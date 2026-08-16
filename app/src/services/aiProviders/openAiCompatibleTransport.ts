import { fetch } from 'expo/fetch';

import { getOpenAiProviderWireAdapter } from './adapters';
import { getProviderApiKey } from './credentials';
import { getOpenAiProviderDescriptor, normalizeProviderSettings } from './registry';
import {
  OpenAiProviderError,
  type OpenAiCompatibleModel,
  type OpenAiCompatibleProviderSettings,
  type OpenAiCompletionCallbacks,
  type OpenAiConversationMessage,
  type OpenAiConversationOptions,
  type OpenAiConversationResult,
} from './types';

const MODEL_LIST_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MESSAGE = 'AI 제공자에 연결하지 못했어요. 네트워크와 서버 주소를 확인해 주세요.';

type ModelPayload = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { output_modalities?: unknown };
};

type StreamedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

let activeController: AbortController | null = null;

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isFreeModel(settings: OpenAiCompatibleProviderSettings, modelId: string) {
  return getOpenAiProviderWireAdapter(settings.providerId).isFreeModel(modelId);
}

function modelFromPayload(
  settings: OpenAiCompatibleProviderSettings,
  value: ModelPayload
): OpenAiCompatibleModel | null {
  const id = String(value.id || '').trim();
  if (!id) return null;
  const modalities = value.architecture?.output_modalities;
  if (Array.isArray(modalities) && !modalities.includes('text')) return null;
  return {
    id,
    name: String(value.name || id).trim(),
    contextLength: safeNumber(value.context_length),
    promptPrice: safeNumber(value.pricing?.prompt),
    completionPrice: safeNumber(value.pricing?.completion),
    free: isFreeModel(settings, id),
  };
}

function buildHeaders(
  settings: OpenAiCompatibleProviderSettings,
  apiKey: string | null,
  json = false
) {
  return getOpenAiProviderWireAdapter(settings.providerId).buildHeaders(apiKey, json);
}

async function requireCredential(settings: OpenAiCompatibleProviderSettings) {
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  const apiKey = await getProviderApiKey(settings.providerId);
  if (descriptor.requiresApiKey && !apiKey) {
    throw new OpenAiProviderError(
      `${descriptor.name} API 키를 먼저 연결해 주세요.`,
      'not_connected',
      settings.providerId
    );
  }
  return apiKey;
}

async function responseError(
  settings: OpenAiCompatibleProviderSettings,
  response: Response
) {
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  const text = await response.text().catch(() => '');
  let providerMessage = '';
  try {
    const payload = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    providerMessage = typeof payload.error === 'string'
      ? payload.error
      : String(payload.error?.message || payload.message || '').trim();
  } catch {
    providerMessage = '';
  }
  if (response.status === 401 || response.status === 403) {
    return new OpenAiProviderError(
      `${descriptor.name} 인증이 만료되었거나 API 키 권한이 부족해요. 연결을 다시 확인해 주세요.`,
      'unauthorized',
      settings.providerId
    );
  }
  if (response.status === 402) {
    return new OpenAiProviderError(
      `${descriptor.name} 잔액 또는 사용 한도가 부족해요. 무료 모델이나 다른 모델을 선택해 주세요.`,
      'payment_required',
      settings.providerId
    );
  }
  if (response.status === 429) {
    return new OpenAiProviderError(
      `${descriptor.name} 사용 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.`,
      'rate_limit',
      settings.providerId
    );
  }
  return new OpenAiProviderError(
    providerMessage.slice(0, 240) || `${descriptor.name} 요청을 처리하지 못했어요. (${response.status})`,
    response.status === 404 || response.status === 405 || response.status === 422 ? 'unsupported' : 'request',
    settings.providerId
  );
}

