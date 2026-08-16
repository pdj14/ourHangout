import type {
  BackendFamilyRoomMemberProfile,
  BackendFamilyRoomRelationship,
  BackendFriend,
  BackendFriendRequest,
  BackendProfile,
  BackendRoom,
  BackendRoomMessage,
  FriendRequestView,
  FamilyRoomMemberProfile,
  FamilyRoomRelationship,
  Message,
  MessageKind,
  Profile,
  Room,
  RoomType,
  User,
} from '../types';

const palette = ['#2F9E8F', '#3F6EEB', '#253B76', '#E86F61', '#C9932E', '#1C8BA0', '#7D5BEF'];

export function parseTimestamp(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function formatTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return palette[hash % palette.length] || palette[0];
}

export function mapProfile(raw: BackendProfile, fallback?: Partial<Profile>): Profile {
  const id = String(raw.id || fallback?.id || 'me').trim();
  const name = String(raw.name || fallback?.name || raw.email || '나').trim();
  return {
    id,
    role: 'me',
    name,
    alias: '나',
    status: String(raw.status || fallback?.status || '').trim(),
    email: String(raw.email || fallback?.email || '').trim(),
    avatarUri: String(raw.avatarUri || fallback?.avatarUri || '').trim(),
    color: fallback?.color || colorForId(id),
    online: true,
    locationSharingEnabled:
      typeof raw.locationSharingEnabled === 'boolean'
        ? raw.locationSharingEnabled
        : fallback?.locationSharingEnabled,
  };
}

export function mapFriend(raw: BackendFriend): User | null {
  const id = String(raw.id || '').trim();
  const name = String(raw.name || raw.profileName || raw.email || '').trim();
  if (!id || !name) return null;
  const family = raw.family?.isFamily;
  return {
    id,
    role: family ? 'family' : 'friend',
    name,
    alias: String(raw.aliasName || '').trim() || undefined,
    relation: family ? String(raw.family?.displayLabel || '가족').trim() : undefined,
    status: String(raw.status || '').trim(),
    email: String(raw.email || '').trim() || undefined,
    avatarUri: String(raw.avatarUri || '').trim() || undefined,
    color: colorForId(id),
    online: false,
    trusted: !!raw.trusted,
  };
}

export function mapFamilyRoomMemberProfiles(
  values: BackendFamilyRoomMemberProfile[] | undefined,
  resolveUri: (value?: string | null) => string = (value) => String(value || '').trim()
): FamilyRoomMemberProfile[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item) => !!item?.userId && !!item?.name)
    .map((item) => ({
      userId: String(item.userId),
      name: String(item.name),
      avatarUri: resolveUri(item.avatarUri) || undefined,
      alias: String(item.alias || '').trim(),
      locationSharingEnabled: !!item.locationSharingEnabled,
    }));
}

