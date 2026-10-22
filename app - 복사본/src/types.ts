export type TabKey = 'chats' | 'people' | 'family' | 'me';

export type RoomType = 'direct' | 'group' | 'family';

export type MessageKind = 'text' | 'image' | 'video' | 'system';

export type DeliveryState = 'sending' | 'sent' | 'read' | 'failed';

export type AuthState = 'checking' | 'signedOut' | 'signingIn' | 'syncing' | 'ready' | 'degraded';

export type ServerState = 'checking' | 'ready' | 'error';

export type UserRole = 'me' | 'family' | 'friend';

export type User = {
  id: string;
  name: string;
  alias?: string;
  role: UserRole;
  relation?: string;
  status: string;
  email?: string;
  avatarUri?: string;
  color: string;
  online?: boolean;
  locationLabel?: string;
  trusted?: boolean;
};

export type Profile = User & {
  role: 'me';
  locationSharingEnabled?: boolean;
};

export type Room = {
  id: string;
  type: RoomType;
  title: string;
  memberIds: string[];
  ownerUserId?: string;
  unread: number;
  pinned?: boolean;
  favorite?: boolean;
  muted?: boolean;
  preview: string;
  lastActivity: string;
  updatedAt: number;
  familySignal?: string;
};

export type Message = {
  id: string;
  clientMessageId?: string;
  roomId: string;
  senderId: string;
  senderName: string;
  kind: MessageKind;
  text?: string;
  uri?: string;
  time: string;
  at: number;
  delivery?: DeliveryState;
  unreadCount?: number;
  readByNames?: string[];
};

export type AttachmentDraft = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  status: 'picked' | 'uploading' | 'failed';
  error?: string;
};

export type BackendEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  message?: string;
};

export type BackendListData<T> = {
  items?: T[];
  nextCursor?: string;
};

export type BackendRequestError = Error & {
  status?: number;
  code?: string;
};

export type BackendAuthUser = {
  id?: string;
  name?: string;
  displayName?: string;
  email?: string;
  avatarUri?: string;
};

export type BackendAuthData = {
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
  user?: BackendAuthUser;
};

export type BackendProfile = {
  id?: string;
  name?: string;
  status?: string;
  email?: string;
  avatarUri?: string;
  locale?: string;
  locationSharingEnabled?: boolean;
};

export type BackendFriend = {
  id?: string;
  name?: string;
  profileName?: string;
  aliasName?: string;
  status?: string;
  email?: string;
  avatarUri?: string;
  trusted?: boolean;
  family?: {
    isFamily?: boolean;
    displayLabel?: string;
    relationshipType?: string;
  };
};

export type BackendFriendRequest = {
  id?: string;
  requesterUserId?: string;
  requesterName?: string;
  requesterAvatarUri?: string;
  targetUserId?: string;
  targetName?: string;
  targetAvatarUri?: string;
  status?: string;
  createdAt?: string;
};

export type BackendFriendRequestList = {
  incoming?: BackendFriendRequest[];
  outgoing?: BackendFriendRequest[];
};

export type BackendRoom = {
  id?: string;
  type?: RoomType;
  title?: string;
  members?: string[];
  ownerUserId?: string;
  isGroup?: boolean;
  favorite?: boolean;
  muted?: boolean;
  unread?: number;
  preview?: string;
  updatedAt?: string | number;
};

export type BackendRoomMessage = {
  id?: string;
  messageId?: string;
  clientMessageId?: string;
  roomId?: string;
  senderId?: string;
  sender?: {
    id?: string;
    name?: string;
    displayName?: string;
  };
  senderName?: string;
  kind?: MessageKind;
  type?: MessageKind;
  text?: string;
  body?: string;
  content?: string;
  uri?: string;
  url?: string;
  mediaUrl?: string;
  at?: string | number;
  createdAt?: string | number;
  updatedAt?: string | number;
  timestamp?: string | number;
  delivery?: DeliveryState;
  unreadCount?: number;
  readByNames?: string[];
};

export type BackendRoomRead = {
  unread?: number;
  lastReadMessageId?: string;
};

export type BackendLocationRefreshRequest = {
  requestToken?: string;
  requestedAt?: string;
  targetUserId?: string;
  expiresAt?: string;
};

export type BackendUserLocation = {
  userId?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  capturedAt?: string;
  source?: string;
  locationSharingEnabled?: boolean;
};

export type BackendFamilyRoomLocationList = {
  items?: BackendUserLocation[];
};

export type FamilyLocation = {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracyM?: number;
  capturedAt?: string;
  source?: string;
  locationSharingEnabled: boolean;
};

export type BackendMediaUploadTicket = {
  uploadUrl?: string;
  fileUrl?: string;
  expiresInSec?: number;
};

export type BackendCompletedMedia = {
  fileUrl?: string;
  kind?: 'image' | 'video' | 'avatar';
  status?: 'completed';
};

export type FriendRequestView = {
  id: string;
  userId: string;
  name: string;
  avatarUri?: string;
  direction: 'incoming' | 'outgoing';
  status: string;
};
