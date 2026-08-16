import {
  deleteProviderApiKey,
  fetchOpenAiCompatibleModels,
  formatOpenAiCompatibleModelName,
  getOpenAiProviderDescriptor,
  getProviderApiKey,
  normalizeProviderSettings,
  storeProviderApiKey,
  streamOpenAiCompatibleConversation,
  type OpenAiCompletionCallbacks,
  type OpenAiConversationMessage,
  type OpenAiConversationOptions,
  OpenAiProviderError,
} from './aiProviders';
import type { GuardianProfile } from './guardianProfile';
import {
  disconnectOpenRouter,
  hasOpenRouterConnection,
  importOpenRouterApiKey,
} from './openRouterAuth';

export type GuardianCloudModel = Awaited<ReturnType<typeof fetchOpenAiCompatibleModels>>[number];
export type GuardianCloudConversationMessage = OpenAiConversationMessage;

export function getGuardianCloudSettings(profile: GuardianProfile) {
  return normalizeProviderSettings({
    providerId: profile.cloudProviderId,
    baseUrl: profile.cloudBaseUrl,
    modelId: profile.cloudProviderId === 'openRouter'
      ? profile.cloudModelId || profile.openRouterModelId
      : profile.cloudModelId,
  });
}

export function getGuardianCloudProvider(profile: GuardianProfile) {
  return getOpenAiProviderDescriptor(getGuardianCloudSettings(profile).providerId);
}

export async function hasGuardianCloudConnection(profile: GuardianProfile) {
  const settings = getGuardianCloudSettings(profile);
  if (settings.providerId === 'openRouter') return hasOpenRouterConnection();
  const descriptor = getOpenAiProviderDescriptor(settings.providerId);
  return !descriptor.requiresApiKey || !!(await getProviderApiKey(settings.providerId));
}

function configuredModel(profile: GuardianProfile): GuardianCloudModel[] {
  const settings = getGuardianCloudSettings(profile);
  if (!settings.modelId) return [];
  return [{
    id: settings.modelId,
    name: settings.modelId,
    contextLength: 0,
    promptPrice: 0,
    completionPrice: 0,
    requestPrice: 0,
    imagePrice: 0,
    free: settings.providerId === 'ollama' || settings.providerId === 'vllm',
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsTools: false,
  }];
}

export async function fetchGuardianCloudModels(profile: GuardianProfile) {
  try {
    return await fetchOpenAiCompatibleModels(getGuardianCloudSettings(profile));
  } catch (error) {
    if (error instanceof OpenAiProviderError && error.code === 'unsupported') {
      const fallback = configuredModel(profile);
      if (fallback.length) return fallback;
    }
    throw error;
  }
}

export async function importGuardianCloudApiKey(profile: GuardianProfile, apiKey: string) {
  const settings = getGuardianCloudSettings(profile);
  if (settings.providerId === 'openRouter') {
    await importOpenRouterApiKey(apiKey);
    return fetchOpenAiCompatibleModels(settings);
  }
  await storeProviderApiKey(settings.providerId, apiKey);
  try {
    return await fetchGuardianCloudModels(profile);
  } catch (error) {
    await deleteProviderApiKey(settings.providerId);
    throw error;
  }
}

export async function disconnectGuardianCloudProvider(profile: GuardianProfile) {
  const settings = getGuardianCloudSettings(profile);
  if (settings.providerId === 'openRouter') return disconnectOpenRouter();
  return deleteProviderApiKey(settings.providerId);
}

export function streamGuardianCloudConversation(
  profile: GuardianProfile,
  messages: OpenAiConversationMessage[],
  systemPrompt: string,
  callbacks: OpenAiCompletionCallbacks,
  options: OpenAiConversationOptions = {}
) {
  return streamOpenAiCompatibleConversation(
    getGuardianCloudSettings(profile),
    messages,
    systemPrompt,
    callbacks,
    options
  );
}

export function formatGuardianCloudModelName(
  profile: GuardianProfile,
  modelId: string,
  models: GuardianCloudModel[] = []
) {
  return formatOpenAiCompatibleModelName(modelId, models);
}
