import type {
  OpenAiCompatibleProviderDescriptor,
  OpenAiCompatibleProviderId,
  OpenAiCompatibleProviderSettings,
} from './types';

export const OPEN_AI_COMPATIBLE_PROVIDERS: readonly OpenAiCompatibleProviderDescriptor[] = [
  {
    id: 'openRouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModelId: 'openrouter/free',
    requiresApiKey: true,
    supportsOptionalApiKey: false,
    allowsInsecureHttp: false,
    supportsOAuth: true,
    capabilities: { modelListing: 'supported', streaming: 'supported', functionTools: 'conditional' },
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModelId: '',
    requiresApiKey: true,
    supportsOptionalApiKey: false,
    allowsInsecureHttp: false,
    supportsOAuth: false,
    capabilities: { modelListing: 'supported', streaming: 'supported', functionTools: 'conditional' },
  },
  {
    id: 'ollama',
    name: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModelId: '',
    requiresApiKey: false,
    supportsOptionalApiKey: false,
    allowsInsecureHttp: true,
    supportsOAuth: false,
    capabilities: { modelListing: 'supported', streaming: 'supported', functionTools: 'conditional' },
  },
  {
    id: 'vllm',
    name: 'vLLM',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultModelId: '',
    requiresApiKey: false,
    supportsOptionalApiKey: true,
    allowsInsecureHttp: true,
    supportsOAuth: false,
    capabilities: { modelListing: 'supported', streaming: 'supported', functionTools: 'conditional' },
  },
  {
    id: 'custom',
    name: '사용자 지정 API',
    defaultBaseUrl: '',
    defaultModelId: '',
    requiresApiKey: false,
    supportsOptionalApiKey: true,
    allowsInsecureHttp: false,
    supportsOAuth: false,
    capabilities: { modelListing: 'conditional', streaming: 'conditional', functionTools: 'conditional' },
  },
] as const;

export function getOpenAiProviderDescriptor(providerId: OpenAiCompatibleProviderId) {
  return OPEN_AI_COMPATIBLE_PROVIDERS.find((provider) => provider.id === providerId)
    || OPEN_AI_COMPATIBLE_PROVIDERS[0];
}

export function normalizeOpenAiProviderId(value: unknown): OpenAiCompatibleProviderId {
  return OPEN_AI_COMPATIBLE_PROVIDERS.some((provider) => provider.id === value)
    ? value as OpenAiCompatibleProviderId
    : 'openRouter';
}

export function normalizeProviderBaseUrl(providerId: OpenAiCompatibleProviderId, value: unknown) {
  const descriptor = getOpenAiProviderDescriptor(providerId);
  const candidate = String(value || descriptor.defaultBaseUrl).trim().replace(/\/+$/, '');
  if (!candidate) return descriptor.defaultBaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return descriptor.defaultBaseUrl;
  }
  if (parsed.protocol !== 'https:' && !(descriptor.allowsInsecureHttp && parsed.protocol === 'http:')) {
    return descriptor.defaultBaseUrl;
  }
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

export function normalizeProviderSettings(
  value: Partial<OpenAiCompatibleProviderSettings> | null | undefined
): OpenAiCompatibleProviderSettings {
  const providerId = normalizeOpenAiProviderId(value?.providerId);
  const descriptor = getOpenAiProviderDescriptor(providerId);
  return {
    providerId,
    baseUrl: normalizeProviderBaseUrl(providerId, value?.baseUrl),
    modelId: String(value?.modelId || descriptor.defaultModelId).trim().slice(0, 240),
  };
}
