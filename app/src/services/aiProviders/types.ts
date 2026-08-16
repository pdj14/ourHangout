export type OpenAiCompatibleProviderId = 'openRouter' | 'xai' | 'ollama' | 'vllm' | 'custom';

export type OpenAiCompatibleProviderDescriptor = {
  id: OpenAiCompatibleProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModelId: string;
  requiresApiKey: boolean;
  supportsOptionalApiKey: boolean;
  allowsInsecureHttp: boolean;
  supportsOAuth: boolean;
  capabilities: {
    modelListing: 'supported' | 'conditional';
    streaming: 'supported' | 'conditional';
    functionTools: 'supported' | 'conditional';
  };
};

export type OpenAiCompatibleProviderSettings = {
  providerId: OpenAiCompatibleProviderId;
  baseUrl: string;
  modelId: string;
};

export type OpenAiCompatibleModel = {
  id: string;
  name: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  free: boolean;
};

export type OpenAiFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenAiConversationMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export type OpenAiCompletionCallbacks = {
  onPartial: (content: string) => void;
  onModel?: (modelId: string) => void;
};

export type OpenAiConversationOptions = {
  tools?: OpenAiFunctionTool[];
};

export type OpenAiConversationResult = {
  content: string;
  modelId: string;
  toolCalls: OpenAiToolCall[];
};

export type OpenAiProviderErrorCode =
  | 'not_connected'
  | 'network'
  | 'rate_limit'
  | 'payment_required'
  | 'unauthorized'
  | 'unsupported'
  | 'request'
  | 'cancelled';

export class OpenAiProviderError extends Error {
  constructor(
    message: string,
    readonly code: OpenAiProviderErrorCode,
    readonly providerId: OpenAiCompatibleProviderId
  ) {
    super(message);
    this.name = 'OpenAiProviderError';
  }
}
