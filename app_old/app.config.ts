import type { ExpoConfig } from '@expo/config-types';
const { getBuildVersionInfo } = require('./scripts/build-version');

type AppExtra = {
  buildVersion?: {
    name?: string;
    storeName?: string;
    code?: number;
    source?: string;
  };
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
const pick = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    const normalized = trim(value);
    if (normalized) return normalized;
  }
  return '';
};
const unique = (values: string[]): string[] => [...new Set(values.map(trim).filter(Boolean))];

type ExpoPlugin = string | [string, Record<string, unknown>];

const getPluginName = (plugin: ExpoPlugin): string => (Array.isArray(plugin) ? plugin[0] : plugin);
const getPluginOptions = (plugins: ExpoPlugin[], name: string): Record<string, unknown> => {
  const plugin = plugins.find((entry) => getPluginName(entry) === name);
  if (!Array.isArray(plugin)) return {};
  const options = plugin[1];
  return options && typeof options === 'object' && !Array.isArray(options) ? { ...options } : {};
};
const upsertPlugin = (plugins: ExpoPlugin[], name: string, options?: Record<string, unknown>): void => {
  const nextPlugin: ExpoPlugin = options ? [name, options] : name;
  const index = plugins.findIndex((entry) => getPluginName(entry) === name);
  if (index >= 0) {
    plugins[index] = nextPlugin;
    return;
  }
  plugins.push(nextPlugin);
};
const toGoogleUrlScheme = (clientId: string): string => {
  const normalized = trim(clientId);
  if (normalized.startsWith('com.googleusercontent.apps.')) return normalized;
  const suffix = '.apps.googleusercontent.com';
  if (!normalized.endsWith(suffix)) return '';
  return `com.googleusercontent.apps.${normalized.slice(0, -suffix.length)}`;
};
const getHttpExceptionDomain = (baseUrl: string): string => {
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === 'http:' ? parsed.hostname : '';
  } catch {
    return '';
  }
};
const withHttpTransportException = (
  existing: unknown,
  domain: string
): Record<string, unknown> => {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const domains =
    base.NSExceptionDomains &&
    typeof base.NSExceptionDomains === 'object' &&
    !Array.isArray(base.NSExceptionDomains)
      ? { ...(base.NSExceptionDomains as Record<string, unknown>) }
      : {};
  const existingDomain =
    domains[domain] && typeof domains[domain] === 'object' && !Array.isArray(domains[domain])
      ? { ...(domains[domain] as Record<string, unknown>) }
      : {};

  return {
    ...base,
    NSExceptionDomains: {
      ...domains,
      [domain]: {
        ...existingDomain,
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: true
      }
    }
  };
};

const defaultExtra = (baseConfig.extra ?? {}) as AppExtra;
const defaultGoogle = defaultExtra.googleAuth ?? {};
const defaultBackend = defaultExtra.backend ?? {};
const backendBaseUrl = pick(process.env.EXPO_PUBLIC_BACKEND_BASE_URL, defaultBackend.baseUrl)
  .replace(/\/+$/, '');
