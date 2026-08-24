import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 숨겨진 개발자 모드 상태.
// - 프로필 화면의 지키미 마스코트를 짧은 시간 안에 여러 번 탭하면 토글된다.
// - 설정은 AsyncStorage에 저장되므로 앱 재시작 후에도 유지된다.
// - 릴리스 빌드에서도 동작한다(__DEV__와 무관한 순수 앱 상태).

const DEBUG_MODE_STORAGE_KEY = 'ourhangout.debug-mode.v1';

type DebugModeListener = (enabled: boolean) => void;

let cachedEnabled = false;
let hydration: Promise<void> | null = null;
const listeners = new Set<DebugModeListener>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener(cachedEnabled));
}

/** 저장된 값을 읽어 캐시를 채운다. 최초 1회만 수행된다. */
export function ensureDebugModeHydrated(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(DEBUG_MODE_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        cachedEnabled = stored === 'on';
        notifyListeners();
      });
  }
  return hydration;
}

/** 동기 조회용. hydrate 전에는 false를 반환한다. */
export function isDebugModeEnabled(): boolean {
  return cachedEnabled;
}

export async function setDebugModeEnabled(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  notifyListeners();
  await AsyncStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? 'on' : 'off').catch(() => undefined);
}

export function subscribeDebugMode(listener: DebugModeListener): () => void {
  listeners.add(listener);
  void ensureDebugModeHydrated();
  return () => {
    listeners.delete(listener);
  };
}

/** React 훅. 개발자 모드 on/off에 맞춰 컴포넌트를 다시 렌더링한다. */
export function useDebugMode(): boolean {
  const [enabled, setEnabled] = useState(cachedEnabled);
  useEffect(() => subscribeDebugMode(setEnabled), []);
  return enabled;
}
