import Constants from 'expo-constants';
import * as Application from 'expo-application';

import { normalizeBackendBaseUrl } from './services/backend';

const DEFAULT_BACKEND_BASE_URL = 'http://wowjini0228.synology.me:7083';
const DEFAULT_GOOGLE_ANDROID_CLIENT_ID =
  '599659668409-311tkiv1ikkk55apu33h9j9pfk2rkvof.apps.googleusercontent.com';
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '599659668409-jo6tdh99iht1tle9mf089k8ba3en08ou.apps.googleusercontent.com';

type RuntimeExtra = {
  backend?: {
    baseUrl?: string;
  };
  googleAuth?: {
    androidClientId?: string;
    iosClientId?: string;
    webClientId?: string;
  };
};

export type RuntimeConfig = {
  baseUrl: string;
  googleAndroidClientId: string;
  googleIosClientId: string;
  googleWebClientId: string;
  appVersion: string;
};

export function getRuntimeConfig(): RuntimeConfig {
  const extra = (Constants.expoConfig?.extra || {}) as RuntimeExtra;
  return {
    baseUrl: normalizeBackendBaseUrl(extra.backend?.baseUrl || DEFAULT_BACKEND_BASE_URL),
    googleAndroidClientId: String(extra.googleAuth?.androidClientId || DEFAULT_GOOGLE_ANDROID_CLIENT_ID).trim(),
    googleIosClientId: String(extra.googleAuth?.iosClientId || '').trim(),
    googleWebClientId: String(extra.googleAuth?.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID).trim(),
    appVersion: String(Application.nativeApplicationVersion || Constants.expoConfig?.version || '0.1.0').trim(),
  };
}

export function getDeviceId(): string {
  const constants = Constants as typeof Constants & {
    deviceName?: string;
    sessionId?: string;
  };
  return String(constants.deviceName || constants.sessionId || 'unknown').trim();
}
