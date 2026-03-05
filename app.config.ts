import type { ExpoConfig } from '@expo/config-types';

type AppExtra = {
  googleAuth?: {
    androidClientId?: string;
    iosClientId?: string;
    webClientId?: string;
  };
  backend?: {
    baseUrl?: string;
  };
};

const baseConfig = (require('./app.json').expo ?? {}) as ExpoConfig & {
  extra?: AppExtra;
};

const trim = (value?: string): string => (value ?? '').trim();
const pick = (envValue: string | undefined, fallback?: string): string =>
  trim(envValue) || trim(fallback);

const defaultExtra = (baseConfig.extra ?? {}) as AppExtra;
const defaultGoogle = defaultExtra.googleAuth ?? {};
const defaultBackend = defaultExtra.backend ?? {};

const backendBaseUrl = pick(process.env.EXPO_PUBLIC_BACKEND_BASE_URL, defaultBackend.baseUrl)
  .replace(/\/+$/, '');

const config: ExpoConfig = {
  ...baseConfig,
  extra: {
    ...defaultExtra,
    googleAuth: {
      ...defaultGoogle,
      androidClientId: pick(
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        defaultGoogle.androidClientId
      ),
      iosClientId: pick(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, defaultGoogle.iosClientId),
      webClientId: pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, defaultGoogle.webClientId)
    },
    backend: {
      ...defaultBackend,
      baseUrl: backendBaseUrl
    }
  }
};

export default config;
