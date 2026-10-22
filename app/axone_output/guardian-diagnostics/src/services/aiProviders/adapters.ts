import { buildOpenRouterHeaders } from '../openRouterConfig';
import type { OpenAiCompatibleProviderId } from './types';

export type ProviderRequestContext = {
  hasTools: boolean;
  modelId: string;
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
    requestExtensions: ({ hasTools, modelId }) => {
      const freeOnly = isOpenRouterFreeModel(modelId);
      return {
        // NOTE: `effort: 'none'` is not a documented OpenRouter value
        // (allowed: high | medium | low) and was rejected with HTTP 400
        // (metadata.provider_name = null) by the router validator.
        // `exclude: true` alone keeps the intended behavior: hide reasoning output.
        reasoning: { exclude: true },
        ...(hasTools || freeOnly ? {
          provider: {
            ...(hasTools ? { require_parameters: true } : {}),
            ...(freeOnly ? { max_price: { prompt: 0, completion: 0, request: 0 } } : {}),
          },
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
