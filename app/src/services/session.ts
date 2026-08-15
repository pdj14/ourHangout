import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type PersistedSession = {
  accessToken: string;
  refreshToken?: string;
};

export const SESSION_STORAGE_KEY = 'ourhangout.session.v1';

const canUseSecureStore = Platform.OS !== 'web';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function parseSession(raw: string | null | undefined): PersistedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    const accessToken = String(parsed.accessToken || '').trim();
    const refreshToken = String(parsed.refreshToken || '').trim();
    if (!accessToken) return null;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<PersistedSession | null> {
  if (canUseSecureStore) {
    const secureRaw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY, secureStoreOptions).catch(() => null);
    const secureSession = parseSession(secureRaw);
    if (secureSession) return secureSession;

    const fallbackRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY).catch(() => null);
    const fallbackSession = parseSession(fallbackRaw);
    if (fallbackSession) {
      await SecureStore.setItemAsync(
        SESSION_STORAGE_KEY,
        JSON.stringify(fallbackSession),
        secureStoreOptions
      );
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => null);
    }
    return fallbackSession;
  }

  const fallbackRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY).catch(() => null);
  return parseSession(fallbackRaw);
}

export async function writeSession(session: PersistedSession): Promise<void> {
  const payload = JSON.stringify(session);
  if (canUseSecureStore) {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, payload, secureStoreOptions);
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => null);
    return;
  }
  await AsyncStorage.setItem(SESSION_STORAGE_KEY, payload);
}

export async function clearSession(): Promise<void> {
  if (canUseSecureStore) {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY, secureStoreOptions).catch(() => null);
  }
  await AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => null);
}
