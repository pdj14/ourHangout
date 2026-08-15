import { NativeModules } from 'react-native';

export type NativeLocationCaptureModule = {
  storeSession: (accessToken: string, refreshToken?: string) => Promise<boolean>;
  clearSession: () => Promise<boolean>;
  startCapture: (
    baseUrl: string,
    accessToken: string,
    refreshToken: string,
    source: string,
    precise: boolean
  ) => Promise<boolean>;
  startCaptureWithRequest: (
    baseUrl: string,
    requestToken: string,
    source: string,
    precise: boolean
  ) => Promise<boolean>;
};

export type NativePushTokenModule = {
  getToken: () => Promise<string>;
  deleteToken?: () => Promise<boolean>;
};

export const NativeLocationCapture = NativeModules.LocationCaptureModule as
  | NativeLocationCaptureModule
  | undefined;

export const NativePushToken = NativeModules.PushTokenModule as NativePushTokenModule | undefined;
