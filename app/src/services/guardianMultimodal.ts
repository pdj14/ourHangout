import * as FileSystem from 'expo-file-system/legacy';

import type { ChatAttachment } from '../types';
import type { OpenAiUserContentPart } from './aiProviders';
import type { OnDeviceChatMessage } from './onDeviceAi';

const MAX_BYTES: Record<ChatAttachment['kind'], number> = {
  image: 12 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 24 * 1024 * 1024,
};

function audioFormat(attachment: ChatAttachment) {
  const mime = String(attachment.mimeType || '').toLowerCase();
  const name = String(attachment.fileName || attachment.uri).toLowerCase();
  if (mime.includes('wav') || name.endsWith('.wav')) return 'wav';
  if (mime.includes('flac') || name.endsWith('.flac')) return 'flac';
  if (mime.includes('aiff') || name.endsWith('.aiff') || name.endsWith('.aif')) return 'aiff';
  if (mime.includes('aac') || name.endsWith('.aac')) return 'aac';
  if (mime.includes('ogg') || name.endsWith('.ogg') || name.endsWith('.oga')) return 'ogg';
  if (mime.includes('webm') || name.endsWith('.webm')) return 'webm';
  if (mime.includes('mp4') || name.endsWith('.m4a') || name.endsWith('.mp4')) return 'm4a';
  return 'mp3';
}

function fallbackMimeType(attachment: ChatAttachment) {
  const mime = String(attachment.mimeType || '').toLowerCase();
  if (attachment.kind === 'image') return mime.startsWith('image/') ? mime : 'image/jpeg';
  if (attachment.kind === 'video') {
    if (mime.includes('quicktime') || mime.includes('mov')) return 'video/mov';
    if (mime === 'video/mpeg' || mime === 'video/webm' || mime === 'video/mp4') return mime;
    return 'video/mp4';
  }
  return `audio/${audioFormat(attachment)}`;
}

export function supportedGuardianAttachmentMessage(kind: ChatAttachment['kind'], maxBytes = MAX_BYTES[kind]) {
  return `${kind === 'image' ? '\uC774\uBBF8\uC9C0' : kind === 'video' ? '\uB3D9\uC601\uC0C1' : '\uC624\uB514\uC624'}\uB294 ${Math.floor(maxBytes / 1024 / 1024)}MB \uC774\uD558 \uD30C\uC77C\uB9CC \uBCF4\uB0BC \uC218 \uC788\uC5B4\uC694.`;
}

export async function buildGuardianUserContent(message: OnDeviceChatMessage): Promise<string | OpenAiUserContentPart[]> {
  const attachment = message.attachment;
  if (!attachment) return message.content;
  const info = await FileSystem.getInfoAsync(attachment.uri);
  if (!info.exists || info.isDirectory) {
    throw new Error('\uCCA8\uBD80 \uD30C\uC77C\uC744 \uB2E4\uC2DC \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694. \uD30C\uC77C\uC744 \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.');
  }
  const size = typeof info.size === 'number' ? info.size : attachment.fileSize || 0;
  if (size > MAX_BYTES[attachment.kind]) {
    throw new Error(supportedGuardianAttachmentMessage(attachment.kind));
  }
  const data = await FileSystem.readAsStringAsync(attachment.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const parts: OpenAiUserContentPart[] = [];
  if (message.content.trim()) parts.push({ type: 'text', text: message.content.trim() });
  if (attachment.kind === 'audio') {
    parts.push({ type: 'input_audio', input_audio: { data, format: audioFormat(attachment) } });
  } else {
    const url = `data:${fallbackMimeType(attachment)};base64,${data}`;
    parts.push(attachment.kind === 'image'
      ? { type: 'image_url', image_url: { url } }
      : { type: 'video_url', video_url: { url } });
  }
  return parts;
}
