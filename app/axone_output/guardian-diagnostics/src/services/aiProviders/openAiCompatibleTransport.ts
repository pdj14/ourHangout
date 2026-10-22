import { fetch } from 'expo/fetch';

import { isZeroPricedModel, normalizeModelModalities } from '../modelCapabilities';
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

export type AiTransportLogEntry = {
  at: string;
  source: string;
  event: string;
  detail?: Record<string, unknown>;
};

const AI_TRANSPORT_LOG_LIMIT = 150;
const aiTransportLogs: AiTransportLogEntry[] = [];

export function logAiTransport(source: string, event: string, detail?: Record<string, unknown>) {
  aiTransportLogs.push({
    at: new Date().toISOString().slice(11, 23),
    source,
    event,
    ...(detail ? { detail } : {}),
  });
  if (aiTransportLogs.length > AI_TRANSPORT_LOG_LIMIT) {
    aiTransportLogs.splice(0, aiTransportLogs.length - AI_TRANSPORT_LOG_LIMIT);
  }
}

export function getAiTransportLogs(): AiTransportLogEntry[] {
  return [...aiTransportLogs];
}

export function clearAiTransportLogs() {
  aiTransportLogs.length = 0;
}

function describeErrorCause(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error || 'unknown');
}

type ModelPayload = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown; request?: unknown; image?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  supported_parameters?: unknown;
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

