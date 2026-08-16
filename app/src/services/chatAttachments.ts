import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { AttachmentDraft, ChatMediaKind } from '../types';

function attachmentId() {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function pickChatAttachment(kind: ChatMediaKind): Promise<AttachmentDraft | null> {
  if (kind === 'audio') {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];
    return {
      id: attachmentId(),
      kind,
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.name,
      fileSize: asset.size,
      status: 'picked',
    };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('\uC0AC\uC9C4\uACFC \uB3D9\uC601\uC0C1\uC5D0 \uC811\uADFC\uD560 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: [kind === 'image' ? 'images' : 'videos'],
    allowsEditing: false,
    quality: kind === 'image' ? 0.86 : 1,
    videoMaxDuration: 180,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const resolvedKind: ChatMediaKind = asset.type === 'video' ? 'video' : 'image';
  return {
    id: attachmentId(),
    kind: resolvedKind,
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    status: 'picked',
  };
}
