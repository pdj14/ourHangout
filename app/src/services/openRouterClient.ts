import {
  OpenAiProviderError,
  type OpenAiCompatibleModel,
  type OpenAiCompletionCallbacks,
  type OpenAiConversationMessage,
  type OpenAiConversationOptions,
  type OpenAiFunctionTool,
  type OpenAiToolCall,
} from './aiProviders/types';
import {
  cancelOpenAiCompatibleCompletion,
  fetchOpenAiCompatibleModels,
  formatOpenAiCompatibleModelName,
  streamOpenAiCompatibleConversation,
} from './aiProviders/openAiCompatibleTransport';
import { OpenRouterAuthError, validateOpenRouterConnection } from './openRouterAuth';
import { OPENROUTER_API_URL } from './openRouterConfig';

export const DEFAULT_OPENROUTER_MODEL_ID = 'openrouter/free';

export type OpenRouterModel = OpenAiCompatibleModel;
export type OpenRouterCompletionCallbacks = OpenAiCompletionCallbacks;
export type OpenRouterFunctionTool = OpenAiFunctionTool;
export type OpenRouterToolCall = OpenAiToolCall;
export type OpenRouterConversationMessage = OpenAiConversationMessage;
export type OpenRouterConversationOptions = OpenAiConversationOptions;

export const OpenRouterClientError = OpenAiProviderError;

const settings = (modelId = DEFAULT_OPENROUTER_MODEL_ID) => ({
  providerId: 'openRouter' as const,
  baseUrl: OPENROUTER_API_URL,
  modelId,
});

export function isFreeOnlyOpenRouterModel(modelId: string) {
  const normalized = modelId.trim().toLowerCase();
  return normalized === DEFAULT_OPENROUTER_MODEL_ID || normalized.endsWith(':free');
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    await validateOpenRouterConnection();
  } catch (error) {
    if (error instanceof OpenRouterAuthError && error.code === 'invalid_key') {
      throw new OpenAiProviderError(error.message, 'unauthorized', 'openRouter');
    }
    throw new OpenAiProviderError(
      error instanceof Error ? error.message : 'OpenRouter 키를 확인하지 못했어요.',
      'network',
      'openRouter'
    );
  }
  return fetchOpenAiCompatibleModels(settings());
}

export function streamOpenRouterConversation(
  messages: OpenRouterConversationMessage[],
  systemPrompt: string,
  modelId: string,
  callbacks: OpenRouterCompletionCallbacks,
  options: OpenRouterConversationOptions = {}
) {
  return streamOpenAiCompatibleConversation(
    settings(modelId || DEFAULT_OPENROUTER_MODEL_ID),
    messages,
    systemPrompt,
    callbacks,
    options
  );
}

export function cancelOpenRouterCompletion() {
  cancelOpenAiCompatibleCompletion();
}

export function formatOpenRouterModelName(modelId: string, models: OpenRouterModel[] = []) {
  return formatOpenAiCompatibleModelName(modelId, models);
}