function hostOf(baseUrl: string) {
  const match = baseUrl.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1] : baseUrl;
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
  const inputModalities = normalizeModelModalities(value.architecture?.input_modalities);
  const outputModalities = normalizeModelModalities(value.architecture?.output_modalities);
  if (outputModalities.length && !outputModalities.includes('text')) return null;
  const supportedParameters = Array.isArray(value.supported_parameters)
    ? value.supported_parameters.map((entry) => String(entry || '').trim().toLowerCase())
    : [];
  return {
    id,
    name: String(value.name || id).trim(),
    contextLength: safeNumber(value.context_length),
    promptPrice: safeNumber(value.pricing?.prompt),
    completionPrice: safeNumber(value.pricing?.completion),
    requestPrice: safeNumber(value.pricing?.request),
    imagePrice: safeNumber(value.pricing?.image),
    free: isFreeModel(settings, id)
      || (settings.providerId === 'openRouter' && isZeroPricedModel(value.pricing)),
    inputModalities: inputModalities.length ? inputModalities : ['text'],
    outputModalities: outputModalities.length ? outputModalities : ['text'],
    supportsTools: supportedParameters.includes('tools'),
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
  const bodySnippet = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  let providerMessage = '';
  let errorCode = '';
  try {
    const payload = JSON.parse(text) as {
      error?: { message?: unknown; code?: unknown; metadata?: { raw?: unknown } } | string;
      message?: unknown;
    };
    providerMessage = typeof payload.error === 'string'
      ? payload.error
      : String(payload.error?.message || payload.message || '').trim();
    errorCode = payload.error && typeof payload.error === 'object'
      ? String(payload.error.code ?? '').trim()
      : '';
  } catch {
    providerMessage = '';
  }
  const technical = [
    `HTTP ${response.status}`,
    settings.modelId ? `model=${settings.modelId}` : '',
    hostOf(settings.baseUrl),
    errorCode ? `code=${errorCode}` : '',
    providerMessage ? `msg="${providerMessage.slice(0, 200)}"` : '',
    bodySnippet ? `body="${bodySnippet}"` : '',
  ].filter(Boolean).join(' · ');
  logAiTransport('transport', 'http_error', {
    status: response.status,
    code: errorCode,
    providerMessage,
    bodySnippet,
  });
  if (response.status === 401 || response.status === 403) {
    return new OpenAiProviderError(
      `${descriptor.name} 인증이 만료되었거나 API 키 권한이 부족해요. 연결을 다시 확인해 주세요.\n[상세] ${technical}`,
      'unauthorized',
      settings.providerId
    );
  }
  if (response.status === 402) {
    return new OpenAiProviderError(
      `${descriptor.name} 잔액 또는 사용 한도가 부족해요. 무료 모델이나 다른 모델을 선택해 주세요.\n[상세] ${technical}`,
      'payment_required',
      settings.providerId
    );
  }
  if (response.status === 429) {
    return new OpenAiProviderError(
      `${descriptor.name} 사용 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.\n[상세] ${technical}`,
      'rate_limit',
      settings.providerId
    );
  }
  return new OpenAiProviderError(
    providerMessage
      ? `${providerMessage.slice(0, 240)}\n[상세] ${technical}`
      : `${descriptor.name} 요청을 처리하지 못했어요. (${response.status})\n[상세] ${technical}`,
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
  } catch (error) {
    logAiTransport('transport', 'models_request_failed', { cause: describeErrorCause(error) });
    throw new OpenAiProviderError(
      `${descriptor.name} 모델 목록을 불러오지 못했어요. 네트워크와 서버 주소를 확인해 주세요. [원인: ${describeErrorCause(error).slice(0, 200)}]`,
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
  logAiTransport('transport', 'models_loaded', { count: models.length });

  if (settings.providerId !== 'openRouter') return models;
  const freeRouter: OpenAiCompatibleModel = {
    id: 'openrouter/free',
    name: '무료 모델 자동 선택',
    contextLength: 200_000,
    promptPrice: 0,
    completionPrice: 0,
    requestPrice: 0,
    imagePrice: 0,
    free: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsTools: true,
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

function describePayloadError(value: unknown) {
  if (!value || typeof value !== 'object') return String(value || '');
  const record = value as { message?: unknown; code?: unknown; metadata?: { raw?: unknown } };
  const message = String(record.message || '').trim();
  const code = String(record.code ?? '').trim();
  let raw = '';
  const metadataRaw = record.metadata?.raw;
  if (metadataRaw) {
    try {
      raw = JSON.stringify(metadataRaw);
    } catch {
      raw = String(metadataRaw);
    }
  }
  const combined = [
    message,
    code ? `(code ${code})` : '',
    raw ? `raw=${raw.slice(0, 300)}` : '',
  ].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  try {
    return JSON.stringify(value).slice(0, 300);
  } catch {
    return String(value);
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

function requestMessage(message: OpenAiConversationMessage) {
  if (message.role === 'tool') {
    return {
      role: 'tool' as const,
      tool_call_id: message.tool_call_id,
      content: message.content.slice(0, 5000),
    };
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant' as const,
      // An assistant turn without tool_calls must never serialize `content: null`;
      // several routers reject it with HTTP 400 before selecting a provider.
      content: message.content?.slice(0, 6000) || (message.tool_calls?.length ? null : ''),
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    };
  }
  if (typeof message.content === 'string') {
    return { role: 'user' as const, content: message.content.slice(0, 6000) };
  }
  return {
    role: 'user' as const,
    content: message.content.slice(0, 12).map((part) => (
      part.type === 'text' ? { ...part, text: part.text.slice(0, 6000) } : part
    )),
  };
}

/**
 * Removes broken tool-call/tool-result pairs from a restored conversation.
 * A dangling assistant `tool_calls` entry (its results were lost, e.g. the app
 * was killed mid-run) or an orphan `tool` result makes routers reject the whole
 * request with HTTP 400 and metadata.provider_name = null.
 */
function sanitizeHistory(messages: OpenAiConversationMessage[]) {
  const answeredIds = new Set<string>();
  const announcedIds = new Set<string>();
  messages.forEach((message) => {
    if (message.role === 'tool' && message.tool_call_id) answeredIds.add(message.tool_call_id);
    if (message.role === 'assistant') {
      message.tool_calls?.forEach((call) => {
        if (call.id) announcedIds.add(call.id);
      });
    }
  });
  let droppedResults = 0;
  let droppedCalls = 0;
  const cleaned = messages
    .filter((message) => {
      if (message.role !== 'tool') return true;
      const keep = !!message.tool_call_id && announcedIds.has(message.tool_call_id);
      if (!keep) droppedResults += 1;
      return keep;
    })
    .map((message) => {
      if (message.role !== 'assistant' || !message.tool_calls?.length) return message;
      const kept = message.tool_calls.filter((call) => !!call.id && answeredIds.has(call.id));
      if (kept.length === message.tool_calls.length) return message;
      droppedCalls += message.tool_calls.length - kept.length;
      return { ...message, tool_calls: kept };
    });
  if (droppedResults || droppedCalls) {
    logAiTransport('transport', 'history_sanitized', {
      droppedToolResults: droppedResults,
      droppedToolCalls: droppedCalls,
    });
  }
  return cleaned;
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
  const startedAt = Date.now();
  const history = sanitizeHistory(messages.slice(-40));
  logAiTransport('transport', 'chat_request', {
    provider: descriptor.name,
    endpoint: hostOf(settings.baseUrl),
    model: requestedModelId,
    tools: hasTools ? options.tools!.length : 0,
    messages: history.length,
  });
  const chatUrl = endpoint(settings.baseUrl, '/chat/completions');
  const buildRequestBody = (reduced: boolean) => JSON.stringify({
    model: requestedModelId,
    stream: true,
    temperature: 0.35,
    max_tokens: 800,
    messages: [
      { role: 'system', content: systemPrompt.slice(0, 5000) },
      ...history.map(requestMessage),
    ],
    ...(hasTools && !reduced ? { tools: options.tools } : {}),
    ...(reduced ? {} : requestBodyExtensions(settings, hasTools, requestedModelId)),
  });
  let response: Response;
  try {
    response = await fetch(chatUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: buildHeaders(settings, apiKey, true),
      body: buildRequestBody(false),
    });
    // HTTP 400 usually means one optional extension (reasoning/provider/tools)
    // was rejected by the router validator. Log the original rejection, then
    // transparently retry once with the minimal request body so the user still
    // gets an answer while the logs preserve the root cause.
    if (!response.ok && response.status === 400) {
      await responseError(settings, response);
      logAiTransport('transport', 'retry_reduced_request', {});
      response = await fetch(chatUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: buildHeaders(settings, apiKey, true),
        body: buildRequestBody(true),
      });
    }
    if (!response.ok) throw await responseError(settings, response);
    if (!response.body) {
      throw new OpenAiProviderError(`${descriptor.name} 스트림을 시작하지 못했어요.`, 'request', settings.providerId);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let resolvedModel = '';
    let lastStreamError = '';
    const streamedToolCalls = new Map<number, StreamedToolCall>();
    const consume = (payload: Record<string, unknown>) => {
      const payloadError = payload.error;
      if (payloadError) {
        lastStreamError = describePayloadError(payloadError);
        logAiTransport('transport', 'stream_payload_error', { error: lastStreamError });
        return;
      }
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
    if (!content.trim() && !toolCalls.length && lastStreamError) {
      throw new OpenAiProviderError(
        `${descriptor.name} 모델이 오류를 반환했어요. ${lastStreamError}`,
        'request',
        settings.providerId
      );
    }
    if (!content.trim() && !toolCalls.length) {
      logAiTransport('transport', 'empty_response', { resolvedModel: resolvedModel || requestedModelId });
      throw new OpenAiProviderError(`${descriptor.name} 모델이 빈 응답을 반환했어요.`, 'request', settings.providerId);
    }
    const safeContent = sanitizeContent(content);
    if (!safeContent && !toolCalls.length) {
      logAiTransport('transport', 'unsanitizable_response', {
        chars: content.length,
        preview: content.slice(0, 200),
      });
      throw new OpenAiProviderError(`${descriptor.name} 모델이 표시할 답변을 반환하지 못했어요.`, 'request', settings.providerId);
    }
    logAiTransport('transport', 'chat_done', {
      ms: Date.now() - startedAt,
      chars: safeContent.length,
      toolCalls: toolCalls.length,
      resolvedModel: resolvedModel || requestedModelId,
    });
    return { content: safeContent, modelId: resolvedModel || requestedModelId, toolCalls };
  } catch (error) {
    const cause = describeErrorCause(error);
    if (controller.signal.aborted) {
      logAiTransport('transport', 'chat_cancelled', { ms: Date.now() - startedAt });
      throw new OpenAiProviderError('답변 생성을 중지했어요.', 'cancelled', settings.providerId);
    }
    if (error instanceof OpenAiProviderError) {
      logAiTransport('transport', 'chat_failed', { code: error.code, message: error.message });
      throw error;
    }
    logAiTransport('transport', 'chat_failed', { cause: cause.slice(0, 300) });
    throw new OpenAiProviderError(
      `${CHAT_TIMEOUT_MESSAGE} [원인: ${cause.slice(0, 200)}]`,
      'network',
      settings.providerId
    );
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
