import { NativeModules } from 'react-native';
export const NativeDiary = NativeModules.OurHangoutDiary as {
  open: (userId: string, baseUrl: string, token: string, compose: boolean) => Promise<boolean>;
  consumeSharedDiary: () => Promise<string>;
  clearSession: () => Promise<boolean>;
} | undefined;
