import * as SecureStore from 'expo-secure-store';

import { getOpenRouterApiKey } from '../openRouterAuth';
import type { OpenAiCompatibleProviderId } from './types';

const credentialKey = (providerId: OpenAiCompatibleProviderId) => `guardian:openai_provider_key:${providerId}:v1`;

export async function getProviderApiKey(providerId: OpenAiCompatibleProviderId) {
  if (providerId === 'openRouter') return getOpenRouterApiKey();
  if (!(await SecureStore.isAvailableAsync())) return null;
  return SecureStore.getItemAsync(credentialKey(providerId));
}

export async function storeProviderApiKey(providerId: OpenAiCompatibleProviderId, apiKey: string) {
  if (providerId === 'openRouter') {
    throw new Error('OpenRouter 키는 OpenRouter 인증 모듈을 통해 저장해야 합니다.');
  }
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('이 기기에서는 보안 저장소를 사용할 수 없습니다.');
  }
  const normalized = apiKey.trim();
  if (!normalized) throw new Error('API 키를 입력해 주세요.');
  await SecureStore.setItemAsync(credentialKey(providerId), normalized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteProviderApiKey(providerId: OpenAiCompatibleProviderId) {
  if (providerId === 'openRouter') return;
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(credentialKey(providerId)).catch(() => undefined);
  }
}
