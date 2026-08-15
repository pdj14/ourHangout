import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedSession = {
  accessToken: string;
  refreshToken?: string;
};

type NativeAuthSessionModule = {
  readSession?: () => Promise<{ accessToken?: string; refreshToken?: string } | null>;
  refreshSession?: (
    baseUrl: string,
    refreshToken?: string
  ) => Promise<{ accessToken?: string; refreshToken?: string } | null>;
  storeSession?: (accessToken: string, refreshToken?: string) => Promise<boolean>;
  clearSession?: () => Promise<boolean>;
};

const canUseSecureStore = Platform.OS !== 'web';

function parsePersistedSession(raw: string | null | undefined): PersistedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    const accessToken = (parsed.accessToken || '').trim();
    const refreshToken = (parsed.refreshToken || '').trim();
    if (!accessToken) return null;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    };
  } catch {
    return null;
  }
}

function getNativeAuthSessionModule(): NativeAuthSessionModule | undefined {
  return NativeModules.LocationCaptureModule as NativeAuthSessionModule | undefined;
}

async function readNativeSession(): Promise<PersistedSession | null> {
  const nativeModule = getNativeAuthSessionModule();
  if (!nativeModule?.readSession) return null;
  try {
    const raw = await nativeModule.readSession();
    const accessToken = String(raw?.accessToken || '').trim();
    const refreshToken = String(raw?.refreshToken || '').trim();
    if (!accessToken) return null;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    };
  } catch {
    return null;
  }
}

async function syncNativeSession(session: PersistedSession): Promise<void> {
  const nativeModule = getNativeAuthSessionModule();
  if (!nativeModule?.storeSession) return;
  await nativeModule.storeSession(session.accessToken, session.refreshToken || '').catch(() => null);
}

async function clearNativeSession(): Promise<void> {
  const nativeModule = getNativeAuthSessionModule();
  if (!nativeModule?.clearSession) return;
  await nativeModule.clearSession().catch(() => null);
}

async function readJsSession(storageKey: string): Promise<PersistedSession | null> {
  let stored: PersistedSession | null = null;
  if (canUseSecureStore) {
    try {
      const secureRaw = await SecureStore.getItemAsync(storageKey);
      stored = parsePersistedSession(secureRaw);
    } catch {
      stored = null;
    }
  }
  if (!stored) {
    try {
      const fallbackRaw = await AsyncStorage.getItem(storageKey);
      stored = parsePersistedSession(fallbackRaw);
    } catch {
      stored = null;
    }
  }
  return stored;
}

export function hasNativeAuthRefreshSupport(): boolean {
  return Platform.OS === 'android' && !!getNativeAuthSessionModule()?.refreshSession;
}

export async function refreshNativeAuthSession(
  baseUrl: string,
  preferredRefreshToken?: string
): Promise<PersistedSession | null> {
  const nativeModule = getNativeAuthSessionModule();
  if (!nativeModule?.refreshSession) return null;
  const raw = await nativeModule.refreshSession(baseUrl, preferredRefreshToken || '');
  const accessToken = String(raw?.accessToken || '').trim();
  const refreshToken = String(raw?.refreshToken || '').trim();
  if (!accessToken) return null;
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
  };
}

export async function readAuthSession(storageKey: string): Promise<PersistedSession | null> {
  if (Platform.OS === 'android') {
    const nativeSession = await readNativeSession().catch(() => null);
    if (nativeSession?.accessToken) {
      const stored = await readJsSession(storageKey);
      if (
        !stored ||
        nativeSession.accessToken !== stored.accessToken ||
        (nativeSession.refreshToken || '') !== (stored.refreshToken || '')
      ) {
        await writeAuthSession(storageKey, nativeSession).catch(() => null);
      }
      return nativeSession;
    }
  }

  const stored = await readJsSession(storageKey);
  if (Platform.OS === 'android' && stored?.accessToken) {
    await syncNativeSession(stored).catch(() => null);
  }

  const nativeSession = await readNativeSession().catch(() => null);
  if (
    nativeSession?.accessToken &&
    (!stored ||
      nativeSession.accessToken !== stored.accessToken ||
      (nativeSession.refreshToken || '') !== (stored.refreshToken || ''))
  ) {
    await writeAuthSession(storageKey, nativeSession).catch(() => null);
    return nativeSession;
  }

  return stored;
}

export async function writeAuthSession(storageKey: string, session: PersistedSession): Promise<void> {
  const payload = JSON.stringify(session);
  if (canUseSecureStore) {
    try {
      await SecureStore.setItemAsync(storageKey, payload);
    } catch {
      // Keep AsyncStorage/native sync even when SecureStore fails.
    }
  }
  try {
    await AsyncStorage.setItem(storageKey, payload);
  } catch {
    // Ignore fallback storage failure.
  }
  await syncNativeSession(session).catch(() => null);
}

export async function clearAuthSession(storageKey: string): Promise<void> {
  if (canUseSecureStore) {
    try {
      await SecureStore.deleteItemAsync(storageKey);
    } catch {
      // Ignore cleanup failure.
    }
  }
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failure.
  }
  await clearNativeSession().catch(() => null);
}
