import { buildOpenRouterHeaders } from '../openRouterConfig';
import type { OpenAiCompatibleProviderId } from './types';

export type ProviderRequestContext = {
  hasTools: boolean;
  modelId: string;
  fallbackModelIds: string[];
};

export type OpenAiProviderWireAdapter = {
  buildHeaders: (apiKey: string | null, json: boolean) => Record<string, string>;
  modelsQuery: string;
  isFreeModel: (modelId: string) => boolean;
  requestExtensions: (context: ProviderRequestContext) => Record<string, unknown>;
};

const genericHeaders = (apiKey: string | null, json: boolean) => ({
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const genericAdapter: OpenAiProviderWireAdapter = {
  buildHeaders: genericHeaders,
  modelsQuery: '',
  isFreeModel: () => false,
  requestExtensions: () => ({}),
};

const isOpenRouterFreeModel = (modelId: string) => {
  const normalized = modelId.trim().toLowerCase();
  return normalized === 'openrouter/free' || normalized.endsWith(':free');
};

const adapters: Partial<Record<OpenAiCompatibleProviderId, OpenAiProviderWireAdapter>> = {
  openRouter: {
    buildHeaders: (apiKey, json) => buildOpenRouterHeaders(apiKey || '', json),
    modelsQuery: '?output_modalities=text&supported_parameters=tools&sort=most-popular',
    isFreeModel: isOpenRouterFreeModel,
    requestExtensions: ({ hasTools, modelId, fallbackModelIds }) => {
      const freeOnly = isOpenRouterFreeModel(modelId);
      return {
        // NOTE: send NO `reasoning` field at all. History:
        // - `effort: 'none'` is not a documented value (high|medium|low); the
        //   router validator rejected it with HTTP 400 (provider_name = null).
        // - `exclude: true` made reasoning-heavy free models return EMPTY
        //   content: they spent their whole completion budget on reasoning
        //   tokens that were then stripped from the response.
        // Omitting the field is safe: reasoning arrives on `delta.reasoning`
        // (ignored by the transport) and `delta.content` keeps the real answer.
        ...(hasTools || freeOnly ? {
          provider: {
            ...(hasTools ? { require_parameters: true } : {}),
            ...(freeOnly ? { max_price: { prompt: 0, completion: 0, request: 0 } } : {}),
          },
        } : {}),
        // Fallback routing: when the primary model has no available provider
        // (the recurring free-model outage), OpenRouter retries down this list.
        ...(fallbackModelIds.length ? {
          route: 'fallback',
          models: [modelId, ...fallbackModelIds],
        } : {}),
      };
    },
  },
  ollama: {
    ...genericAdapter,
    isFreeModel: () => true,
  },
  vllm: {
    ...genericAdapter,
    isFreeModel: () => true,
  },
};

export function getOpenAiProviderWireAdapter(providerId: OpenAiCompatibleProviderId) {
  return adapters[providerId] || genericAdapter;
}
