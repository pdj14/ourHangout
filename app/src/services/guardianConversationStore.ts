import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OnDeviceChatMessage } from './onDeviceAi';
import type { ChatAttachment, ChatMediaKind } from '../types';

const STORAGE_KEY = 'guardian:conversation_rooms_v1';
export const LEGACY_GUARDIAN_HISTORY_KEY = 'on_device_ai:history_v1';
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONVERSATION = 60;

export type GuardianConversationRoom = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: OnDeviceChatMessage[];
};

export type GuardianConversationStore = {
  activeConversationId: string;
  conversations: GuardianConversationRoom[];
};

type LegacyStoredHistory = {
  messages?: OnDeviceChatMessage[];
};

function createId() {
  return `guardian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(value: unknown): OnDeviceChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<OnDeviceChatMessage>;
  if (record.role !== 'user' && record.role !== 'assistant') return null;
  if (typeof record.content !== 'string') return null;
  let attachment: ChatAttachment | undefined;
  if (record.attachment && typeof record.attachment === 'object') {
    const rawAttachment = record.attachment as Partial<ChatAttachment>;
    const kind = rawAttachment.kind as ChatMediaKind;
    if ((kind === 'image' || kind === 'video' || kind === 'audio') && typeof rawAttachment.uri === 'string' && rawAttachment.uri) {
      attachment = {
        id: typeof rawAttachment.id === 'string' && rawAttachment.id ? rawAttachment.id : createId(),
        kind,
        uri: rawAttachment.uri,
        mimeType: typeof rawAttachment.mimeType === 'string' ? rawAttachment.mimeType : null,
        fileName: typeof rawAttachment.fileName === 'string' ? rawAttachment.fileName : null,
        fileSize: Number.isFinite(rawAttachment.fileSize) ? Number(rawAttachment.fileSize) : null,
      };
    }
  }
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createId(),
    role: record.role,
    content: record.content,
    createdAt: Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now(),
    ...(attachment ? { attachment } : {}),
  };
}

function titleFromMessages(messages: OnDeviceChatMessage[]) {
  const firstQuestion = messages.find((message) => message.role === 'user' && message.content.trim());
  if (!firstQuestion) return '새 이야기';
  const singleLine = firstQuestion.content.replace(/\s+/g, ' ').trim();
  return singleLine.length > 28 ? `${singleLine.slice(0, 28)}…` : singleLine;
}

function normalizeRoom(value: unknown): GuardianConversationRoom | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<GuardianConversationRoom>;
  if (!Array.isArray(record.messages)) return null;
  const messages = record.messages
    .map(normalizeMessage)
    .filter((message): message is OnDeviceChatMessage => !!message)
    .slice(-MAX_MESSAGES_PER_CONVERSATION);
  const createdAt = Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now();
  const updatedAt = Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : createdAt;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createId(),
    title: typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : titleFromMessages(messages),
    createdAt,
    updatedAt,
    messages,
  };
}

export function createGuardianConversationRoom(
  messages: OnDeviceChatMessage[] = []
): GuardianConversationRoom {
  const now = Date.now();
  return {
    id: createId(),
    title: titleFromMessages(messages),
    createdAt: now,
    updatedAt: now,
    messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
  };
}

export function updateGuardianConversationRoom(
  room: GuardianConversationRoom,
  messages: OnDeviceChatMessage[]
): GuardianConversationRoom {
  const nextMessages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  return {
    ...room,
    title: room.title === '새 이야기' ? titleFromMessages(nextMessages) : room.title,
    updatedAt: Date.now(),
    messages: nextMessages,
  };
}

function normalizeStore(value: unknown): GuardianConversationStore | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<GuardianConversationStore>;
  if (!Array.isArray(record.conversations)) return null;
  const conversations = record.conversations
    .map(normalizeRoom)
    .filter((room): room is GuardianConversationRoom => !!room)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
  if (!conversations.length) return null;
  const activeConversationId = conversations.some((room) => room.id === record.activeConversationId)
    ? String(record.activeConversationId)
    : conversations[0].id;
  return { activeConversationId, conversations };
}

export async function readGuardianConversationStore(): Promise<GuardianConversationStore> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const stored = normalizeStore(JSON.parse(raw));
      if (stored) return stored;
    } catch {
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    }
  }

  const legacyRaw = await AsyncStorage.getItem(LEGACY_GUARDIAN_HISTORY_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as LegacyStoredHistory;
      const messages = Array.isArray(legacy.messages)
        ? legacy.messages
          .map(normalizeMessage)
          .filter((message): message is OnDeviceChatMessage => !!message)
        : [];
      if (messages.length) {
        const migrated = createGuardianConversationRoom(messages);
        const store = { activeConversationId: migrated.id, conversations: [migrated] };
        await writeGuardianConversationStore(store);
        await AsyncStorage.removeItem(LEGACY_GUARDIAN_HISTORY_KEY).catch(() => undefined);
        return store;
      }
    } catch {
      // The legacy value is ignored and removed below.
    }
    await AsyncStorage.removeItem(LEGACY_GUARDIAN_HISTORY_KEY).catch(() => undefined);
  }

  const room = createGuardianConversationRoom();
  return { activeConversationId: room.id, conversations: [room] };
}

export async function writeGuardianConversationStore(store: GuardianConversationStore) {
  const normalized = normalizeStore(store);
  if (!normalized) return;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
