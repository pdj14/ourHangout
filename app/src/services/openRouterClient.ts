import { fetch } from 'expo/fetch';

import type { OnDeviceChatMessage } from './onDeviceAi';
import {
  getOpenRouterApiKey,
  OpenRouterAuthError,
  validateOpenRouterConnection,
} from './openRouterAuth';
import { buildOpenRouterHeaders, OPENROUTER_API_URL } from './openRouterConfig';

const MODEL_LIST_TIMEOUT_MS = 20_000;
export const DEFAULT_OPENROUTER_MODEL_ID = 'openrouter/free';

export type OpenRouterModel = {
  id: string;
  name: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  free: boolean;
};

export type OpenRouterCompletionCallbacks = {
  onPartial: (content: string) => void;
  onModel?: (modelId: string) => void;
};

type OpenRouterModelPayload = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { output_modalities?: unknown };
};

let activeController: AbortController | null = null;

export class OpenRouterClientError extends Error {
  constructor(
    message: string,
    readonly code: 'not_connected' | 'network' | 'rate_limit' | 'unauthorized' | 'request' | 'cancelled'
  ) {
    super(message);
    this.name = 'OpenRouterClientError';
  }
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function modelFromPayload(value: OpenRouterModelPayload): OpenRouterModel | null {
  const id = String(value.id || '').trim();
  if (!id) return null;
  const modalities = value.architecture?.output_modalities;
  if (Array.isArray(modalities) && !modalities.includes('text')) return null;
  const promptPrice = safeNumber(value.pricing?.prompt);
  const completionPrice = safeNumber(value.pricing?.completion);
  return {
    id,
    name: String(value.name || id).trim(),
    contextLength: safeNumber(value.context_length),
    promptPrice,
    completionPrice,
    free: id.endsWith(':free') || (promptPrice === 0 && completionPrice === 0),
  };
}

function freeRouterModel(): OpenRouterModel {
  return {
    id: DEFAULT_OPENROUTER_MODEL_ID,
    name: '무료 모델 자동 선택',
    contextLength: 200_000,
    promptPrice: 0,
    completionPrice: 0,
    free: true,
  };
}

async function requireApiKey() {
  const key = await getOpenRouterApiKey();
  if (!key) {
    throw new OpenRouterClientError('먼저 OpenRouter 계정을 연결해 주세요.', 'not_connected');
  }
  return key;
}

async function responseError(response: Response) {
  const text = await response.text().catch(() => '');
  let providerMessage = '';
  try {
    const payload = JSON.parse(text) as { error?: { message?: unknown } | string };
    providerMessage = typeof payload.error === 'string'
      ? payload.error
      : String(payload.error?.message || '').trim();
  } catch {
    providerMessage = '';
  }
  if (response.status === 401 || response.status === 403) {
    return new OpenRouterClientError('OpenRouter 연결이 만료됐어요. 계정을 다시 연결해 주세요.', 'unauthorized');
  }
  if (response.status === 429) {
    return new OpenRouterClientError('OpenRouter 사용 한도에 도달했어요. 잠시 후 다시 시도하거나 다른 모델을 선택해 주세요.', 'rate_limit');
  }
  return new OpenRouterClientError(
    providerMessage.slice(0, 240) || `OpenRouter 요청을 처리하지 못했어요. (${response.status})`,
    'request'
  );
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const key = await requireApiKey();
  try {
    await validateOpenRouterConnection();
  } catch (error) {
    if (error instanceof OpenRouterAuthError && error.code === 'invalid_key') {
      throw new OpenRouterClientError(error.message, 'unauthorized');
    }
    throw new OpenRouterClientError(
      error instanceof Error ? error.message : 'OpenRouter 키를 확인하지 못했어요.',
      'network'
    );
  }
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
  try {
    response = await fetch(`${OPENROUTER_API_URL}/models?output_modalities=text&sort=most-popular`, {
      signal: controller.signal,
      headers: buildOpenRouterHeaders(key),
    });
  } catch {
    throw new OpenRouterClientError('모델 목록을 불러오지 못했어요. 네트워크를 확인해 주세요.', 'network');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { data?: OpenRouterModelPayload[] };
  const models = (payload.data || []).map(modelFromPayload).filter((model): model is OpenRouterModel => !!model);
  const withoutRouter = models.filter((model) => model.id !== DEFAULT_OPENROUTER_MODEL_ID);
  return [
    freeRouterModel(),
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
    // Ignore a malformed provider event while keeping the remaining stream alive.
  }
}

const EXPLICIT_REASONING_PREFIX = /^\s*(?:here(?:'s| is)\s+(?:a\s+|the\s+)?(?:thinking|reasoning|analysis)\s+process|(?:analysis|reasoning)\s*:|we need to (?:answer|respond)|let me (?:think|reason))/i;
const FINAL_ANSWER_MARKER = /(?:^|\n)\s*(?:final\s*(?:answer|response)|answer|output|최종\s*답변|답변)\s*:\s*/gim;

function trimAnswerWrapper(value: string) {
  return value
    .trim()
    .replace(/^["'“”‘’`]+/, '')
    .replace(/["'“”‘’`]+$/, '')
    .trim();
}

function sanitizeOpenRouterContent(value: string) {
  let safe = value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  // Never reveal an unfinished provider reasoning block while streaming.
  if (/<(?:think|analysis)>/i.test(safe)) return '';

  if (EXPLICIT_REASONING_PREFIX.test(safe)) {
    const markers = [...safe.matchAll(FINAL_ANSWER_MARKER)];
    const last = markers.at(-1);
    if (!last || last.index === undefined) return '';
    safe = safe.slice(last.index + last[0].length);
  }

  return trimAnswerWrapper(safe);
}

export async function streamOpenRouterConversation(
  messages: OnDeviceChatMessage[],
  systemPrompt: string,
  modelId: string,
  callbacks: OpenRouterCompletionCallbacks
) {
  const key = await requireApiKey();
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...buildOpenRouterHeaders(key, true),
      },
      body: JSON.stringify({
        model: modelId || DEFAULT_OPENROUTER_MODEL_ID,
        stream: true,
        temperature: 0.35,
        max_tokens: 800,
        reasoning: {
          effort: 'none',
          exclude: true,
        },
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 5000) },
          ...messages.slice(-30).map((message) => ({ role: message.role, content: message.content.slice(0, 6000) })),
        ],
      }),
    });
    if (!response.ok) throw await responseError(response);
    if (!response.body) throw new OpenRouterClientError('OpenRouter 스트림을 시작하지 못했어요.', 'request');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let resolvedModel = '';
    const consume = (payload: Record<string, unknown>) => {
      const model = typeof payload.model === 'string' ? payload.model : '';
      if (model && model !== resolvedModel) {
        resolvedModel = model;
        callbacks.onModel?.(model);
      }
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown } } | undefined;
      const next = typeof first?.delta?.content === 'string'
        ? first.delta.content
        : typeof first?.message?.content === 'string' ? first.message.content : '';
      if (!next) return;
      content += next;
      const safeContent = sanitizeOpenRouterContent(content);
      if (safeContent) callbacks.onPartial(safeContent);
    };

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
    if (!content.trim()) throw new OpenRouterClientError('OpenRouter가 빈 답변을 반환했어요. 다시 시도해 주세요.', 'request');
    const safeContent = sanitizeOpenRouterContent(content);
    if (!safeContent) {
      throw new OpenRouterClientError('OpenRouter가 사용자에게 보여줄 답변을 반환하지 못했어요. 다시 시도해 주세요.', 'request');
    }
    return { content: safeContent, modelId: resolvedModel || modelId };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OpenRouterClientError('답변 생성을 중지했어요.', 'cancelled');
    }
    if (error instanceof OpenRouterClientError) throw error;
    throw new OpenRouterClientError('OpenRouter에 연결할 수 없어요. 네트워크를 확인하고 다시 시도해 주세요.', 'network');
  } finally {
    if (activeController === controller) activeController = null;
  }
}

export function cancelOpenRouterCompletion() {
  activeController?.abort();
  activeController = null;
}

export function formatOpenRouterModelName(modelId: string, models: OpenRouterModel[] = []) {
  return models.find((model) => model.id === modelId)?.name
    || modelId.split('/').pop()?.replace(/:free$/i, '').replace(/[-_]/g, ' ')
    || 'OpenRouter 모델';
}
