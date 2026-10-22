import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

export type BackendAppUpdateRelease = {
  version?: string;
  notes?: string;
  fileName?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  publishedAt?: string;
  downloadUrl?: string;
  latestDownloadUrl?: string;
  fileExists?: boolean;
  isLatest?: boolean;
};

export type BackendAppUpdateStatus = {
  currentVersion?: string;
  latestVersion?: string;
  isLatest?: boolean;
  release?: BackendAppUpdateRelease | null;
};

export type AppUpdateState = {
  checked: boolean;
  checking: boolean;
  needsUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  release: BackendAppUpdateRelease | null;
  errorMessage: string;
};

export type AppUpdateInstallPhase = 'idle' | 'downloading' | 'openingInstaller';

export const initialAppUpdateState: AppUpdateState = {
  checked: false,
  checking: false,
  needsUpdate: false,
  latestVersion: '',
  downloadUrl: '',
  release: null,
  errorMessage: '',
};

const APP_PACKAGE_ID = 'com.ourhangout';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export function getCurrentAppVersion(): string {
  return String(
    Application.nativeApplicationVersion ||
      Constants.nativeAppVersion ||
      Constants.expoConfig?.extra?.buildVersion?.name ||
      Constants.expoConfig?.version ||
      '0'
  ).trim() || '0';
}

function tokenizeVersion(value: string): Array<number | string> {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareVersionToken(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left > right ? 1 : -1;
  }
  if (typeof left === 'number') return 1;
  if (typeof right === 'number') return -1;
  const compared = left.localeCompare(right);
  return compared === 0 ? 0 : compared > 0 ? 1 : -1;
}

export function compareVersionStrings(left: string, right: string): number {
  const leftTokens = tokenizeVersion(left);
  const rightTokens = tokenizeVersion(right);
  const maxLength = Math.max(leftTokens.length, rightTokens.length);
  for (let index = 0; index < maxLength; index += 1) {
    const compared = compareVersionToken(leftTokens[index] ?? 0, rightTokens[index] ?? 0);
    if (compared !== 0) return compared;
  }
  return 0;
}

export function formatAppUpdateFileSize(sizeBytes?: number): string {
  if (!Number.isFinite(sizeBytes) || !sizeBytes || sizeBytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function sanitizeVersion(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'latest';
}

async function openUnknownSourcesSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${APP_PACKAGE_ID}`,
    });
  } catch {
    await Linking.openSettings().catch(() => null);
  }
}

export async function downloadAndInstallAppUpdate(
  downloadUrl: string,
  version: string,
  onStageChange: (stage: Exclude<AppUpdateInstallPhase, 'idle'>) => void
): Promise<boolean> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(downloadUrl);
    return true;
  }

  try {
    const sideLoadingEnabled = await Device.isSideLoadingEnabledAsync();
    if (!sideLoadingEnabled) {
      Alert.alert(
        '설치 권한이 필요해요',
        '서버에서 받은 업데이트를 설치하려면 이 앱에 “알 수 없는 앱 설치” 권한을 허용해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => void openUnknownSourcesSettings() },
        ]
      );
      return false;
    }

    const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDirectory) throw new Error('업데이트 파일을 저장할 공간을 찾지 못했습니다.');

    const targetUri = `${baseDirectory}ourhangout-update-${sanitizeVersion(version)}.apk`;
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => null);

    onStageChange('downloading');
    const result = await FileSystem.downloadAsync(downloadUrl, targetUri);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`업데이트 다운로드에 실패했습니다. (${result.status})`);
    }

    onStageChange('openingInstaller');
    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: APK_MIME_TYPE,
    });
    return true;
  } catch (error) {
    Alert.alert(
      '업데이트 실패',
      error instanceof Error ? error.message : '업데이트 파일을 내려받거나 설치 화면을 열지 못했습니다.'
    );
    return false;
  }
}