const googleAuth = {
  androidClientId: pick(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    defaultGoogle.androidClientId
  ),
  iosClientId: pick(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, defaultGoogle.iosClientId),
  webClientId: pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, defaultGoogle.webClientId)
};
const iosGoogleUrlScheme = toGoogleUrlScheme(googleAuth.iosClientId);
const plugins = Array.isArray(baseConfig.plugins) ? ([...baseConfig.plugins] as ExpoPlugin[]) : [];
upsertPlugin(plugins, 'expo-video');
upsertPlugin(plugins, 'expo-image-picker', {
  ...getPluginOptions(plugins, 'expo-image-picker'),
  photosPermission: 'Allow Our Hangout to select photos and videos for chat.',
  cameraPermission: 'Allow Our Hangout to take photos and videos for chat.',
  microphonePermission: 'Allow Our Hangout to record audio while capturing videos.'
});
upsertPlugin(plugins, 'expo-media-library', {
  ...getPluginOptions(plugins, 'expo-media-library'),
  photosPermission: 'Allow Our Hangout to access photos and videos for chat.',
  savePhotosPermission: 'Allow Our Hangout to save photos and videos to your library.'
});
upsertPlugin(plugins, 'expo-background-task');
upsertPlugin(plugins, 'expo-location', {
  ...getPluginOptions(plugins, 'expo-location'),
  locationAlwaysAndWhenInUsePermission:
    'Allow Our Hangout to share your recent location with guardians and your own recovery tools.',
  locationAlwaysPermission:
    'Allow Our Hangout to share your recent location with guardians and your own recovery tools.',
  locationWhenInUsePermission: 'Allow Our Hangout to access your location while the app is open.',
  isAndroidBackgroundLocationEnabled: true,
  isIosBackgroundLocationEnabled: true
});
upsertPlugin(plugins, 'expo-notifications', {
  ...getPluginOptions(plugins, 'expo-notifications'),
  icon: './assets/android-icon-monochrome.png',
  color: '#8B95FF',
  defaultChannel: 'messages',
  enableBackgroundRemoteNotifications: true
});
if (iosGoogleUrlScheme) {
  upsertPlugin(plugins, '@react-native-google-signin/google-signin', {
    iosUrlScheme: iosGoogleUrlScheme
  });
}

const androidGoogleServicesFile = trim(process.env.ANDROID_GOOGLE_SERVICES_FILE);
const iosGoogleServicesFile = trim(process.env.IOS_GOOGLE_SERVICES_FILE);
const buildVersion = getBuildVersionInfo();
const iosBundleIdentifier = pick(
  process.env.IOS_BUNDLE_IDENTIFIER,
  process.env.EXPO_IOS_BUNDLE_IDENTIFIER,
  baseConfig.ios?.bundleIdentifier,
  'com.ourhangout'
);
const baseSchemes = Array.isArray(baseConfig.scheme)
  ? baseConfig.scheme
  : baseConfig.scheme
    ? [baseConfig.scheme]
    : [];
const schemes = unique([...baseSchemes, iosGoogleUrlScheme]);
const baseIosInfoPlist = (baseConfig.ios?.infoPlist ?? {}) as Record<string, unknown>;
const httpExceptionDomain = getHttpExceptionDomain(backendBaseUrl);
const iosInfoPlistBase: Record<string, unknown> = {
  ITSAppUsesNonExemptEncryption: false,
  NSCameraUsageDescription: 'Allow Our Hangout to take photos and videos for chat.',
  NSMicrophoneUsageDescription: 'Allow Our Hangout to record audio while capturing videos.',
  NSPhotoLibraryUsageDescription: 'Allow Our Hangout to select photos and videos for chat.',
  NSPhotoLibraryAddUsageDescription: 'Allow Our Hangout to save photos and videos to your library.',
  NSLocationWhenInUseUsageDescription: 'Allow Our Hangout to access your location while the app is open.',
  NSLocationAlwaysAndWhenInUseUsageDescription:
    'Allow Our Hangout to share your recent location with guardians and your own recovery tools.',
  ...baseIosInfoPlist
};
const iosInfoPlist = {
  ...iosInfoPlistBase,
  ...(httpExceptionDomain
    ? {
        NSAppTransportSecurity: withHttpTransportException(
          iosInfoPlistBase.NSAppTransportSecurity,
          httpExceptionDomain
        )
      }
    : {})
};

const config: ExpoConfig = {
  ...baseConfig,
  scheme: schemes,
  version: buildVersion.storeVersionName || buildVersion.versionName,
  plugins,
  ios: {
    ...baseConfig.ios,
    bundleIdentifier: iosBundleIdentifier,
    buildNumber: String(buildVersion.versionCode),
    infoPlist: iosInfoPlist,
    ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {})
  },
  android: {
    ...baseConfig.android,
    versionCode: buildVersion.versionCode,
    ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {})
  },
  extra: {
    ...defaultExtra,
    buildVersion: {
      name: buildVersion.versionName,
      storeName: buildVersion.storeVersionName || buildVersion.versionName,
      code: buildVersion.versionCode,
      source: buildVersion.source
    },
    googleAuth,
    backend: {
      ...defaultBackend,
      baseUrl: backendBaseUrl
    }
  }
};

export default config;
