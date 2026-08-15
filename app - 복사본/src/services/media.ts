import * as FileSystem from 'expo-file-system/legacy';

import type {
  AttachmentDraft,
  BackendCompletedMedia,
  BackendMediaUploadTicket,
} from '../types';
import type { BackendClient } from './backend';

export function inferMediaMimeType(uri: string, kind: 'image' | 'video', fallback?: string | null): string {
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (normalizedFallback) return normalizedFallback;
  const lower = uri.toLowerCase();
  if (kind === 'image') {
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

export function isLocalUri(uri?: string | null): boolean {
  const value = String(uri || '').trim();
  return /^(file|content):\/\//i.test(value) || value.startsWith('/');
}

export function mediaPreviewLabel(kind: 'image' | 'video'): string {
  return kind === 'image' ? '사진' : '영상';
}

function resolveBackendUrl(client: BackendClient, value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${client.getBaseUrl()}${trimmed}`;
  return trimmed;
}

export async function uploadAttachment(client: BackendClient, attachment: AttachmentDraft): Promise<string> {
  const info = await FileSystem.getInfoAsync(attachment.uri);
  if (!info.exists || info.isDirectory) {
    throw new Error('선택한 파일을 읽을 수 없습니다.');
  }

  const mimeType = inferMediaMimeType(attachment.uri, attachment.kind, attachment.mimeType);
  const issued = await client.request<BackendMediaUploadTicket>('/v1/media/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      kind: attachment.kind,
      mimeType,
      size: typeof info.size === 'number' ? info.size : attachment.fileSize || undefined,
    }),
  });

  const uploadUrl = resolveBackendUrl(client, String(issued.uploadUrl || ''));
  const fileUrl = String(issued.fileUrl || '').trim();
  if (!uploadUrl || !fileUrl) {
    throw new Error('업로드 주소를 발급받지 못했습니다.');
  }

  const token = client.getAccessToken();
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, attachment.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': mimeType,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`파일 업로드에 실패했습니다. (${uploadResult.status})`);
  }

  const completed = await client.request<BackendCompletedMedia>('/v1/media/complete', {
    method: 'POST',
    body: JSON.stringify({
      fileUrl,
      kind: attachment.kind,
    }),
  });

  return resolveBackendUrl(client, String(completed.fileUrl || fileUrl));
}

export async function uploadAvatar(client: BackendClient, uri: string, mimeType?: string | null): Promise<string> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) {
    throw new Error('프로필 사진을 읽을 수 없습니다.');
  }

  const resolvedMimeType = inferMediaMimeType(uri, 'image', mimeType || 'image/jpeg');
  const issued = await client.request<BackendMediaUploadTicket>('/v1/me/avatar/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      mimeType: resolvedMimeType,
      size: typeof info.size === 'number' ? info.size : undefined,
    }),
  });

  const uploadUrl = resolveBackendUrl(client, String(issued.uploadUrl || ''));
  const fileUrl = String(issued.fileUrl || '').trim();
  if (!uploadUrl || !fileUrl) {
    throw new Error('프로필 업로드 주소를 발급받지 못했습니다.');
  }

  const token = client.getAccessToken();
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': resolvedMimeType,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`프로필 사진 업로드에 실패했습니다. (${uploadResult.status})`);
  }

  const completed = await client.request<BackendCompletedMedia>('/v1/media/complete', {
    method: 'POST',
    body: JSON.stringify({
      fileUrl,
      kind: 'avatar',
    }),
  });

  return resolveBackendUrl(client, String(completed.fileUrl || fileUrl));
}