export async function fetchOpenAiCompatibleModels(
  rawSettings: OpenAiCompatibleProviderSettings
): Promise<OpenAiCompatibleModel[]> {
  const settings = normalizeProviderSettings(rawSettings);
  const apiKey = await requireCredential(settings);
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
  let response: Response;
  try {
    const query = getOpenAiProviderWireAdapter(settings.providerId).modelsQuery;
    response = await fetch(endpoint(settings.baseUrl, `/models${query}`), {
      signal: controller.signal,
      headers: buildHeaders(settings, apiKey),
    });
  } catch {
    throw new OpenAiProviderError(
      `${descriptor.name} 모델 목록을 불러오지 못했어요. 네트워크와 서버 주소를 확인해 주세요.`,
      'network',
      settings.providerId
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw await responseError(settings, response);
  const payload = await response.json() as { data?: ModelPayload[] };
  const models = (payload.data || [])
    .map((value) => modelFromPayload(settings, value))
    .filter((model): model is OpenAiCompatibleModel => !!model);

  if (settings.providerId !== 'openRouter') return models;
  const freeRouter: OpenAiCompatibleModel = {
    id: 'openrouter/free',
    name: '무료 모델 자동 선택',
    contextLength: 200_000,
    promptPrice: 0,
    completionPrice: 0,
    free: true,
  };
  const withoutRouter = models.filter((model) => model.id !== freeRouter.id);
  return [
    freeRouter,
    ...withoutRouter.filter((model) => model.free).slice(0, 24),
    ...withoutRouter.filter((model) => !model.free).slice(0, 35),
  ];
}

function parseStreamEvent(data: string, onChunk: (payload: Record<string, unknown>) => void) {
  const body = data
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!body || body === '[DONE]') return;
  try {
    onChunk(JSON.parse(body) as Record<string, unknown>);
  } catch {
    // A malformed event must not discard the remaining SSE stream.
  }
}

const EXPLICIT_REASONING_PREFIX = /^\s*(?:here(?:'s| is)\s+(?:a\s+|the\s+)?(?:thinking|reasoning|analysis)\s+process|(?:analysis|reasoning)\s*:|we need to (?:answer|respond)|let me (?:think|reason))/i;
const FINAL_ANSWER_MARKER = /(?:^|\n)\s*(?:final\s*(?:answer|response)|answer|output|최종\s*답변|답변)\s*:\s*/gim;

function trimAnswerWrapper(value: string) {
  return value.trim().replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
}

function sanitizeContent(value: string) {
  let safe = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  if (/<(?:think|analysis)>/i.test(safe)) return '';
  if (EXPLICIT_REASONING_PREFIX.test(safe)) {
    const markers = [...safe.matchAll(FINAL_ANSWER_MARKER)];
    const last = markers.at(-1);
    if (!last || last.index === undefined) return '';
    safe = safe.slice(last.index + last[0].length);
  }
  return trimAnswerWrapper(safe);
}

function mergeStreamFragment(current: string, fragment: unknown) {
  if (typeof fragment !== 'string' || !fragment) return current;
  if (!current) return fragment;
  if (fragment === current || current.endsWith(fragment)) return current;
  if (fragment.startsWith(current)) return fragment;
  return current + fragment;
}

function appendStreamedToolCalls(target: Map<number, StreamedToolCall>, value: unknown) {
  if (!Array.isArray(value)) return;
  value.forEach((item, fallbackIndex) => {
    if (!item || typeof item !== 'object') return;
    const delta = item as {
      index?: unknown;
      id?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    const parsedIndex = Number(delta.index);
    const index = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : fallbackIndex;
    const current = target.get(index) || { id: '', name: '', arguments: '' };
    current.id = mergeStreamFragment(current.id, delta.id);
    current.name = mergeStreamFragment(current.name, delta.function?.name);
    if (typeof delta.function?.arguments === 'string') {
      current.arguments += delta.function.arguments;
    }
    target.set(index, current);
  });
}

function requestBodyExtensions(
  settings: OpenAiCompatibleProviderSettings,
  hasTools: boolean,
  requestedModelId: string
) {
  return getOpenAiProviderWireAdapter(settings.providerId).requestExtensions({
    hasTools,
    modelId: requestedModelId,
  });
}

export async function streamOpenAiCompatibleConversation(
  rawSettings: OpenAiCompatibleProviderSettings,
  messages: OpenAiConversationMessage[],
  systemPrompt: string,
  callbacks: OpenAiCompletionCallbacks,
  options: OpenAiConversationOptions = {}
): Promise<OpenAiConversationResult> {
  const settings = normalizeProviderSettings(rawSettings);
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  const apiKey = await requireCredential(settings);
  const requestedModelId = settings.modelId || descriptor.defaultModelId;
  if (!requestedModelId) {
    throw new OpenAiProviderError('사용할 모델을 먼저 선택하거나 모델 ID를 입력해 주세요.', 'request', settings.providerId);
  }
  const hasTools = !!options.tools?.length;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  let response: Response;
  try {
    response = await fetch(endpoint(settings.baseUrl, '/chat/completions'), {
      method: 'POST',
      signal: controller.signal,
      headers: buildHeaders(settings, apiKey, true),
      body: JSON.stringify({
        model: requestedModelId,
        stream: true,
        temperature: 0.35,
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 5000) },
          ...messages.slice(-40).map((message) => {
            if (message.role === 'tool') {
              return { role: 'tool', tool_call_id: message.tool_call_id, content: message.content.slice(0, 5000) };
            }
            if (message.role === 'assistant' && message.tool_calls?.length) {
              return {
                role: 'assistant',
                content: message.content?.slice(0, 6000) || null,
                tool_calls: message.tool_calls,
              };
            }
            return { role: message.role, content: message.content?.slice(0, 6000) || '' };
          }),
        ],
        ...(hasTools ? { tools: options.tools } : {}),
        ...requestBodyExtensions(settings, hasTools, requestedModelId),
      }),
    });
    if (!response.ok) throw await responseError(settings, response);
    if (!response.body) {
      throw new OpenAiProviderError(`${descriptor.name} 스트림을 시작하지 못했어요.`, 'request', settings.providerId);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let resolvedModel = '';
    const streamedToolCalls = new Map<number, StreamedToolCall>();
    const consume = (payload: Record<string, unknown>) => {
      const model = typeof payload.model === 'string' ? payload.model : '';
      if (model && model !== resolvedModel) {
        resolvedModel = model;
        callbacks.onModel?.(model);
      }
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] as {
        delta?: { content?: unknown; tool_calls?: unknown };
        message?: { content?: unknown; tool_calls?: unknown };
      } | undefined;
      appendStreamedToolCalls(streamedToolCalls, first?.delta?.tool_calls || first?.message?.tool_calls);
      const next = typeof first?.delta?.content === 'string'
        ? first.delta.content
        : typeof first?.message?.content === 'string' ? first.message.content : '';
      if (!next) return;
      content += next;
      const safeContent = sanitizeContent(content);
      if (safeContent) callbacks.onPartial(safeContent);
    };

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.includes('application/json')) {
      consume(await response.json() as Record<string, unknown>);
    } else {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.match(/\r?\n\r?\n/);
        while (boundary?.index !== undefined) {
          parseStreamEvent(buffer.slice(0, boundary.index), consume);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          boundary = buffer.match(/\r?\n\r?\n/);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) parseStreamEvent(buffer, consume);
    }
    const toolCalls = [...streamedToolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => ({
        id: call.id || `guardian_tool_call_${Date.now()}_${index}`,
        type: 'function' as const,
        function: { name: call.name.trim(), arguments: call.arguments },
      }))
      .filter((call) => !!call.function.name);
    if (!content.trim() && !toolCalls.length) {
      throw new OpenAiProviderError(`${descriptor.name} 모델이 빈 응답을 반환했어요.`, 'request', settings.providerId);
    }
    const safeContent = sanitizeContent(content);
    if (!safeContent && !toolCalls.length) {
      throw new OpenAiProviderError(`${descriptor.name} 모델이 표시할 답변을 반환하지 못했어요.`, 'request', settings.providerId);
    }
    return { content: safeContent, modelId: resolvedModel || requestedModelId, toolCalls };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OpenAiProviderError('답변 생성을 중지했어요.', 'cancelled', settings.providerId);
    }
    if (error instanceof OpenAiProviderError) throw error;
    throw new OpenAiProviderError(CHAT_TIMEOUT_MESSAGE, 'network', settings.providerId);
  } finally {
    if (activeController === controller) activeController = null;
  }
}

export function cancelOpenAiCompatibleCompletion() {
  activeController?.abort();
  activeController = null;
}

export function formatOpenAiCompatibleModelName(modelId: string, models: OpenAiCompatibleModel[] = []) {
  return models.find((model) => model.id === modelId)?.name
    || modelId.split('/').pop()?.replace(/:free$/i, '').replace(/[-_]/g, ' ')
    || 'AI 모델';
}
