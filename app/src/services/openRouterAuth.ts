import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { NativeOpenRouterAuthCallback } from '../native';
import { buildOpenRouterHeaders, OPENROUTER_API_URL } from './openRouterConfig';

const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_KEY_URL = `${OPENROUTER_API_URL}/auth/keys`;
const OPENROUTER_CURRENT_KEY_URL = `${OPENROUTER_API_URL}/key`;
const OPENROUTER_KEY_STORAGE = 'guardian:openrouter_api_key_v1';
const KEY_EXCHANGE_TIMEOUT_MS = 20_000;
export const OPENROUTER_REDIRECT_URI = 'ourhangout://openrouter-callback';

export type OpenRouterAuthResult =
  | { status: 'connected' }
  | { status: 'cancelled' };

export type OpenRouterKeyMetadata = {
  label: string;
  limitRemaining: number | null;
  isFreeTier: boolean;
  expiresAt: string | null;
};

export class OpenRouterAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_key' | 'network' | 'storage'
  ) {
    super(message);
    this.name = 'OpenRouterAuthError';
  }
}

WebBrowser.maybeCompleteAuthSession();

function bytesToVerifier(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function toBase64Url(value: string) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createPkce() {
  const verifier = bytesToVerifier(await Crypto.getRandomBytesAsync(64));
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return { verifier, challenge: toBase64Url(digest) };
}

function authError(message: string) {
  return new Error(message);
}

function normalizeManualApiKey(value: string) {
  const key = value.trim();
  if (!key.startsWith('sk-or-') || key.length < 24 || key.length > 512 || /\s/.test(key)) {
    throw new OpenRouterAuthError('OpenRouter API 키 형식을 확인해 주세요. 전체 키는 sk-or-로 시작합니다.', 'invalid_key');
  }
  return key;
}

async function storeOpenRouterApiKey(key: string) {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new OpenRouterAuthError('이 기기에서는 보안 저장소를 사용할 수 없어요.', 'storage');
  }
  await SecureStore.setItemAsync(OPENROUTER_KEY_STORAGE, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function requestKeyMetadata(key: string): Promise<OpenRouterKeyMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KEY_EXCHANGE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENROUTER_CURRENT_KEY_URL, {
      signal: controller.signal,
      headers: buildOpenRouterHeaders(key),
    });
  } catch {
    throw new OpenRouterAuthError('OpenRouter 키를 확인할 수 없어요. 네트워크를 확인해 주세요.', 'network');
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 || response.status === 403) {
    throw new OpenRouterAuthError('유효하지 않거나 만료된 OpenRouter API 키예요.', 'invalid_key');
  }
  if (!response.ok) {
    throw new OpenRouterAuthError(`OpenRouter 키 확인에 실패했어요. (${response.status})`, 'network');
  }
  const payload = await response.json().catch(() => null) as {
    data?: {
      label?: unknown;
      limit_remaining?: unknown;
      is_free_tier?: unknown;
      is_management_key?: unknown;
      is_provisioning_key?: unknown;
      expires_at?: unknown;
    };
  } | null;
  if (!payload?.data) {
    throw new OpenRouterAuthError('OpenRouter 키 정보를 확인하지 못했어요.', 'invalid_key');
  }
  if (payload.data.is_management_key === true || payload.data.is_provisioning_key === true) {
    throw new OpenRouterAuthError('관리용 키가 아닌 일반 OpenRouter API 키를 입력해 주세요.', 'invalid_key');
  }
  const remaining = Number(payload.data.limit_remaining);
  return {
    label: String(payload.data.label || '').trim(),
    limitRemaining: Number.isFinite(remaining) ? remaining : null,
    isFreeTier: payload.data.is_free_tier === true,
    expiresAt: typeof payload.data.expires_at === 'string' ? payload.data.expires_at : null,
  };
}

export async function getOpenRouterApiKey() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw authError('이 기기에서는 보안 저장소를 사용할 수 없어요.');
  }
  return SecureStore.getItemAsync(OPENROUTER_KEY_STORAGE);
}

export async function hasOpenRouterConnection() {
  return !!(await getOpenRouterApiKey());
}

export async function validateOpenRouterConnection() {
  const key = await getOpenRouterApiKey();
  if (!key) throw new OpenRouterAuthError('먼저 OpenRouter 계정을 연결해 주세요.', 'invalid_key');
  return requestKeyMetadata(key);
}

export async function importOpenRouterApiKey(value: string) {
  const key = normalizeManualApiKey(value);
  const metadata = await requestKeyMetadata(key);
  await storeOpenRouterApiKey(key);
  return metadata;
}

export async function connectOpenRouter(): Promise<OpenRouterAuthResult> {
  if (!NativeOpenRouterAuthCallback) {
    throw authError('이 앱 빌드에서는 OpenRouter 인증 콜백을 사용할 수 없어요.');
  }
  const { verifier, challenge } = await createPkce();
  const loopbackRedirectUri = await NativeOpenRouterAuthCallback.start();
  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set('callback_url', loopbackRedirectUri);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  let browserResult: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
  try {
    browserResult = await WebBrowser.openAuthSessionAsync(
      authUrl.toString(),
      OPENROUTER_REDIRECT_URI,
      { showInRecents: false }
    );
  } finally {
    await NativeOpenRouterAuthCallback.stop().catch(() => false);
  }
  if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
    return { status: 'cancelled' };
  }
  if (browserResult.type !== 'success' || !browserResult.url) {
    throw authError('OpenRouter 인증 결과를 확인하지 못했어요.');
  }

  const callback = new URL(browserResult.url);
  const callbackError = callback.searchParams.get('error');
  if (callbackError) {
    throw authError(callback.searchParams.get('error_description') || 'OpenRouter 연결이 승인되지 않았어요.');
  }
  const code = callback.searchParams.get('code')?.trim();
  if (!code) throw authError('OpenRouter 인증 코드가 전달되지 않았어요.');

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KEY_EXCHANGE_TIMEOUT_MS);
  try {
    response = await fetch(OPENROUTER_KEY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
    });
  } catch {
    throw authError('OpenRouter에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null) as {
    key?: unknown;
    error?: { message?: unknown } | string;
  } | null;
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : String(payload?.error?.message || '').trim();
    throw authError(message || 'OpenRouter API 키를 발급받지 못했어요.');
  }
  const key = String(payload?.key || '').trim();
  if (!key) throw authError('OpenRouter가 유효한 API 키를 반환하지 않았어요.');

  await storeOpenRouterApiKey(key);
  return { status: 'connected' };
}

export async function disconnectOpenRouter() {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(OPENROUTER_KEY_STORAGE);
  }
}
