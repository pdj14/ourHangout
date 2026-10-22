import AsyncStorage from '@react-native-async-storage/async-storage';

export type ServerEnvironment = 'MAIN' | 'DEV';

const SERVER_ENVIRONMENT_STORAGE_KEY = 'ourhangout.server-environment.v1';
const SERVER_PORTS: Record<ServerEnvironment, string> = {
  MAIN: '7083',
  DEV: '7084',
};

export function serverEnvironmentForBaseUrl(baseUrl: string): ServerEnvironment {
  try {
    return new URL(baseUrl).port === SERVER_PORTS.DEV ? 'DEV' : 'MAIN';
  } catch {
    return /:7084(?:\/|$)/.test(baseUrl) ? 'DEV' : 'MAIN';
  }
}

export function baseUrlForServerEnvironment(
  baseUrl: string,
  environment: ServerEnvironment
): string {
  try {
    const url = new URL(baseUrl);
    url.port = SERVER_PORTS[environment];
    return url.toString().replace(/\/$/, '');
  } catch {
    const port = SERVER_PORTS[environment];
    if (/:\d+(?:\/|$)/.test(baseUrl)) {
      return baseUrl.replace(/:\d+(?=\/|$)/, `:${port}`).replace(/\/$/, '');
    }
    return `${baseUrl.replace(/\/$/, '')}:${port}`;
  }
}

export function nextServerEnvironment(environment: ServerEnvironment): ServerEnvironment {
  return environment === 'MAIN' ? 'DEV' : 'MAIN';
}

export async function readServerEnvironment(
  fallback: ServerEnvironment = 'MAIN'
): Promise<ServerEnvironment> {
  const stored = await AsyncStorage.getItem(SERVER_ENVIRONMENT_STORAGE_KEY).catch(() => null);
  return stored === 'MAIN' || stored === 'DEV' ? stored : fallback;
}

export async function writeServerEnvironment(environment: ServerEnvironment): Promise<void> {
  await AsyncStorage.setItem(SERVER_ENVIRONMENT_STORAGE_KEY, environment).catch(() => undefined);
}