export function mapFamilyRoomRelationships(
  values: BackendFamilyRoomRelationship[] | undefined
): FamilyRoomRelationship[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item) => !!item?.id && !!item?.guardianUserId && !!item?.childUserId)
    .map((item) => ({
      id: String(item.id),
      guardianUserId: String(item.guardianUserId),
      guardianName: String(item.guardianName || ''),
      childUserId: String(item.childUserId),
      childName: String(item.childName || ''),
      requestedByUserId: String(item.requestedByUserId || ''),
      requestedByName: String(item.requestedByName || ''),
      createdAt: parseTimestamp(item.createdAt),
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function mapRoom(raw: BackendRoom, currentUserId: string): Room | null {
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const type: RoomType =
    raw.type === 'direct' || raw.type === 'group' || raw.type === 'family'
      ? raw.type
      : raw.isGroup
        ? 'group'
        : 'direct';
  const updatedAt = parseTimestamp(raw.updatedAt);
  return {
    id,
    type,
    title: String(raw.title || (type === 'direct' ? '1:1 대화' : '대화방')).trim(),
    memberIds:
      Array.isArray(raw.members) && raw.members.length
        ? raw.members.map((member) => String(member))
        : [currentUserId],
    ownerUserId: String(raw.ownerUserId || '').trim() || undefined,
    unread: Math.max(0, Number(raw.unread || 0)),
    firstUnreadMessageId: String(raw.firstUnreadMessageId || '').trim() || undefined,
    favorite: !!raw.favorite,
    pinned: !!raw.favorite,
    muted: !!raw.muted,
    preview: String(raw.preview || '').trim(),
    lastActivity: formatTime(updatedAt),
    updatedAt,
    familySignal: type === 'family' ? '가족방' : undefined,
  };
}

export function mapMessage(raw: BackendRoomMessage, currentUserId: string, fallbackRoomId = ''): Message | null {
  const id = String(raw.id || raw.messageId || raw.clientMessageId || '').trim();
  if (!id) return null;
  const senderId = String(raw.senderId || raw.sender?.id || '').trim();
  const at = parseTimestamp(raw.at ?? raw.createdAt ?? raw.timestamp ?? raw.updatedAt);
  const kind: MessageKind =
    raw.kind === 'image' || raw.kind === 'video' || raw.kind === 'audio' || raw.kind === 'system'
      ? raw.kind
      : raw.type === 'image' || raw.type === 'video' || raw.type === 'audio' || raw.type === 'system'
        ? raw.type
        : 'text';
  const text = raw.text ?? raw.body ?? raw.content;
  const uri = raw.uri ?? raw.mediaUrl ?? raw.url;
  return {
    id,
    clientMessageId: String(raw.clientMessageId || '').trim() || undefined,
    roomId: String(raw.roomId || fallbackRoomId).trim(),
    senderId,
    senderName: String(raw.senderName || raw.sender?.name || raw.sender?.displayName || '').trim() || '알 수 없음',
    kind,
    text: String(text || '').trim() || undefined,
    uri: String(uri || '').trim() || undefined,
    mimeType: String(raw.mimeType || '').trim() || undefined,
    fileName: String(raw.fileName || '').trim() || undefined,
    fileSize: Number.isFinite(raw.fileSize) ? Number(raw.fileSize) : undefined,
    at,
    time: formatTime(at),
    delivery: raw.delivery || 'sent',
    unreadCount: typeof raw.unreadCount === 'number' ? Math.max(0, raw.unreadCount) : undefined,
    readByNames: Array.isArray(raw.readByNames) ? raw.readByNames.map((name) => String(name)) : undefined,
  };
}

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return existing;
  const merged = [...existing];
  incoming.forEach((message) => {
    const index = merged.findIndex((current) => {
      if (current.id === message.id) return true;
      const clientMessageId = message.clientMessageId || '';
      const currentClientMessageId = current.clientMessageId || '';
      return !!clientMessageId && (
        currentClientMessageId === clientMessageId || current.id === clientMessageId
      );
    });
    if (index >= 0) {
      merged[index] = { ...merged[index], ...message };
    } else {
      merged.push(message);
    }
  });
  return merged.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function previewForMessage(message: Pick<Message, 'kind' | 'text'>): string {
  if (message.kind === 'image') return '사진';
  if (message.kind === 'video') return '영상';
  if (message.kind === 'audio') return '오디오';
  return message.text || '';
}

export function mapFriendRequest(raw: BackendFriendRequest, direction: 'incoming' | 'outgoing'): FriendRequestView | null {
  const id = String(raw.id || '').trim();
  const userId = String(direction === 'incoming' ? raw.requesterUserId || '' : raw.targetUserId || '').trim();
  const name = String(direction === 'incoming' ? raw.requesterName || '' : raw.targetName || '').trim();
  if (!id || !userId || !name) return null;
  return {
    id,
    userId,
    name,
    avatarUri: String(direction === 'incoming' ? raw.requesterAvatarUri || '' : raw.targetAvatarUri || '').trim() || undefined,
    direction,
    status: String(raw.status || 'pending'),
  };
}
