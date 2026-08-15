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

export type NativeAiModelFile = {
  uri: string;
  name: string;
  sizeBytes: number;
  modifiedAt: number;
  prepared: boolean;
};

export type NativeAiModelsDirectory = {
  directoryUri: string | null;
  directoryName: string | null;
  models: NativeAiModelFile[];
};

export type NativeAiRuntimeCapacity = {
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  lowMemoryThresholdBytes: number;
  lowMemory: boolean;
  availableStorageBytes: number;
};

export type NativeAiModelStorageModule = {
  pickModelsDirectory: () => Promise<NativeAiModelsDirectory>;
  getModels: () => Promise<NativeAiModelsDirectory>;
  prepareModel: (modelUri: string) => Promise<string>;
  getRuntimeCapacity: () => Promise<NativeAiRuntimeCapacity>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

export type NativeBrowserLink = {
  title: string;
  url: string;
};

export type NativeBrowserPage = {
  title: string;
  url: string;
  text: string;
  links: NativeBrowserLink[];
};

export type NativeBrowserToolModule = {
  search: (query: string) => Promise<NativeBrowserPage>;
  openUrl: (url: string) => Promise<NativeBrowserPage>;
  cancel: () => Promise<boolean>;
};

export type NativeOpenRouterAuthCallbackModule = {
  start: () => Promise<string>;
  stop: () => Promise<boolean>;
};

export const NativeLocationCapture = NativeModules.LocationCaptureModule as
  | NativeLocationCaptureModule
  | undefined;

export const NativePushToken = NativeModules.PushTokenModule as NativePushTokenModule | undefined;

export const NativeAiModelStorage = NativeModules.AiModelStorageModule as
  | NativeAiModelStorageModule
  | undefined;

export const NativeBrowserTool = NativeModules.BrowserToolModule as
  | NativeBrowserToolModule
  | undefined;

export const NativeOpenRouterAuthCallback = NativeModules.OpenRouterAuthCallbackModule as
  | NativeOpenRouterAuthCallbackModule
  | undefined;
