import { getProviderApiKey } from './credentials';
import {
  cancelOpenAiCompatibleCompletion,
  fetchOpenAiCompatibleModels,
  formatOpenAiCompatibleModelName,
  streamOpenAiCompatibleConversation,
} from './openAiCompatibleTransport';
import { getOpenAiProviderDescriptor, normalizeProviderSettings } from './registry';
import type {
  OpenAiCompatibleProviderSettings,
  OpenAiCompletionCallbacks,
  OpenAiConversationMessage,
  OpenAiConversationOptions,
} from './types';

export function createOpenAiCompatibleProvider(rawSettings: OpenAiCompatibleProviderSettings) {
  const settings = normalizeProviderSettings(rawSettings);
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  return {
    descriptor,
    settings,
    async hasCredential() {
      if (!descriptor.requiresApiKey) return true;
      return !!(await getProviderApiKey(settings.providerId));
    },
    listModels() {
      return fetchOpenAiCompatibleModels(settings);
    },
    streamConversation(
      messages: OpenAiConversationMessage[],
      systemPrompt: string,
      callbacks: OpenAiCompletionCallbacks,
      options: OpenAiConversationOptions = {}
    ) {
      return streamOpenAiCompatibleConversation(settings, messages, systemPrompt, callbacks, options);
    },
    cancel() {
      cancelOpenAiCompatibleCompletion();
    },
    formatModelName(modelId: string, models = []) {
      return formatOpenAiCompatibleModelName(modelId, models);
    },
  };
}
