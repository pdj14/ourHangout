import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/auth/keys';
const OPENROUTER_KEY_STORAGE = 'guardian:openrouter_api_key_v1';
const KEY_EXCHANGE_TIMEOUT_MS = 20_000;
export const OPENROUTER_REDIRECT_URI = 'ourhangout://openrouter-callback';

export type OpenRouterAuthResult =
  | { status: 'connected' }
  | { status: 'cancelled' };

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

export async function getOpenRouterApiKey() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw authError('이 기기에서는 보안 저장소를 사용할 수 없어요.');
  }
  return SecureStore.getItemAsync(OPENROUTER_KEY_STORAGE);
}

export async function hasOpenRouterConnection() {
  return !!(await getOpenRouterApiKey());
}

export async function connectOpenRouter(): Promise<OpenRouterAuthResult> {
  const { verifier, challenge } = await createPkce();
  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set('callback_url', OPENROUTER_REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const browserResult = await WebBrowser.openAuthSessionAsync(
    authUrl.toString(),
    OPENROUTER_REDIRECT_URI,
    { showInRecents: false }
  );
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

  await SecureStore.setItemAsync(OPENROUTER_KEY_STORAGE, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return { status: 'connected' };
}

export async function disconnectOpenRouter() {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(OPENROUTER_KEY_STORAGE);
  }
}
