import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

let foregroundNotificationRoomId = '';
let foregroundAppState: 'active' | 'background' | 'inactive' = 'active';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const roomId = String(notification.request.content.data?.roomId || '');
    const suppress = foregroundAppState === 'active' && roomId !== '' && roomId === foregroundNotificationRoomId;
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    };
  },
});

type Stage = 'login' | 'setup_name' | 'setup_intro' | 'app';
type Tab = 'chats' | 'friends' | 'profile';
type ChatsMode = 'direct' | 'group';
type CreateRoomKind = 'group' | 'family';
type MsgKind = 'text' | 'image' | 'video' | 'system';
type Delivery = 'sending' | 'sent' | 'read';
type FamilyLabel = 'mother' | 'father' | 'guardian' | 'child';
type FamilyRelationshipType = 'parent_child';
type RoomType = 'direct' | 'group' | 'family';

type Message = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  mine: boolean;
  kind: MsgKind;
  text?: string;
  uri?: string;
  at: number;
  delivery?: Delivery;
  unreadCount?: number;
  readByNames?: string[];
};
type FriendFamilySummary = {
  isFamily: true;
  relationshipId: string;
  relationshipType: string;
  displayLabel: string;
  familyGroupId?: string;
  status: 'active';
};
type Friend = {
  id: string;
  name: string;
  profileName: string;
  aliasName?: string;
  status: string;
  avatarUri: string;
  trusted: boolean;
  family?: FriendFamilySummary;
};
type FamilyUpgradeRequestItem = {
  requestId: string;
  peerUserId: string;
  peerName: string;
  peerAvatarUri: string;
  relationshipType: FamilyRelationshipType;
  requesterLabel: FamilyLabel;
  targetLabel: FamilyLabel;
  note: string;
  createdAt: number;
};
type Room = {
  id: string;
  type: RoomType;
  title: string;
  members: string[];
  ownerUserId: string;
  isGroup: boolean;
  favorite: boolean;
  muted: boolean;
  unread: number;
  preview: string;
  updatedAt: number;
};
type Profile = { name: string; status: string; email: string; avatarUri: string; localeTag: string };
type DraftMedia = { kind: 'image' | 'video'; uri: string; mimeType: string };
type MediaViewer = { kind: 'image' | 'video'; uri: string };
type AvatarViewer = { uri: string; title: string };
type CropTarget = 'profile' | 'chat';
type ProfilePhotoCrop = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  minScale: number;
  maxScale: number;
  scale: number;
  renderWidth: number;
  renderHeight: number;
  overflowX: number;
  overflowY: number;
  offsetX: number;
  offsetY: number;
};
type TouchPoint = { pageX: number; pageY: number };
type BackendAuthUser = {
  id?: string;
  name?: string;
  displayName?: string;
  email?: string;
  avatarUri?: string;
  locale?: string;
};
type BackendAuthTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  tokenType?: string;
};
type BackendAuthData = {
  accessToken?: string;
  refreshToken?: string;
  expiresInSec?: number;
  tokens?: BackendAuthTokens;
  user?: BackendAuthUser;
};
type BackendProfile = {
  id?: string;
  name?: string;
  status?: string;
  email?: string;
  avatarUri?: string;
  locale?: string;
};
type BackendFriend = {
  id?: string;
  name?: string;
  profileName?: string;
  aliasName?: string;
  status?: string;
  avatarUri?: string;
  trusted?: boolean;
  family?: {
    isFamily?: boolean;
    relationshipId?: string;
    relationshipType?: string;
    displayLabel?: string;
    familyGroupId?: string;
    status?: 'active';
  };
};
type BackendFriendSearchUser = {
  id?: string;
  name?: string;
  status?: string;
  email?: string;
  avatarUri?: string;
  isFriend?: boolean;
  outgoingPending?: boolean;
  incomingPending?: boolean;
};
type BackendFriendRequest = {
  id?: string;
  peerUserId?: string;
  peerName?: string;
  createdAt?: string;
};
type BackendFriendRequestList = {
  incoming?: BackendFriendRequest[];
  outgoing?: BackendFriendRequest[];
};
type FriendRequestItem = {
  id: string;
  peerUserId: string;
  peerName: string;
  createdAt: number;
};
type FriendLookupResult = {
  id: string;
  name: string;
  status: string;
  email: string;
  avatarUri: string;
  isFriend: boolean;
  outgoingPending: boolean;
  incomingPending: boolean;
};
type BackendBot = {
  id?: string;
  botKey?: string;
  name?: string;
  description?: string;
  userId?: string;
  isActive?: boolean;
};
type BotSummary = {
  id: string;
  botKey: string;
  name: string;
  description: string;
  userId: string;
};
type BackendRoom = {
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
type BackendRoomMessage = {
  id?: string;
  roomId?: string;
  senderId?: string;
  senderName?: string;
  kind?: MsgKind;
  text?: string;
  uri?: string;
  at?: string | number;
  delivery?: Delivery;
  unreadCount?: number;
  readByNames?: string[];
};
type BackendEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  message?: string;
};
type BackendRequestError = Error & {
  status?: number;
  code?: string;
};
type BackendListData<T> = {
  items?: T[];
  nextCursor?: string;
};
type BackendMediaUploadTicket = {
  uploadUrl?: string;
  fileUrl?: string;
  expiresInSec?: number;
};
type BackendCompletedMedia = {
  fileUrl?: string;
  kind?: 'image' | 'video' | 'avatar';
  status?: 'completed';
};
type BackendRoomRead = {
  unread?: number;
  lastReadMessageId?: string;
};
type BackendFamilyRoomMemberProfile = {
  userId?: string;
  name?: string;
  avatarUri?: string;
  alias?: string;
};
type BackendFamilyRoomMemberProfileList = {
  canManage?: boolean;
  items?: BackendFamilyRoomMemberProfile[];
};
type BackendFamilyRoomRelationship = {
  id?: string;
  guardianUserId?: string;
  guardianName?: string;
  childUserId?: string;
  childName?: string;
  requestedByUserId?: string;
  requestedByName?: string;
  createdAt?: string;
};
type BackendFamilyRoomRelationshipList = {
  items?: BackendFamilyRoomRelationship[];
  pendingIncoming?: BackendFamilyRoomRelationship[];
  pendingOutgoing?: BackendFamilyRoomRelationship[];
};
type FamilyRoomMemberProfile = {
  userId: string;
  name: string;
  avatarUri: string;
  alias: string;
};
type FamilyRoomRelationship = {
  id: string;
  guardianUserId: string;
  guardianName: string;
  childUserId: string;
  childName: string;
  requestedByUserId: string;
  requestedByName: string;
  createdAt: number;
};
type BackendRoomMember = {
  userId?: string;
  name?: string;
  avatarUri?: string;
  alias?: string;
  role?: 'admin' | 'member';
  isOwner?: boolean;
};
type BackendRoomMemberList = {
  roomId?: string;
  ownerUserId?: string;
  myRole?: 'admin' | 'member';
  canTransferOwnership?: boolean;
  canManageAdmins?: boolean;
  canKickMembers?: boolean;
  items?: BackendRoomMember[];
};
type RoomMember = {
  userId: string;
  name: string;
  avatarUri: string;
  alias: string;
  role: 'admin' | 'member';
  isOwner: boolean;
};
type AppExtra = {
  buildVersion?: { name?: string; code?: number; source?: string };
  googleAuth?: { androidClientId?: string; iosClientId?: string; webClientId?: string };
  backend?: { baseUrl?: string };
};
type PersistedSession = {
  accessToken: string;
  refreshToken?: string;
};
type BackendSyncOptions = {
  strict?: boolean;
};
type BackendAppUpdateRelease = {
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
type BackendAppUpdateStatus = {
  currentVersion?: string;
  latestVersion?: string;
  isLatest?: boolean;
  release?: BackendAppUpdateRelease | null;
};
type AppUpdateCardState = {
  checked: boolean;
  isChecking: boolean;
  needsUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  release: BackendAppUpdateRelease | null;
  errorMessage: string;
};

const MY_ID = 'me';
const URL_REGEX = /https?:\/\/\S+/gi;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PROFILE_CROP_BOX = 260;
const PROFILE_PHOTO_MAX_OUTPUT = 2048;
const DEFAULT_APP_VERSION = '0';
const APP_PACKAGE_ID = 'com.ourhangout';
const APP_UPDATE_APK_MIME_TYPE = 'application/vnd.android.package-archive';
const INTENT_FLAG_GRANT_READ_URI_PERMISSION = 1;

const normalizeBackendErrorMessage = (message: string, isKo: boolean): string => {
  const normalized = message.trim();
  if (!normalized) {
    return isKo ? '\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.' : 'Request failed.';
  }

  const map: Array<[string, string, string]> = [
    [
      'The other participant already left this room.',
      '\uC0C1\uB300\uBC29\uC774 \uC774\uBBF8 \uC774 \uB300\uD654\uBC29\uC744 \uB098\uAC14\uC5B4\uC694.',
      'The other participant already left this room.',
    ],
    [
      'Use DELETE /rooms/:roomId for direct rooms.',
      '1:1 \uB300\uD654\uBC29\uC740 \uB098\uAC00\uAE30\uB9CC \uD560 \uC218 \uC788\uC5B4\uC694.',
      'Direct rooms can only be left.',
    ],
    [
      'Room has no active members.',
      '\uD604\uC7AC \uCC38\uC5EC \uC911\uC778 \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uB294 \uB300\uD654\uBC29\uC774\uC5D0\uC694.',
      'This room has no active members.',
    ],
    ['Room not found.', '\uB300\uD654\uBC29\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.', 'Room not found.'],
    [
      'Target user not found.',
      '\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.',
      'Target user not found.',
    ],
    [
      'Direct rooms can only be opened with friends.',
      '\uCE5C\uAD6C\uC640\uB9CC 1:1 \uB300\uD654\uB97C \uC5F4 \uC218 \uC788\uC5B4\uC694.',
      'Direct rooms can only be opened with friends.',
    ],
    [
      'Direct room can be opened only with friends (or active bot accounts).',
      '\uCE5C\uAD6C\uC640\uB9CC 1:1 \uB300\uD654\uB97C \uC5F4 \uC218 \uC788\uC5B4\uC694.',
      'Direct rooms can only be opened with friends.',
    ],
    [
      'Group title must be 1-100 characters.',
      '\uADF8\uB8F9 \uC774\uB984\uC740 1\uC790 \uC774\uC0C1 100\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
      'Group title must be between 1 and 100 characters.',
    ],
    [
      'Group room requires at least 2 members.',
      '\uADF8\uB8F9\uBC29\uC740 \uCD5C\uC18C 2\uBA85 \uC774\uC0C1\uC774\uC5B4\uC57C \uD574\uC694.',
      'Group rooms require at least 2 members.',
    ],
    [
      'Family room title must be 1-100 characters.',
      '가족방 이름은 1자 이상 100자 이하로 입력해 주세요.',
      'Family room title must be between 1 and 100 characters.',
    ],
    [
      'Family room requires at least 2 members.',
      '가족방은 최소 2명 이상이어야 해요.',
      'Family rooms require at least 2 members.',
    ],
    [
      'Family room members must already be friends.',
      '가족방 멤버는 먼저 친구여야 해요.',
      'Family room members must already be friends.',
    ],
    [
      'Transfer room ownership before leaving this room.',
      '이 방을 나가기 전에 먼저 방장을 넘겨 주세요.',
      'Transfer ownership before leaving this room.',
    ],
    [
      'Only the room owner can delete this room.',
      '이 방은 현재 방장만 삭제할 수 있어요.',
      'Only the room owner can delete this room.',
    ],
    [
      'Only the room owner can transfer ownership.',
      '방장만 다른 멤버에게 방장을 넘길 수 있어요.',
      'Only the room owner can transfer ownership.',
    ],
    [
      'Only the room owner can manage admins.',
      '방장만 관리자를 지정하거나 해제할 수 있어요.',
      'Only the room owner can manage admins.',
    ],
    [
      'Only the room owner or admins can remove members.',
      '방장이나 관리자인 경우에만 멤버를 내보낼 수 있어요.',
      'Only the room owner or admins can remove members.',
    ],
    [
      'Only the room owner can remove another admin.',
      '다른 관리자는 방장만 내보낼 수 있어요.',
      'Only the room owner can remove another admin.',
    ],
    [
      'The room owner cannot be removed.',
      '현재 방장은 내보낼 수 없어요. 먼저 방장을 넘겨 주세요.',
      'The room owner cannot be removed.',
    ],
    [
      'The room owner role must be transferred, not downgraded.',
      '방장을 일반 멤버로 바꾸려면 먼저 다른 멤버에게 방장을 넘겨야 해요.',
      'Transfer ownership before downgrading the owner.',
    ],
    [
      'Members can edit only their own alias.',
      '호칭은 각자 자신의 것만 바꿀 수 있어요.',
      'Members can edit only their own alias.',
    ],
    [
      'A pending guardian-child request already exists.',
      '이미 대기 중인 보호자 관계 요청이 있어요.',
      'A guardian-child request is already pending.',
    ],
    [
      'Pending guardian-child request not found.',
      '대기 중인 보호자 관계 요청을 찾을 수 없어요.',
      'Pending guardian-child request not found.',
    ],
    [
      'The requester cannot accept their own guardian-child request.',
      '요청을 보낸 사람은 직접 수락할 수 없어요.',
      'The requester cannot accept their own guardian-child request.',
    ],
    [
      'Only the target member can respond to this guardian-child request.',
      '이 요청은 상대 멤버만 수락하거나 거절할 수 있어요.',
      'Only the target member can respond to this guardian-child request.',
    ],
    [
      'Users are already connected by a guardian-child relationship.',
      '이미 보호자 관계로 연결되어 있어요.',
      'Users are already connected by a guardian-child relationship.',
    ],
    [
      'Only group/family room title can be changed.',
      '그룹방이나 가족방 이름만 바꿀 수 있어요.',
      'Only group or family room titles can be changed.',
    ],
    [
      'Shared room title must be 1-100 characters.',
      '공유 방 이름은 1자 이상 100자 이하로 입력해 주세요.',
      'Shared room title must be between 1 and 100 characters.',
    ],
    [
      'Users are already connected as family.',
      '이미 가족으로 연결된 사용자예요.',
      'Users are already connected as family.',
    ],
    [
      'A family upgrade request is already pending.',
      '이미 가족 연결 요청이 진행 중이에요.',
      'A family-group request is already pending.',
    ],
    [
      'Family upgrade requires an existing friend relationship.',
      '가족 연결은 먼저 친구 관계여야 해요.',
      'Family links require an existing friend relationship.',
    ],
    [
      'Pending family upgrade request not found.',
      '진행 중인 가족 연결 요청을 찾을 수 없어요.',
      'The pending family-group request was not found.',
    ],
    [
      'Active family link not found.',
      '활성 가족 연결을 찾을 수 없어요.',
      'The active family link was not found.',
    ],
    [
      'Family link access is not allowed.',
      '이 가족 연결을 변경할 권한이 없어요.',
      'You do not have access to this family link.',
    ],
  ];

  for (const [source, ko, en] of map) {
    if (normalized === source) {
      return isKo ? ko : en;
    }
  }

  return normalized;
};
const createBackendRequestError = (
  message: string,
  options?: {
    status?: number;
    code?: string;
  }
): BackendRequestError => {
  const error = new Error(message) as BackendRequestError;
  if (typeof options?.status === 'number') {
    error.status = options.status;
  }
  if (options?.code) {
    error.code = options.code;
  }
  return error;
};
const getBackendErrorDetails = (raw: unknown): { message: string; code: string } => {
  if (!raw || typeof raw !== 'object') {
    return { message: '', code: '' };
  }
  const body = raw as BackendEnvelope<unknown>;
  return {
    message: String(body.error?.message || body.message || '').trim(),
    code: String(body.error?.code || '').trim(),
  };
};
const toBackendRequestError = (
  raw: unknown,
  fallbackMessage: string,
  status?: number
): BackendRequestError => {
  const details = getBackendErrorDetails(raw);
  return createBackendRequestError(details.message || fallbackMessage, {
    ...(typeof status === 'number' ? { status } : {}),
    ...(details.code ? { code: details.code } : {}),
  });
};
const isSessionInvalidError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const status = typeof (error as BackendRequestError).status === 'number' ? (error as BackendRequestError).status : 0;
  const code = String((error as BackendRequestError).code || '').trim();
  return code === 'AUTH_REFRESH_INVALID' || code === 'AUTH_UNAUTHORIZED' || (status === 401 && !code);
};
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : '');
const SESSION_STORAGE_KEY = 'ourhangout.session.v1';
const BACKEND_OVERRIDE_STORAGE_KEY = 'ourhangout.backend-override.v1';
const CHATS_TAB_MODE_STORAGE_KEY = 'ourhangout.chats-tab-mode.v1';
const HIDDEN_SERVER_MENU_TAP_COUNT = 5;
const HIDDEN_SERVER_MENU_TAP_WINDOW_MS = 1200;
const FOREST_GLOWS: Array<{
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  size: number;
  color: string;
}> = [
  { top: 78, left: 34, size: 7, color: 'rgba(248, 225, 150, 0.72)' },
  { top: 142, right: 52, size: 6, color: 'rgba(207, 240, 178, 0.65)' },
  { top: 260, left: 88, size: 5, color: 'rgba(240, 199, 126, 0.62)' },
  { bottom: 208, right: 40, size: 8, color: 'rgba(200, 234, 183, 0.58)' },
  { bottom: 126, left: 52, size: 6, color: 'rgba(249, 216, 160, 0.55)' },
  { bottom: 58, right: 108, size: 4, color: 'rgba(214, 241, 184, 0.48)' },
];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finiteOr = (value: number | null | undefined, fallback = 0) =>
  Number.isFinite(value) ? (value as number) : fallback;
const touchDistance = (touches: TouchPoint[]) => {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
};
const touchCenter = (touches: TouchPoint[]) => ({
  x: (touches[0].pageX + touches[1].pageX) / 2,
  y: (touches[0].pageY + touches[1].pageY) / 2,
});
const readLayoutSize = (evt: LayoutChangeEvent) => ({
  x: finiteOr(evt.nativeEvent.layout.x, 0),
  y: finiteOr(evt.nativeEvent.layout.y, 0),
  width: Math.max(1, finiteOr(evt.nativeEvent.layout.width, PROFILE_CROP_BOX)),
  height: Math.max(1, finiteOr(evt.nativeEvent.layout.height, PROFILE_CROP_BOX)),
});
const normalizeTouches = (value: unknown): TouchPoint[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      pageX: finiteOr((item as { pageX?: number }).pageX, Number.NaN),
      pageY: finiteOr((item as { pageY?: number }).pageY, Number.NaN),
    }))
    .filter((touch) => Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY));
};
const cropGeometry = (imageWidth: number, imageHeight: number, scale: number) => {
  const renderWidth = imageWidth * scale;
  const renderHeight = imageHeight * scale;
  const overflowX = Math.max(0, renderWidth - PROFILE_CROP_BOX);
  const overflowY = Math.max(0, renderHeight - PROFILE_CROP_BOX);
  return { renderWidth, renderHeight, overflowX, overflowY };
};
const canUseSecureStore = Platform.OS !== 'web';
const normalizeBackendBaseUrl = (value?: string | null): string => (value || '').trim().replace(/\/+$/, '');
const isLocalAssetUri = (value?: string | null): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) return false;
  return /^(file|content):\/\//i.test(normalized) || normalized.startsWith('/');
};
const parsePersistedSession = (raw: string | null | undefined): PersistedSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSession;
    const accessToken = (parsed.accessToken || '').trim();
    const refreshToken = (parsed.refreshToken || '').trim();
    if (!accessToken) return null;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {})
    };
  } catch {
    return null;
  }
};
const readSessionFromStorage = async (): Promise<PersistedSession | null> => {
  if (canUseSecureStore) {
    try {
      const secureRaw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
      const secure = parsePersistedSession(secureRaw);
      if (secure?.accessToken) {
        return secure;
      }
    } catch {
      // Ignore SecureStore read failure and fallback to AsyncStorage.
    }
  }
  try {
    const fallbackRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    return parsePersistedSession(fallbackRaw);
  } catch {
    return null;
  }
};
const writeSessionToStorage = async (session: PersistedSession): Promise<void> => {
  const payload = JSON.stringify(session);
  if (canUseSecureStore) {
    try {
      await SecureStore.setItemAsync(SESSION_STORAGE_KEY, payload);
    } catch {
      // Keep fallback persistence even when SecureStore fails.
    }
  }
  try {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, payload);
  } catch {
    // Ignore fallback storage failure.
  }
};
const clearSessionInStorage = async (): Promise<void> => {
  if (canUseSecureStore) {
    try {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    } catch {
      // Ignore cleanup failure.
    }
  }
  try {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore cleanup failure.
  }
};
const readBackendOverrideFromStorage = async (): Promise<string> => {
  try {
    return normalizeBackendBaseUrl(await AsyncStorage.getItem(BACKEND_OVERRIDE_STORAGE_KEY));
  } catch {
    return '';
  }
};
const writeBackendOverrideToStorage = async (value: string): Promise<void> => {
  const normalized = normalizeBackendBaseUrl(value);
  try {
    if (normalized) {
      await AsyncStorage.setItem(BACKEND_OVERRIDE_STORAGE_KEY, normalized);
    } else {
      await AsyncStorage.removeItem(BACKEND_OVERRIDE_STORAGE_KEY);
    }
  } catch {
    // Ignore override persistence failure.
  }
};
const buildDevBackendBaseUrl = (prodBaseUrl: string): string => {
  const normalized = normalizeBackendBaseUrl(prodBaseUrl);
  try {
    const next = new URL(normalized);
    next.port = '7084';
    return normalizeBackendBaseUrl(next.toString());
  } catch {
    return 'http://wowjini0228.synology.me:7084';
  }
};
const getRuntimeAppVersion = (): string => {
  const constantsAny = Constants as unknown as {
    expoConfig?: { version?: string; extra?: { buildVersion?: { name?: string } } };
    manifest2?: { version?: string };
    manifest?: { version?: string };
  };

  return (
    constantsAny.expoConfig?.extra?.buildVersion?.name ||
    constantsAny.expoConfig?.version ||
    constantsAny.manifest2?.version ||
    constantsAny.manifest?.version ||
    DEFAULT_APP_VERSION
  ).trim() || DEFAULT_APP_VERSION;
};
const tokenizeVersion = (value: string): Array<number | string> =>
  value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
const compareVersionToken = (left: number | string, right: number | string): number => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left > right ? 1 : -1;
  }
  if (typeof left === 'number') return 1;
  if (typeof right === 'number') return -1;
  const compared = left.localeCompare(right);
  return compared === 0 ? 0 : compared > 0 ? 1 : -1;
};
const compareVersionStrings = (left: string, right: string): number => {
  const normalizedLeft = tokenizeVersion(left);
  const normalizedRight = tokenizeVersion(right);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftToken = normalizedLeft[index] ?? 0;
    const rightToken = normalizedRight[index] ?? 0;
    const compared = compareVersionToken(leftToken, rightToken);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
};
const formatAppUpdateFileSize = (sizeBytes: number | undefined, isKo: boolean): string => {
  if (!Number.isFinite(sizeBytes) || !sizeBytes || sizeBytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}${isKo ? '' : ''}`;
};
const sanitizeAppUpdateVersion = (value: string): string =>
  value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'latest';
const openUnknownSourcesSettings = async (): Promise<void> => {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${APP_PACKAGE_ID}`,
    });
  } catch {
    await Linking.openSettings().catch(() => null);
  }
};
const downloadAndInstallAppUpdate = async (
  downloadUrl: string,
  version: string,
  isKo: boolean
): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    try {
      const canOpen = await Linking.canOpenURL(downloadUrl);
      if (!canOpen) {
        Alert.alert(
          isKo ? '링크를 열 수 없어요' : 'Cannot open link',
          isKo ? '이 기기에는 링크를 열 수 있는 앱이 없어요.' : 'No app is available to open the link.'
        );
        return false;
      }
      await Linking.openURL(downloadUrl);
      return true;
    } catch {
      Alert.alert(
        isKo ? '열기 실패' : 'Open failed',
        isKo ? '다운로드 링크를 열지 못했어요.' : 'Could not open the download link.'
      );
      return false;
    }
  }

  try {
    const sideLoadingEnabled = await Device.isSideLoadingEnabledAsync();
    if (!sideLoadingEnabled) {
      Alert.alert(
        isKo ? '설치 권한이 필요해요' : 'Install permission required',
        isKo
          ? '브라우저 없이 업데이트하려면 이 앱에 "알 수 없는 앱 설치" 권한을 허용해 주세요.'
          : 'To update without a browser, allow this app to install unknown apps.',
        [
          { text: isKo ? '닫기' : 'Close', style: 'cancel' },
          {
            text: isKo ? '설정 열기' : 'Open Settings',
            onPress: () => {
              void openUnknownSourcesSettings();
            },
          },
        ]
      );
      return false;
    }

    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) {
      throw new Error('Missing writable directory.');
    }

    const targetUri = `${baseDir}ourhangout-update-${sanitizeAppUpdateVersion(version)}.apk`;
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => null);

    const result = await FileSystem.downloadAsync(downloadUrl, targetUri);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Download failed (${result.status}).`);
    }

    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: INTENT_FLAG_GRANT_READ_URI_PERMISSION,
      type: APP_UPDATE_APK_MIME_TYPE,
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : isKo
          ? '업데이트 파일을 내려받거나 설치 화면을 열지 못했어요.'
          : 'Could not download the update or open the installer.';
    Alert.alert(
      isKo ? '업데이트 실패' : 'Update failed',
      normalizeBackendErrorMessage(message, isKo)
    );
    return false;
  }
};
const logSessionTrace = (event: string, details?: Record<string, unknown>) => {
  try {
    if (details) {
      console.info(`[session] ${event}`, JSON.stringify(details));
      return;
    }
    console.info(`[session] ${event}`);
  } catch {
    console.info(`[session] ${event}`);
  }
};

const TEXT = {
  en: {
    app: 'Our Hangout',
    login: 'Sign in',
    loginBody: 'Use Google sign-in, then set your profile.',
    google: 'Continue with Google',
    loginSkip: 'Preview demo',
    needsLoginTitle: 'Sign in needed',
    needsLoginBody: 'This part of the app opens after sign-in.',
    loginHintMissing: 'Set app.json extra.googleAuth to enable Google login.',
    loginHintReady: 'Press Google sign-in to continue.',
    loginServerChecking: 'Checking backend connection...',
    loginServerReady: 'Backend connected.',
    loginServerError: 'Backend connection failed.',
    loginSessionRestoring: 'Restoring previous session...',
    loginBackendAuthFailed: 'Backend Google login failed.',
    loginBackendSyncFailed: 'Logged in, but initial backend sync failed.',
    loginFailed: 'Google sign-in failed.',
    loginCanceled: 'Google sign-in was canceled.',
    loginDismissed: 'Google sign-in was closed before completion.',
    setup1: 'Set your display name',
    setup2: 'Core flow: friends -> room list -> chat',
    displayName: 'Display name',
    editName: 'Edit name',
    next: 'Next',
    start: 'Enter app',
    defaultStatus: 'Chatting safely',
    tabsChats: 'Chats',
    tabsFriends: 'Friends',
    tabsProfile: 'Profile',
    searchChats: 'Search rooms',
    searchFriends: 'Search friends',
    noRooms: 'No rooms yet',
    noRoomsBody: 'Create a group room or start 1:1 chat from friends.',
    noSearchRooms: 'No rooms match your search.',
    noFriends: 'Add a friend first.',
    noSearchFriends: 'No friends match your search.',
    goFriends: 'Go to Friends',
    newGroup: 'New Group',
    botsTitle: 'Assistant',
    botStart: 'Chat with assistant',
    botLoadFailed: 'Failed to load bot list.',
    addFriend: 'Add friend',
    friendName: 'Friend name',
    friendStatus: 'Status message',
    friendLookupPlaceholder: 'Enter friend email',
    friendLookupAction: 'Search',
    friendLookupNeedQuery: 'Enter email first.',
    friendLookupInvalidEmail: 'Enter a valid email address.',
    friendLookupEmpty: 'No user found for this email.',
    friendIncoming: 'Incoming requests',
    friendOutgoing: 'Sent requests',
    friendNoIncoming: 'No incoming requests.',
    friendNoOutgoing: 'No sent requests.',
    friendRequestSend: 'Request',
    friendRequestSent: 'Requested',
    friendRequestAccept: 'Accept',
    friendRequestReject: 'Reject',
    friendAlready: 'Already friend',
    friendRequestSentDone: 'Friend request sent.',
    friendRequestAcceptedDone: 'Friend request accepted.',
    friendRequestRejectedDone: 'Friend request rejected.',
    friendLoading: 'Loading...',
    denGreeting: 'Welcome back',
    denGreetingBody: 'Step away from the noise and settle into moss, lantern light, and easy conversation.',
    denChatsTitle: 'Rooms glowing softly tonight',
    denChatsBody: 'A calm place to pick up the conversations that matter.',
    denFriendsTitle: 'Companions of the clearing',
    denFriendsBody: 'Invite people in and keep your circle close.',
    denProfileTitle: 'My woodland cabin',
    denProfileBody: 'Keep your little cabin simple and warm.',
    denQuickNewChat: 'New circle',
    denQuickFriends: 'Invite someone',
    denSectionRooms: 'Cozy corners',
    denSectionFriends: 'Forest crew',
    denSectionRequests: 'Footsteps at the gate',
    denNoRoomsTitle: 'No glowing rooms yet',
    denNoRoomsBody: 'Start with one friend or gather a little campfire circle.',
    denQuietNote: 'Slow down. This room can wait for you.',
    denRoomDirect: 'A quiet corner for two',
    denRoomGroup: 'A shared fire for the group',
    denChatHint: 'A warm pocket of conversation, ready when you are.',
    denFriendHint: 'The people who make this place feel lived in.',
    denProfileHint: 'Keep your own little cabin soft, clear, and welcoming.',
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove',
    startChat: 'Start chat',
    profileEdit: 'Edit profile',
    logout: 'Log out',
    logoutTitle: 'Log out?',
    logoutBody: 'You will need Google sign-in again next time.',
    myStatus: 'My status message',
    profilePhoto: 'Profile photo',
    photoPick: 'Choose photo',
    photoRemove: 'Remove photo',
    photoCropHint: 'After selecting, adjust the visible area.',
    photoCropTitle: 'Set visible area',
    photoCropGuide: 'Drag the photo, then use zoom controls to set the visible area.',
    photoZoomLabel: 'Zoom',
    photoZoomOut: 'Zoom out',
    photoZoomIn: 'Zoom in',
    photoCenter: 'Center',
    photoApply: 'Apply',
    statsFriends: 'Friends',
    statsRooms: 'Rooms',
    statsFavs: 'Favorites',
    roomSetting: 'Room settings',
    editRoomTitle: 'Rename group',
    roomTitlePlaceholder: 'Group room title',
    favoriteOn: 'Add favorite',
    favoriteOff: 'Remove favorite',
    muteOn: 'Mute room',
    muteOff: 'Unmute room',
    leaveRoom: 'Leave room',
    deleteRoom: 'Delete room',
    report: 'Report',
    reported: 'Report added to guardian queue.',
    safe: 'Links open in an external browser app.',
    linkUnavailableTitle: 'Cannot open link',
    linkUnavailableBody: 'No browser app is available on this device.',
    linkFailedTitle: 'Open failed',
    linkFailedBody: 'Could not open the link.',
    mediaPermissionTitle: 'Permission required',
    mediaPermissionBody: 'Allow photo and video access to attach files.',
    mediaPickFailed: 'Failed to load selected media.',
    msgInput: 'Write a message',
    mediaHint: 'Press send to share.',
    imageSelected: 'Image selected',
    videoSelected: 'Video selected',
    imageLabel: 'Image',
    videoLabel: 'Video',
    firstMsg: 'Send hello',
    noMsg: 'No messages yet',
    hello: 'Hi! Welcome to our room.',
    sending: 'Sending',
    sent: 'Sent',
    read: 'Read',
    groupTitle: 'Create group room',
    groupName: 'Group name',
    groupHint: 'Select at least 2 friends',
    createRoom: 'Create room',
    createRoomTitle: 'Create new room',
    createRoomGroupLabel: 'Group',
    createRoomGroupBody: 'Start a shared chat with friends right away.',
    createRoomFamilyLabel: 'Family',
    createRoomFamilyBody: 'Make a family room for titles, permissions, and shared features.',
    createRoomFamilyHint: 'Select at least 1 friend for your family room',
    createRoomFamilyName: 'Family room name',
    createFamilyRoomAction: 'Create family room',
    directRoomFallback: 'Chat',
    me: 'Me',
  },
  ko: {
    app: '우리들의아지트',
    login: '로그인',
    loginBody: '구글 로그인 후 프로필을 설정해요.',
    google: '구글로 계속하기',
    loginSkip: '데모로 둘러보기',
    needsLoginTitle: '로그인이 필요해요',
    needsLoginBody: '이 기능은 로그인 후 사용할 수 있어요.',
    loginHintMissing: 'Google 로그인은 app.json extra.googleAuth 설정이 필요해요.',
    loginHintReady: '구글로 계속하기를 눌러 시작해요.',
    loginServerChecking: '백엔드 연결을 확인 중이에요...',
    loginServerReady: '백엔드에 연결됐어요.',
    loginServerError: '백엔드 연결에 실패했어요.',
    loginSessionRestoring: '이전 로그인 세션을 복원 중이에요...',
    loginBackendAuthFailed: '백엔드 Google 로그인에 실패했어요.',
    loginBackendSyncFailed: '로그인은 되었지만 초기 데이터 동기화에 실패했어요.',
    loginFailed: 'Google 로그인에 실패했어요.',
    loginCanceled: 'Google 로그인이 취소되었어요.',
    loginDismissed: 'Google 로그인 창이 완료 전에 닫혔어요.',
    setup1: '표시 이름을 설정해요',
    setup2: '핵심 흐름: 친구 -> 대화방 -> 채팅',
    displayName: '표시 이름',
    editName: '이름 수정',
    next: '다음',
    start: '앱 시작',
    defaultStatus: '안전하게 대화 중',
    tabsChats: '대화',
    tabsFriends: '친구',
    tabsProfile: '프로필',
    searchChats: '대화방 검색',
    searchFriends: '친구 검색',
    noRooms: '대화방이 없어요',
    noRoomsBody: '친구에서 1:1 대화를 시작하거나 그룹방을 만들어 보세요.',
    noSearchRooms: '검색 결과가 없어요.',
    noFriends: '먼저 친구를 추가해 주세요.',
    noSearchFriends: '검색 결과가 없어요.',
    goFriends: '친구로 이동',
    newGroup: '그룹 만들기',
    botsTitle: '도우미',
    botStart: '도우미와 대화',
    botLoadFailed: '봇 목록을 불러오지 못했어요.',
    addFriend: '친구 추가',
    friendName: '친구 이름',
    friendStatus: '상태 메시지',
    friendLookupPlaceholder: '친구 이메일 입력',
    friendLookupAction: '검색',
    friendLookupNeedQuery: '이메일을 먼저 입력해 주세요.',
    friendLookupInvalidEmail: '올바른 이메일 형식으로 입력해 주세요.',
    friendLookupEmpty: '해당 이메일의 사용자가 없어요.',
    friendIncoming: '받은 요청',
    friendOutgoing: '보낸 요청',
    friendNoIncoming: '받은 요청이 없어요.',
    friendNoOutgoing: '보낸 요청이 없어요.',
    friendRequestSend: '요청',
    friendRequestSent: '요청됨',
    friendRequestAccept: '수락',
    friendRequestReject: '거절',
    friendAlready: '이미 친구',
    friendRequestSentDone: '친구 요청을 보냈어요.',
    friendRequestAcceptedDone: '친구 요청을 수락했어요.',
    friendRequestRejectedDone: '친구 요청을 거절했어요.',
    friendLoading: '불러오는 중...',
    denGreeting: '다시 왔어요',
    denGreetingBody: '바깥의 소음을 잠시 내려두고, 이끼 냄새와 등불빛 사이에서 천천히 쉬어가요.',
    denChatsTitle: '오늘의 대화',
    denChatsBody: '중요한 대화를 조용히 이어가는 공간이에요.',
    denFriendsTitle: '함께할 사람들',
    denFriendsBody: '사람을 초대하고, 가까운 사람들을 곁에 두세요.',
    denProfileTitle: '나의 작은 숲 오두막',
    denProfileBody: '내 작은 오두막을 단정하고 따뜻하게 가꿔요.',
    denQuickNewChat: '새 모임',
    denQuickFriends: '친구 초대',
    denSectionRooms: '포근한 대화방',
    denSectionFriends: '숲속 친구들',
    denSectionRequests: '문 앞의 발자국',
    denNoRoomsTitle: '아직 불이 켜진 방이 없어요',
    denNoRoomsBody: '친구 한 명과 시작하거나, 작은 모닥불 모임을 만들어 보세요.',
    denQuietNote: '조금 천천히 가도 괜찮아요. 이 방은 기다려줘요.',
    denRoomDirect: '둘만의 조용한 쉼터',
    denRoomGroup: '함께 둘러앉는 숲속 모닥불',
    denChatHint: '천천히 이어가는 대화가 머무는 따뜻한 공간이에요.',
    denFriendHint: '이 공간을 함께 채워 줄 사람들을 가까이 두세요.',
    denProfileHint: '내 오두막의 온도와 분위기를 다듬는 곳이에요.',
    save: '저장',
    cancel: '취소',
    remove: '삭제',
    startChat: '대화 시작',
    profileEdit: '프로필 수정',
    logout: '로그아웃',
    logoutTitle: '로그아웃할까요?',
    logoutBody: '다음에 다시 구글 로그인이 필요해요.',
    myStatus: '상태 메시지',
    profilePhoto: '프로필 사진',
    photoPick: '사진 선택',
    photoRemove: '사진 제거',
    photoCropHint: '사진 선택 후 보일 영역을 설정해요.',
    photoCropTitle: '보일 영역 설정',
    photoCropGuide: '사진을 드래그하고 확대/축소로 보일 영역을 맞춰요.',
    photoZoomLabel: '줌',
    photoZoomOut: '축소',
    photoZoomIn: '확대',
    photoCenter: '가운데',
    photoApply: '적용',
    statsFriends: '친구 수',
    statsRooms: '방 수',
    statsFavs: '즐겨찾기',
    roomSetting: '방 설정',
    editRoomTitle: '그룹 이름 변경',
    roomTitlePlaceholder: '그룹방 이름',
    favoriteOn: '즐겨찾기 추가',
    favoriteOff: '즐겨찾기 해제',
    muteOn: '알림 끄기',
    muteOff: '알림 켜기',
    leaveRoom: '방 나가기',
    deleteRoom: '방 삭제',
    report: '신고',
    reported: '보호자 검토 대기열에 신고가 접수됐어요.',
    safe: '링크를 누르면 외부 브라우저 앱에서 열려요.',
    linkUnavailableTitle: '링크를 열 수 없어요',
    linkUnavailableBody: '이 기기에 사용할 수 있는 브라우저 앱이 없어요.',
    linkFailedTitle: '열기 실패',
    linkFailedBody: '링크를 열지 못했어요.',
    mediaPermissionTitle: '권한이 필요해요',
    mediaPermissionBody: '사진과 동영상을 첨부하려면 접근 권한을 허용해 주세요.',
    mediaPickFailed: '선택한 미디어를 불러오지 못했어요.',
    msgInput: '메시지 입력',
    mediaHint: '전송 버튼을 눌러 공유해요.',
    imageSelected: '이미지 선택됨',
    videoSelected: '동영상 선택됨',
    imageLabel: '이미지',
    videoLabel: '동영상',
    firstMsg: '첫 메시지 보내기',
    noMsg: '메시지가 없어요',
    hello: '안녕! 우리 방에 온 걸 환영해.',
    sending: '전송 중',
    sent: '보냄',
    read: '읽음',
    groupTitle: '그룹방 만들기',
    groupName: '그룹방 이름',
    groupHint: '친구를 2명 이상 선택해요',
    createRoom: '방 만들기',
    createRoomTitle: '새 방 만들기',
    createRoomGroupLabel: '일반 그룹',
    createRoomGroupBody: '친구들과 바로 대화를 시작하는 공유 방이에요.',
    createRoomFamilyLabel: '가족방',
    createRoomFamilyBody: '호칭, 권한, 공유 기능이 붙는 가족 전용 방이에요.',
    createRoomFamilyHint: '가족방은 친구를 1명 이상 선택해요',
    createRoomFamilyName: '가족방 이름',
    createFamilyRoomAction: '가족방 만들기',
    directRoomFallback: '대화',
    me: '나',
  },
} as const;

type Locale = keyof typeof TEXT;

const localeKey = (): Locale =>
  Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ko')
    ? 'ko'
    : 'en';
const uid = () => `${Date.now()}-${Math.round(Math.random() * 99999)}`;
const tLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayKey = (ms: number) => {
  const target = new Date(ms);
  return `${target.getFullYear()}-${target.getMonth()}-${target.getDate()}`;
};
const messageDayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
const decodeJwtPayload = (token: string): { sub?: string; email?: string } => {
  const trimmed = token.trim();
  if (!trimmed) return {};
  const parts = trimmed.split('.');
  if (parts.length < 2) return {};
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const raw =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(raw) as { sub?: string; email?: string };
  } catch {
    return {};
  }
};
const roomTimeLabel = (ms: number) => {
  const target = new Date(ms);
  const now = new Date();
  if (target.toDateString() === now.toDateString()) {
    return tLabel(ms);
  }
  return target.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
function InAppVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.viewerMedia}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}
const splitLinkParts = (value: string): Array<{ text: string; url?: string }> => {
  const out: Array<{ text: string; url?: string }> = [];
  let cursor = 0;
  const regex = new RegExp(URL_REGEX.source, 'gi');
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(value)) !== null) {
    if (match.index > cursor) {
      out.push({ text: value.slice(cursor, match.index) });
    }
    out.push({ text: match[0], url: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) out.push({ text: value.slice(cursor) });
  if (!out.length) out.push({ text: value });
  return out;
};

const randomReply = (isKo: boolean) => {
  const arr = isKo
    ? ['Sounds good!', 'Okay, I will reply soon.', 'Great idea.']
    : ['Looks good!', 'Got it!', 'Great idea.'];
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
};

const FOREST = {
  gradientTop: '#FFF6FB',
  gradientMid: '#EEF7FF',
  gradientBottom: '#F6FFE8',
  deep: '#F6F8FF',
  card: 'rgba(255, 255, 255, 0.72)',
  cardStrong: 'rgba(255, 255, 255, 0.9)',
  border: 'rgba(167, 177, 230, 0.2)',
  text: '#40436C',
  textSoft: 'rgba(76, 83, 130, 0.82)',
  textMuted: 'rgba(120, 127, 171, 0.72)',
  link: '#5E74EA',
  button: '#8B95FF',
  buttonBorder: '#B0B6FF',
  buttonSoft: 'rgba(139, 149, 255, 0.12)',
  inputBg: '#FFFFFF',
  inputText: '#40436C',
  placeholder: '#A0A7D0',
  mineBubble: '#8B95FF',
  otherBubble: '#FFFFFF',
  sheetBg: 'rgba(255, 255, 255, 0.98)',
  sheetBorder: 'rgba(167, 177, 230, 0.24)',
  overlay: 'rgba(116, 126, 184, 0.22)',
  iconDark: 'rgba(139, 149, 255, 0.12)',
  iconLight: 'rgba(139, 149, 255, 0.1)',
  badge: '#FF94B6',
};

function App() {
  const locale = useMemo(localeKey, []);
  const s = TEXT[locale];
  const isKo = locale === 'ko';
  const appLocaleTag = isKo ? 'ko-KR' : 'en-US';
  const insets = useSafeAreaInsets();

  const extra = useMemo(() => {
    const constantsAny = Constants as unknown as {
      expoConfig?: { extra?: AppExtra };
      manifest2?: { extra?: AppExtra };
      manifest?: { extra?: AppExtra };
    };
    return (
      constantsAny.expoConfig?.extra ??
      constantsAny.manifest2?.extra ??
      constantsAny.manifest?.extra ??
      {}
    ) as AppExtra;
  }, []);
  const runtimeEnv = useMemo(() => {
    const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process;
    return runtimeProcess?.env ?? {};
  }, []);
  const currentAppVersion = useMemo(() => getRuntimeAppVersion(), []);
  const executionEnvironment = (
    (Constants as unknown as { executionEnvironment?: string }).executionEnvironment || ''
  ).trim();
  const canCheckForAppUpdate = Platform.OS === 'android' && executionEnvironment !== 'storeClient';
  const pickValue = (primary?: string, fallback?: string): string =>
    (primary || '').trim() || (fallback || '').trim();
  const g = {
    androidClientId: pickValue(
      extra.googleAuth?.androidClientId,
      runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ),
    iosClientId: pickValue(extra.googleAuth?.iosClientId, runtimeEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    webClientId: pickValue(extra.googleAuth?.webClientId, runtimeEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  };
  const defaultBackendBaseUrl = normalizeBackendBaseUrl(pickValue(
    extra.backend?.baseUrl,
    runtimeEnv.EXPO_PUBLIC_BACKEND_BASE_URL
  )) || 'http://wowjini0228.synology.me:7083';
  const devBackendBaseUrl = useMemo(() => buildDevBackendBaseUrl(defaultBackendBaseUrl), [defaultBackendBaseUrl]);

  const hasGoogle = !!Platform.select({
    android: g.webClientId,
    ios: g.iosClientId || g.webClientId,
    default: g.webClientId,
  });

  const [stage, setStage] = useState<Stage>('login');
  const [tab, setTab] = useState<Tab>('friends');
  const [chatsMode, setChatsMode] = useState<ChatsMode>('direct');
  const [profile, setProfile] = useState<Profile>({ name: '', status: '', email: '', avatarUri: '', localeTag: appLocaleTag });
  const [nameDraft, setNameDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [profilePhotoDraft, setProfilePhotoDraft] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [backendStateMsg, setBackendStateMsg] = useState('');
  const [backendOverrideUrl, setBackendOverrideUrl] = useState('');
  const [isBackendConfigReady, setIsBackendConfigReady] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [serverMenuDraft, setServerMenuDraft] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [isSessionRestoring, setIsSessionRestoring] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(MY_ID);
  const [appVisibility, setAppVisibility] = useState<'active' | 'background' | 'inactive'>(
    AppState.currentState === 'active'
      ? 'active'
      : AppState.currentState === 'inactive'
        ? 'inactive'
        : 'background'
  );

  const [friends, setFriends] = useState<Friend[]>([]);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const activeRoomRef = useRef<string | null>(null);

  const [chatQuery, setChatQuery] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  const [input, setInput] = useState('');
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);
  const [cropTarget, setCropTarget] = useState<CropTarget>('profile');
  const [profileCrop, setProfileCrop] = useState<ProfilePhotoCrop | null>(null);
  const [isApplyingPhoto, setIsApplyingPhoto] = useState(false);
  const profileCropRef = useRef<ProfilePhotoCrop | null>(null);
  const cropPanPointerRef = useRef({ x: 0, y: 0 });
  const cropGestureModeRef = useRef<'none' | 'pan' | 'pinch'>('none');
  const cropViewportLayoutRef = useRef({ width: PROFILE_CROP_BOX, height: PROFILE_CROP_BOX });
  const cropPinchStartRef = useRef({
    distance: 0,
    scale: 1,
    centerPageX: 0,
    centerPageY: 0,
    centerImageX: 0,
    centerImageY: 0,
  });

  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friendLookupQuery, setFriendLookupQuery] = useState('');
  const [friendLookupResults, setFriendLookupResults] = useState<FriendLookupResult[]>([]);
  const [friendLookupMsg, setFriendLookupMsg] = useState('');
  const [isFriendLookupLoading, setIsFriendLookupLoading] = useState(false);
  const [friendRequestsIncoming, setFriendRequestsIncoming] = useState<FriendRequestItem[]>([]);
  const [friendRequestsOutgoing, setFriendRequestsOutgoing] = useState<FriendRequestItem[]>([]);
  const [familyRequestsIncoming, setFamilyRequestsIncoming] = useState<FamilyUpgradeRequestItem[]>([]);
  const [familyRequestsOutgoing, setFamilyRequestsOutgoing] = useState<FamilyUpgradeRequestItem[]>([]);
  const [friendActionKey, setFriendActionKey] = useState('');
  const [familyActionKey, setFamilyActionKey] = useState('');
  const [isFriendSyncing, setIsFriendSyncing] = useState(false);
  const [showFamilyPickerModal, setShowFamilyPickerModal] = useState(false);
  const [showFamilyUpgradeModal, setShowFamilyUpgradeModal] = useState(false);
  const [familyUpgradeTargetId, setFamilyUpgradeTargetId] = useState('');
  const [showFriendAliasModal, setShowFriendAliasModal] = useState(false);
  const [friendAliasTargetId, setFriendAliasTargetId] = useState('');
  const [friendAliasDraft, setFriendAliasDraft] = useState('');
  const [showFriendActionsModal, setShowFriendActionsModal] = useState(false);
  const [friendActionsTargetId, setFriendActionsTargetId] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [createRoomType, setCreateRoomType] = useState<CreateRoomKind>('group');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRoomTitleModal, setShowRoomTitleModal] = useState(false);
  const [roomTitleDraft, setRoomTitleDraft] = useState('');
  const [mediaViewer, setMediaViewer] = useState<MediaViewer | null>(null);
  const [avatarViewer, setAvatarViewer] = useState<AvatarViewer | null>(null);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const [roomMenuId, setRoomMenuId] = useState<string | null>(null);
  const [roomMembersRoomId, setRoomMembersRoomId] = useState<string | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [roomOwnerUserId, setRoomOwnerUserId] = useState('');
  const [roomMembersMyRole, setRoomMembersMyRole] = useState<'admin' | 'member'>('member');
  const [roomMembersCanTransferOwnership, setRoomMembersCanTransferOwnership] = useState(false);
  const [roomMembersCanManageAdmins, setRoomMembersCanManageAdmins] = useState(false);
  const [roomMembersCanKickMembers, setRoomMembersCanKickMembers] = useState(false);
  const [isRoomMembersLoading, setIsRoomMembersLoading] = useState(false);
  const [roomMembersActionKey, setRoomMembersActionKey] = useState('');
  const [familyStructureRoomId, setFamilyStructureRoomId] = useState<string | null>(null);
  const [familyStructureProfiles, setFamilyStructureProfiles] = useState<FamilyRoomMemberProfile[]>([]);
  const [familyStructureRelationships, setFamilyStructureRelationships] = useState<FamilyRoomRelationship[]>([]);
  const [familyStructurePendingIncoming, setFamilyStructurePendingIncoming] = useState<FamilyRoomRelationship[]>([]);
  const [familyStructurePendingOutgoing, setFamilyStructurePendingOutgoing] = useState<FamilyRoomRelationship[]>([]);
  const [familyStructureAliasDrafts, setFamilyStructureAliasDrafts] = useState<Record<string, string>>({});
  const [familyStructureTargetId, setFamilyStructureTargetId] = useState('');
  const [familyStructureRequestAs, setFamilyStructureRequestAs] = useState<'guardian' | 'child'>('guardian');
  const [isFamilyStructureLoading, setIsFamilyStructureLoading] = useState(false);
  const [familyStructureActionKey, setFamilyStructureActionKey] = useState('');
  const [wsRetryTick, setWsRetryTick] = useState(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateCardState>({
    checked: false,
    isChecking: false,
    needsUpdate: false,
    latestVersion: '',
    downloadUrl: '',
    release: null,
    errorMessage: '',
  });
  const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false);
  const [directReadCutoffs, setDirectReadCutoffs] = useState<Record<string, number>>({});

  const scrollRef = useRef<ScrollView>(null);
  const cropOpenedAtRef = useRef(0);
  const sessionRestoreStartedRef = useRef(false);
  const hiddenServerTapCountRef = useRef(0);
  const hiddenServerTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRoomRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomGroupRef = useRef<Record<string, boolean>>({});
  const sendLockRef = useRef(false);
  const currentUserIdRef = useRef(currentUserId);
  const accessTokenRef = useRef('');
  const refreshTokenRef = useRef('');
  const refreshRequestRef = useRef<Promise<string> | null>(null);
  const roomReadCutoffRef = useRef<Record<string, number>>({});
  const pushTokenRef = useRef('');
  const registeredPushTokenRef = useRef('');
  const notificationResponseSubRef = useRef<Notifications.EventSubscription | null>(null);
  const friendTabRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendTabRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const backendBaseUrl = normalizeBackendBaseUrl(backendOverrideUrl) || defaultBackendBaseUrl;
  const backendOrigin = useMemo(() => {
    try {
      return new URL(backendBaseUrl).origin;
    } catch {
      return '';
    }
  }, [backendBaseUrl]);
  const setSessionTokens = (nextAccessToken: string, nextRefreshToken?: string) => {
    const normalizedAccessToken = nextAccessToken.trim();
    const normalizedRefreshToken = (nextRefreshToken || '').trim();
    accessTokenRef.current = normalizedAccessToken;
    refreshTokenRef.current = normalizedRefreshToken;
    setAccessToken(normalizedAccessToken);
    setRefreshToken(normalizedRefreshToken);
  };

  const resolveBackendUrl = (
    value: string | null | undefined,
    pathPrefixes: string[],
    preferBasePath = false
  ): string => {
    const normalized = (value || '').trim();
    if (!normalized || !backendOrigin) return normalized;

    try {
      const parsed = new URL(normalized);
      if (!pathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))) {
        return normalized;
      }
      if (parsed.origin === backendOrigin) {
        return normalized;
      }
      return `${backendOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      if (!pathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
        return normalized;
      }
      return `${preferBasePath ? backendBaseUrl : backendOrigin}${normalized}`;
    }
  };

  const resolveBackendMediaUrl = (value?: string | null): string =>
    resolveBackendUrl(value, ['/v1/media/files/']);

  const resolveBackendApiUrl = (value?: string | null): string =>
    resolveBackendUrl(value, ['/v1/'], true);

  const friendMapById = useMemo(() => new Map(friends.map((friend) => [friend.id, friend])), [friends]);
  const botMapByUserId = useMemo(() => new Map(bots.map((bot) => [bot.userId, bot])), [bots]);
  const getFriend = (fid: string) => friendMapById.get(fid);
  const getBot = (botUserId: string) => botMapByUserId.get(botUserId);
  const isOpenClawAssistantBotUser = (botUserId: string) => getBot(botUserId)?.botKey === 'openclaw-assistant';
  const roomAvatarUri = (room: Room) => {
    if (room.type !== 'direct') return '';
    const peerId = room.members.find((member) => member !== currentUserId) ?? '';
    return getFriend(peerId)?.avatarUri || '';
  };
  const messageAvatarUri = (message: Message) => getFriend(message.senderId)?.avatarUri || '';
  const roomTitle = (room: Room) =>
    room.type !== 'direct'
      ? room.title
      : getFriend(room.members.find((m) => m !== currentUserId) ?? '')?.name ??
        getBot(room.members.find((m) => m !== currentUserId) ?? '')?.name ??
        room.title;
  const roomMemberNames = (room: Room) =>
    room.members
      .filter((m) => m !== currentUserId)
      .map((m) => getFriend(m)?.name ?? getBot(m)?.name ?? '')
        .filter(Boolean)
        .join(', ');
  const normalizeMessageOwnership = (message: Message): Message => {
    const senderId = message.senderId?.trim() || '';
    const mine = !!senderId && senderId === currentUserIdRef.current;
    return message.mine === mine ? message : { ...message, mine };
  };
  const mergeRoomMessages = (prev: Message[], incoming: Message[]): Message[] => {
    if (incoming.length === 0) {
      return prev;
    }

    const next = [...prev];
    incoming.forEach((item) => {
      const normalized = normalizeMessageOwnership(item);
      const existingIndex = next.findIndex((message) => message.id === normalized.id);
      if (existingIndex >= 0) {
        next[existingIndex] = { ...next[existingIndex], ...normalized };
      } else {
        next.push(normalized);
      }
    });
    next.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    return next;
  };
  const openAvatarViewer = (uri: string, title: string) => {
    const normalizedUri = uri.trim();
    if (!normalizedUri) return;
    setAvatarViewer({
      uri: normalizedUri,
      title: title.trim(),
    });
  };
  const openServerMenu = () => {
    setServerMenuDraft(backendBaseUrl);
    setShowServerMenu(true);
  };
  const shouldAutoMarkRoomRead = (roomId: string) =>
    !!roomId && appVisibility === 'active' && activeRoomRef.current === roomId;
  const latestReadableMessage = (roomMessages?: Message[]): Message | null => {
    if (!Array.isArray(roomMessages) || roomMessages.length === 0) return null;
    for (let index = roomMessages.length - 1; index >= 0; index -= 1) {
      const candidate = roomMessages[index];
      if (candidate?.id && candidate.kind !== 'system') {
        return candidate;
      }
    }
    return null;
  };
  const latestReadableMessageId = (roomMessages?: Message[]): string => latestReadableMessage(roomMessages)?.id || '';
  const rememberRoomReadCutoff = (roomId: string, roomMessages?: Message[]) => {
    if (!roomId) return;
    const latestMessage = latestReadableMessage(roomMessages);
    const fallbackUpdatedAt = roomMap.get(roomId)?.updatedAt ?? 0;
    const nextCutoff = Math.max(latestMessage?.at ?? 0, fallbackUpdatedAt);
    if (!nextCutoff) return;
    roomReadCutoffRef.current[roomId] = Math.max(roomReadCutoffRef.current[roomId] ?? 0, nextCutoff);
  };
  const shouldSuppressRoomUnread = (roomId: string, unread: number, roomUpdatedAt?: number) => {
    if (unread <= 0) return false;
    const cutoff = roomReadCutoffRef.current[roomId] ?? 0;
    if (!cutoff) return false;
    const updatedAt = roomUpdatedAt ?? roomMap.get(roomId)?.updatedAt ?? 0;
    return updatedAt > 0 && updatedAt <= cutoff;
  };
  const registerHiddenServerMenuTap = () => {
    if (hiddenServerTapTimerRef.current) {
      clearTimeout(hiddenServerTapTimerRef.current);
    }
    hiddenServerTapCountRef.current += 1;
    if (hiddenServerTapCountRef.current >= HIDDEN_SERVER_MENU_TAP_COUNT) {
      hiddenServerTapCountRef.current = 0;
      hiddenServerTapTimerRef.current = null;
      openServerMenu();
      return;
    }
    hiddenServerTapTimerRef.current = setTimeout(() => {
      hiddenServerTapCountRef.current = 0;
      hiddenServerTapTimerRef.current = null;
    }, HIDDEN_SERVER_MENU_TAP_WINDOW_MS);
  };

  const visibleBots = useMemo(
    () => bots.filter((bot) => bot.botKey !== 'openclaw-assistant'),
    [bots]
  );
  const sortedRooms = useMemo(
    () =>
      rooms
        .filter((room) => {
          const peerId = room.members.find((member) => member !== currentUserId) ?? '';
          return !isOpenClawAssistantBotUser(peerId);
        })
        .sort((a, b) =>
          a.favorite === b.favorite ? b.updatedAt - a.updatedAt : a.favorite ? -1 : 1
        ),
    [rooms, bots, currentUserId]
  );

  const filteredRooms = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    if (!q) return sortedRooms;
    return sortedRooms.filter((room) => {
      const title = roomTitle(room).toLowerCase();
      const members = roomMemberNames(room).toLowerCase();
      const preview = room.preview.toLowerCase();
      return title.includes(q) || members.includes(q) || preview.includes(q);
    });
  }, [chatQuery, sortedRooms]);

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => `${f.name} ${f.profileName} ${f.status}`.toLowerCase().includes(q));
  }, [friendQuery, friends]);
  const familyFriends = useMemo(
    () =>
      [...filteredFriends.filter((friend) => friend.family?.isFamily)]
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filteredFriends]
  );
  const connectableFamilyFriends = useMemo(
    () =>
      [...friends.filter((friend) => !friend.family?.isFamily)].sort((a, b) => a.name.localeCompare(b.name)),
    [friends]
  );
  const directRooms = useMemo(() => filteredRooms.filter((room) => room.type === 'direct'), [filteredRooms]);
  const groupRooms = useMemo(() => filteredRooms.filter((room) => room.type === 'group'), [filteredRooms]);
  const familyRooms = useMemo(() => filteredRooms.filter((room) => room.type === 'family'), [filteredRooms]);
  const favoriteDirectRooms = useMemo(() => directRooms.filter((room) => room.favorite), [directRooms]);
  const otherDirectRooms = useMemo(() => directRooms.filter((room) => !room.favorite), [directRooms]);
  const favoriteGroupRooms = useMemo(() => groupRooms.filter((room) => room.favorite), [groupRooms]);
  const otherGroupRooms = useMemo(() => groupRooms.filter((room) => !room.favorite), [groupRooms]);
  const favoriteFamilyRooms = useMemo(() => familyRooms.filter((room) => room.favorite), [familyRooms]);
  const otherFamilyRooms = useMemo(() => familyRooms.filter((room) => !room.favorite), [familyRooms]);
  const sortedFriendsByTrust = useMemo(
    () =>
      [...filteredFriends].sort((a, b) =>
        a.trusted === b.trusted ? a.name.localeCompare(b.name) : a.trusted ? -1 : 1
      ),
    [filteredFriends]
  );
  const favoriteFriends = useMemo(() => sortedFriendsByTrust.filter((friend) => friend.trusted), [sortedFriendsByTrust]);
  const otherFriends = useMemo(() => sortedFriendsByTrust.filter((friend) => !friend.trusted), [sortedFriendsByTrust]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );
  const activeMsgs = useMemo(
    () => (activeRoomId ? messages[activeRoomId] ?? [] : []),
    [messages, activeRoomId]
  );

  const stats = useMemo(
    () => ({
      friends: friends.length,
      rooms: rooms.length,
      favs: rooms.filter((r) => r.favorite).length,
    }),
    [friends.length, rooms]
  );

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const knockCount = friendRequestsIncoming.length + friendRequestsOutgoing.length;
  const activeRoomCompanions = activeRoom?.members.filter((m) => m !== currentUserId).length ?? 0;
  const topAvatarUri = tab === 'chats' && activeRoom ? roomAvatarUri(activeRoom) : profile.avatarUri;
  const familyUpgradeTarget = useMemo(
    () => friends.find((friend) => friend.id === familyUpgradeTargetId) ?? null,
    [familyUpgradeTargetId, friends]
  );
  const friendActionsTarget = useMemo(
    () => friends.find((friend) => friend.id === friendActionsTargetId) ?? null,
    [friendActionsTargetId, friends]
  );
  const familyStructureRoom = useMemo(
    () => (familyStructureRoomId ? roomMap.get(familyStructureRoomId) ?? null : null),
    [familyStructureRoomId, roomMap]
  );
  const roomMembersRoom = useMemo(
    () => (roomMembersRoomId ? roomMap.get(roomMembersRoomId) ?? null : null),
    [roomMembersRoomId, roomMap]
  );
  const familyStructureProfileMap = useMemo(
    () => new Map(familyStructureProfiles.map((profile) => [profile.userId, profile])),
    [familyStructureProfiles]
  );
  const familyStructureCanManage = false;
  const familyStructureGuardianId = '';
  const familyStructureChildId = '';
  const setFamilyStructureGuardianId = (_value: string) => undefined;
  const setFamilyStructureChildId = (_value: string) => undefined;
  const friendsTabLabel = s.tabsFriends;
  const friendsTabHint = isKo ? '친구 목록' : 'Friend list';
  const chatsTabLabel =
    chatsMode === 'group' ? (isKo ? '그룹' : 'Groups') : isKo ? '1:1' : 'Direct';
  const chatsTabHint =
    chatsMode === 'group'
      ? isKo
        ? '다시 누르면 1:1'
        : 'Tap again: Direct'
      : isKo
        ? '다시 누르면 그룹'
        : 'Tap again: Groups';
  const currentSectionLabel =
    tab === 'friends'
      ? friendsTabLabel
      : tab === 'chats'
        ? chatsTabLabel
        : s.tabsProfile;
  const appUpdateRelease = appUpdateStatus.release;
  const appUpdateFileSize = formatAppUpdateFileSize(appUpdateRelease?.sizeBytes, isKo);
  const appUpdateNotes = (appUpdateRelease?.notes || '').trim();
  const appUpdateSummary = appUpdateStatus.isChecking
    ? isKo
      ? '\uCD5C\uC2E0 \uBC84\uC804\uC744 \uD655\uC778 \uC911\uC774\uC5D0\uC694.'
      : 'Checking for the latest version.'
    : appUpdateStatus.errorMessage
      ? appUpdateStatus.errorMessage
      : appUpdateStatus.needsUpdate
        ? isKo
          ? `\uC0C8 \uBC84\uC804 ${appUpdateStatus.latestVersion}\uC774 \uC900\uBE44\uB410\uC5B4\uC694.`
          : `Version ${appUpdateStatus.latestVersion} is ready.`
        : appUpdateStatus.checked
          ? isKo
            ? '\uD604\uC7AC \uC571\uC740 \uCD5C\uC2E0 \uBC84\uC804\uC744 \uC0AC\uC6A9 \uC911\uC774\uC5D0\uC694.'
            : 'This device is already on the latest version.'
          : isKo
            ? '\uD504\uB85C\uD544 \uD0ED\uC5D0\uC11C \uCD5C\uC2E0 \uBC84\uC804 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC694.'
            : 'The profile tab checks whether a newer version is available.';
  const appUpdateButtonLabel = isInstallingAppUpdate
    ? isKo
      ? '\uC124\uCE58 \uD654\uBA74 \uC5EC\uB294 \uC911...'
      : 'Opening installer...'
    : isKo
      ? '\uCD5C\uC2E0 \uBC84\uC804 \uC5C5\uB370\uC774\uD2B8'
      : 'Update to latest';

  const startAppUpdateInstall = async () => {
    if (!appUpdateStatus.needsUpdate) return;
    if (!appUpdateStatus.downloadUrl || !appUpdateStatus.latestVersion) return;
    if (isInstallingAppUpdate) return;

    setIsInstallingAppUpdate(true);
    try {
      await downloadAndInstallAppUpdate(appUpdateStatus.downloadUrl, appUpdateStatus.latestVersion, isKo);
    } finally {
      setIsInstallingAppUpdate(false);
    }
  };
  const handleFriendsTabPress = () => {
    if (activeRoomRef.current) return;
    setTab('friends');
  };
  const handleChatsTabPress = () => {
    if (activeRoomRef.current) return;
    if (tab === 'chats') {
      setChatsMode((prev) => (prev === 'direct' ? 'group' : 'direct'));
      return;
    }
    setTab('chats');
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const stored = await readBackendOverrideFromStorage();
      if (cancelled) return;
      setBackendOverrideUrl(stored);
      setServerMenuDraft(stored || defaultBackendBaseUrl);
      setIsBackendConfigReady(true);
    };
    void run();
    return () => {
      cancelled = true;
      if (hiddenServerTapTimerRef.current) {
        clearTimeout(hiddenServerTapTimerRef.current);
        hiddenServerTapTimerRef.current = null;
      }
    };
  }, [defaultBackendBaseUrl]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const storedChatsMode = await AsyncStorage.getItem(CHATS_TAB_MODE_STORAGE_KEY);
        if (cancelled) return;
        if (storedChatsMode === 'direct' || storedChatsMode === 'group') {
          setChatsMode(storedChatsMode);
        }
      } catch {
        if (cancelled) return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void AsyncStorage.setItem(CHATS_TAB_MODE_STORAGE_KEY, chatsMode).catch(() => null);
  }, [chatsMode]);

  const renderNookHero = ({
    title,
    body,
    iconName,
    footer,
    actions,
  }: {
    title: string;
    body: string;
    iconName: ComponentProps<typeof Ionicons>['name'];
    footer?: ReactNode;
    actions?: ReactNode;
  }) => (
    <View style={styles.denHero}>
      <View pointerEvents="none" style={styles.denGlow} />
      <LinearGradient colors={['rgba(255,248,235,0.06)', 'rgba(14,24,18,0.1)']} style={styles.denHeroSurface}>
        <View style={styles.denHeroBadge}>
          <Ionicons name={iconName} size={16} color={FOREST.text} />
        </View>
        <View style={styles.denHeroCopy}>
          <Text style={styles.denTitle}>{title}</Text>
          <Text style={styles.denBody}>{body}</Text>
        </View>
      </LinearGradient>
      {footer ? <View style={styles.denStatsRow}>{footer}</View> : null}
      {actions ? <View style={styles.denActionRow}>{actions}</View> : null}
    </View>
  );

  const renderDenStat = (
    iconName: ComponentProps<typeof Ionicons>['name'],
    value: string | number,
    label: string
  ) => (
    <View style={styles.denStatPill}>
      <Ionicons name={iconName} size={14} color={FOREST.text} />
      <View style={styles.denStatCopy}>
        <Text style={styles.denStatValue}>{value}</Text>
        <Text style={styles.denStatLabel}>{label}</Text>
      </View>
    </View>
  );

  const renderRoomRow = (room: Room) => (
    <Pressable key={room.id} style={styles.roomItem} onPress={() => openRoom(room.id)}>
      <Pressable
        style={styles.listAvatar}
        disabled={!roomAvatarUri(room)}
        onPress={(event) => {
          event.stopPropagation();
          openAvatarViewer(roomAvatarUri(room), roomTitle(room));
        }}
      >
        {roomAvatarUri(room) ? (
          <Image source={{ uri: roomAvatarUri(room) }} style={styles.listAvatarImage} />
        ) : (
          <Text style={styles.listAvatarText}>{roomTitle(room).slice(0, 1).toUpperCase()}</Text>
        )}
      </Pressable>
      <View style={styles.roomItemCopy}>
        <View style={styles.roomItemHead}>
          <Text style={[styles.itemTitle, { flex: 1 }]}>{roomTitle(room)}</Text>
          <Text style={styles.roomItemTime}>{roomTimeLabel(room.updatedAt)}</Text>
        </View>
        {room.type === 'family' ? (
          <View style={styles.friendMetaRow}>
            <View style={[styles.moodChip, styles.familyPill]}>
              <Text style={styles.familyPillText}>{isKo ? '가족방' : 'Family room'}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.roomPreview} numberOfLines={1}>
          {room.preview || roomMemberNames(room) || s.startChat}
        </Text>
      </View>
      <View style={styles.itemRight}>
        {room.unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{room.unread > 99 ? '99+' : room.unread}</Text>
          </View>
        ) : null}
        <Pressable style={styles.iconLight} onPress={() => toggleFavorite(room.id)}>
          <Ionicons
            name={room.favorite ? 'star' : 'star-outline'}
            size={16}
            color={room.favorite ? '#FFB347' : FOREST.text}
          />
        </Pressable>
      </View>
    </Pressable>
  );

  const renderFriendRow = (friend: Friend) => {
    const trustedBusy = friendActionKey === `trusted:${friend.id}`;
    const removeFriendBusy = friendActionKey === `friend-remove:${friend.id}`;
    const aliasBusy = friendActionKey === `alias:${friend.id}`;
    const subtitle = friend.aliasName
      ? friend.status
        ? `${friend.profileName} · ${friend.status}`
        : friend.profileName
      : friend.status || friend.profileName || s.startChat;
    return (
      <View key={friend.id} style={styles.friendItem}>
        <Pressable
          style={styles.listAvatar}
          disabled={!friend.avatarUri}
          onPress={() => openAvatarViewer(friend.avatarUri, friend.name)}
        >
          {friend.avatarUri ? (
            <Image source={{ uri: friend.avatarUri }} style={styles.listAvatarImage} />
          ) : (
            <Text style={styles.listAvatarText}>{friend.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </Pressable>
        <View style={styles.friendItemCopy}>
          <Text style={styles.itemTitle}>{friend.name}</Text>
          <Text style={styles.friendStatusText} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          style={[styles.iconLight, (trustedBusy || !!friendActionKey) && styles.off]}
          disabled={!!friendActionKey}
          onPress={() => void toggleTrusted(friend.id)}
        >
          <Ionicons name={friend.trusted ? 'star' : 'star-outline'} size={16} color={FOREST.text} />
        </Pressable>
        <Pressable style={styles.iconLight} onPress={() => void startDirectRoom(friend.id)}>
          <Ionicons name="chatbubble-ellipses" size={16} color={FOREST.text} />
        </Pressable>
        <Pressable
          style={[styles.iconLight, (aliasBusy || removeFriendBusy || !!friendActionKey) && styles.off]}
          disabled={!!friendActionKey}
          onPress={() => openFriendActions(friend)}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={FOREST.text} />
        </Pressable>
      </View>
    );
  };

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
    foregroundNotificationRoomId = activeRoomId ?? '';
  }, [activeRoomId]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    rooms.forEach((room) => {
      next[room.id] = room.isGroup;
    });
    roomGroupRef.current = next;
  }, [rooms]);

  useEffect(() => {
    foregroundAppState = AppState.currentState === 'active' ? 'active' : AppState.currentState === 'inactive' ? 'inactive' : 'background';
    const sub = AppState.addEventListener('change', (nextState) => {
      foregroundAppState =
        nextState === 'active' ? 'active' : nextState === 'inactive' ? 'inactive' : 'background';
      setAppVisibility(foregroundAppState);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!activeRoomId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void closeActiveRoom();
      return true;
    });
    return () => sub.remove();
  }, [activeRoomId, accessToken]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (isSessionRestoring) return;
      if (backendState !== 'ready') return;
      const token = accessToken.trim();
      if (!token) return;
      void Promise.all([refreshFriendTabData({ silent: true }), refreshRoomsFromBackend(token)]).catch(() => null);
      if (activeRoomRef.current) {
        void syncRoomReadState(token, activeRoomRef.current, { refreshMessages: true }).catch(() => null);
      }
    });
    return () => sub.remove();
  }, [accessToken, backendState, isSessionRestoring]);

  useEffect(() => {
    if (!activeRoomId) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [activeRoomId, activeMsgs.length]);

  useEffect(() => {
    const totalUnread = rooms.reduce((sum, room) => sum + Math.max(0, room.unread), 0);
    void syncAppBadgeCount(totalUnread);
  }, [rooms]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId.trim();
  }, [currentUserId]);

  useEffect(() => {
    return () => {
      if (activeRoomRefreshTimerRef.current) {
        clearTimeout(activeRoomRefreshTimerRef.current);
        activeRoomRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    accessTokenRef.current = accessToken.trim();
  }, [accessToken]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken.trim();
  }, [refreshToken]);

  useEffect(() => {
    if (tab !== 'chats') return;
    if (activeRoomId) return;
    if (isSessionRestoring) return;
    if (backendState !== 'ready') return;
    const token = accessToken.trim();
    if (!token) return;
    void refreshRoomsFromBackend(token).catch(() => null);
  }, [tab, activeRoomId, accessToken, backendState, isSessionRestoring]);

  useEffect(() => {
    const token = accessToken.trim();
    if (!activeRoomId || !token || activeMsgs.length === 0) return;
    if (!shouldAutoMarkRoomRead(activeRoomId)) return;
    const latest = activeMsgs[activeMsgs.length - 1];
    if (!latest || latest.mine) return;
    if (latest.delivery !== 'read') {
      void syncRoomReadState(token, activeRoomId).catch(() => null);
    }
  }, [activeRoomId, activeMsgs.length, accessToken, appVisibility]);

  useEffect(() => {
    const token = accessToken.trim();
    const roomId = activeRoomRef.current;
    if (!roomId || !token) return;
    if (!shouldAutoMarkRoomRead(roomId)) return;
    if (appVisibility !== 'active') return;
    let cancelled = false;
    const run = async () => {
      try {
        await syncRoomReadState(token, roomId, { refreshMessages: true });
      } catch {
        if (cancelled) return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, appVisibility]);

  useEffect(() => {
    const token = accessToken.trim();
    if (!activeRoomId || !token) return;
    if (appVisibility !== 'active') return;
    const interval = setInterval(() => {
      void (async () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        if (!shouldAutoMarkRoomRead(activeRoomId)) return;
        const synced = await syncRoomMessagesFromBackend(token, activeRoomId).catch(() => null);
        if (synced) {
          await maybeMarkLatestIncomingMessageRead(token, activeRoomId, synced).catch(() => null);
        }
      })();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeRoomId, accessToken, appVisibility]);

  const unwrapEnvelope = <T,>(raw: unknown): T => {
    if (!raw || typeof raw !== 'object') return {} as T;
    const body = raw as BackendEnvelope<T>;
    if (body.ok === false || body.success === false) {
      throw toBackendRequestError(raw, 'Request failed');
    }
    if (body.data !== undefined) return body.data;
    return raw as T;
  };

  const refreshAccessToken = async (preferredRefreshToken?: string): Promise<string> => {
    const preferred = (preferredRefreshToken || '').trim();
    const current = refreshTokenRef.current.trim();
    const tokenToUse = current || preferred;
    if (!tokenToUse) {
      throw new Error('missing refresh token');
    }
    if (refreshRequestRef.current) {
      return refreshRequestRef.current;
    }

    const request = (async () => {
      let refreshed: Response;
      try {
        refreshed = await fetch(`${backendBaseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokenToUse }),
        });
      } catch (error) {
        throw createBackendRequestError(errorMessage(error) || 'Network request failed.', {
          code: 'NETWORK_ERROR',
        });
      }
      const refreshText = await refreshed.text();
      let refreshJson: unknown = null;
      if (refreshText) {
        try {
          refreshJson = JSON.parse(refreshText);
        } catch {
          refreshJson = {};
        }
      }
      if (!refreshed.ok) {
        throw toBackendRequestError(refreshJson || {}, `HTTP ${refreshed.status}`, refreshed.status);
      }
      const refreshData = unwrapEnvelope<BackendAuthData>(refreshJson || {});
      const nextAccessToken = (refreshData.accessToken || refreshData.tokens?.accessToken || '').trim();
      const nextRefreshToken = (refreshData.refreshToken || refreshData.tokens?.refreshToken || tokenToUse).trim();
      if (!nextAccessToken) {
        throw new Error('missing access token');
      }
      setSessionTokens(nextAccessToken, nextRefreshToken);
      await writeSessionToStorage({
        accessToken: nextAccessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
      });
      return nextAccessToken;
    })();

    refreshRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (refreshRequestRef.current === request) {
        refreshRequestRef.current = null;
      }
    }
  };

  const backendRequest = async <T,>(
    path: string,
    init?: RequestInit,
    token?: string
  ): Promise<T> => {
    const isAbsoluteUrl = /^https?:\/\//i.test(path);
    const normalizedPath = isAbsoluteUrl ? new URL(path).pathname : path;
    const requestUrl = isAbsoluteUrl ? path : `${backendBaseUrl}${path}`;

    const perform = async (resolvedToken?: string) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string> | undefined),
      };
      if (!headers['Content-Type'] && typeof init?.body === 'string') headers['Content-Type'] = 'application/json';
      if (resolvedToken) headers.Authorization = `Bearer ${resolvedToken}`;
      let res: Response;
      try {
        res = await fetch(requestUrl, { ...(init || {}), headers });
      } catch (error) {
        throw createBackendRequestError(errorMessage(error) || 'Network request failed.', {
          code: 'NETWORK_ERROR',
        });
      }
      const txt = await res.text();
      let json: unknown = null;
      if (txt) {
        try {
          json = JSON.parse(txt);
        } catch {
          json = {};
        }
      }
      return { res, json };
    };

    let resolvedToken = token;
    let response = await perform(resolvedToken);
    let refreshFailure: Error | null = null;

    if (
      response.res.status === 401 &&
      normalizedPath !== '/v1/auth/refresh' &&
      normalizedPath !== '/v1/auth/google' &&
      normalizedPath !== '/health'
    ) {
      const currentRefreshToken = refreshTokenRef.current.trim();
      if (!currentRefreshToken) {
        throw toBackendRequestError(response.json || {}, `HTTP ${response.res.status}`, response.res.status);
      }
      try {
        const nextAccessToken = await refreshAccessToken(currentRefreshToken);
        if (nextAccessToken) {
          resolvedToken = nextAccessToken;
          response = await perform(resolvedToken);
        }
      } catch (error) {
        refreshFailure = error instanceof Error ? error : new Error('Refresh failed.');
      }
    }

    if (!response.res.ok) {
      if (refreshFailure) {
        throw refreshFailure;
      }
      throw toBackendRequestError(response.json || {}, `HTTP ${response.res.status}`, response.res.status);
    }
    return unwrapEnvelope<T>(response.json || {});
  };

  const parseTimestamp = (value: string | number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const ms = value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(ms) ? ms : Date.now();
  };

  const inferMediaMimeType = (
    uri: string,
    kind: 'image' | 'video',
    fallback?: string | null
  ): string => {
    const normalizedFallback = (fallback || '').trim().toLowerCase();
    if (normalizedFallback) return normalizedFallback;
    const lowerUri = uri.toLowerCase();
    if (kind === 'image') {
      if (lowerUri.endsWith('.png')) return 'image/png';
      if (lowerUri.endsWith('.webp')) return 'image/webp';
      return 'image/jpeg';
    }
    if (lowerUri.endsWith('.webm')) return 'video/webm';
    if (lowerUri.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  };

  const asListItems = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object' && Array.isArray((value as BackendListData<T>).items)) {
      return (value as BackendListData<T>).items ?? [];
    }
    return [];
  };

  const mapBackendRoom = (room: BackendRoom, fallbackUserId?: string): Room => {
    const roomType: RoomType =
      room.type === 'direct' || room.type === 'group' || room.type === 'family'
        ? room.type
        : room.isGroup
          ? 'group'
          : 'direct';

    return {
      id: String(room.id || uid()),
      type: roomType,
      title: String(room.title || s.directRoomFallback),
      members:
        Array.isArray(room.members) && room.members.length
          ? room.members.map((member) => String(member))
          : [(fallbackUserId || currentUserId || MY_ID).trim() || MY_ID],
      ownerUserId: String(room.ownerUserId || fallbackUserId || currentUserId || MY_ID),
      isGroup: roomType !== 'direct',
      favorite: !!room.favorite,
      muted: !!room.muted,
      unread: Math.max(0, Number(room.unread || 0)),
      preview: String(room.preview || ''),
      updatedAt: parseTimestamp(room.updatedAt),
    };
  };

  const mapBackendMessage = (message: BackendRoomMessage): Message => {
    const senderId = String(message.senderId || '');
    const mine = !!senderId && senderId === currentUserIdRef.current;
    return {
      id: String(message.id || uid()),
      roomId: String(message.roomId || activeRoomId || ''),
      senderId,
      senderName: String(message.senderName || getFriend(senderId)?.name || profile.name || s.me),
      mine,
      kind: (message.kind || 'text') as MsgKind,
      ...(message.text ? { text: String(message.text) } : {}),
      ...(message.uri ? { uri: resolveBackendMediaUrl(String(message.uri)) } : {}),
      at: parseTimestamp(message.at),
      delivery: (message.delivery || 'sent') as Delivery,
      ...(typeof message.unreadCount === 'number' ? { unreadCount: Math.max(0, Number(message.unreadCount)) } : {}),
      ...(Array.isArray(message.readByNames) ? { readByNames: message.readByNames.map((name) => String(name)) } : {}),
    };
  };

  const previewFromMessage = (message: Pick<Message, 'kind' | 'text'>) => {
    if (message.kind === 'image') return s.imageLabel;
    if (message.kind === 'video') return s.videoLabel;
    return message.text || '';
  };

  const shouldIncreaseRoomUnread = (message: Pick<Message, 'mine' | 'kind'>) =>
    !message.mine && message.kind !== 'system';

  const uploadDraftMediaToBackend = async (token: string, media: DraftMedia): Promise<string> => {
    const fileInfo = await FileSystem.getInfoAsync(media.uri);
    if (!fileInfo.exists || fileInfo.isDirectory) {
      throw new Error('Failed to read local media file.');
    }

    const mimeType = inferMediaMimeType(media.uri, media.kind, media.mimeType);
    const issued = await backendRequest<BackendMediaUploadTicket>(
      '/v1/media/upload-url',
      {
        method: 'POST',
        body: JSON.stringify({
          kind: media.kind,
          mimeType,
          size: fileInfo.size,
        }),
      },
      token
    );

    const uploadUrl = resolveBackendApiUrl(String(issued.uploadUrl || ''));
    const fileUrl = String(issued.fileUrl || '').trim();
    if (!uploadUrl || !fileUrl) {
      throw new Error('Media upload URL was not issued.');
    }

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, media.uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
    });
    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Media upload failed (${uploadResult.status}).`);
    }

    const completed = await backendRequest<BackendCompletedMedia>(
      '/v1/media/complete',
      {
        method: 'POST',
        body: JSON.stringify({
          fileUrl,
          kind: media.kind,
        }),
      },
      token
    );

    const completedUrl = resolveBackendMediaUrl(String(completed.fileUrl || fileUrl));
    if (!completedUrl) {
      throw new Error('Media upload did not return a file URL.');
    }

    return completedUrl;
  };

  const uploadProfilePhotoToBackend = async (token: string, localUri: string): Promise<string> => {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists || fileInfo.isDirectory) {
      throw new Error('Failed to read local profile photo.');
    }

    const mimeType = inferMediaMimeType(localUri, 'image', 'image/jpeg');
    const issued = await backendRequest<BackendMediaUploadTicket>(
      '/v1/me/avatar/upload-url',
      {
        method: 'POST',
        body: JSON.stringify({
          mimeType,
          size: fileInfo.size,
        }),
      },
      token
    );

    const uploadUrl = resolveBackendApiUrl(String(issued.uploadUrl || ''));
    const fileUrl = String(issued.fileUrl || '').trim();
    if (!uploadUrl || !fileUrl) {
      throw new Error('Avatar upload URL was not issued.');
    }

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
    });
    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Avatar upload failed (${uploadResult.status}).`);
    }

    const completed = await backendRequest<BackendCompletedMedia>(
      '/v1/media/complete',
      {
        method: 'POST',
        body: JSON.stringify({
          fileUrl,
          kind: 'avatar',
        }),
      },
      token
    );

    const completedUrl = resolveBackendMediaUrl(String(completed.fileUrl || fileUrl));
    if (!completedUrl) {
      throw new Error('Avatar upload did not return a file URL.');
    }

    return completedUrl;
  };

  const requireAccessToken = (): string => {
    const token = accessToken.trim();
    if (token) return token;
    Alert.alert(s.needsLoginTitle, s.needsLoginBody);
    return '';
  };

  const pushPlatform: 'android' | 'ios' | 'web' =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

  const openRoomFromExternalSignal = async (roomId: string) => {
    if (!roomId) return;
    activeRoomRef.current = roomId;
    foregroundNotificationRoomId = roomId;
    const token = accessToken.trim();
    let hasRoom = rooms.some((room) => room.id === roomId);
    if (token) {
      const refreshedRooms = await refreshRoomsFromBackend(token).catch(() => null);
      hasRoom = hasRoom || !!refreshedRooms?.some((room) => room.id === roomId);
      if (!hasRoom) {
        const backRoom = await backendRequest<BackendRoom>(`/v1/rooms/${roomId}`, { method: 'GET' }, token).catch(() => null);
        if (backRoom?.id) {
          const mapped = mapBackendRoom(backRoom, currentUserId);
          hasRoom = true;
          setRooms((prev) => [mapped, ...prev.filter((room) => room.id !== mapped.id)]);
          setMessages((prev) => ({ ...prev, [mapped.id]: prev[mapped.id] ?? [] }));
        }
      }
      await syncRoomMessagesFromBackend(token, roomId).catch(() => null);
      if (appVisibility === 'active') {
        await markRoomAsRead(token, roomId).catch(() => null);
      }
    }
    setActiveRoomId(roomId);
    setTab('chats');
    setInput('');
    setDraftMedia(null);
  };

  const dismissPresentedNotificationsForRoom = async (roomId: string) => {
    if (!roomId) return;
    const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
    const targets = presented.filter(
      (notification) => String(notification.request.content.data?.roomId || '') === roomId
    );
    await Promise.all(
      targets.map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => null)
      )
    );
  };
  const syncAppBadgeCount = async (totalUnread: number) => {
    await Notifications.setBadgeCountAsync(Math.max(0, totalUnread)).catch(() => null);
    if (totalUnread === 0) {
      await Notifications.dismissAllNotificationsAsync().catch(() => null);
    }
  };

  const markRoomAsRead = async (token: string, roomId: string, lastReadMessageId?: string): Promise<number | null> => {
    if (!token || !roomId) return null;
    const result = await backendRequest<BackendRoomRead>(
      `/v1/rooms/${roomId}/read`,
      {
        method: 'POST',
        ...(lastReadMessageId ? { body: JSON.stringify({ lastReadMessageId }) } : {}),
      },
      token
    ).catch(() => null);
    const unread = Math.max(0, Number(result?.unread ?? 0));
    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, unread } : room)));
    await dismissPresentedNotificationsForRoom(roomId).catch(() => null);
    if (activeRoomRef.current === roomId && (roomGroupRef.current[roomId] ?? roomMap.get(roomId)?.isGroup ?? false)) {
      scheduleActiveRoomMessagesRefresh(token, roomId);
    }
    return unread;
  };

  const syncRoomReadState = async (
    token: string,
    roomId: string,
    options?: { refreshMessages?: boolean }
  ): Promise<number | null> => {
    if (!token || !roomId) return null;
    let roomMessages = messages[roomId] ?? [];
    if (options?.refreshMessages || roomMessages.length === 0) {
      const syncedMessages = await syncRoomMessagesFromBackend(token, roomId).catch(() => null);
      if (syncedMessages) {
        roomMessages = syncedMessages;
      }
    }

    const lastReadMessageId = latestReadableMessageId(roomMessages);
    const unread = await markRoomAsRead(token, roomId, lastReadMessageId || undefined).catch(() => null);
    if (unread !== null) {
      rememberRoomReadCutoff(roomId, roomMessages);
      const latestMessage = latestReadableMessage(roomMessages);
      const fallbackUpdatedAt = Math.max(latestMessage?.at ?? 0, roomMap.get(roomId)?.updatedAt ?? 0);
      const nextUnread = shouldSuppressRoomUnread(roomId, unread, fallbackUpdatedAt) ? 0 : unread;
      setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, unread: nextUnread } : room)));
    }
    return unread;
  };

  const syncLocaleWithBackend = async (token: string, currentLocale?: string) => {
    const nextLocale = appLocaleTag;
    if ((currentLocale || '').trim() === nextLocale) return;
    await backendRequest(
      '/v1/me',
      {
        method: 'PATCH',
        body: JSON.stringify({ locale: nextLocale }),
      },
      token
    ).catch(() => null);
    setProfile((prev) => ({ ...prev, localeTag: nextLocale }));
  };

  const maybeMarkLatestIncomingMessageRead = async (
    token: string,
    roomId: string,
    roomMessages?: Message[]
  ) => {
    const source = roomMessages ?? messages[roomId] ?? [];
    const latest = source[source.length - 1];
    if (!latest || latest.mine || latest.delivery === 'read') return;
    await markRoomAsRead(token, roomId, latest.id);
  };

  const registerPushTokenWithBackend = async (pushToken: string, token: string) => {
    if (!pushToken || !token) return;
    if (registeredPushTokenRef.current === pushToken) return;
    await backendRequest(
      '/v1/push-tokens',
      {
        method: 'POST',
        body: JSON.stringify({
          platform: pushPlatform,
          pushToken,
        }),
      },
      token
    );
    registeredPushTokenRef.current = pushToken;
  };

  const requestDevicePushToken = async (): Promise<string> => {
    if (!Device.isDevice) return '';

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: '#8B95FF',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return '';

    try {
      const result = await Notifications.getDevicePushTokenAsync();
      const pushToken = typeof result.data === 'string' ? result.data.trim() : '';
      if (pushToken) {
        pushTokenRef.current = pushToken;
      }
      return pushToken;
    } catch {
      return '';
    }
  };

  const mapFriendRequests = (value: BackendFriendRequest[] | undefined): FriendRequestItem[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => !!item?.id && !!item?.peerUserId && !!item?.peerName)
      .map((item) => ({
        id: String(item.id),
        peerUserId: String(item.peerUserId),
        peerName: String(item.peerName),
        createdAt: parseTimestamp(item.createdAt),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  };
  const mapFamilyRoomMemberProfiles = (
    value: BackendFamilyRoomMemberProfile[] | undefined
  ): FamilyRoomMemberProfile[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => !!item?.userId && !!item?.name)
      .map((item) => ({
        userId: String(item.userId),
        name: String(item.name),
        avatarUri: resolveBackendMediaUrl(String(item.avatarUri || '')),
        alias: String(item.alias || ''),
      }));
  };
  const mapFamilyRoomRelationships = (
    value: BackendFamilyRoomRelationship[] | undefined
  ): FamilyRoomRelationship[] => {
    if (!Array.isArray(value)) return [];
    return value
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
      .sort((a, b) => a.createdAt - b.createdAt);
  };
  const mapRoomMembers = (value: BackendRoomMember[] | undefined): RoomMember[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => !!item?.userId && !!item?.name && (item.role === 'admin' || item.role === 'member'))
      .map((item) => ({
        userId: String(item.userId),
        name: String(item.name),
        avatarUri: resolveBackendMediaUrl(String(item.avatarUri || '')),
        alias: String(item.alias || ''),
        role: item.role as 'admin' | 'member',
        isOwner: !!item.isOwner,
      }));
  };
  const refreshFriendsAndRequests = async (token: string, options?: BackendSyncOptions) => {
    const strict = options?.strict ?? false;
    const [backFriendsRaw, requestsRaw] = strict
      ? await Promise.all([
          backendRequest<BackendFriend[] | BackendListData<BackendFriend>>('/v1/friends', { method: 'GET' }, token),
          backendRequest<BackendFriendRequestList>('/v1/friends/requests', { method: 'GET' }, token),
        ])
      : await Promise.all([
          backendRequest<BackendFriend[] | BackendListData<BackendFriend>>('/v1/friends', { method: 'GET' }, token).catch(
            () => null
          ),
          backendRequest<BackendFriendRequestList>('/v1/friends/requests', { method: 'GET' }, token).catch(() => null),
        ]);

    if (backFriendsRaw) {
      const backFriends = asListItems<BackendFriend>(backFriendsRaw);
      if (Array.isArray(backFriends)) {
        setFriends(
          backFriends
            .filter((f) => !!f?.id && !!f?.name)
            .map((f) => ({
              id: String(f.id),
              name: String(f.name),
              profileName: String(f.profileName || f.name || ''),
              ...(f.aliasName ? { aliasName: String(f.aliasName) } : {}),
              status: String(f.status || ''),
              avatarUri: resolveBackendMediaUrl(String(f.avatarUri || '')),
              trusted: !!f.trusted,
              ...(f.family?.isFamily && f.family.relationshipId
                ? {
                    family: {
                      isFamily: true as const,
                      relationshipId: String(f.family.relationshipId),
                      relationshipType: (f.family.relationshipType || 'parent_child') as FamilyRelationshipType,
                      displayLabel: (f.family.displayLabel || 'guardian') as FamilyLabel,
                      ...(f.family.familyGroupId ? { familyGroupId: String(f.family.familyGroupId) } : {}),
                      status: 'active' as const,
                    },
                  }
                : {}),
            }))
        );
      }
    }

    if (requestsRaw) {
      setFriendRequestsIncoming(mapFriendRequests(requestsRaw.incoming));
      setFriendRequestsOutgoing(mapFriendRequests(requestsRaw.outgoing));
    }
  };

  const refreshBotsFromBackend = async (token: string) => {
    const raw = await backendRequest<BackendBot[] | BackendListData<BackendBot>>('/v1/bots', { method: 'GET' }, token).catch(
      () => null
    );
    if (!raw) return;
    const items = asListItems<BackendBot>(raw)
      .filter((bot) => !!bot?.id && !!bot?.userId)
      .map((bot) => ({
        id: String(bot.id),
        botKey: String(bot.botKey || ''),
        name: String(bot.name || 'Assistant'),
        description: String(bot.description || ''),
        userId: String(bot.userId),
      }));
    setBots(items);
  };

  const refreshRoomsFromBackend = async (
    token: string,
    fallbackUserId?: string,
    options?: BackendSyncOptions
  ): Promise<Room[] | null> => {
    const strict = options?.strict ?? false;
    const backRoomsRaw = strict
      ? await backendRequest<BackendRoom[] | BackendListData<BackendRoom>>('/v1/rooms', { method: 'GET' }, token)
      : await backendRequest<BackendRoom[] | BackendListData<BackendRoom>>('/v1/rooms', { method: 'GET' }, token).catch(
          () => null
        );
    if (!backRoomsRaw) return null;
    const backRooms = asListItems<BackendRoom>(backRoomsRaw);
    if (!Array.isArray(backRooms)) return null;
    const mapped = backRooms
      .filter((r) => !!r?.id)
      .map((r) => {
        const mappedRoom = mapBackendRoom(r, fallbackUserId);
        const suppressedUnread =
          activeRoomRef.current === mappedRoom.id || shouldSuppressRoomUnread(mappedRoom.id, mappedRoom.unread, mappedRoom.updatedAt)
            ? 0
            : mappedRoom.unread;
        return suppressedUnread === mappedRoom.unread ? mappedRoom : { ...mappedRoom, unread: suppressedUnread };
      });
    setRooms(mapped);
    setMessages((prev) => {
      const next = { ...prev };
      mapped.forEach((room) => {
        if (!next[room.id]) next[room.id] = [];
      });
      return next;
    });
    return mapped;
  };

  const syncRoomMessagesFromBackend = async (token: string, roomId: string): Promise<Message[]> => {
    const raw = await backendRequest<BackendRoomMessage[] | BackendListData<BackendRoomMessage>>(
      `/v1/rooms/${roomId}/messages?limit=100`,
      { method: 'GET' },
      token
    );
    const items = asListItems<BackendRoomMessage>(raw).filter((item) => !!item?.id);
    const mappedItems = items.map((item) => mapBackendMessage(item));
    setMessages((prev) => ({
      ...prev,
      [roomId]: mappedItems,
    }));
    return mappedItems;
  };

  const scheduleActiveRoomMessagesRefresh = (token: string, roomId: string, delayMs = 160) => {
    if (!token || !roomId) return;
    if (activeRoomRefreshTimerRef.current) {
      clearTimeout(activeRoomRefreshTimerRef.current);
    }
    activeRoomRefreshTimerRef.current = setTimeout(() => {
      activeRoomRefreshTimerRef.current = null;
      if (activeRoomRef.current !== roomId) return;
      void syncRoomMessagesFromBackend(token, roomId).catch(() => null);
    }, delayMs);
  };

  const syncInitialFromBackend = async (
    token: string,
    fallbackUser?: BackendAuthUser
  ): Promise<{ hasProfileName: boolean }> => {
    logSessionTrace('sync_initial:start', {
      hasFallbackUser: !!fallbackUser?.id,
      tokenLength: token.length,
    });
    const tokenPayload = decodeJwtPayload(token);
    const me = await backendRequest<BackendProfile>('/v1/me', { method: 'GET' }, token).catch((error) => {
      if (isSessionInvalidError(error)) {
        throw error;
      }
      logSessionTrace('sync_initial:me_failed', {
        message: errorMessage(error),
      });
      return null;
    });
    const nextUserId = (me?.id || fallbackUser?.id || tokenPayload.sub || MY_ID).trim();
    const resolvedName = (
      me?.name ||
      fallbackUser?.name ||
      fallbackUser?.displayName ||
      me?.email ||
      fallbackUser?.email ||
      tokenPayload.email ||
      profile.email ||
      ''
    ).trim();
    currentUserIdRef.current = nextUserId || MY_ID;
    setCurrentUserId(nextUserId || MY_ID);
    setProfile((prev) => ({
      ...prev,
      name: resolvedName || prev.name || '',
      status: (me?.status || prev.status || '').trim(),
      email: (me?.email || fallbackUser?.email || tokenPayload.email || prev.email || '').trim(),
      avatarUri: resolveBackendMediaUrl(me?.avatarUri || fallbackUser?.avatarUri || prev.avatarUri || ''),
      localeTag: (me?.locale || prev.localeTag || appLocaleTag).trim() || appLocaleTag,
    }));
    setNameDraft(resolvedName);

    void syncLocaleWithBackend(token, me?.locale).catch(() => null);

    const [, , syncedRooms] = await Promise.all([
      refreshFriendsAndRequests(token, { strict: true }).catch((error) => {
        if (isSessionInvalidError(error)) {
          throw error;
        }
        logSessionTrace('sync_initial:friends_failed', {
          message: errorMessage(error),
        });
      }),
      refreshBotsFromBackend(token).catch(() => null),
      refreshRoomsFromBackend(token, nextUserId, { strict: true }).catch((error) => {
        if (isSessionInvalidError(error)) {
          throw error;
        }
        logSessionTrace('sync_initial:rooms_failed', {
          message: errorMessage(error),
        });
        return null;
      }),
    ]);
    logSessionTrace('sync_initial:done', {
      userId: nextUserId,
      friends: friends.length,
      rooms: syncedRooms?.length ?? 0,
    });
    return { hasProfileName: resolvedName.length > 0 };
  };

  useEffect(() => {
    const token = accessToken.trim();
    if (backendState !== 'ready' || !token) {
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let disposed = false;
    const wsBaseUrl = backendBaseUrl.replace(/^https?/i, (value) =>
      value.toLowerCase() === 'https' ? 'wss' : 'ws'
    );
    const socket = new WebSocket(`${wsBaseUrl}/v1/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      if (disposed) return;
      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data || '');
        const payload = JSON.parse(raw) as {
          type?: string;
          event?: string;
          data?: Record<string, unknown>;
        };

        if (payload.event === 'message.new' && payload.data) {
          const roomId = typeof payload.data.roomId === 'string' ? payload.data.roomId : '';
          const message = (payload.data.message || {}) as BackendRoomMessage;
          if (roomId && message) {
            void applyRealtimeMessage(token, roomId, message);
          }
          return;
        }

        if (payload.event === 'message.delivery' && payload.data) {
          const roomId = typeof payload.data.roomId === 'string' ? payload.data.roomId : '';
          const messageId = typeof payload.data.messageId === 'string' ? payload.data.messageId : '';
          const delivery = typeof payload.data.delivery === 'string' ? (payload.data.delivery as Delivery) : null;
          const deliveryAt = parseTimestamp(payload.data.at as string | number | undefined);
          if (roomId && messageId && delivery) {
            const isGroupRoom = roomGroupRef.current[roomId] ?? true;
            if (delivery === 'read' && !isGroupRoom && Number.isFinite(deliveryAt)) {
              setDirectReadCutoffs((prev) => ({
                ...prev,
                [roomId]: Math.max(prev[roomId] ?? 0, deliveryAt),
              }));
            }
            setRoomMsgs(roomId, (prev) =>
              prev.map((message) => {
                if (delivery === 'read' && !isGroupRoom && message.mine) {
                  return { ...message, delivery: 'read', unreadCount: 0 };
                }
                return message.id === messageId ? { ...message, delivery } : message;
              })
            );
            if (delivery === 'read' && isGroupRoom && activeRoomRef.current === roomId) {
              scheduleActiveRoomMessagesRefresh(token, roomId);
            }
          }
          return;
        }

        if (payload.event === 'room.unread.updated' && payload.data) {
          const roomId = typeof payload.data.roomId === 'string' ? payload.data.roomId : '';
          const unread = Number(payload.data.unread ?? Number.NaN);
          if (roomId && Number.isFinite(unread)) {
            let nextUnread = unread;
            setRooms((prev) =>
              prev.map((room) => {
                if (room.id !== roomId) return room;
                nextUnread =
                  activeRoomRef.current === roomId || shouldSuppressRoomUnread(roomId, unread, room.updatedAt) ? 0 : unread;
                return room.unread === nextUnread ? room : { ...room, unread: nextUnread };
              })
            );
            if (nextUnread === 0) {
              void dismissPresentedNotificationsForRoom(roomId).catch(() => null);
            }
          }
          return;
        }

        if (payload.event === 'room.updated' && payload.data) {
          const roomId = typeof payload.data.roomId === 'string' ? payload.data.roomId : '';
          const deleted = !!payload.data.deleted;
          if (deleted && roomId && activeRoomRef.current === roomId) {
            setActiveRoomId(null);
          }
          void refreshRoomsFromBackend(token);
          if (roomId && activeRoomRef.current === roomId) {
            void syncRoomMessagesFromBackend(token, roomId).catch(() => null);
          }
          return;
        }

        if (payload.event === 'friend.updated') {
          scheduleFriendTabRefresh(120);
          void refreshRoomsFromBackend(token).catch(() => null);
          return;
        }
      } catch {
        // Ignore malformed websocket payloads and keep the socket alive.
      }
    };

    socket.onclose = () => {
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
      if (disposed) return;
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
      }
      wsReconnectTimerRef.current = setTimeout(() => {
        setWsRetryTick((value) => value + 1);
      }, 1500);
    };

    socket.onerror = () => {
      // The close handler drives reconnect.
    };

    return () => {
      disposed = true;
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      if (wsRef.current === socket) {
        wsRef.current = null;
      }
      socket.close();
    };
  }, [accessToken, backendBaseUrl, backendState, wsRetryTick]);

  useEffect(() => {
    const token = accessToken.trim();
    if (backendState !== 'ready' || !token) return;
    let cancelled = false;

    const run = async () => {
      const nativeToken = pushTokenRef.current || (await requestDevicePushToken());
      if (!nativeToken || cancelled) return;
      await registerPushTokenWithBackend(nativeToken, token).catch(() => null);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, backendState]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const roomId = String(response.notification.request.content.data?.roomId || '');
      const token = accessToken.trim();
      if (roomId) {
        void openRoomFromExternalSignal(roomId);
        return;
      }
      if (!token) return;
      void Promise.all([refreshFriendsAndRequests(token), refreshRoomsFromBackend(token)]).finally(() => {
        setTab('friends');
      });
    });
    notificationResponseSubRef.current = subscription;

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const roomId = String(response?.notification.request.content.data?.roomId || '');
      const token = accessToken.trim();
      if (roomId) {
        void openRoomFromExternalSignal(roomId);
        return;
      }
      if (!response || !token) return;
      void Promise.all([refreshFriendsAndRequests(token), refreshRoomsFromBackend(token)]).finally(() => {
        setTab('friends');
      });
    });

    return () => {
      notificationResponseSubRef.current?.remove();
      notificationResponseSubRef.current = null;
    };
  }, [accessToken, backendState]);

  useEffect(() => {
    if (!isBackendConfigReady) return;
    let cancelled = false;
    const run = async () => {
      setBackendState('checking');
      setBackendStateMsg('');
      logSessionTrace('health:start', { backendBaseUrl });
      try {
        await backendRequest('/health', { method: 'GET' });
        if (cancelled) return;
        setBackendState('ready');
        setBackendStateMsg(s.loginServerReady);
        logSessionTrace('health:ready', { backendBaseUrl });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setBackendState('error');
        setBackendStateMsg(msg ? `${s.loginServerError} (${msg})` : s.loginServerError);
        logSessionTrace('health:error', {
          backendBaseUrl,
          message: msg || s.loginServerError,
        });
        if (!sessionRestoreStartedRef.current) {
          setIsSessionRestoring(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [backendBaseUrl, isBackendConfigReady, s.loginServerError, s.loginServerReady]);

  useEffect(() => {
    if (!isBackendConfigReady) return;
    if (backendState !== 'ready') return;
    if (!canCheckForAppUpdate) return;
    if (tab !== 'profile') return;

    let cancelled = false;
    const run = async () => {
      try {
        const params = new URLSearchParams({ currentVersion: currentAppVersion });
        const data = await backendRequest<BackendAppUpdateStatus>(
          `/v1/app-updates/latest?${params.toString()}`,
          { method: 'GET' }
        );
        if (cancelled) return;

        const release = data.release ?? null;
        const latestVersion = (data.latestVersion || release?.version || '').trim();
        const downloadUrl = (release?.latestDownloadUrl || release?.downloadUrl || '').trim();
        const needsUpdate =
          !!release &&
          !!downloadUrl &&
          !!latestVersion &&
          (data.isLatest === false || compareVersionStrings(currentAppVersion, latestVersion) < 0);

        setAppUpdateStatus({
          checked: true,
          isChecking: false,
          needsUpdate,
          latestVersion,
          downloadUrl: needsUpdate ? downloadUrl : '',
          release,
          errorMessage: '',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        console.info('[app-update] latest check skipped:', message);
        if (cancelled) return;
        setAppUpdateStatus({
          checked: true,
          isChecking: false,
          needsUpdate: false,
          latestVersion: '',
          downloadUrl: '',
          release: null,
          errorMessage: isKo
            ? '\uC9C0\uAE08\uC740 \uCD5C\uC2E0 \uBC84\uC804\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.'
            : 'Could not check for updates right now.',
        });
      }
    };

    setAppUpdateStatus((prev) => ({
      ...prev,
      isChecking: true,
      errorMessage: '',
    }));
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    backendBaseUrl,
    backendState,
    canCheckForAppUpdate,
    currentAppVersion,
    isBackendConfigReady,
    isKo,
    tab,
  ]);

  useEffect(() => {
    if (!isBackendConfigReady) return;
    if (backendState !== 'ready') return;
    if (sessionRestoreStartedRef.current) return;
    sessionRestoreStartedRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const stored = await readSessionFromStorage();
        logSessionTrace('restore:storage_read', {
          hasAccessToken: !!stored?.accessToken,
          hasRefreshToken: !!stored?.refreshToken,
        });
        if (!stored?.accessToken) {
          logSessionTrace('restore:no_session');
          return;
        }

        const applySession = async (nextAccessToken: string, nextRefreshToken?: string, user?: BackendAuthUser) => {
          logSessionTrace('restore:apply_session', {
            accessTokenLength: nextAccessToken.length,
            hasRefreshToken: !!(nextRefreshToken || '').trim(),
            hasUser: !!user?.id,
          });
          setSessionTokens(nextAccessToken, nextRefreshToken);
          setLoginErr('');
          try {
            await syncInitialFromBackend(nextAccessToken, user);
          } catch (error) {
            if (isSessionInvalidError(error)) {
              throw error;
            }
            logSessionTrace('restore:apply_session_partial', {
              message: errorMessage(error),
            });
          }
          if (cancelled) return;
          logSessionTrace('restore:apply_session_done');
          setStage('app');
        };

        try {
          await applySession(stored.accessToken, stored.refreshToken);
          return;
        } catch (initialError) {
          logSessionTrace('restore:initial_failed', {
            message: initialError instanceof Error ? initialError.message : '',
          });
          const storedRefreshToken = (stored.refreshToken || '').trim();
          const latestAccessToken = accessTokenRef.current.trim();
          const latestRefreshToken = refreshTokenRef.current.trim();

          if (storedRefreshToken && latestRefreshToken && latestRefreshToken !== storedRefreshToken && latestAccessToken) {
            try {
              logSessionTrace('restore:retry_after_internal_refresh', {
                accessTokenLength: latestAccessToken.length,
                hasRefreshToken: !!latestRefreshToken,
              });
              await applySession(latestAccessToken, latestRefreshToken);
              return;
            } catch (retryError) {
              const msg = retryError instanceof Error ? retryError.message : '';
              logSessionTrace('restore:retry_after_internal_refresh_failed', {
                message: msg || s.loginBackendSyncFailed,
              });
            }
          }

          if (!storedRefreshToken) {
            const msg = errorMessage(initialError);
            if (isSessionInvalidError(initialError)) {
              setSessionTokens('', '');
              await clearSessionInStorage();
              logSessionTrace('restore:cleared_missing_refresh', {
                message: msg,
              });
              if (!cancelled && msg) {
                setLoginErr(normalizeBackendErrorMessage(msg, isKo));
              }
              return;
            }
            logSessionTrace('restore:proceed_without_refresh', {
              message: msg,
            });
            if (!cancelled) {
              setStage('app');
            }
            return;
          }

          let refreshed: BackendAuthData;
          try {
            logSessionTrace('restore:refresh_start');
            const nextAccessToken = await refreshAccessToken(storedRefreshToken);
            refreshed = {
              accessToken: nextAccessToken,
              refreshToken: refreshTokenRef.current.trim(),
            };
          } catch (refreshError) {
            const msg = errorMessage(refreshError);
            logSessionTrace('restore:refresh_failed', {
              message: msg,
            });
            if (isSessionInvalidError(refreshError)) {
              setSessionTokens('', '');
              await clearSessionInStorage();
              if (!cancelled && msg) {
                setLoginErr(normalizeBackendErrorMessage(msg, isKo));
              }
              return;
            }
            setSessionTokens(stored.accessToken, storedRefreshToken);
            if (!cancelled) {
              setStage('app');
            }
            return;
          }

          const nextAccessToken = (refreshed.accessToken || refreshed.tokens?.accessToken || '').trim();
          const nextRefreshToken =
            (refreshed.refreshToken || refreshed.tokens?.refreshToken || storedRefreshToken).trim();
          logSessionTrace('restore:refresh_done', {
            hasAccessToken: !!nextAccessToken,
            hasRefreshToken: !!nextRefreshToken,
            hasUser: !!refreshed.user?.id,
          });
          if (!nextAccessToken) {
            setSessionTokens('', '');
            await clearSessionInStorage();
            logSessionTrace('restore:cleared_missing_access_after_refresh');
            if (!cancelled) {
              setLoginErr(s.loginBackendSyncFailed);
            }
            return;
          }

          await writeSessionToStorage({
            accessToken: nextAccessToken,
            ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {})
          });

          try {
            await applySession(nextAccessToken, nextRefreshToken);
          } catch (retryError) {
            const msg = errorMessage(retryError);
            logSessionTrace('restore:retry_failed', {
              message: msg || s.loginBackendSyncFailed,
            });
            if (isSessionInvalidError(retryError)) {
              setSessionTokens('', '');
              await clearSessionInStorage();
              if (!cancelled) {
                setLoginErr(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
              }
              return;
            }
            if (!cancelled) {
              setStage('app');
            }
          }
        }
      } catch (error) {
        if (cancelled) return;
        logSessionTrace('restore:unexpected_failure');
        if (isSessionInvalidError(error)) {
          setSessionTokens('', '');
          await clearSessionInStorage();
          const msg = errorMessage(error);
          if (msg) {
            setLoginErr(normalizeBackendErrorMessage(msg, isKo));
          }
          return;
        }
        if (accessTokenRef.current.trim()) {
          setStage('app');
        }
      } finally {
        logSessionTrace('restore:finished');
        if (!cancelled) setIsSessionRestoring(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [backendState, isBackendConfigReady, isKo, s.loginBackendSyncFailed]);

  useEffect(() => {
    if (isSessionRestoring) return;
    let cancelled = false;
    const run = async () => {
      const nextAccessToken = accessToken.trim();
      const nextRefreshToken = refreshToken.trim();
      if (!nextAccessToken) {
        await clearSessionInStorage();
        return;
      }
      await writeSessionToStorage({
        accessToken: nextAccessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {})
      });
    };
    run().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshToken, isSessionRestoring]);

  useEffect(() => {
    if (!hasGoogle) return;
    GoogleSignin.configure({
      webClientId: g.webClientId,
      ...(g.iosClientId ? { iosClientId: g.iosClientId } : {}),
      scopes: ['openid', 'profile', 'email'],
      offlineAccess: false,
    });
  }, [g.iosClientId, g.webClientId, hasGoogle]);

  const postGoogleAuth = async (idToken: string, accessToken: string) => {
    const payload: {
      idToken?: string;
      accessToken?: string;
      device: { platform: string; appVersion: string; deviceId: string };
    } = {
      device: {
        platform: Platform.OS,
        appVersion: currentAppVersion,
        deviceId: String(Constants.deviceName || Constants.sessionId || 'unknown'),
      },
    };
    const trimmedIdToken = idToken.trim();
    const trimmedAccessToken = accessToken.trim();
    if (trimmedIdToken) payload.idToken = trimmedIdToken;
    if (trimmedAccessToken) payload.accessToken = trimmedAccessToken;
    return backendRequest<BackendAuthData>('/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const setRoomMsgs = (rid: string, updater: (prev: Message[]) => Message[]) =>
    setMessages((p) => ({ ...p, [rid]: updater(p[rid] ?? []).map(normalizeMessageOwnership) }));
  const upsertRoomMessage = (rid: string, message: Message) =>
    setRoomMsgs(rid, (prev) => mergeRoomMessages(prev, [message]));

  const setProfileCropSynced = (
    updater: (prev: ProfilePhotoCrop | null) => ProfilePhotoCrop | null
  ) => {
    setProfileCrop((prev) => {
      const next = updater(prev);
      profileCropRef.current = next;
      return next;
    });
  };

  const closeCropModal = () => {
    cropOpenedAtRef.current = 0;
    cropGestureModeRef.current = 'none';
    setCropTarget('profile');
    setProfileCropSynced(() => null);
  };

  const normalizeImageForCrop = async (uri: string) => {
    return uri;
  };

  const beginPinch = (crop: ProfilePhotoCrop, touches: TouchPoint[]) => {
    const distance = touchDistance(touches);
    if (distance <= 0) return;
    const center = touchCenter(touches);
    cropGestureModeRef.current = 'pinch';
    cropPinchStartRef.current = {
      distance,
      scale: crop.scale,
      centerPageX: center.x,
      centerPageY: center.y,
      centerImageX: (-crop.offsetX + PROFILE_CROP_BOX / 2) / crop.scale,
      centerImageY: (-crop.offsetY + PROFILE_CROP_BOX / 2) / crop.scale,
    };
  };

  const touchRoom = (rid: string, preview: string, incoming = false) =>
    setRooms((p) =>
      p.map((r) =>
        r.id === rid
          ? {
              ...r,
              preview,
              updatedAt: Date.now(),
              unread: incoming && activeRoomRef.current !== rid ? r.unread + 1 : r.unread,
            }
          : r
      )
    );

  const appendSystem = (rid: string, text: string) => {
    const m: Message = {
      id: uid(),
      roomId: rid,
      senderId: 'system',
      senderName: 'system',
      mine: false,
      kind: 'system',
      text,
      at: Date.now(),
    };
    upsertRoomMessage(rid, m);
    touchRoom(rid, text, false);
  };

  const applyRealtimeMessage = async (token: string, roomId: string, rawMessage: BackendRoomMessage) => {
    const mapped = mapBackendMessage({ ...rawMessage, roomId: rawMessage.roomId || roomId });
    let inserted = false;

    setMessages((prev) => {
      const existing = prev[roomId] ?? [];
      inserted = !existing.some((message) => message.id === mapped.id);
      return { ...prev, [roomId]: mergeRoomMessages(existing, [mapped]) };
    });

    setRooms((prev) => {
      const exists = prev.some((room) => room.id === roomId);
      if (!exists) return prev;
      return prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              preview: previewFromMessage(mapped),
              updatedAt: Math.max(room.updatedAt, mapped.at),
              unread:
                inserted && shouldIncreaseRoomUnread(mapped) && activeRoomRef.current !== roomId
                  ? room.unread + 1
                  : room.unread,
            }
          : room
      );
    });

    if (!rooms.some((room) => room.id === roomId)) {
      void refreshRoomsFromBackend(token);
    }

    if (shouldAutoMarkRoomRead(roomId) && !mapped.mine) {
      await markRoomAsRead(token, roomId, mapped.id);
    }
  };

  const ensureDirectRoom = async (fid: string) => {
    const old = rooms.find(
      (r) =>
        !r.isGroup &&
        r.members.length === 2 &&
        r.members.includes(currentUserId) &&
        r.members.includes(fid)
    );
    if (old) return old.id;

    const token = accessToken.trim();
    if (token) {
      try {
        const backRoom = await backendRequest<BackendRoom>(
          '/v1/rooms/direct',
          {
            method: 'POST',
            body: JSON.stringify({ friendUserId: fid }),
          },
          token
        );
        const mapped = mapBackendRoom(backRoom, currentUserId);
        setRooms((prev) => [mapped, ...prev.filter((room) => room.id !== mapped.id)]);
        setMessages((prev) => ({ ...prev, [mapped.id]: prev[mapped.id] ?? [] }));
        return mapped.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
      }
    }

    const rid = uid();
    const room: Room = {
      id: rid,
      type: 'direct',
      title: getFriend(fid)?.name ?? s.directRoomFallback,
      members: [currentUserId, fid],
      ownerUserId: currentUserId,
      isGroup: false,
      favorite: false,
      muted: false,
      unread: 0,
      preview: '',
      updatedAt: Date.now(),
    };
    setRooms((p) => [room, ...p]);
    setMessages((p) => ({ ...p, [rid]: [] }));
    appendSystem(rid, s.safe);
    return rid;
  };

  const startDirectRoom = async (fid: string) => {
    const rid = await ensureDirectRoom(fid);
    openRoom(rid);
  };

  const startBotRoom = async (botId: string) => {
    const token = accessToken.trim();
    if (!token) return;
    try {
      const result = await backendRequest<{ bot?: BackendBot; room?: BackendRoom }>(
        `/v1/bots/${botId}/rooms`,
        { method: 'POST' },
        token
      );
      const backRoom = result.room;
      if (!backRoom?.id) {
        throw new Error('missing bot room');
      }
      const mapped = mapBackendRoom(backRoom, currentUserId);
      setRooms((prev) => [mapped, ...prev.filter((room) => room.id !== mapped.id)]);
      setMessages((prev) => ({ ...prev, [mapped.id]: prev[mapped.id] ?? [] }));
      openRoom(mapped.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.botLoadFailed, isKo));
    }
  };

  const openRoom = (rid: string) => {
    activeRoomRef.current = rid;
    foregroundNotificationRoomId = rid;
    const targetRoom = rooms.find((room) => room.id === rid);
    if (targetRoom) {
      setChatsMode(targetRoom.isGroup ? 'group' : 'direct');
    }
    setActiveRoomId(rid);
    setTab('chats');
    setInput('');
    setDraftMedia(null);
    setRooms((p) => p.map((r) => (r.id === rid ? { ...r, unread: 0 } : r)));
    void dismissPresentedNotificationsForRoom(rid).catch(() => null);
    const token = accessToken.trim();
    if (token) {
      void syncRoomReadState(token, rid, { refreshMessages: true }).catch(() => null);
    }
  };
  const closeActiveRoom = async () => {
    const rid = activeRoomRef.current;
    foregroundNotificationRoomId = '';
    const token = accessToken.trim();
    if (rid && token) {
      await syncRoomReadState(token, rid, { refreshMessages: true }).catch(() => null);
      await refreshRoomsFromBackend(token).catch(() => null);
    }
    activeRoomRef.current = null;
    setActiveRoomId(null);
  };

  const displayFamilyStructureName = (userId: string, fallbackName?: string) => {
    const profile = familyStructureProfileMap.get(userId);
    const alias = profile?.alias.trim() || '';
    if (alias) return alias;
    if (profile?.name) return profile.name;
    return fallbackName || '';
  };

  const closeFamilyStructureModal = () => {
    setFamilyStructureRoomId(null);
    setFamilyStructureProfiles([]);
    setFamilyStructureRelationships([]);
    setFamilyStructurePendingIncoming([]);
    setFamilyStructurePendingOutgoing([]);
    setFamilyStructureAliasDrafts({});
    setFamilyStructureTargetId('');
    setFamilyStructureRequestAs('guardian');
    setIsFamilyStructureLoading(false);
    setFamilyStructureActionKey('');
  };

  const loadFamilyStructure = async (token: string, roomId: string) => {
    if (!token || !roomId) return;
    setIsFamilyStructureLoading(true);
    try {
      const [profilesRaw, relationshipsRaw] = await Promise.all([
        backendRequest<BackendFamilyRoomMemberProfileList>(`/v1/rooms/${roomId}/member-profiles`, { method: 'GET' }, token),
        backendRequest<BackendFamilyRoomRelationshipList>(`/v1/rooms/${roomId}/relationships`, { method: 'GET' }, token),
      ]);
      const profiles = mapFamilyRoomMemberProfiles(profilesRaw.items);
      setFamilyStructureProfiles(profiles);
      setFamilyStructureAliasDrafts(
        Object.fromEntries(profiles.map((profile) => [profile.userId, profile.alias]))
      );
      setFamilyStructureRelationships(mapFamilyRoomRelationships(relationshipsRaw.items));
      setFamilyStructurePendingIncoming(mapFamilyRoomRelationships(relationshipsRaw.pendingIncoming));
      setFamilyStructurePendingOutgoing(mapFamilyRoomRelationships(relationshipsRaw.pendingOutgoing));
    } finally {
      setIsFamilyStructureLoading(false);
    }
  };

  const openFamilyStructureEditor = async (roomId: string) => {
    const token = requireAccessToken();
    if (!token || !roomId) return;
    setRoomMenuId(null);
    setFamilyStructureRoomId(roomId);
    await loadFamilyStructure(token, roomId).catch((err) => {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
      closeFamilyStructureModal();
    });
  };

  const saveFamilyStructureAlias = async (targetUserId: string) => {
    const token = requireAccessToken();
    const roomId = familyStructureRoomId || '';
    if (!token || !roomId || !targetUserId) return;
    const actionKey = `alias:${targetUserId}`;
    setFamilyStructureActionKey(actionKey);
    const nextAlias = (familyStructureAliasDrafts[targetUserId] || '').trim();
    try {
      await backendRequest(
        `/v1/rooms/${roomId}/member-profiles/${targetUserId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ alias: nextAlias || null }),
        },
        token
      );
      setFamilyStructureProfiles((prev) =>
        prev.map((profile) => (profile.userId === targetUserId ? { ...profile, alias: nextAlias } : profile))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyStructureActionKey('');
    }
  };

  const createFamilyGuardianLink = async () => {
    const token = requireAccessToken();
    const roomId = familyStructureRoomId || '';
    if (!token || !roomId || !familyStructureTargetId) return;
    const actionKey = `link-create:${familyStructureRequestAs}:${familyStructureTargetId}`;
    setFamilyStructureActionKey(actionKey);
    try {
      const created = await backendRequest<BackendFamilyRoomRelationship>(
        `/v1/rooms/${roomId}/relationships`,
        {
          method: 'POST',
          body: JSON.stringify({
            targetUserId: familyStructureTargetId,
            as: familyStructureRequestAs,
          }),
        },
        token
      );
      const mapped = mapFamilyRoomRelationships([created])[0];
      if (mapped) {
        setFamilyStructurePendingOutgoing((prev) =>
          [...prev.filter((item) => item.id !== mapped.id), mapped].sort((a, b) => a.createdAt - b.createdAt)
        );
      }
      setFamilyStructureTargetId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyStructureActionKey('');
    }
  };

  const respondFamilyGuardianLink = async (relationshipId: string, decision: 'accept' | 'reject') => {
    const token = requireAccessToken();
    const roomId = familyStructureRoomId || '';
    if (!token || !roomId || !relationshipId) return;
    const actionKey = `link-respond:${decision}:${relationshipId}`;
    setFamilyStructureActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/rooms/${roomId}/relationships/${relationshipId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        },
        token
      );
      const matched = familyStructurePendingIncoming.find((item) => item.id === relationshipId) ?? null;
      setFamilyStructurePendingIncoming((prev) => prev.filter((item) => item.id !== relationshipId));
      if (decision === 'accept' && matched) {
        setFamilyStructureRelationships((prev) => [...prev, matched].sort((a, b) => a.createdAt - b.createdAt));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyStructureActionKey('');
    }
  };

  const deleteFamilyGuardianLink = async (relationshipId: string) => {
    const token = requireAccessToken();
    const roomId = familyStructureRoomId || '';
    if (!token || !roomId || !relationshipId) return;
    const actionKey = `link-delete:${relationshipId}`;
    setFamilyStructureActionKey(actionKey);
    try {
      await backendRequest(`/v1/rooms/${roomId}/relationships/${relationshipId}`, { method: 'DELETE' }, token);
      setFamilyStructureRelationships((prev) => prev.filter((item) => item.id !== relationshipId));
      setFamilyStructurePendingIncoming((prev) => prev.filter((item) => item.id !== relationshipId));
      setFamilyStructurePendingOutgoing((prev) => prev.filter((item) => item.id !== relationshipId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyStructureActionKey('');
    }
  };

  const closeRoomMembersModal = () => {
    setRoomMembersRoomId(null);
    setRoomMembers([]);
    setRoomOwnerUserId('');
    setRoomMembersMyRole('member');
    setRoomMembersCanTransferOwnership(false);
    setRoomMembersCanManageAdmins(false);
    setRoomMembersCanKickMembers(false);
    setIsRoomMembersLoading(false);
    setRoomMembersActionKey('');
  };

  const loadRoomMembers = async (token: string, roomId: string) => {
    if (!token || !roomId) return;
    setIsRoomMembersLoading(true);
    try {
      const raw = await backendRequest<BackendRoomMemberList>(`/v1/rooms/${roomId}/members`, { method: 'GET' }, token);
      setRoomMembers(mapRoomMembers(raw.items));
      setRoomOwnerUserId(String(raw.ownerUserId || ''));
      setRoomMembersMyRole(raw.myRole === 'admin' ? 'admin' : 'member');
      setRoomMembersCanTransferOwnership(!!raw.canTransferOwnership);
      setRoomMembersCanManageAdmins(!!raw.canManageAdmins);
      setRoomMembersCanKickMembers(!!raw.canKickMembers);
    } finally {
      setIsRoomMembersLoading(false);
    }
  };

  const openRoomMembersEditor = async (roomId: string) => {
    const token = requireAccessToken();
    if (!token || !roomId) return;
    setRoomMenuId(null);
    setRoomMembersRoomId(roomId);
    await loadRoomMembers(token, roomId).catch((err) => {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
      closeRoomMembersModal();
    });
  };

  const displayRoomMemberName = (member: RoomMember) => member.alias.trim() || member.name;

  const transferRoomOwnership = async (targetUserId: string) => {
    const token = requireAccessToken();
    const roomId = roomMembersRoomId || '';
    if (!token || !roomId || !targetUserId) return;
    const actionKey = `owner:${targetUserId}`;
    setRoomMembersActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/rooms/${roomId}/transfer-ownership`,
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        },
        token
      );
      await Promise.all([loadRoomMembers(token, roomId), refreshRoomsFromBackend(token)]).catch(() => null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setRoomMembersActionKey('');
    }
  };

  const updateRoomMemberRole = async (targetUserId: string, role: 'admin' | 'member') => {
    const token = requireAccessToken();
    const roomId = roomMembersRoomId || '';
    if (!token || !roomId || !targetUserId) return;
    const actionKey = `role:${targetUserId}:${role}`;
    setRoomMembersActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/rooms/${roomId}/members/${targetUserId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        },
        token
      );
      await Promise.all([loadRoomMembers(token, roomId), refreshRoomsFromBackend(token)]).catch(() => null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setRoomMembersActionKey('');
    }
  };

  const kickRoomMember = async (targetUserId: string) => {
    const token = requireAccessToken();
    const roomId = roomMembersRoomId || '';
    if (!token || !roomId || !targetUserId) return;
    const actionKey = `kick:${targetUserId}`;
    setRoomMembersActionKey(actionKey);
    try {
      await backendRequest(`/v1/rooms/${roomId}/members/${targetUserId}`, { method: 'DELETE' }, token);
      await Promise.all([loadRoomMembers(token, roomId), refreshRoomsFromBackend(token)]).catch(() => null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setRoomMembersActionKey('');
    }
  };

  const refreshFriendTabData = async (options?: { silent?: boolean }) => {
    const token = accessToken.trim();
    if (!token) return;
    if (friendTabRefreshInFlightRef.current) {
      return friendTabRefreshInFlightRef.current;
    }
    const silent = options?.silent ?? false;
    const request = (async () => {
      if (!silent) {
        setIsFriendSyncing(true);
      }
      try {
        await refreshFriendsAndRequests(token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!silent && msg) Alert.alert(msg);
      } finally {
        if (!silent) {
          setIsFriendSyncing(false);
        }
      }
    })();
    friendTabRefreshInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (friendTabRefreshInFlightRef.current === request) {
        friendTabRefreshInFlightRef.current = null;
      }
    }
  };
  const scheduleFriendTabRefresh = (delayMs = 250) => {
    if (friendTabRefreshTimerRef.current) {
      clearTimeout(friendTabRefreshTimerRef.current);
    }
    friendTabRefreshTimerRef.current = setTimeout(() => {
      friendTabRefreshTimerRef.current = null;
      if (tab !== 'friends') return;
      if (appVisibility !== 'active') return;
      if (isSessionRestoring) return;
      if (backendState !== 'ready') return;
      void refreshFriendTabData({ silent: true });
    }, delayMs);
  };

  const openFriendModal = () => {
    setFriendLookupQuery('');
    setFriendLookupResults([]);
    setFriendLookupMsg('');
    setShowFriendModal(true);
  };
  const openCreateRoomModal = (kind: CreateRoomKind = 'group') => {
    setCreateRoomType(kind);
    setGroupNameDraft('');
    setGroupPick([]);
    setShowGroupModal(true);
  };
  const openFamilyUpgradeModal = (friend: Friend) => {
    if (friend.family?.isFamily) return;
    setFamilyUpgradeTargetId(friend.id);
    setShowFamilyUpgradeModal(true);
  };
  const openFamilyPickerModal = () => {
    setShowFamilyPickerModal(true);
  };
  const closeFamilyPickerModal = () => {
    setShowFamilyPickerModal(false);
  };
  const selectFamilyUpgradeFriend = (friend: Friend) => {
    closeFamilyPickerModal();
    openFamilyUpgradeModal(friend);
  };
  const closeFamilyUpgradeModal = () => {
    setShowFamilyUpgradeModal(false);
    setFamilyUpgradeTargetId('');
  };
  const sendFamilyUpgradeRequest = async () => {
    const token = requireAccessToken();
    if (!token) return;
    const targetUserId = familyUpgradeTargetId.trim();
    if (!targetUserId) return;
    const actionKey = `create:${targetUserId}`;
    setFamilyActionKey(actionKey);
    try {
      await backendRequest(
        '/v1/family/upgrade-requests',
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        },
        token
      );
      closeFamilyUpgradeModal();
      await refreshFriendTabData();
      Alert.alert(isKo ? '가족 연결 요청을 보냈어요.' : 'Family link request sent.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyActionKey('');
    }
  };
  const acceptFamilyUpgradeRequest = async (requestId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `accept:${requestId}`;
    setFamilyActionKey(actionKey);
    try {
      await backendRequest(`/v1/family/upgrade-requests/${requestId}/accept`, { method: 'POST' }, token);
      setFamilyRequestsIncoming((prev) => prev.filter((item) => item.requestId !== requestId));
      await refreshFriendTabData();
      await refreshRoomsFromBackend(token).catch(() => null);
      Alert.alert(isKo ? '가족 관계가 연결됐어요.' : 'Family link created.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyActionKey('');
    }
  };
  const rejectFamilyUpgradeRequest = async (requestId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `reject:${requestId}`;
    setFamilyActionKey(actionKey);
    try {
      await backendRequest(`/v1/family/upgrade-requests/${requestId}/reject`, { method: 'POST' }, token);
      setFamilyRequestsIncoming((prev) => prev.filter((item) => item.requestId !== requestId));
      await refreshFriendTabData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyActionKey('');
    }
  };
  const cancelFamilyUpgradeRequest = async (requestId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `cancel:${requestId}`;
    setFamilyActionKey(actionKey);
    try {
      await backendRequest(`/v1/family/upgrade-requests/${requestId}/cancel`, { method: 'POST' }, token);
      setFamilyRequestsOutgoing((prev) => prev.filter((item) => item.requestId !== requestId));
      await refreshFriendTabData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyActionKey('');
    }
  };
  const removeFamilyLink = async (relationshipId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `family-remove:${relationshipId}`;
    setFamilyActionKey(actionKey);
    try {
      await backendRequest(`/v1/family/links/${relationshipId}`, { method: 'DELETE' }, token);
      await refreshFriendTabData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFamilyActionKey('');
    }
  };
  const removeFriendConnection = async (friendUserId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `friend-remove:${friendUserId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(`/v1/friends/${friendUserId}`, { method: 'DELETE' }, token);
      await Promise.all([refreshFriendTabData(), refreshRoomsFromBackend(token)]).catch(() => null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };
  const openFriendAliasModal = (friend: Friend) => {
    setFriendAliasTargetId(friend.id);
    setFriendAliasDraft(friend.aliasName || '');
    setShowFriendAliasModal(true);
  };
  const removeFriendAlias = async (friendUserId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `alias:${friendUserId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/friends/${friendUserId}/alias`,
        { method: 'PATCH', body: JSON.stringify({ alias: null }) },
        token
      );
      await refreshFriendTabData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };
  const closeFriendAliasModal = () => {
    setShowFriendAliasModal(false);
    setFriendAliasTargetId('');
    setFriendAliasDraft('');
  };
  const saveFriendAlias = async () => {
    const token = requireAccessToken();
    if (!token) return;
    const friendUserId = friendAliasTargetId.trim();
    if (!friendUserId) return;
    const actionKey = `alias:${friendUserId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/friends/${friendUserId}/alias`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            alias: friendAliasDraft.trim() ? friendAliasDraft.trim() : null,
          }),
        },
        token
      );
      closeFriendAliasModal();
      await refreshFriendTabData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };
  const openFriendActions = (friend: Friend) => {
    setFriendActionsTargetId(friend.id);
    setShowFriendActionsModal(true);
  };
  const closeFriendActionsModal = () => {
    setShowFriendActionsModal(false);
    setFriendActionsTargetId('');
  };

  const searchFriendCandidates = async () => {
    const token = requireAccessToken();
    if (!token) return;
    const query = friendLookupQuery.trim();
    if (!query) {
      setFriendLookupMsg(s.friendLookupNeedQuery);
      setFriendLookupResults([]);
      return;
    }
    if (!EMAIL_REGEX.test(query)) {
      setFriendLookupMsg(s.friendLookupInvalidEmail);
      setFriendLookupResults([]);
      return;
    }
    setFriendLookupMsg('');
    setIsFriendLookupLoading(true);
    try {
      const encoded = encodeURIComponent(query);
      const raw = await backendRequest<BackendFriendSearchUser[] | BackendListData<BackendFriendSearchUser>>(
        `/v1/friends/search?q=${encoded}&limit=20`,
        { method: 'GET' },
        token
      );
      const emailQuery = query.toLowerCase();
      const items = asListItems<BackendFriendSearchUser>(raw)
        .filter((item) => {
          if (!item?.id || !item?.name || !item?.email) return false;
          return String(item.email).trim().toLowerCase() === emailQuery;
        })
        .map((item) => ({
          id: String(item.id),
          name: String(item.name),
          status: String(item.status || ''),
          email: String(item.email),
          avatarUri: resolveBackendMediaUrl(String(item.avatarUri || '')),
          isFriend: !!item.isFriend,
          outgoingPending: !!item.outgoingPending,
          incomingPending: !!item.incomingPending,
        }));
      setFriendLookupResults(items);
      if (items.length === 0) setFriendLookupMsg(s.friendLookupEmpty);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setFriendLookupMsg(msg || s.loginBackendSyncFailed);
      setFriendLookupResults([]);
    } finally {
      setIsFriendLookupLoading(false);
    }
  };

  const sendFriendRequest = async (targetUserId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `send:${targetUserId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(
        '/v1/friends/requests',
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        },
        token
      );
      await refreshFriendsAndRequests(token);
      setFriendLookupResults((prev) =>
        prev.map((item) =>
          item.id === targetUserId ? { ...item, outgoingPending: true, incomingPending: false } : item
        )
      );
      Alert.alert(s.friendRequestSentDone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };

  const acceptFriendRequest = async (requestId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `accept:${requestId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(`/v1/friends/requests/${requestId}/accept`, { method: 'POST' }, token);
      setFriendRequestsIncoming((prev) => prev.filter((item) => item.id !== requestId));
      await Promise.all([refreshFriendsAndRequests(token), refreshRoomsFromBackend(token)]);
      Alert.alert(s.friendRequestAcceptedDone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const actionKey = `reject:${requestId}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(`/v1/friends/requests/${requestId}/reject`, { method: 'POST' }, token);
      setFriendRequestsIncoming((prev) => prev.filter((item) => item.id !== requestId));
      await refreshFriendsAndRequests(token);
      Alert.alert(s.friendRequestRejectedDone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };

  useEffect(() => {
    if (tab !== 'friends') return;
    if (!accessToken.trim()) return;
    void refreshFriendTabData();
  }, [tab, accessToken]);
  useEffect(() => {
    return () => {
      if (friendTabRefreshTimerRef.current) {
        clearTimeout(friendTabRefreshTimerRef.current);
        friendTabRefreshTimerRef.current = null;
      }
    };
  }, []);

  const createSharedRoom = async () => {
    const minPickCount = createRoomType === 'family' ? 1 : 2;
    if (groupPick.length < minPickCount) return;
    const title =
      groupNameDraft.trim() ||
      groupPick
        .map((idv) => getFriend(idv)?.name ?? '')
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

    const token = accessToken.trim();
    if (token) {
      try {
        const backRoom = await backendRequest<BackendRoom>(
          '/v1/rooms',
          {
            method: 'POST',
            body: JSON.stringify({ type: createRoomType, title, memberUserIds: groupPick }),
          },
          token
        );
        const mapped = mapBackendRoom(backRoom, currentUserId);
        setRooms((prev) => [mapped, ...prev.filter((room) => room.id !== mapped.id)]);
        setMessages((prev) => ({ ...prev, [mapped.id]: prev[mapped.id] ?? [] }));
        setGroupNameDraft('');
        setGroupPick([]);
        setShowGroupModal(false);
        openRoom(mapped.id);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
      }
    }

    const rid = uid();
    const room: Room = {
      id: rid,
      type: createRoomType,
      title,
      members: [currentUserId, ...groupPick],
      ownerUserId: currentUserId,
      isGroup: true,
      favorite: false,
      muted: false,
      unread: 0,
      preview: '',
      updatedAt: Date.now(),
    };
    setRooms((p) => [room, ...p]);
    setMessages((p) => ({ ...p, [rid]: [] }));
    appendSystem(rid, roomMemberNames(room));
    setGroupNameDraft('');
    setGroupPick([]);
    setShowGroupModal(false);
    openRoom(rid);
  };

  const updateDelivery = (rid: string, mid: string, d: Delivery) =>
    setRoomMsgs(rid, (p) => p.map((m) => (m.id === mid ? { ...m, delivery: d } : m)));

  const send = async () => {
    if (!activeRoom) return;
    const text = input.trim();
    if (!text && !draftMedia) return;
    if (sendLockRef.current) return;

    sendLockRef.current = true;
    setIsSendingMessage(true);
    const token = accessToken.trim();
    try {
      if (token) {
        let textSent = false;
        let mediaSent = false;
        try {
          if (text) {
            const createdText = await backendRequest<BackendRoomMessage>(
              `/v1/rooms/${activeRoom.id}/messages`,
              {
                method: 'POST',
                body: JSON.stringify({
                  clientMessageId: uid(),
                  kind: 'text',
                  text,
                }),
              },
              token
            );
            const mappedText = mapBackendMessage(createdText);
            upsertRoomMessage(activeRoom.id, mappedText);
            touchRoom(activeRoom.id, mappedText.text || '', false);
            textSent = true;
          }

          if (draftMedia) {
            const uploadedUri = await uploadDraftMediaToBackend(token, draftMedia);
            const createdMedia = await backendRequest<BackendRoomMessage>(
              `/v1/rooms/${activeRoom.id}/messages`,
              {
                method: 'POST',
                body: JSON.stringify({
                  clientMessageId: uid(),
                  kind: draftMedia.kind,
                  uri: uploadedUri,
                }),
              },
              token
            );
            const mappedMedia = mapBackendMessage(createdMedia);
            upsertRoomMessage(activeRoom.id, mappedMedia);
            touchRoom(activeRoom.id, previewFromMessage(mappedMedia), false);
            mediaSent = true;
          }

          if (textSent) setInput('');
          if (mediaSent) setDraftMedia(null);
          return;
        } catch (err) {
          if (textSent) setInput('');
          if (mediaSent) setDraftMedia(null);
          const msg = err instanceof Error ? err.message : '';
          Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
          return;
        }
      }

      const out: Message[] = [];
      if (text) {
        out.push({
          id: uid(),
          roomId: activeRoom.id,
          senderId: currentUserId,
          senderName: profile.name || s.me,
          mine: true,
          kind: 'text',
          text,
          at: Date.now(),
          delivery: 'sending',
        });
      }

      if (draftMedia) {
        out.push({
          id: uid(),
          roomId: activeRoom.id,
          senderId: currentUserId,
          senderName: profile.name || s.me,
          mine: true,
          kind: draftMedia.kind,
          uri: draftMedia.uri,
          at: Date.now(),
          delivery: 'sending',
        });
      }

      setRoomMsgs(activeRoom.id, (p) => [...p, ...out]);
      const last = out[out.length - 1];
      touchRoom(
        activeRoom.id,
        last?.kind === 'text' ? last.text || '' : last?.kind === 'image' ? s.imageLabel : s.videoLabel,
        false
      );

      setInput('');
      setDraftMedia(null);

      out.forEach((m, i) => {
        setTimeout(() => updateDelivery(activeRoom.id, m.id, 'sent'), 350 + i * 130);
        setTimeout(() => updateDelivery(activeRoom.id, m.id, 'read'), 760 + i * 180);
      });

      const others = activeRoom.members.filter((m) => m !== currentUserId);
      const replier = getFriend(others[Math.floor(Math.random() * others.length)] ?? '');
      if (replier) {
        setTimeout(() => {
          const r: Message = {
            id: uid(),
            roomId: activeRoom.id,
            senderId: replier.id,
            senderName: replier.name,
            mine: false,
            kind: 'text',
            text: randomReply(isKo),
            at: Date.now(),
          };
          setRoomMsgs(activeRoom.id, (p) => [...p, r]);
          touchRoom(activeRoom.id, r.text || '', true);
        }, 1200);
      }
    } finally {
      sendLockRef.current = false;
      setIsSendingMessage(false);
    }
  };

  const applyPickedMediaAsset = async (
    asset: { uri?: string; type?: string | null; mimeType?: string | null },
    kind: 'image' | 'video'
  ) => {
    if (!asset.uri) return;
    if (asset.type === 'video' || kind === 'video') {
      setDraftMedia({
        kind: 'video',
        uri: asset.uri,
        mimeType: inferMediaMimeType(asset.uri, 'video', asset.mimeType),
      });
      return;
    }
    setDraftMedia({
      kind: 'image',
      uri: asset.uri,
      mimeType: inferMediaMimeType(asset.uri, 'image', asset.mimeType),
    });
  };

  const openMediaExternally = async (uri: string) => {
    if (!uri) return;
    try {
      const supported = await Linking.canOpenURL(uri);
      if (!supported) {
        Alert.alert(s.linkUnavailableTitle, s.linkUnavailableBody);
        return;
      }
      await Linking.openURL(uri);
    } catch {
      Alert.alert(s.linkFailedTitle, s.linkFailedBody);
    }
  };

  const mediaSaveLabels = {
    action: isKo ? '\uAE30\uAE30\uC5D0 \uC800\uC7A5' : 'Save to device',
    permissionTitle: isKo ? '\uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694' : 'Permission required',
    permissionBody: isKo
      ? '\uC0AC\uC9C4\uACFC \uB3D9\uC601\uC0C1\uC744 \uC800\uC7A5\uD558\uB824\uBA74 \uBBF8\uB514\uC5B4 \uC811\uADFC \uAD8C\uD55C\uC744 \uD5C8\uC6A9\uD574 \uC8FC\uC138\uC694.'
      : 'Allow photo library access to save images and videos.',
    done: isKo ? '\uAE30\uAE30\uC5D0 \uC800\uC7A5\uD588\uC5B4\uC694.' : 'Saved to device.',
    failed: isKo ? '\uBBF8\uB514\uC5B4\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.' : 'Could not save media.',
  };

  const guessMediaExtension = (uri: string, kind: 'image' | 'video') => {
    const normalized = uri.split('?')[0].toLowerCase();
    const match = normalized.match(/\.([a-z0-9]{2,5})$/i);
    if (match?.[1]) return match[1];
    return kind === 'image' ? 'jpg' : 'mp4';
  };

  const saveMediaToDevice = async (media: MediaViewer) => {
    if (isSavingMedia || !media.uri) return;

    const existingPermission = await MediaLibrary.getPermissionsAsync().catch(() => null);
    let status = existingPermission?.status ?? 'undetermined';
    if (status !== 'granted') {
      const requested = await MediaLibrary.requestPermissionsAsync().catch(() => null);
      status = requested?.status ?? 'denied';
    }
    if (status !== 'granted') {
      Alert.alert(mediaSaveLabels.permissionTitle, mediaSaveLabels.permissionBody);
      return;
    }

    setIsSavingMedia(true);
    let downloadedUri = '';
    try {
      let localUri = media.uri;
      if (!/^file:\/\//i.test(localUri)) {
        const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!baseDir) {
          throw new Error('Missing writable directory.');
        }
        const ext = guessMediaExtension(localUri, media.kind);
        const targetUri = `${baseDir}ourhangout-${Date.now()}.${ext}`;
        const result = await FileSystem.downloadAsync(localUri, targetUri);
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`Download failed (${result.status}).`);
        }
        downloadedUri = result.uri;
        localUri = result.uri;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert(mediaSaveLabels.done);
    } catch {
      Alert.alert(mediaSaveLabels.failed);
    } finally {
      if (downloadedUri) {
        await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(() => null);
      }
      setIsSavingMedia(false);
    }
  };

  const captureMedia = async (kind: 'image' | 'video') => {
    if (!activeRoomId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        isKo ? '카메라 권한이 필요해요' : 'Camera permission required',
        isKo ? '사진이나 동영상을 찍어 보내려면 카메라 권한을 허용해 주세요.' : 'Allow camera access to capture media for chat.'
      );
      return;
    }
    try {
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: [kind === 'image' ? 'images' : 'videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 120,
      });
      if (r.canceled || !r.assets.length) return;
      await applyPickedMediaAsset(r.assets[0], kind);
    } catch {
      Alert.alert(s.mediaPickFailed);
    }
  };

  const openCaptureMenu = () => {
    Alert.alert(
      isKo ? '카메라로 보내기' : 'Capture Media',
      isKo ? '사진 또는 동영상을 촬영해서 보낼 수 있어요.' : 'Capture a photo or video to send.',
      [
        { text: isKo ? '사진 찍기' : 'Take Photo', onPress: () => void captureMedia('image') },
        { text: isKo ? '동영상 찍기' : 'Record Video', onPress: () => void captureMedia('video') },
        { text: s.cancel, style: 'cancel' },
      ]
    );
  };

  const pickMedia = async (kind: 'image' | 'video') => {
    if (!activeRoomId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(s.mediaPermissionTitle, s.mediaPermissionBody);
      return;
    }
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [kind === 'image' ? 'images' : 'videos'],
        allowsEditing: false,
        legacy: Platform.OS === 'android',
        quality: 1,
        videoMaxDuration: 120,
      });
      if (r.canceled || !r.assets.length) return;
      await applyPickedMediaAsset(r.assets[0], kind);
    } catch {
      Alert.alert(s.mediaPickFailed);
    }
  };

  const openImageCrop = async (uri: string, target: CropTarget) => {
    const sourceUri = await normalizeImageForCrop(uri);
    setCropTarget(target);
    if (target === 'profile') setProfilePhotoDraft(sourceUri);
    Image.getSize(
      sourceUri,
      (imageWidth, imageHeight) => {
        const minScale = Math.max(PROFILE_CROP_BOX / imageWidth, PROFILE_CROP_BOX / imageHeight);
        const maxScale = minScale * 4;
        const { renderWidth, renderHeight, overflowX, overflowY } = cropGeometry(
          imageWidth,
          imageHeight,
          minScale
        );
        cropOpenedAtRef.current = Date.now();
        cropGestureModeRef.current = 'none';
        const initialCrop: ProfilePhotoCrop = {
          uri: sourceUri,
          imageWidth,
          imageHeight,
          minScale,
          maxScale,
          scale: minScale,
          renderWidth,
          renderHeight,
          overflowX,
          overflowY,
          offsetX: -overflowX / 2,
          offsetY: -overflowY / 2,
        };
        cropViewportLayoutRef.current = { width: PROFILE_CROP_BOX, height: PROFILE_CROP_BOX };
        profileCropRef.current = initialCrop;
        setProfileCrop(initialCrop);
      },
      () => {}
    );
  };

  const zoomProfileCrop = (zoomIn: boolean) => {
    setProfileCropSynced((prev) => {
      if (!prev) return prev;
      const nextScale = clamp(
        prev.scale * (zoomIn ? 1.2 : 1 / 1.2),
        prev.minScale,
        prev.maxScale
      );
      if (Math.abs(nextScale - prev.scale) < 0.0001) return prev;

      const centerX = (-prev.offsetX + PROFILE_CROP_BOX / 2) / prev.scale;
      const centerY = (-prev.offsetY + PROFILE_CROP_BOX / 2) / prev.scale;
      const { renderWidth, renderHeight, overflowX, overflowY } = cropGeometry(
        prev.imageWidth,
        prev.imageHeight,
        nextScale
      );
      const offsetX = clamp(PROFILE_CROP_BOX / 2 - centerX * nextScale, -overflowX, 0);
      const offsetY = clamp(PROFILE_CROP_BOX / 2 - centerY * nextScale, -overflowY, 0);

      return {
        ...prev,
        scale: nextScale,
        renderWidth,
        renderHeight,
        overflowX,
        overflowY,
        offsetX,
        offsetY,
      };
    });
  };

  const centerProfileCrop = () => {
    setProfileCropSynced((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        offsetX: -prev.overflowX / 2,
        offsetY: -prev.overflowY / 2,
      };
    });
  };

  const pickProfilePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(s.mediaPermissionTitle, s.mediaPermissionBody);
      return;
    }
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        legacy: Platform.OS === 'android',
        quality: 1,
      });
      if (r.canceled || !r.assets.length || !r.assets[0].uri) return;
      await openImageCrop(r.assets[0].uri, 'profile');
    } catch {
      Alert.alert(s.mediaPickFailed);
    }
  };

  const startGoogle = async () => {
    setLoginErr('');
    if (!hasGoogle) {
      setLoginErr(s.loginHintMissing);
      return;
    }
    if (isSessionRestoring) {
      return;
    }
    if (backendState !== 'ready') {
      setLoginErr(backendStateMsg || s.loginServerError);
      return;
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResponse = await GoogleSignin.signIn();
      if (!isSuccessResponse(signInResponse)) {
        setLoginErr(s.loginCanceled);
        return;
      }
      const tokens = await GoogleSignin.getTokens().catch(() => ({ idToken: '', accessToken: '' }));
      const idToken = (signInResponse.data.idToken || tokens.idToken || '').trim();
      const accessToken = (tokens.accessToken || '').trim();
      if (!idToken) {
        setLoginErr(s.loginFailed);
        return;
      }

      const authData = await postGoogleAuth(idToken, accessToken);
      const nextAccessToken = (authData.accessToken || authData.tokens?.accessToken || '').trim();
      const nextRefreshToken = (authData.refreshToken || authData.tokens?.refreshToken || '').trim();
      if (!nextAccessToken) throw new Error('missing access token');
      await writeSessionToStorage({
        accessToken: nextAccessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {})
      });
      setSessionTokens(nextAccessToken, nextRefreshToken);
      try {
        await syncInitialFromBackend(nextAccessToken, authData.user);
      } catch (syncError) {
        const msg = errorMessage(syncError);
        if (isSessionInvalidError(syncError)) {
          setSessionTokens('', '');
          await clearSessionInStorage();
          setLoginErr(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
          return;
        }
        logSessionTrace('login:initial_sync_partial', {
          message: msg || s.loginBackendSyncFailed,
        });
      }
      setStage('app');
    } catch (err) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) {
          setLoginErr(s.loginCanceled);
          return;
        }
        if (err.code === statusCodes.IN_PROGRESS) {
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          const msg = isKo
            ? '이 기기에서는 Google Play 서비스를 사용할 수 없어 로그인할 수 없어요.'
            : 'Google Play services are not available on this device.';
          setLoginErr(msg);
          return;
        }
      }
      const msg = err instanceof Error ? err.message : '';
      setLoginErr(msg ? `${s.loginFailed} (${msg})` : s.loginFailed);
    }
  };

  const persistProfile = async (nextProfile: { name: string; status: string; avatarUri: string }) => {
    const token = accessToken.trim();
    if (!token) {
      setProfile((p) => ({ ...p, ...nextProfile }));
      return true;
    }
    const saved = await backendRequest<BackendProfile>(
      '/v1/me',
      {
        method: 'PATCH',
        body: JSON.stringify(nextProfile),
      },
      token
    );
    setProfile((p) => ({
      ...p,
      name: String(saved.name || nextProfile.name),
      status: String(saved.status || nextProfile.status),
      email: String(saved.email || p.email),
      avatarUri: resolveBackendMediaUrl(String(saved.avatarUri || nextProfile.avatarUri)),
    }));
    setNameDraft(String(saved.name || nextProfile.name));
    setStatusDraft(String(saved.status || nextProfile.status));
    setProfilePhotoDraft(resolveBackendMediaUrl(String(saved.avatarUri || nextProfile.avatarUri)));
    return true;
  };

  const saveProfile = async () => {
    const n = nameDraft.trim();
    if (!n) return;
    try {
      const token = accessToken.trim();
      const draftAvatarUri = profilePhotoDraft.trim();
      const nextAvatarUri =
        token && draftAvatarUri && isLocalAssetUri(draftAvatarUri)
          ? await uploadProfilePhotoToBackend(token, draftAvatarUri)
          : resolveBackendMediaUrl(draftAvatarUri);
      const nextProfile = {
        name: n,
        status: statusDraft.trim(),
        avatarUri: nextAvatarUri,
      };
      await persistProfile(nextProfile);
      setShowProfileModal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    }
  };

  const openExternalUrl = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(s.linkUnavailableTitle, s.linkUnavailableBody);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(s.linkFailedTitle, s.linkFailedBody);
    }
  };

  const renderMessageText = (value: string, mine: boolean) => {
    const parts = splitLinkParts(value);
    return (
      <Text style={[styles.msg, mine && styles.msgMine]}>
        {parts.map((part, idx) =>
          part.url ? (
            <Text
              key={`${part.url}-${idx}`}
              style={[styles.msgLink, mine && styles.msgLinkMine]}
              onPress={() => openExternalUrl(part.url!)}
            >
              {part.text}
            </Text>
          ) : (
            <Text key={`plain-${idx}`}>{part.text}</Text>
          )
        )}
      </Text>
    );
  };

  const renderSystemText = (value: string) => {
    if (value.startsWith('__sys__:member_left:')) {
      const encodedName = value.slice('__sys__:member_left:'.length);
      const displayName = decodeURIComponent(encodedName || '').trim();
      return displayName
        ? isKo
          ? `${displayName}님이 방을 나갔어요.`
          : `${displayName} left the room.`
        : isKo
        ? '누군가 방을 나갔어요.'
        : 'Someone left the room.';
    }
    return value;
  };

  const applyProfilePhotoCrop = async () => {
    const crop = profileCropRef.current;
    if (!crop || isApplyingPhoto) return;
    setIsApplyingPhoto(true);
    try {
      const viewport = cropViewportLayoutRef.current;
      const viewportW = Math.max(1, Math.round(viewport.width));
      const viewportH = Math.max(1, Math.round(viewport.height));
      const viewportSide = Math.max(1, Math.min(viewportW, viewportH));
      const cropSide = Math.max(
        1,
        Math.min(
          Math.round(viewportSide / crop.scale),
          Math.round(crop.imageWidth),
          Math.round(crop.imageHeight)
        )
      );
      const maxOriginX = Math.max(0, Math.round(crop.imageWidth) - cropSide);
      const maxOriginY = Math.max(0, Math.round(crop.imageHeight) - cropSide);
      const originX = clamp(Math.round(-crop.offsetX / crop.scale), 0, maxOriginX);
      const originY = clamp(Math.round(-crop.offsetY / crop.scale), 0, maxOriginY);
      const profileOutputSize = Math.max(1, Math.min(PROFILE_PHOTO_MAX_OUTPUT, cropSide));
      const actions: ImageManipulator.Action[] = [
        { crop: { originX, originY, width: cropSide, height: cropSide } },
      ];
      if (cropTarget !== 'chat' && cropSide > profileOutputSize) {
        actions.push({ resize: { width: profileOutputSize, height: profileOutputSize } });
      }
      const out = await ImageManipulator.manipulateAsync(
        crop.uri,
        actions,
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      if (cropTarget === 'chat') {
        setDraftMedia({ kind: 'image', uri: out.uri, mimeType: 'image/jpeg' });
      } else {
        setProfilePhotoDraft(out.uri);
      }
      closeCropModal();
    } finally {
      setIsApplyingPhoto(false);
    }
  };

  const cropPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!profileCropRef.current,
        onStartShouldSetPanResponderCapture: () => !!profileCropRef.current,
        onMoveShouldSetPanResponder: () => !!profileCropRef.current,
        onMoveShouldSetPanResponderCapture: () => !!profileCropRef.current,
        onPanResponderGrant: (evt, gesture) => {
          const current = profileCropRef.current;
          if (!current) return;
          const touches = normalizeTouches(evt.nativeEvent.touches);
          if (touches.length >= 2) {
            beginPinch(current, touches);
            return;
          }
          const changed = normalizeTouches(evt.nativeEvent.changedTouches);
          const lead = touches[0] ?? changed[0];
          cropGestureModeRef.current = 'pan';
          cropPanPointerRef.current = {
            x: lead ? lead.pageX : finiteOr(gesture.moveX, cropPanPointerRef.current.x),
            y: lead ? lead.pageY : finiteOr(gesture.moveY, cropPanPointerRef.current.y),
          };
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (evt, gesture) => {
          const current = profileCropRef.current;
          if (!current) return;

          const touches = normalizeTouches(evt.nativeEvent.touches);
          if (gesture.numberActiveTouches >= 2 && touches.length >= 2) {
            if (cropGestureModeRef.current !== 'pinch') {
              beginPinch(current, touches);
              return;
            }

            const start = cropPinchStartRef.current;
            if (start.distance <= 0) return;
            const distance = touchDistance(touches);
            if (distance <= 0) return;
            const center = touchCenter(touches);
            const nextScale = clamp(
              start.scale * (distance / start.distance),
              current.minScale,
              current.maxScale
            );
            const { renderWidth, renderHeight, overflowX, overflowY } = cropGeometry(
              current.imageWidth,
              current.imageHeight,
              nextScale
            );
            const centerShiftX = center.x - start.centerPageX;
            const centerShiftY = center.y - start.centerPageY;
            const offsetX = clamp(
              PROFILE_CROP_BOX / 2 - start.centerImageX * nextScale + centerShiftX,
              -overflowX,
              0
            );
            const offsetY = clamp(
              PROFILE_CROP_BOX / 2 - start.centerImageY * nextScale + centerShiftY,
              -overflowY,
              0
            );

            setProfileCropSynced((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                scale: nextScale,
                renderWidth,
                renderHeight,
                overflowX,
                overflowY,
                offsetX,
                offsetY,
              };
            });
            return;
          }

          const changed = normalizeTouches(evt.nativeEvent.changedTouches);
          const lead = touches[0] ?? changed[0];
          if (!lead) return;
          if (cropGestureModeRef.current !== 'pan') {
            cropGestureModeRef.current = 'pan';
            cropPanPointerRef.current = {
              x: lead.pageX,
              y: lead.pageY,
            };
            return;
          }

          const moveX = lead.pageX;
          const moveY = lead.pageY;
          const dX = moveX - cropPanPointerRef.current.x;
          const dY = moveY - cropPanPointerRef.current.y;
          cropPanPointerRef.current = { x: moveX, y: moveY };
          if (Math.abs(dX) < 0.01 && Math.abs(dY) < 0.01) return;

          setProfileCropSynced((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              offsetX: clamp(prev.offsetX + dX, -prev.overflowX, 0),
              offsetY: clamp(prev.offsetY + dY, -prev.overflowY, 0),
            };
          });
        },
        onPanResponderRelease: () => {
          cropGestureModeRef.current = 'none';
        },
        onPanResponderTerminate: () => {
          cropGestureModeRef.current = 'none';
        },
      }),
    []
  );

  const renderProfilePhotoEditor = () => (
    <>
      <Text style={styles.sub}>{s.profilePhoto}</Text>
      <View style={styles.profilePhotoRow}>
        {profilePhotoDraft ? (
          <Image source={{ uri: profilePhotoDraft }} style={styles.profilePhotoPreview} />
        ) : (
          <View style={styles.profilePhotoPreviewFallback}>
            <Ionicons name="person" size={24} color={FOREST.text} />
          </View>
        )}
        <View style={styles.profilePhotoActions}>
          <Pressable style={styles.smallBtn} onPress={pickProfilePhoto}>
            <Text style={styles.smallBtnText}>{s.photoPick}</Text>
          </Pressable>
          {profilePhotoDraft ? (
            <Pressable style={styles.smallBtn} onPress={() => setProfilePhotoDraft('')}>
              <Text style={styles.smallBtnText}>{s.photoRemove}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.sub}>{s.photoCropHint}</Text>
        </View>
      </View>
    </>
  );

  const renderCropModal = () => (
    <Modal
      visible={!!profileCrop}
      transparent
      animationType="fade"
      statusBarTranslucent
    navigationBarTranslucent
    onRequestClose={closeCropModal}
  >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (isApplyingPhoto) return;
            if (Date.now() - cropOpenedAtRef.current < 400) return;
            closeCropModal();
          }}
        />
        <View style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}>
          <View style={styles.sheet}>
            <Text style={styles.h1}>{s.photoCropTitle}</Text>
            <Text style={styles.sub}>{s.photoCropGuide}</Text>
            {profileCrop ? (
              <View
                style={styles.cropViewport}
                {...cropPanResponder.panHandlers}
                onLayout={(evt) => {
                  const layout = readLayoutSize(evt);
                  cropViewportLayoutRef.current = { width: layout.width, height: layout.height };
                }}
              >
                <Image
                  source={{ uri: profileCrop.uri }}
                  style={[
                    styles.cropImage,
                    {
                      width: profileCrop.renderWidth,
                      height: profileCrop.renderHeight,
                      left: profileCrop.offsetX,
                      top: profileCrop.offsetY,
                    },
                  ]}
                />
                <View pointerEvents="none" style={styles.cropFrame} />
                <View pointerEvents="none" style={[styles.cropCorner, styles.cropCornerTL]} />
                <View pointerEvents="none" style={[styles.cropCorner, styles.cropCornerTR]} />
                <View pointerEvents="none" style={[styles.cropCorner, styles.cropCornerBL]} />
                <View pointerEvents="none" style={[styles.cropCorner, styles.cropCornerBR]} />
                <View pointerEvents="none" style={styles.cropCenterIcon}>
                  <Ionicons name="scan-outline" size={22} color="rgba(243,248,234,0.82)" />
                </View>
              </View>
            ) : null}
            {profileCrop ? (
              <Text style={styles.zoomText}>
                {s.photoZoomLabel} {Math.round((profileCrop.scale / profileCrop.minScale) * 100)}%
              </Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={[
                  styles.smallBtn,
                  (!profileCrop || profileCrop.scale <= profileCrop.minScale + 0.0001 || isApplyingPhoto) &&
                    styles.off,
                ]}
                disabled={!profileCrop || profileCrop.scale <= profileCrop.minScale + 0.0001 || isApplyingPhoto}
                onPress={() => zoomProfileCrop(false)}
              >
                <Text style={styles.smallBtnText}>{s.photoZoomOut}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.smallBtn,
                  (!profileCrop || profileCrop.scale >= profileCrop.maxScale - 0.0001 || isApplyingPhoto) &&
                    styles.off,
                ]}
                disabled={!profileCrop || profileCrop.scale >= profileCrop.maxScale - 0.0001 || isApplyingPhoto}
                onPress={() => zoomProfileCrop(true)}
              >
                <Text style={styles.smallBtnText}>{s.photoZoomIn}</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, isApplyingPhoto && styles.off]}
                disabled={isApplyingPhoto}
                onPress={centerProfileCrop}
              >
                <Text style={styles.smallBtnText}>{s.photoCenter}</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable
                style={[styles.smallBtn, isApplyingPhoto && styles.off]}
                disabled={isApplyingPhoto}
                onPress={() => {
                  closeCropModal();
                }}
              >
                <Text style={styles.smallBtnText}>{s.cancel}</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, isApplyingPhoto && styles.off]}
                disabled={isApplyingPhoto}
                onPress={applyProfilePhotoCrop}
              >
                <Text style={styles.smallBtnText}>{s.photoApply}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  const updateRoomPrefs = async (rid: string, patch: { favorite?: boolean; muted?: boolean; title?: string }) => {
    const token = accessToken.trim();
    const room = rooms.find((item) => item.id === rid);
    if (!room) return;
    const nextFavorite = patch.favorite ?? room.favorite;
    const nextMuted = patch.muted ?? room.muted;
    const nextTitle = patch.title?.trim() || room.title;
    if (!token) {
      setRooms((p) =>
        p.map((r) => (r.id === rid ? { ...r, favorite: nextFavorite, muted: nextMuted, title: nextTitle } : r))
      );
      return;
    }
    try {
      const updated = await backendRequest<{ favorite?: boolean; muted?: boolean; title?: string }>(
        `/v1/rooms/${rid}/settings`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
        token
      );
      setRooms((p) =>
        p.map((r) =>
          r.id === rid
            ? {
                ...r,
                favorite: updated.favorite ?? nextFavorite,
                muted: updated.muted ?? nextMuted,
                title: updated.title ?? nextTitle,
              }
            : r
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    }
  };

  const toggleFavorite = (rid: string) => {
    const room = rooms.find((item) => item.id === rid);
    if (!room) return;
    void updateRoomPrefs(rid, { favorite: !room.favorite });
  };

  const toggleMute = (rid: string) => {
    const room = rooms.find((item) => item.id === rid);
    if (!room) return;
    void updateRoomPrefs(rid, { muted: !room.muted });
  };
  const openRoomTitleEditor = (rid: string) => {
    const room = rooms.find((item) => item.id === rid);
    if (!room || room.type === 'direct') return;
    setRoomTitleDraft(room.title);
    setShowRoomTitleModal(true);
    setRoomMenuId(null);
  };
  const saveRoomTitle = async () => {
    const rid = roomMenuId || activeRoom?.id || '';
    if (!rid) return;
    const nextTitle = roomTitleDraft.trim();
    if (!nextTitle) return;
    await updateRoomPrefs(rid, { title: nextTitle });
    setShowRoomTitleModal(false);
  };
  const toggleTrusted = async (fid: string) => {
    const token = requireAccessToken();
    if (!token) return;
    const friend = friends.find((item) => item.id === fid);
    if (!friend) return;
    const nextTrusted = !friend.trusted;
    const actionKey = `trusted:${fid}`;
    setFriendActionKey(actionKey);
    try {
      await backendRequest(
        `/v1/friends/${fid}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ trusted: nextTrusted }),
        },
        token
      );
      setFriends((p) => p.map((f) => (f.id === fid ? { ...f, trusted: nextTrusted } : f)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
    } finally {
      setFriendActionKey('');
    }
  };
  const toggleGroupPick = (fid: string) =>
    setGroupPick((p) => (p.includes(fid) ? p.filter((x) => x !== fid) : [...p, fid]));

  const deleteRoom = async (rid: string) => {
    const token = accessToken.trim();
    if (token) {
      try {
        await backendRequest(`/v1/rooms/${rid}`, { method: 'DELETE' }, token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
        return;
      }
    }
    setRooms((p) => p.filter((r) => r.id !== rid));
    setMessages((p) => {
      const next = { ...p };
      delete next[rid];
      return next;
    });
    if (activeRoomRef.current === rid) setActiveRoomId(null);
    setRoomMenuId(null);
  };

  const leaveRoom = async (rid: string) => {
    const token = accessToken.trim();
    if (token) {
      try {
        await backendRequest(`/v1/rooms/${rid}/leave`, { method: 'POST' }, token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
        return;
      }
    }
    setRooms((p) => p.filter((r) => r.id !== rid));
    setMessages((p) => {
      const next = { ...p };
      delete next[rid];
      return next;
    });
    if (activeRoomRef.current === rid) setActiveRoomId(null);
    setRoomMenuId(null);
  };

  const reportRoom = (rid: string) => {
    appendSystem(rid, s.reported);
    setRoomMenuId(null);
  };

  const resetForLogout = () => {
    setSessionTokens('', '');
    if (friendTabRefreshTimerRef.current) {
      clearTimeout(friendTabRefreshTimerRef.current);
      friendTabRefreshTimerRef.current = null;
    }
    friendTabRefreshInFlightRef.current = null;
    roomReadCutoffRef.current = {};
    pushTokenRef.current = '';
    registeredPushTokenRef.current = '';
    currentUserIdRef.current = MY_ID;
    setCurrentUserId(MY_ID);
    setStage('login');
    setTab('chats');
    setActiveRoomId(null);
    setProfile({ name: '', status: '', email: '', avatarUri: '', localeTag: appLocaleTag });
    setNameDraft('');
    setStatusDraft('');
    setProfilePhotoDraft('');
    setFriends([]);
    setBots([]);
    setRooms([]);
    setMessages({});
    setChatQuery('');
    setFriendQuery('');
    setFriendLookupQuery('');
    setFriendLookupResults([]);
    setFriendLookupMsg('');
    setIsFriendLookupLoading(false);
    setFriendRequestsIncoming([]);
    setFriendRequestsOutgoing([]);
    setFamilyRequestsIncoming([]);
    setFamilyRequestsOutgoing([]);
    setFriendActionKey('');
    setFamilyActionKey('');
    setIsFriendSyncing(false);
    setInput('');
    setDraftMedia(null);
    setAvatarViewer(null);
    setShowProfileModal(false);
    setShowFriendModal(false);
    setShowFamilyPickerModal(false);
    setShowFamilyUpgradeModal(false);
    setShowFriendAliasModal(false);
    setShowFriendActionsModal(false);
    setShowGroupModal(false);
    setFriendAliasTargetId('');
    setFriendAliasDraft('');
    setFriendActionsTargetId('');
    setFamilyUpgradeTargetId('');
    setRoomMenuId(null);
    setLoginErr('');
  };

  const switchBackendServer = async (nextUrl: string) => {
    const normalized = normalizeBackendBaseUrl(nextUrl);
    if (!normalized) {
      Alert.alert(isKo ? '서버 주소를 입력해 주세요.' : 'Enter a server URL.');
      return;
    }

    if (normalized === backendBaseUrl) {
      setShowServerMenu(false);
      setServerMenuDraft(normalized);
      return;
    }

    const nextOverride = normalized === defaultBackendBaseUrl ? '' : normalized;
    try {
      await writeBackendOverrideToStorage(nextOverride);
      await clearSessionInStorage();
    } finally {
      if (hiddenServerTapTimerRef.current) {
        clearTimeout(hiddenServerTapTimerRef.current);
        hiddenServerTapTimerRef.current = null;
      }
      hiddenServerTapCountRef.current = 0;
      sessionRestoreStartedRef.current = false;
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setBackendOverrideUrl(nextOverride);
      setBackendState('checking');
      setBackendStateMsg('');
      setShowServerMenu(false);
      setServerMenuDraft(normalized);
      setIsSessionRestoring(true);
      resetForLogout();
    }
  };

  const requestLogout = () => {
    Alert.alert(s.logoutTitle, s.logoutBody, [
      { text: s.cancel, style: 'cancel' },
      {
        text: s.logout,
        style: 'destructive',
        onPress: () => {
          const run = async () => {
            try {
              if (accessToken.trim() && pushTokenRef.current) {
                await backendRequest(
                  '/v1/push-tokens',
                  {
                    method: 'DELETE',
                    body: JSON.stringify({ pushToken: pushTokenRef.current }),
                  },
                  accessToken.trim()
                ).catch(() => null);
              }
              await GoogleSignin.signOut().catch(() => null);
              await clearSessionInStorage();
            } finally {
              setIsSessionRestoring(false);
              resetForLogout();
            }
          };
          void run();
        },
      },
    ]);
  };

  const kbBehavior = Platform.OS === 'ios' ? 'padding' : 'height';
  const sheetBottomInset = Math.max(insets.bottom, 12);
  const ForestBackdrop = () => (
    <>
      <View pointerEvents="none" style={styles.bgOrbTop} />
      <View pointerEvents="none" style={styles.bgOrbMid} />
      <View pointerEvents="none" style={styles.bgOrbBottom} />
      {FOREST_GLOWS.map((glow, index) => (
        <View
          key={`glow-${index}`}
          pointerEvents="none"
          style={[
            styles.firefly,
            {
              top: glow.top,
              bottom: glow.bottom,
              left: glow.left,
              right: glow.right,
              width: glow.size,
              height: glow.size,
              borderRadius: glow.size / 2,
              backgroundColor: glow.color,
            },
          ]}
        />
      ))}
    </>
  );

  if (stage === 'login') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={[FOREST.gradientTop, FOREST.gradientMid, FOREST.gradientBottom]} style={styles.fill}>
          <ForestBackdrop />
          <View style={styles.centerCard}>
            <Pressable onPress={registerHiddenServerMenuTap}>
              <Text style={styles.brand}>{s.app}</Text>
            </Pressable>
            <Text style={styles.h1}>{s.login}</Text>
            <Text style={styles.sub}>{s.loginBody}</Text>
            <Pressable
              style={[styles.btn, (backendState !== 'ready' || !hasGoogle || isSessionRestoring) && styles.off]}
              onPress={startGoogle}
              disabled={backendState !== 'ready' || !hasGoogle || isSessionRestoring}
            >
              <Text style={styles.btnText}>{s.google}</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => setStage('setup_name')}>
              <Text style={styles.link}>{s.loginSkip}</Text>
            </Pressable>
            <Text style={styles.sub}>
              {isSessionRestoring
                ? s.loginSessionRestoring
                : backendState === 'checking'
                ? s.loginServerChecking
                : backendState === 'ready'
                  ? s.loginServerReady
                  : backendStateMsg || s.loginServerError}
            </Text>
            <Text style={styles.sub}>
              {loginErr || (hasGoogle ? s.loginHintReady : s.loginHintMissing)}
            </Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (stage === 'setup_name' || stage === 'setup_intro') {
    const isName = stage === 'setup_name';
    const setupBlocked = !nameDraft.trim();
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={[FOREST.gradientTop, FOREST.gradientMid, FOREST.gradientBottom]} style={styles.fill}>
          <ForestBackdrop />
          <KeyboardAvoidingView style={styles.fill} behavior={kbBehavior}>
            <View style={styles.centerCard}>
              <Text style={styles.h1}>{isName ? s.setup1 : s.setup2}</Text>
              {isName ? (
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={s.displayName}
                  style={styles.field}
                  placeholderTextColor={FOREST.placeholder}
                />
              ) : null}
              {!isName ? (
                <>
                  <TextInput
                    style={styles.field}
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder={s.displayName}
                    placeholderTextColor={FOREST.placeholder}
                  />
                  {renderProfilePhotoEditor()}
                  <TextInput
                    style={styles.field}
                    value={statusDraft}
                    onChangeText={setStatusDraft}
                    placeholder={s.myStatus}
                    placeholderTextColor={FOREST.placeholder}
                  />
                </>
              ) : null}

              <Pressable
                style={[styles.btn, setupBlocked && styles.off]}
                onPress={() => {
                  if (isName) {
                    setProfile((p) => ({ ...p, name: nameDraft.trim() }));
                    setStatusDraft((prev) => prev || profile.status || '');
                    setProfilePhotoDraft((prev) => prev || profile.avatarUri || '');
                    setStage('setup_intro');
                    return;
                  }
                  const nextProfile = {
                    name: nameDraft.trim() || profile.name,
                    status: statusDraft.trim(),
                    avatarUri: profilePhotoDraft.trim(),
                  };
                  const run = async () => {
                    try {
                      await persistProfile(nextProfile);
                      setStage('app');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : '';
                      Alert.alert(normalizeBackendErrorMessage(msg || s.loginBackendSyncFailed, isKo));
                    }
                  };
                  void run();
                }}
                disabled={setupBlocked}
              >
                <Text style={styles.btnText}>{isName ? s.next : s.start}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
          {renderCropModal()}
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <LinearGradient colors={[FOREST.gradientTop, FOREST.gradientMid, FOREST.gradientBottom]} style={styles.fill}>
        <ForestBackdrop />
        <KeyboardAvoidingView
          style={[styles.fill, { paddingBottom: Math.max(8, insets.bottom) }]}
          behavior={kbBehavior}
        >
          {activeRoom ? (
            <>
              <View style={[styles.header, styles.headerRetreat]}>
                <Pressable style={styles.iconDark} onPress={() => void closeActiveRoom()}>
                  <Ionicons name="chevron-back" size={18} color={FOREST.text} />
                </Pressable>
                {roomAvatarUri(activeRoom) ? (
                  <Pressable onPress={() => openAvatarViewer(roomAvatarUri(activeRoom), roomTitle(activeRoom))}>
                    <Image source={{ uri: roomAvatarUri(activeRoom) }} style={styles.headerAvatar} />
                  </Pressable>
                ) : (
                  <View style={[styles.headerAvatar, styles.headerAvatarFallbackSmall]}>
                    <Text style={styles.headerAvatarSmallText}>{roomTitle(activeRoom).slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>{roomTitle(activeRoom)}</Text>
                  {activeRoom.isGroup ? (
                    <Text style={styles.headerMeta}>
                      {activeRoom.type === 'family'
                        ? isKo
                          ? `${activeRoomCompanions}명과 함께하는 가족방`
                          : `Family room with ${activeRoomCompanions} others`
                        : `${activeRoomCompanions} ${isKo ? '명과 함께' : 'companions nearby'}`}
                    </Text>
                  ) : null}
                </View>
                <Pressable style={styles.iconDark} onPress={() => setRoomMenuId(activeRoom.id)}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={FOREST.text} />
                </Pressable>
              </View>

              <View style={styles.main}>
                <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
                  {activeMsgs.length === 0 ? (
                    <View style={[styles.empty, styles.emptyCove]}>
                      <Text style={styles.h1}>{s.noMsg}</Text>
                      <Text style={styles.sub}>{s.denQuietNote}</Text>
                      <Pressable style={styles.btn} onPress={() => setInput(s.hello)}>
                        <Text style={styles.btnText}>{s.firstMsg}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    activeMsgs.map((m, index) => {
                      const showDayChip = index === 0 || dayKey(activeMsgs[index - 1].at) !== dayKey(m.at);
                      const isMine = m.mine || (!!m.senderId && m.senderId === currentUserId);
                      const avatarUri = isMine ? '' : messageAvatarUri(m);
                      return (
                        <Fragment key={m.id}>
                          {showDayChip ? (
                            <View style={styles.roomDayChip}>
                              <Text style={styles.roomDayChipText}>{messageDayLabel(m.at)}</Text>
                            </View>
                          ) : null}
                          <View
                            style={[
                              styles.bubbleRow,
                              isMine ? styles.mineRow : styles.otherRow,
                              !isMine && m.kind !== 'system' ? styles.otherRowWithAvatar : null,
                            ]}
                          >
                            {!isMine && m.kind !== 'system' ? (
                              <Pressable
                                style={styles.messageAvatarDock}
                                disabled={!avatarUri}
                                onPress={() => openAvatarViewer(avatarUri, m.senderName)}
                              >
                                {avatarUri ? (
                                  <Image source={{ uri: avatarUri }} style={styles.messageAvatar} />
                                ) : (
                                  <View style={styles.messageAvatarFallback}>
                                    <Text style={styles.messageAvatarText}>
                                      {(m.senderName || '?').slice(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </Pressable>
                            ) : null}
                            {!isMine && m.kind !== 'system' ? (
                              <Text style={styles.roomSender}>{m.senderName}</Text>
                            ) : null}
                        <View style={[styles.bubble, isMine ? styles.mineBubble : styles.otherBubble]}>
                          {m.kind === 'text' ? renderMessageText(m.text || '', isMine) : null}
                          {m.kind === 'image' && m.uri ? (
                            <Pressable onPress={() => setMediaViewer({ kind: 'image', uri: m.uri || '' })}>
                              <Image source={{ uri: m.uri }} style={styles.media} />
                            </Pressable>
                          ) : null}
                          {m.kind === 'video' && m.uri ? (
                            <Pressable onPress={() => setMediaViewer({ kind: 'video', uri: m.uri || '' })}>
                              <View style={[styles.media, styles.videoCard]}>
                                <Ionicons name="videocam-outline" size={28} color="#E7F4FF" />
                                <Text style={styles.videoCardText}>{isKo ? '동영상 크게 보기' : 'Open video viewer'}</Text>
                              </View>
                            </Pressable>
                          ) : null}
                          {m.kind === 'system' ? <Text style={styles.system}>{renderSystemText(m.text || '')}</Text> : null}
                          <View style={styles.metaRow}>
                            {isMine ? (
                              <View style={styles.receiptWrap}>
                                {m.delivery === 'read' ||
                                m.unreadCount === 0 ||
                                (!activeRoom.isGroup && (directReadCutoffs[activeRoom.id] ?? 0) >= m.at) ? (
                                  <Text style={styles.receiptCheck}>✓</Text>
                                ) : typeof m.unreadCount === 'number' && m.unreadCount > 0 ? (
                                  <Text style={styles.receiptBadge}>{m.unreadCount}</Text>
                                ) : null}
                              </View>
                            ) : null}
                            <Text style={[styles.meta, isMine && styles.metaMine]}>
                              {tLabel(m.at)}
                              {isMine && m.delivery
                                ? ` · ${m.delivery === 'sending' ? s.sending : m.delivery === 'sent' ? s.sent : s.read}`
                                : ''}
                            </Text>
                          </View>
                          {isMine && activeRoom.isGroup && m.readByNames?.length ? (
                            <Text style={styles.readersText} numberOfLines={1}>
                              {`${isKo ? '읽음' : 'Read'} ${m.readByNames.slice(0, 3).join(', ')}${
                                m.readByNames.length > 3 ? ` +${m.readByNames.length - 3}` : ''
                              }`}
                            </Text>
                          ) : null}
                            </View>
                          </View>
                        </Fragment>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              <View style={styles.composer}>
                {draftMedia ? (
                  <View style={[styles.draft, styles.draftNest]}>
                    <View style={styles.draftCopy}>
                      <Text style={styles.itemTitle}>
                        {draftMedia.kind === 'image' ? s.imageSelected : s.videoSelected}
                      </Text>
                      <Text style={styles.composerHint}>{s.mediaHint}</Text>
                    </View>
                    <Pressable style={styles.iconLight} onPress={() => setDraftMedia(null)}>
                      <Ionicons name="close" size={16} color={FOREST.text} />
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Pressable
                    style={[styles.attachBtn, isSendingMessage && styles.off]}
                    disabled={isSendingMessage}
                    onPress={openCaptureMenu}
                  >
                    <Ionicons name="camera-outline" size={18} color={FOREST.text} />
                  </Pressable>
                  <Pressable
                    style={[styles.attachBtn, isSendingMessage && styles.off]}
                    disabled={isSendingMessage}
                    onPress={() => {
                      void pickMedia('image');
                    }}
                  >
                    <Ionicons name="image-outline" size={18} color={FOREST.text} />
                  </Pressable>
                  <Pressable
                    style={[styles.attachBtn, isSendingMessage && styles.off]}
                    disabled={isSendingMessage}
                    onPress={() => {
                      void pickMedia('video');
                    }}
                  >
                    <Ionicons name="videocam-outline" size={18} color={FOREST.text} />
                  </Pressable>
                  <TextInput
                    style={styles.composerInput}
                    placeholder={s.msgInput}
                    placeholderTextColor={FOREST.placeholder}
                    value={input}
                    onChangeText={setInput}
                    multiline
                  />
                  <Pressable
                    style={[styles.send, (!input.trim() && !draftMedia) && styles.off, isSendingMessage && styles.off]}
                    disabled={(!input.trim() && !draftMedia) || isSendingMessage}
                    onPress={() => {
                      void send();
                    }}
                  >
                    <Ionicons name="arrow-up" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.topIdentity}>
                  {topAvatarUri ? (
                    <Image source={{ uri: topAvatarUri }} style={styles.headerAvatarLarge} />
                  ) : (
                    <View style={styles.headerAvatarFallback}>
                      <Text style={styles.headerAvatarFallbackText}>
                        {(profile.name || s.me).slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.topIdentityCopy}>
                    <Text style={styles.headerName}>{profile.name || s.me}</Text>
                    <Text style={styles.headerSection}>{currentSectionLabel}</Text>
                  </View>
                </View>
                {tab === 'friends' ? (
                  <Pressable style={styles.iconDark} onPress={openFriendModal}>
                    <Ionicons name="person-add" size={18} color={FOREST.text} />
                  </Pressable>
                ) : tab === 'chats' ? (
                  chatsMode === 'group' ? (
                    <Pressable style={styles.iconDark} onPress={() => openCreateRoomModal('group')}>
                      <Ionicons name="add" size={20} color={FOREST.text} />
                    </Pressable>
                  ) : (
                    <View style={styles.iconPlaceholder} />
                  )
                ) : (
                  <Pressable
                    style={styles.iconDark}
                    onPress={() => {
                      setNameDraft(profile.name);
                      setStatusDraft(profile.status);
                      setProfilePhotoDraft(profile.avatarUri);
                      setShowProfileModal(true);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={FOREST.text} />
                  </Pressable>
                )}
              </View>

              <View style={styles.main}>
                {tab === 'chats' ? (
                  <ScrollView contentContainerStyle={styles.list}>
                    {chatsMode === 'direct' && directRooms.length === 0 && visibleBots.length === 0 ? (
                      <View style={[styles.empty, styles.emptyCove]}>
                        <Text style={styles.h1}>{isKo ? '1:1 대화가 없어요' : 'No Direct Chats Yet'}</Text>
                        <Text style={styles.sub}>
                          {isKo ? '친구와 대화를 시작하면 여기에서 바로 이어져요.' : 'Start a chat with a friend and it will appear here.'}
                        </Text>
                      </View>
                    ) : chatsMode === 'group' && groupRooms.length === 0 && familyRooms.length === 0 ? (
                      <View style={[styles.empty, styles.emptyCove]}>
                        <Text style={styles.h1}>{isKo ? '그룹 대화가 없어요' : 'No Group Chats Yet'}</Text>
                        <Text style={styles.sub}>
                          {isKo ? '그룹을 만들면 이 목록에 모여 보여요.' : 'Create a group chat and it will show up here.'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        {chatsMode === 'direct' ? (
                          <>
                            {visibleBots.length > 0 ? <Text style={styles.sectionTitle}>{s.botsTitle}</Text> : null}
                            {visibleBots.map((bot) => (
                              <Pressable key={bot.id} style={styles.roomItem} onPress={() => void startBotRoom(bot.id)}>
                                <View style={styles.listAvatar}>
                                  <Text style={styles.listAvatarText}>{bot.name.slice(0, 1).toUpperCase()}</Text>
                                </View>
                                <View style={styles.roomItemCopy}>
                                  <View style={styles.roomItemHead}>
                                    <Text style={[styles.itemTitle, { flex: 1 }]}>{bot.name}</Text>
                                  </View>
                                  <Text style={styles.roomPreview} numberOfLines={1}>
                                    {bot.description || s.botStart}
                                  </Text>
                                </View>
                                <View style={styles.itemRight}>
                                  <Pressable style={styles.iconLight} onPress={() => void startBotRoom(bot.id)}>
                                    <Ionicons name="chatbubble-ellipses" size={16} color={FOREST.text} />
                                  </Pressable>
                                </View>
                              </Pressable>
                            ))}
                            {favoriteDirectRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '즐겨찾기' : 'Favorites'}</Text> : null}
                            {favoriteDirectRooms.map(renderRoomRow)}
                            {otherDirectRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '1:1 대화' : 'Direct Chats'}</Text> : null}
                            {otherDirectRooms.map(renderRoomRow)}
                          </>
                        ) : (
                          <>
                            {favoriteGroupRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '즐겨찾기' : 'Favorites'}</Text> : null}
                            {favoriteGroupRooms.map(renderRoomRow)}
                            {favoriteFamilyRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '가족방 즐겨찾기' : 'Favorite Family Rooms'}</Text> : null}
                            {favoriteFamilyRooms.map(renderRoomRow)}
                            {otherFamilyRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '가족방' : 'Family Rooms'}</Text> : null}
                            {otherFamilyRooms.map(renderRoomRow)}
                            {otherGroupRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '그룹 대화' : 'Group Chats'}</Text> : null}
                            {otherGroupRooms.map(renderRoomRow)}
                          </>
                        )}
                      </>
                    )}
                  </ScrollView>
                ) : null}

                {tab === 'friends' ? (
                  <ScrollView contentContainerStyle={styles.list}>
                    {isFriendSyncing ? <Text style={styles.sub}>{s.friendLoading}</Text> : null}
                    {false ? (
                      <>
                        <Text style={styles.sectionTitle}>{isKo ? '가족 요청' : 'Family Requests'}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                          {familyRequestsIncoming.map((req) => (
                            <View key={req.requestId} style={styles.requestCard}>
                              <Text style={styles.itemTitle}>{req.peerName}</Text>
                              <Text style={styles.sub}>
                                {isKo ? '가족 그룹 초대 요청' : 'Family group invitation'}
                              </Text>
                              <View style={styles.row}>
                                <Pressable
                                  style={[styles.requestBtn, !!familyActionKey && styles.off]}
                                  disabled={!!familyActionKey}
                                  onPress={() => void acceptFamilyUpgradeRequest(req.requestId)}
                                >
                                  <Text style={styles.requestBtnText}>{isKo ? '수락' : 'Accept'}</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.requestBtn, !!familyActionKey && styles.off]}
                                  disabled={!!familyActionKey}
                                  onPress={() => void rejectFamilyUpgradeRequest(req.requestId)}
                                >
                                  <Text style={styles.requestBtnText}>{isKo ? '거절' : 'Reject'}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    {false ? (
                      <>
                        <Text style={styles.sectionTitle}>{isKo ? '보낸 가족 요청' : 'Sent Family Requests'}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                          {familyRequestsOutgoing.map((req) => (
                            <View key={req.requestId} style={styles.requestCard}>
                              <Text style={styles.itemTitle}>{req.peerName}</Text>
                              <Text style={styles.sub}>
                                {isKo ? '가족 그룹 초대를 보냈어요.' : 'Family group invitation sent.'}
                              </Text>
                              <Pressable
                                style={[styles.requestBtn, !!familyActionKey && styles.off]}
                                disabled={!!familyActionKey}
                                onPress={() => void cancelFamilyUpgradeRequest(req.requestId)}
                              >
                                <Text style={styles.requestBtnText}>{isKo ? '요청 취소' : 'Cancel Request'}</Text>
                              </Pressable>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    {friendRequestsIncoming.length > 0 ? (
                      <>
                        <Text style={styles.sectionTitle}>{s.friendIncoming}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                          {friendRequestsIncoming.map((req) => (
                            <View key={req.id} style={styles.requestCard}>
                              <Text style={styles.itemTitle}>{req.peerName}</Text>
                              <Text style={styles.sub}>
                                {new Date(req.createdAt).toLocaleDateString()}
                              </Text>
                              <View style={styles.row}>
                                <Pressable
                                  style={[styles.requestBtn, !!friendActionKey && styles.off]}
                                  disabled={!!friendActionKey}
                                  onPress={() => void acceptFriendRequest(req.id)}
                                >
                                  <Text style={styles.requestBtnText}>{s.friendRequestAccept}</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.requestBtn, !!friendActionKey && styles.off]}
                                  disabled={!!friendActionKey}
                                  onPress={() => void rejectFriendRequest(req.id)}
                                >
                                  <Text style={styles.requestBtnText}>{s.friendRequestReject}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    {friendRequestsOutgoing.length > 0 ? (
                      <>
                        <Text style={styles.sectionTitle}>{s.friendOutgoing}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                          {friendRequestsOutgoing.map((req) => (
                            <View key={req.id} style={styles.requestCard}>
                              <Text style={styles.itemTitle}>{req.peerName}</Text>
                              <Text style={styles.sub}>{s.friendRequestSent}</Text>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    {friends.length === 0 ? (
                      <View style={[styles.empty, styles.emptyCove]}>
                        <Pressable onPress={openFriendModal}>
                          <Text style={[styles.h1, { textDecorationLine: 'underline' }]}>{s.noFriends}</Text>
                        </Pressable>
                        <Text style={styles.sub}>{s.addFriend}</Text>
                        <Pressable style={styles.smallBtn} onPress={openFriendModal}>
                          <Text style={styles.smallBtnText}>{s.addFriend}</Text>
                        </Pressable>
                      </View>
                    ) : false ? (
                      familyFriends.length === 0 ? (
                        <View style={[styles.empty, styles.emptyCove]}>
                          <Text style={styles.h1}>{isKo ? '가족이 아직 없어요' : 'No Family Links Yet'}</Text>
                          <Text style={styles.sub}>
                            {isKo
                              ? '가족 연결로 초대 요청을 보내면 여기에서 가족만 따로 볼 수 있어요.'
                              : 'Send a family-group invitation and your linked family will appear here.'}
                          </Text>
                          <Pressable
                            style={[styles.smallBtn, connectableFamilyFriends.length === 0 && styles.off]}
                            disabled={connectableFamilyFriends.length === 0}
                            onPress={openFamilyPickerModal}
                          >
                            <Text style={styles.smallBtnText}>{isKo ? '가족 연결' : 'Connect Family'}</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.sectionTitle}>{isKo ? '가족' : 'Family'}</Text>
                          {familyFriends.map(renderFriendRow)}
                        </>
                      )
                    ) : (
                      <>
                        {favoriteFriends.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '즐겨찾기' : 'Favorites'}</Text> : null}
                        {favoriteFriends.map(renderFriendRow)}
                        {otherFriends.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '친구' : 'Friends'}</Text> : null}
                        {otherFriends.map(renderFriendRow)}
                      </>
                    )}
                  </ScrollView>
                ) : null}

                {tab === 'profile' ? (
                  <ScrollView contentContainerStyle={styles.list}>
                    <Pressable style={styles.profileCabinCard} onLongPress={openServerMenu} delayLongPress={900}>
                      <View style={styles.profileHero}>
                        {profile.avatarUri ? (
                          <Image source={{ uri: profile.avatarUri }} style={styles.profileAvatar} />
                        ) : (
                          <View style={styles.profileAvatarFallback}>
                            <Text style={styles.profileAvatarText}>
                              {(profile.name || s.me).slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.profileCabinText}>
                        <Text style={styles.h1}>{profile.name || s.app}</Text>
                        <Text style={styles.profileStatus}>{profile.status || s.myStatus}</Text>
                        <Text style={styles.sub}>{profile.email || '-'}</Text>
                      </View>
                      <Pressable
                        style={styles.smallBtn}
                        onPress={() => {
                          setNameDraft(profile.name);
                          setStatusDraft(profile.status);
                          setProfilePhotoDraft(profile.avatarUri);
                          setShowProfileModal(true);
                        }}
                      >
                        <Text style={styles.smallBtnText}>{s.profileEdit}</Text>
                      </Pressable>
                    </Pressable>
                    {canCheckForAppUpdate ? (
                      <View style={styles.appUpdateCard}>
                        <Text style={styles.sectionTitle}>{isKo ? '\uC571 \uC5C5\uB370\uC774\uD2B8' : 'App update'}</Text>
                        <Text style={styles.sub}>{appUpdateSummary}</Text>
                        <View style={styles.appUpdateMetaRow}>
                          <Text style={styles.appUpdateMetaLabel}>{isKo ? '\uD604\uC7AC' : 'Current'}</Text>
                          <Text style={styles.appUpdateMetaValue}>{currentAppVersion}</Text>
                        </View>
                        {appUpdateStatus.latestVersion ? (
                          <View style={styles.appUpdateMetaRow}>
                            <Text style={styles.appUpdateMetaLabel}>{isKo ? '\uCD5C\uC2E0' : 'Latest'}</Text>
                            <Text style={styles.appUpdateMetaValue}>{appUpdateStatus.latestVersion}</Text>
                          </View>
                        ) : null}
                        {appUpdateFileSize ? (
                          <View style={styles.appUpdateMetaRow}>
                            <Text style={styles.appUpdateMetaLabel}>{isKo ? '\uD30C\uC77C \uD06C\uAE30' : 'File size'}</Text>
                            <Text style={styles.appUpdateMetaValue}>{appUpdateFileSize}</Text>
                          </View>
                        ) : null}
                        {appUpdateNotes ? (
                          <View style={styles.appUpdateNotesBlock}>
                            <Text style={styles.appUpdateMetaLabel}>{isKo ? '\uBC30\uD3EC \uBA54\uBAA8' : 'Release notes'}</Text>
                            <Text style={styles.appUpdateNotes}>{appUpdateNotes}</Text>
                          </View>
                        ) : null}
                        {appUpdateStatus.needsUpdate ? (
                          <Text style={styles.appUpdateHint}>
                            {isKo
                              ? `\uC9C0\uAE08 \uC5C5\uB370\uC774\uD2B8\uD558\uC9C0 \uC54A\uC73C\uBA74 v${currentAppVersion}\uC5D0 \uB9DE\uB294 \uAD6C\uD615 \uBAA8\uB378\uC744 \uACC4\uC18D \uC0AC\uC6A9\uD574\uC694.`
                              : `If you stay on v${currentAppVersion}, the app keeps using the older model.`}
                          </Text>
                        ) : null}
                        {appUpdateStatus.needsUpdate ? (
                          <Pressable
                            style={[styles.smallBtn, styles.appUpdateButton, isInstallingAppUpdate && styles.off]}
                            disabled={isInstallingAppUpdate}
                            onPress={() => {
                              void startAppUpdateInstall();
                            }}
                          >
                            <Text style={styles.smallBtnText}>{appUpdateButtonLabel}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                    <Pressable style={styles.logoutBtn} onPress={requestLogout}>
                      <Ionicons name="log-out-outline" size={16} color="#FFDADD" />
                      <Text style={styles.logoutText}>{s.logout}</Text>
                    </Pressable>
                    <Text style={styles.appVersionText}>{`v${currentAppVersion}`}</Text>
                  </ScrollView>
                ) : null}
              </View>

              <View style={styles.tabs}>
                <Pressable style={[styles.tab, tab === 'friends' && styles.tabOn]} onPress={handleFriendsTabPress}>
                  <Ionicons name="people" size={18} color={tab === 'friends' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{friendsTabLabel}</Text>
                  <Text style={styles.tabHint}>{friendsTabHint}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'chats' && styles.tabOn]} onPress={handleChatsTabPress}>
                  <Ionicons name="chatbubbles" size={18} color={tab === 'chats' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{chatsTabLabel}</Text>
                  <Text style={styles.tabHint}>{chatsTabHint}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'profile' && styles.tabOn]} onPress={() => setTab('profile')}>
                  <Ionicons name="person" size={18} color={tab === 'profile' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{s.tabsProfile}</Text>
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>

        <Modal
          visible={showFriendModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowFriendModal(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowFriendModal(false)} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                <Text style={styles.h1}>{s.addFriend}</Text>
                <TextInput
                  style={styles.field}
                  placeholder={s.friendLookupPlaceholder}
                  placeholderTextColor={FOREST.placeholder}
                  value={friendLookupQuery}
                  onChangeText={setFriendLookupQuery}
                  onSubmitEditing={() => {
                    void searchFriendCandidates();
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.smallBtn, (!friendLookupQuery.trim() || isFriendLookupLoading) && styles.off]}
                    disabled={!friendLookupQuery.trim() || isFriendLookupLoading}
                    onPress={() => {
                      void searchFriendCandidates();
                    }}
                  >
                    <Text style={styles.smallBtnText}>{s.friendLookupAction}</Text>
                  </Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => setShowFriendModal(false)}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                </View>
                {isFriendLookupLoading ? <Text style={styles.sub}>{s.friendLoading}</Text> : null}
                {friendLookupMsg ? <Text style={styles.sub}>{friendLookupMsg}</Text> : null}
                <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.list}>
                  {friendLookupResults.map((item) => {
                    const incomingReq = friendRequestsIncoming.find((req) => req.peerUserId === item.id);
                    const outgoingReq = friendRequestsOutgoing.find((req) => req.peerUserId === item.id);
                    const hasOutgoing = item.outgoingPending || !!outgoingReq;
                    const hasIncoming = item.incomingPending || !!incomingReq;
                    let actionLabel: string = s.friendRequestSend;
                    let actionDisabled = !!friendActionKey;
                    let actionHandler: (() => void) | null = () => {
                      void sendFriendRequest(item.id);
                    };

                    if (item.isFriend) {
                      actionLabel = s.friendAlready;
                      actionDisabled = true;
                      actionHandler = null;
                    } else if (hasIncoming && incomingReq) {
                      actionLabel = s.friendRequestAccept;
                      actionHandler = () => {
                        void acceptFriendRequest(incomingReq.id);
                      };
                    } else if (hasOutgoing || hasIncoming) {
                      actionLabel = s.friendRequestSent;
                      actionDisabled = true;
                      actionHandler = null;
                    }

                    return (
                      <View key={item.id} style={styles.item}>
                        <View style={styles.listAvatar}>
                          {item.avatarUri ? (
                            <Image source={{ uri: item.avatarUri }} style={styles.listAvatarImage} />
                          ) : (
                            <Text style={styles.listAvatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{item.name}</Text>
                          <Text style={styles.sub} numberOfLines={1}>
                            {item.status || item.email}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.requestBtn, actionDisabled && styles.off]}
                          disabled={actionDisabled || !actionHandler}
                          onPress={() => actionHandler?.()}
                        >
                          <Text style={styles.requestBtnText}>{actionLabel}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showFamilyPickerModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeFamilyPickerModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeFamilyPickerModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{isKo ? '가족으로 연결할 친구 선택' : 'Choose A Friend For Family Link'}</Text>
                  <Text style={styles.sub}>
                    {isKo
                      ? '가족은 먼저 친구가 된 뒤에 연결할 수 있어요. 아래 친구를 선택하면 가족 연결 요청을 보낼 수 있어요.'
                      : 'Family links start from existing friends. Pick a friend below to send a family-group request.'}
                  </Text>
                  {connectableFamilyFriends.length === 0 ? (
                    <View style={[styles.empty, styles.emptyCove]}>
                      <Text style={styles.h1}>{isKo ? '연결 가능한 친구가 없어요' : 'No Eligible Friends Yet'}</Text>
                      <Text style={styles.sub}>
                        {isKo
                          ? '먼저 친구를 추가하거나 이미 가족으로 연결된 친구를 확인해 보세요.'
                          : 'Add a friend first, or check the friends already connected as family.'}
                      </Text>
                    </View>
                  ) : (
                    connectableFamilyFriends.map((friend) => (
                      <Pressable
                        key={friend.id}
                        style={styles.item}
                        onPress={() => selectFamilyUpgradeFriend(friend)}
                      >
                        <View style={styles.row}>
                          <View style={styles.listAvatar}>
                            {friend.avatarUri ? (
                              <Image source={{ uri: friend.avatarUri }} style={styles.listAvatarImage} />
                            ) : (
                              <Text style={styles.listAvatarText}>{friend.name.slice(0, 1).toUpperCase()}</Text>
                            )}
                          </View>
                          <View style={styles.familyOptionCopy}>
                            <Text style={styles.itemTitle}>{friend.name}</Text>
                            <Text style={styles.sub} numberOfLines={1}>
                              {friend.status || (isKo ? '친구 관계에서 가족 그룹으로 연결' : 'Upgrade from friend to family group')}
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={FOREST.text} />
                      </Pressable>
                    ))
                  )}
                  <Pressable style={styles.smallBtn} onPress={closeFamilyPickerModal}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showFamilyUpgradeModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeFamilyUpgradeModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeFamilyUpgradeModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{isKo ? '가족으로 연결' : 'Upgrade To Family'}</Text>
                  <Text style={styles.sub}>
                    {familyUpgradeTarget
                      ? isKo
                        ? `${familyUpgradeTarget.name} 님을 가족 그룹에 초대할까요? 역할이나 호칭은 나중에 그룹 안에서 따로 정리할 수 있어요.`
                        : `Invite ${familyUpgradeTarget.name} into your family group? Roles and titles can be sorted out later inside the group.`
                      : isKo
                        ? '가족 그룹 초대를 보낼까요?'
                        : 'Send a family-group invitation?'}
                  </Text>
                  <View style={[styles.item, styles.familyOptionItem]}>
                    <View style={styles.familyOptionCopy}>
                      <Text style={styles.itemTitle}>{isKo ? '가족 그룹 초대' : 'Family Group Invite'}</Text>
                      <Text style={styles.sub}>
                        {isKo
                          ? '지금은 가족 그룹 생성과 멤버 연결에 집중하고, 세부 역할과 권한은 이후 서비스 확장에 맞춰 조정합니다.'
                          : 'For now, this focuses on creating the family group and linking members. Detailed roles and permissions come later.'}
                      </Text>
                    </View>
                    <Ionicons name="people-circle-outline" size={18} color={FOREST.text} />
                  </View>
                  <View style={styles.row}>
                    <Pressable style={styles.smallBtn} onPress={closeFamilyUpgradeModal}>
                      <Text style={styles.smallBtnText}>{s.cancel}</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.smallBtn,
                        (!familyUpgradeTargetId || !!familyActionKey) && styles.off,
                      ]}
                      disabled={!familyUpgradeTargetId || !!familyActionKey}
                      onPress={() => {
                        void sendFamilyUpgradeRequest();
                      }}
                    >
                      <Text style={styles.smallBtnText}>{isKo ? '요청 보내기' : 'Send Request'}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showFriendAliasModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeFriendAliasModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeFriendAliasModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{isKo ? '내가 부르는 이름' : 'My Name For This Person'}</Text>
                  <Text style={styles.sub}>
                    {isKo
                      ? '상대 프로필명과 별개로 내가 부르는 이름을 저장할 수 있어요. 비워두면 공식 프로필명이 보여요.'
                      : 'Save the name you want to use for this person. Leave it empty to fall back to their profile name.'}
                  </Text>
                  <TextInput
                    style={styles.field}
                    value={friendAliasDraft}
                    onChangeText={setFriendAliasDraft}
                    placeholder={isKo ? '예: 엄마, 큰딸, 외할머니' : 'Examples: Mom, Eldest Daughter, Grandma'}
                    placeholderTextColor={FOREST.placeholder}
                    maxLength={100}
                  />
                  <View style={styles.row}>
                    <Pressable style={styles.smallBtn} onPress={closeFriendAliasModal}>
                      <Text style={styles.smallBtnText}>{s.cancel}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallBtn, !!friendActionKey && styles.off]}
                      disabled={!!friendActionKey}
                      onPress={() => {
                        void saveFriendAlias();
                      }}
                    >
                      <Text style={styles.smallBtnText}>{s.save}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showFriendActionsModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeFriendActionsModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeFriendActionsModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{friendActionsTarget?.name || (isKo ? '친구 관리' : 'Manage Friend')}</Text>
                  <Text style={styles.sub}>
                    {isKo
                      ? '이 친구의 닉네임과 관계를 관리할 수 있어요.'
                      : 'Manage this friend nickname and connection.'}
                  </Text>
                  <Pressable
                    style={styles.item}
                    onPress={() => {
                      if (!friendActionsTarget) return;
                      closeFriendActionsModal();
                      openFriendAliasModal(friendActionsTarget);
                    }}
                  >
                    <Text style={styles.itemTitle}>
                      {friendActionsTarget?.aliasName
                        ? isKo
                          ? '닉네임 수정'
                          : 'Edit Nickname'
                        : isKo
                          ? '닉네임 지정'
                          : 'Set Nickname'}
                    </Text>
                  </Pressable>
                  {friendActionsTarget?.aliasName ? (
                    <Pressable
                      style={styles.item}
                      onPress={() => {
                        if (!friendActionsTarget) return;
                        closeFriendActionsModal();
                        void removeFriendAlias(friendActionsTarget.id);
                      }}
                    >
                      <Text style={styles.itemTitle}>{isKo ? '닉네임 삭제' : 'Remove Nickname'}</Text>
                    </Pressable>
                  ) : null}
                  {false ? (
                    <Pressable
                      style={styles.item}
                      onPress={() => {
                        if (!friendActionsTarget?.family?.relationshipId) return;
                        closeFriendActionsModal();
                        void removeFamilyLink(friendActionsTarget.family.relationshipId);
                      }}
                    >
                      <Text style={[styles.itemTitle, { color: '#D05E85' }]}>
                        {isKo ? '가족 관계 해제' : 'Remove Family Relationship'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.item}
                    onPress={() => {
                      if (!friendActionsTarget) return;
                      closeFriendActionsModal();
                      void removeFriendConnection(friendActionsTarget.id);
                    }}
                  >
                    <Text style={[styles.itemTitle, { color: '#D05E85' }]}>
                      {isKo ? '친구 삭제' : 'Remove Friend'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.smallBtn} onPress={closeFriendActionsModal}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showGroupModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowGroupModal(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowGroupModal(false)} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}
              behavior={kbBehavior}
            >
              <View style={styles.sheet}>
                <Text style={styles.h1}>{s.createRoomTitle}</Text>
                <View style={{ gap: 10 }}>
                  <Pressable
                    style={[
                      styles.item,
                      styles.familyOptionItem,
                      createRoomType === 'group' && styles.familyOptionItemSelected,
                    ]}
                    onPress={() => setCreateRoomType('group')}
                  >
                    <View style={styles.familyOptionCopy}>
                      <Text style={styles.itemTitle}>{s.createRoomGroupLabel}</Text>
                      <Text style={styles.sub}>{s.createRoomGroupBody}</Text>
                    </View>
                    <Ionicons
                      name={createRoomType === 'group' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={FOREST.text}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.item,
                      styles.familyOptionItem,
                      createRoomType === 'family' && styles.familyOptionItemSelected,
                    ]}
                    onPress={() => setCreateRoomType('family')}
                  >
                    <View style={styles.familyOptionCopy}>
                      <Text style={styles.itemTitle}>{s.createRoomFamilyLabel}</Text>
                      <Text style={styles.sub}>{s.createRoomFamilyBody}</Text>
                    </View>
                    <Ionicons
                      name={createRoomType === 'family' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={FOREST.text}
                    />
                  </Pressable>
                </View>
                <TextInput
                  style={styles.field}
                  placeholder={createRoomType === 'family' ? s.createRoomFamilyName : s.groupName}
                  placeholderTextColor={FOREST.placeholder}
                  value={groupNameDraft}
                  onChangeText={setGroupNameDraft}
                />
                <Text style={styles.sub}>{createRoomType === 'family' ? s.createRoomFamilyHint : s.groupHint}</Text>
                <ScrollView style={{ maxHeight: 180 }}>
                  {friends.map((f) => (
                    <Pressable key={f.id} style={styles.item} onPress={() => toggleGroupPick(f.id)}>
                      <Text style={styles.itemTitle}>{f.name}</Text>
                      <Ionicons name={groupPick.includes(f.id) ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={FOREST.text} />
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.row}>
                  <Pressable style={styles.smallBtn} onPress={() => setShowGroupModal(false)}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.smallBtn,
                      groupPick.length < (createRoomType === 'family' ? 1 : 2) && styles.off,
                    ]}
                    disabled={groupPick.length < (createRoomType === 'family' ? 1 : 2)}
                    onPress={() => {
                      void createSharedRoom();
                    }}
                  >
                    <Text style={styles.smallBtnText}>
                      {createRoomType === 'family' ? s.createFamilyRoomAction : s.createRoom}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {renderCropModal()}

        <Modal
          visible={showProfileModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowProfileModal(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowProfileModal(false)} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{s.profileEdit}</Text>
                  {renderProfilePhotoEditor()}
                  <TextInput
                    style={styles.field}
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder={s.displayName}
                    placeholderTextColor={FOREST.placeholder}
                  />
                  <TextInput
                    style={styles.field}
                    value={statusDraft}
                    onChangeText={setStatusDraft}
                    placeholder={s.myStatus}
                    placeholderTextColor={FOREST.placeholder}
                  />
                  <View style={styles.row}>
                    <Pressable style={styles.smallBtn} onPress={() => setShowProfileModal(false)}>
                      <Text style={styles.smallBtnText}>{s.cancel}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallBtn, !nameDraft.trim() && styles.off]}
                      disabled={!nameDraft.trim()}
                      onPress={saveProfile}
                    >
                      <Text style={styles.smallBtnText}>{s.save}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showServerMenu}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowServerMenu(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowServerMenu(false)} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}
              behavior={kbBehavior}
            >
              <View style={styles.sheet}>
                <Text style={styles.h1}>{isKo ? '숨김 서버 메뉴' : 'Hidden Server Menu'}</Text>
                <Text style={styles.sub}>{isKo ? '현재 앱이 연결할 서버 주소예요.' : 'This app will talk to the server below.'}</Text>
                <Text style={styles.itemTitle}>{backendBaseUrl}</Text>
                <Text style={styles.sub}>
                  {isKo ? '서버를 바꾸면 저장된 로그인 세션과 캐시가 정리돼요.' : 'Switching servers clears the saved login session and local cache.'}
                </Text>
                <Pressable style={styles.item} onPress={() => void switchBackendServer(defaultBackendBaseUrl)}>
                  <Text style={styles.itemTitle}>{isKo ? '운영 서버 사용' : 'Use Prod Server'}</Text>
                  <Text style={styles.sub}>{defaultBackendBaseUrl}</Text>
                </Pressable>
                <Pressable style={styles.item} onPress={() => void switchBackendServer(devBackendBaseUrl)}>
                  <Text style={styles.itemTitle}>{isKo ? '개발 서버 사용 (7084)' : 'Use Dev Server (7084)'}</Text>
                  <Text style={styles.sub}>{devBackendBaseUrl}</Text>
                </Pressable>
                <TextInput
                  style={styles.field}
                  value={serverMenuDraft}
                  onChangeText={setServerMenuDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={isKo ? '직접 서버 URL 입력' : 'Enter custom server URL'}
                  placeholderTextColor={FOREST.placeholder}
                />
                <View style={styles.row}>
                  <Pressable style={styles.smallBtn} onPress={() => setShowServerMenu(false)}>
                    <Text style={styles.smallBtnText}>{isKo ? '닫기' : 'Close'}</Text>
                  </Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => void switchBackendServer(serverMenuDraft)}>
                    <Text style={styles.smallBtnText}>{isKo ? '이 주소로 적용' : 'Apply URL'}</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={!!avatarViewer}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setAvatarViewer(null)}
        >
          <View style={styles.viewerOverlay}>
            <Pressable style={styles.backdrop} onPress={() => setAvatarViewer(null)} />
            <View style={styles.viewerStage}>
              {avatarViewer?.title ? <Text style={styles.avatarViewerTitle}>{avatarViewer.title}</Text> : null}
              {avatarViewer ? (
                <Image source={{ uri: avatarViewer.uri }} style={styles.avatarViewerMedia} resizeMode="contain" />
              ) : null}
              <View style={styles.viewerActions}>
                <Pressable style={styles.smallBtn} onPress={() => setAvatarViewer(null)}>
                  <Text style={styles.smallBtnText}>{s.cancel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!mediaViewer}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setMediaViewer(null)}
        >
          <View style={styles.viewerOverlay}>
            <Pressable style={styles.backdrop} onPress={() => setMediaViewer(null)} />
            <View style={styles.viewerStage}>
              {mediaViewer?.kind === 'image' ? (
                <Image source={{ uri: mediaViewer.uri }} style={styles.viewerMedia} resizeMode="contain" />
              ) : mediaViewer?.kind === 'video' ? (
                <InAppVideoPlayer uri={mediaViewer.uri} />
              ) : null}
              <View style={styles.viewerActions}>
                <Pressable style={styles.smallBtn} onPress={() => setMediaViewer(null)}>
                  <Text style={styles.smallBtnText}>{s.cancel}</Text>
                </Pressable>
                {mediaViewer ? (
                  <Pressable
                    style={[styles.smallBtn, isSavingMedia && styles.off]}
                    disabled={isSavingMedia}
                    onPress={() => void saveMediaToDevice(mediaViewer)}
                  >
                    <Text style={styles.smallBtnText}>
                      {isSavingMedia
                        ? isKo
                          ? '\uC800\uC7A5 \uC911...'
                          : 'Saving...'
                        : isKo
                          ? '\uAE30\uAE30\uC5D0 \uC800\uC7A5'
                          : 'Save to device'}
                    </Text>
                  </Pressable>
                ) : null}
                {mediaViewer ? (
                  <Pressable style={styles.smallBtn} onPress={() => void openMediaExternally(mediaViewer.uri)}>
                    <Text style={styles.smallBtnText}>{isKo ? '다른 앱으로 열기' : 'Open Externally'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showRoomTitleModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowRoomTitleModal(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setShowRoomTitleModal(false)} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}
              behavior={kbBehavior}
            >
              <View style={styles.sheet}>
                <Text style={styles.h1}>{s.editRoomTitle}</Text>
                <TextInput
                  style={styles.field}
                  value={roomTitleDraft}
                  onChangeText={setRoomTitleDraft}
                  placeholder={s.roomTitlePlaceholder}
                  placeholderTextColor={FOREST.placeholder}
                />
                <View style={styles.row}>
                  <Pressable style={styles.smallBtn} onPress={() => setShowRoomTitleModal(false)}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, !roomTitleDraft.trim() && styles.off]}
                    disabled={!roomTitleDraft.trim()}
                    onPress={() => void saveRoomTitle()}
                  >
                    <Text style={styles.smallBtnText}>{s.save}</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={!!roomMenuId}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setRoomMenuId(null)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={() => setRoomMenuId(null)} />
            <View style={[styles.sheetWrap, { paddingBottom: sheetBottomInset }]}>
              <View style={styles.sheet}>
                <Text style={styles.h1}>{s.roomSetting}</Text>
                {roomMenuId ? (
                  <>
                    {roomMap.get(roomMenuId)?.isGroup ? (
                      <Pressable style={styles.item} onPress={() => openRoomTitleEditor(roomMenuId)}>
                        <Text style={styles.itemTitle}>{s.editRoomTitle}</Text>
                      </Pressable>
                    ) : null}
                    {roomMap.get(roomMenuId)?.isGroup ? (
                      <Pressable style={styles.item} onPress={() => void openRoomMembersEditor(roomMenuId)}>
                        <Text style={styles.itemTitle}>{isKo ? '멤버 관리' : 'Manage members'}</Text>
                      </Pressable>
                    ) : null}
                    {roomMap.get(roomMenuId)?.type === 'family' ? (
                      <Pressable style={styles.item} onPress={() => void openFamilyStructureEditor(roomMenuId)}>
                        <Text style={styles.itemTitle}>{isKo ? '가족 구조' : 'Family structure'}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.item} onPress={() => toggleFavorite(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.favorite ? s.favoriteOff : s.favoriteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => toggleMute(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.muted ? s.muteOff : s.muteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => reportRoom(roomMenuId)}>
                      <Text style={styles.itemTitle}>{s.report}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.item}
                      onPress={() =>
                        roomMap.get(roomMenuId)?.ownerUserId === currentUserId
                          ? void deleteRoom(roomMenuId)
                          : void leaveRoom(roomMenuId)
                      }
                    >
                      <Text style={[styles.itemTitle, { color: '#FFD4DE' }]}>
                        {roomMap.get(roomMenuId)?.ownerUserId === currentUserId ? s.deleteRoom : s.leaveRoom}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!familyStructureRoomId}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeFamilyStructureModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeFamilyStructureModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{isKo ? '가족 구조' : 'Family structure'}</Text>
                  <Text style={styles.sub}>
                    {familyStructureRoom
                      ? roomTitle(familyStructureRoom)
                      : isKo
                        ? '가족방 멤버와 보호자 관계를 관리해요.'
                        : 'Manage member aliases and guardian links in this family room.'}
                  </Text>
                  {isFamilyStructureLoading ? (
                    <Text style={styles.sub}>{isKo ? '불러오는 중...' : 'Loading...'}</Text>
                  ) : (
                    <>
                      <Text style={styles.sectionTitle}>{isKo ? '호칭' : 'Aliases'}</Text>
                      {familyStructureProfiles.map((profile) => {
                        const canEditAlias = profile.userId === currentUserId;
                        const draftAlias = familyStructureAliasDrafts[profile.userId] ?? profile.alias;
                        return (
                          <View key={profile.userId} style={styles.familyStructureCard}>
                            <View style={styles.familyStructureHeader}>
                              <Text style={styles.itemTitle}>{profile.name}</Text>
                              {profile.userId === currentUserId ? (
                                <Text style={styles.sub}>{isKo ? '나' : 'Me'}</Text>
                              ) : null}
                            </View>
                            <TextInput
                              style={[styles.field, styles.familyAliasInput, !canEditAlias && styles.off]}
                              value={draftAlias}
                              editable={canEditAlias && !familyStructureActionKey.startsWith('link-')}
                              onChangeText={(value) =>
                                setFamilyStructureAliasDrafts((prev) => ({
                                  ...prev,
                                  [profile.userId]: value,
                                }))
                              }
                              placeholder={isKo ? '이 방에서 보일 호칭' : 'Alias shown in this room'}
                              placeholderTextColor={FOREST.placeholder}
                            />
                            {canEditAlias ? (
                              <View style={styles.row}>
                                <Pressable
                                  style={[
                                    styles.smallBtn,
                                    familyStructureActionKey === `alias:${profile.userId}` && styles.off,
                                  ]}
                                  disabled={!!familyStructureActionKey}
                                  onPress={() => {
                                    void saveFamilyStructureAlias(profile.userId);
                                  }}
                                >
                                  <Text style={styles.smallBtnText}>{s.save}</Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}

                      <Text style={styles.sectionTitle}>{isKo ? '보호자 관계' : 'Guardian links'}</Text>
                      <Text style={styles.sectionTitle}>{isKo ? '보호자 요청' : 'Guardian requests'}</Text>
                      <Text style={styles.sub}>
                        {isKo
                          ? '다른 멤버를 선택하고, 그 사람이 나의 자녀인지 보호자인지 요청할 수 있어요.'
                          : 'Pick another member and request whether they are your child or guardian.'}
                      </Text>
                      <Text style={styles.familyStructureLabel}>{isKo ? '상대 멤버' : 'Target member'}</Text>
                      <View style={styles.familyChipWrap}>
                        {familyStructureProfiles
                          .filter((profile) => profile.userId !== currentUserId)
                          .map((profile) => (
                            <Pressable
                              key={`target-${profile.userId}`}
                              style={[
                                styles.familyChip,
                                familyStructureTargetId === profile.userId && styles.familyChipOn,
                              ]}
                              onPress={() => setFamilyStructureTargetId(profile.userId)}
                            >
                              <Text style={styles.familyChipText}>
                                {displayFamilyStructureName(profile.userId, profile.name) || profile.name}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                      <Text style={styles.familyStructureLabel}>{isKo ? '요청 방식' : 'Request as'}</Text>
                      <View style={styles.familyChipWrap}>
                        <Pressable
                          style={[
                            styles.familyChip,
                            familyStructureRequestAs === 'guardian' && styles.familyChipOn,
                          ]}
                          onPress={() => setFamilyStructureRequestAs('guardian')}
                        >
                          <Text style={styles.familyChipText}>{isKo ? '내 자녀로 지정' : 'Mark as my child'}</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.familyChip,
                            familyStructureRequestAs === 'child' && styles.familyChipOn,
                          ]}
                          onPress={() => setFamilyStructureRequestAs('child')}
                        >
                          <Text style={styles.familyChipText}>{isKo ? '내 보호자로 지정' : 'Mark as my guardian'}</Text>
                        </Pressable>
                      </View>
                      <Pressable
                        style={[
                          styles.smallBtn,
                          (!familyStructureTargetId || !!familyStructureActionKey) && styles.off,
                        ]}
                        disabled={!familyStructureTargetId || !!familyStructureActionKey}
                        onPress={() => {
                          void createFamilyGuardianLink();
                        }}
                      >
                        <Text style={styles.smallBtnText}>{isKo ? '관계 요청 보내기' : 'Send relationship request'}</Text>
                      </Pressable>
                      {familyStructurePendingIncoming.length > 0 ? (
                        <>
                          <Text style={styles.sectionTitle}>{isKo ? '받은 요청' : 'Incoming requests'}</Text>
                          {familyStructurePendingIncoming.map((relationship) => (
                            <View key={`incoming-${relationship.id}`} style={styles.familyStructureCard}>
                              <Text style={styles.itemTitle}>
                                {`${displayFamilyStructureName(relationship.guardianUserId, relationship.guardianName)} -> ${displayFamilyStructureName(
                                  relationship.childUserId,
                                  relationship.childName
                                )}`}
                              </Text>
                              <View style={styles.row}>
                                <Pressable
                                  style={[
                                    styles.smallBtn,
                                    familyStructureActionKey === `link-respond:accept:${relationship.id}` && styles.off,
                                  ]}
                                  disabled={!!familyStructureActionKey}
                                  onPress={() => {
                                    void respondFamilyGuardianLink(relationship.id, 'accept');
                                  }}
                                >
                                  <Text style={styles.smallBtnText}>{isKo ? '수락' : 'Accept'}</Text>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.smallBtn,
                                    familyStructureActionKey === `link-respond:reject:${relationship.id}` && styles.off,
                                  ]}
                                  disabled={!!familyStructureActionKey}
                                  onPress={() => {
                                    void respondFamilyGuardianLink(relationship.id, 'reject');
                                  }}
                                >
                                  <Text style={styles.smallBtnText}>{isKo ? '거절' : 'Reject'}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </>
                      ) : null}
                      {familyStructurePendingOutgoing.length > 0 ? (
                        <>
                          <Text style={styles.sectionTitle}>{isKo ? '보낸 요청' : 'Outgoing requests'}</Text>
                          {familyStructurePendingOutgoing.map((relationship) => (
                            <View key={`outgoing-${relationship.id}`} style={styles.familyRelationRow}>
                              <Text style={styles.itemTitle}>
                                {`${displayFamilyStructureName(relationship.guardianUserId, relationship.guardianName)} -> ${displayFamilyStructureName(
                                  relationship.childUserId,
                                  relationship.childName
                                )}`}
                              </Text>
                              <Pressable
                                style={[
                                  styles.iconLight,
                                  familyStructureActionKey === `link-delete:${relationship.id}` && styles.off,
                                ]}
                                disabled={!!familyStructureActionKey}
                                onPress={() => {
                                  void deleteFamilyGuardianLink(relationship.id);
                                }}
                              >
                                <Ionicons name="close-outline" size={16} color={FOREST.text} />
                              </Pressable>
                            </View>
                          ))}
                        </>
                      ) : null}
                      {false ? (
                        <>
                          <Text style={styles.sub}>
                            {isKo
                              ? '보호자와 자녀를 각각 선택해서 연결해요.'
                              : 'Pick one guardian and one child to create a link.'}
                          </Text>
                          <Text style={styles.familyStructureLabel}>{isKo ? '보호자' : 'Guardian'}</Text>
                          <View style={styles.familyChipWrap}>
                            {familyStructureProfiles.map((profile) => (
                              <Pressable
                                key={`guardian-${profile.userId}`}
                                style={[
                                  styles.familyChip,
                                  familyStructureGuardianId === profile.userId && styles.familyChipOn,
                                ]}
                                onPress={() => setFamilyStructureGuardianId(profile.userId)}
                              >
                                <Text style={styles.familyChipText}>
                                  {displayFamilyStructureName(profile.userId, profile.name) || profile.name}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <Text style={styles.familyStructureLabel}>{isKo ? '자녀' : 'Child'}</Text>
                          <View style={styles.familyChipWrap}>
                            {familyStructureProfiles.map((profile) => (
                              <Pressable
                                key={`child-${profile.userId}`}
                                style={[
                                  styles.familyChip,
                                  familyStructureChildId === profile.userId && styles.familyChipOn,
                                ]}
                                onPress={() => setFamilyStructureChildId(profile.userId)}
                              >
                                <Text style={styles.familyChipText}>
                                  {displayFamilyStructureName(profile.userId, profile.name) || profile.name}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <Pressable
                            style={[
                              styles.smallBtn,
                              (!familyStructureGuardianId ||
                                !familyStructureChildId ||
                                familyStructureGuardianId === familyStructureChildId ||
                                !!familyStructureActionKey) &&
                                styles.off,
                            ]}
                            disabled={
                              !familyStructureGuardianId ||
                              !familyStructureChildId ||
                              familyStructureGuardianId === familyStructureChildId ||
                              !!familyStructureActionKey
                            }
                            onPress={() => {
                              void createFamilyGuardianLink();
                            }}
                          >
                            <Text style={styles.smallBtnText}>{isKo ? '보호자 관계 추가' : 'Add guardian link'}</Text>
                          </Pressable>
                        </>
                      ) : (
                        <Text style={styles.sub}>
                          {isKo
                            ? '호칭은 직접 바꿀 수 있고, 보호자 관계는 가족방 관리자만 바꿀 수 있어요.'
                            : 'You can edit your own alias, but only family room admins can manage guardian links.'}
                        </Text>
                      )}

                      {familyStructureRelationships.length === 0 ? (
                        <Text style={styles.sub}>
                          {isKo ? '아직 연결된 보호자 관계가 없어요.' : 'No guardian links yet.'}
                        </Text>
                      ) : (
                        familyStructureRelationships.map((relationship) => (
                          <View key={relationship.id} style={styles.familyRelationRow}>
                            <Text style={styles.itemTitle}>
                              {`${displayFamilyStructureName(relationship.guardianUserId, relationship.guardianName)} -> ${displayFamilyStructureName(
                                relationship.childUserId,
                                relationship.childName
                              )}`}
                            </Text>
                            {relationship.guardianUserId === currentUserId || relationship.childUserId === currentUserId ? (
                              <Pressable
                                style={[
                                  styles.iconLight,
                                  familyStructureActionKey === `link-delete:${relationship.id}` && styles.off,
                                ]}
                                disabled={!!familyStructureActionKey}
                                onPress={() => {
                                  void deleteFamilyGuardianLink(relationship.id);
                                }}
                              >
                                <Ionicons name="trash-outline" size={16} color={FOREST.text} />
                              </Pressable>
                            ) : null}
                          </View>
                        ))
                      )}
                    </>
                  )}
                  <View style={styles.row}>
                    <Pressable style={styles.smallBtn} onPress={closeFamilyStructureModal}>
                      <Text style={styles.smallBtnText}>{isKo ? '닫기' : 'Close'}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={!!roomMembersRoomId}
          transparent
          animationType="slide"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeRoomMembersModal}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeRoomMembersModal} />
            <KeyboardAvoidingView
              style={[styles.sheetWrap, { paddingBottom: sheetBottomInset + 12 }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
              <ScrollView
                contentContainerStyle={[styles.sheetScrollContent, styles.sheetScrollContentRoomy]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheet}>
                  <Text style={styles.h1}>{isKo ? '멤버 관리' : 'Manage members'}</Text>
                  <Text style={styles.sub}>
                    {roomMembersRoom
                      ? roomTitle(roomMembersRoom)
                      : isKo
                        ? '방의 owner, admin, 멤버를 관리해요.'
                        : 'Manage the owner, admins, and members of this room.'}
                  </Text>
                  {isRoomMembersLoading ? (
                    <Text style={styles.sub}>{isKo ? '불러오는 중...' : 'Loading...'}</Text>
                  ) : (
                    roomMembers.map((member) => {
                      const isSelf = member.userId === currentUserId;
                      const canTransfer = roomMembersCanTransferOwnership && !member.isOwner;
                      const canPromote = roomMembersCanManageAdmins && !member.isOwner && member.role === 'member';
                      const canDemote = roomMembersCanManageAdmins && !member.isOwner && member.role === 'admin';
                      const canKick =
                        roomMembersCanKickMembers &&
                        !member.isOwner &&
                        !isSelf &&
                        (roomMembersCanTransferOwnership || member.role === 'member');
                      return (
                        <View key={member.userId} style={styles.familyStructureCard}>
                          <View style={styles.familyStructureHeader}>
                            <Text style={styles.itemTitle}>{displayRoomMemberName(member)}</Text>
                            <Text style={styles.sub}>
                              {member.isOwner
                                ? isKo
                                  ? '방장'
                                  : 'Owner'
                                : member.role === 'admin'
                                  ? isKo
                                    ? '관리자'
                                    : 'Admin'
                                  : isKo
                                    ? '멤버'
                                    : 'Member'}
                            </Text>
                          </View>
                          <Text style={styles.sub}>{member.name}</Text>
                          <View style={styles.row}>
                            {canTransfer ? (
                              <Pressable
                                style={[
                                  styles.smallBtn,
                                  roomMembersActionKey === `owner:${member.userId}` && styles.off,
                                ]}
                                disabled={!!roomMembersActionKey}
                                onPress={() => {
                                  void transferRoomOwnership(member.userId);
                                }}
                              >
                                <Text style={styles.smallBtnText}>{isKo ? '방장 양도' : 'Make owner'}</Text>
                              </Pressable>
                            ) : null}
                            {canPromote ? (
                              <Pressable
                                style={[
                                  styles.smallBtn,
                                  roomMembersActionKey === `role:${member.userId}:admin` && styles.off,
                                ]}
                                disabled={!!roomMembersActionKey}
                                onPress={() => {
                                  void updateRoomMemberRole(member.userId, 'admin');
                                }}
                              >
                                <Text style={styles.smallBtnText}>{isKo ? 'Admin 지정' : 'Make admin'}</Text>
                              </Pressable>
                            ) : null}
                            {canDemote ? (
                              <Pressable
                                style={[
                                  styles.smallBtn,
                                  roomMembersActionKey === `role:${member.userId}:member` && styles.off,
                                ]}
                                disabled={!!roomMembersActionKey}
                                onPress={() => {
                                  void updateRoomMemberRole(member.userId, 'member');
                                }}
                              >
                                <Text style={styles.smallBtnText}>{isKo ? 'Admin 해제' : 'Remove admin'}</Text>
                              </Pressable>
                            ) : null}
                            {canKick ? (
                              <Pressable
                                style={[
                                  styles.smallBtn,
                                  roomMembersActionKey === `kick:${member.userId}` && styles.off,
                                ]}
                                disabled={!!roomMembersActionKey}
                                onPress={() => {
                                  void kickRoomMember(member.userId);
                                }}
                              >
                                <Text style={styles.smallBtnText}>{isKo ? '강퇴' : 'Remove'}</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                  <View style={styles.row}>
                    <Pressable style={styles.smallBtn} onPress={closeRoomMembersModal}>
                      <Text style={styles.smallBtnText}>{isKo ? '닫기' : 'Close'}</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FOREST.deep },
  fill: { flex: 1 },
  bgOrbTop: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255, 189, 214, 0.3)',
  },
  bgOrbMid: {
    position: 'absolute',
    top: 240,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(190, 231, 255, 0.32)',
  },
  bgOrbBottom: {
    position: 'absolute',
    bottom: -110,
    right: -60,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(215, 255, 191, 0.3)',
  },
  firefly: {
    position: 'absolute',
    shadowColor: '#FFD7EE',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  centerCard: {
    margin: 16,
    marginTop: 54,
    borderRadius: 28,
    padding: 20,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 14,
  },
  brand: { color: FOREST.text, fontSize: 32, textAlign: 'center', fontWeight: '800', letterSpacing: 0.8 },
  h1: { color: FOREST.text, fontSize: 21, fontWeight: '800' },
  title: { color: FOREST.text, fontSize: 18, fontWeight: '800', flex: 1 },
  sub: { color: FOREST.textSoft, fontSize: 13, lineHeight: 20 },
  btn: {
    borderRadius: 16,
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FOREST.button,
    borderWidth: 1,
    borderColor: FOREST.buttonBorder,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  btnText: { color: FOREST.text, fontSize: 15, fontWeight: '800' },
  smallBtn: {
    borderRadius: 14,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: FOREST.buttonSoft,
    borderWidth: 1,
    borderColor: FOREST.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { color: FOREST.text, fontSize: 14, fontWeight: '700' },
  linkBtn: { alignSelf: 'flex-start' },
  link: { color: FOREST.link, fontSize: 13, fontWeight: '700' },
  off: { opacity: 0.42 },
  header: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 22,
    padding: 14,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerRetreat: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  headerCopy: { flex: 1, gap: 2 },
  headerMeta: { color: FOREST.textMuted, fontSize: 12, fontWeight: '600' },
  iconDark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: FOREST.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
  headerAvatarLarge: { width: 42, height: 42, borderRadius: 21 },
  headerAvatarFallbackSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 122, 0.36)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  headerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 122, 0.36)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  headerAvatarFallbackText: { color: FOREST.text, fontSize: 16, fontWeight: '800' },
  headerAvatarSmallText: { color: FOREST.text, fontSize: 12, fontWeight: '800' },
  topIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  topIdentityCopy: { gap: 2, flex: 1 },
  headerName: { color: FOREST.text, fontSize: 18, fontWeight: '800' },
  headerSection: { color: FOREST.textMuted, fontSize: 12, fontWeight: '700' },
  iconLight: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: FOREST.iconLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
  },
  main: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 24,
    padding: 12,
    backgroundColor: FOREST.card,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 10,
  },
  list: { gap: 12, paddingBottom: 18 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  sectionTitle: { color: FOREST.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  eyebrow: { color: '#DDE8BC', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  denHero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    padding: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  denGlow: {
    position: 'absolute',
    top: -52,
    right: -42,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 193, 210, 0.26)',
  },
  denHeroSurface: {
    minHeight: 124,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  denHeroBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 149, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  denHeroCopy: { flex: 1, gap: 6, justifyContent: 'center' },
  denTitle: { color: FOREST.text, fontSize: 20, fontWeight: '800', lineHeight: 25 },
  denBody: { color: FOREST.textSoft, fontSize: 12, lineHeight: 18, maxWidth: '98%' },
  denStatsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  denStatPill: {
    minWidth: 84,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(139, 149, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(203, 224, 184, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  denStatIcon: { display: 'none' },
  denStatCopy: { gap: 0 },
  denStatValue: { color: FOREST.text, fontSize: 13, fontWeight: '800' },
  denStatLabel: { color: FOREST.textMuted, fontSize: 9, fontWeight: '700' },
  denActionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heroBtn: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(139, 149, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(204, 222, 184, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroBtnText: { color: FOREST.text, fontSize: 11, fontWeight: '700' },
  infoStrip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(249, 218, 160, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(237, 210, 163, 0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoStripText: { color: FOREST.textSoft, fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },
  requestCard: {
    minWidth: 170,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 8,
  },
  requestBtn: {
    borderRadius: 10,
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: FOREST.buttonSoft,
    borderWidth: 1,
    borderColor: FOREST.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnText: { color: FOREST.text, fontSize: 12, fontWeight: '700' },
  item: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  familyOptionItem: { alignItems: 'center' },
  familyOptionItemSelected: {
    borderColor: FOREST.buttonBorder,
    backgroundColor: 'rgba(139, 149, 255, 0.12)',
  },
  familyOptionCopy: { flex: 1, gap: 4 },
  itemTitle: { color: FOREST.text, fontSize: 15, fontWeight: '700' },
  itemRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  roomItem: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 12,
  },
  roomItemTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  roomItemCopy: { flex: 1, gap: 6 },
  roomItemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomItemTime: { color: FOREST.textMuted, fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  roomPreview: { color: FOREST.textSoft, fontSize: 13, lineHeight: 20 },
  roomItemFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  friendItem: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  friendItemCopy: { flex: 1, gap: 6 },
  friendStatusText: { color: FOREST.textMuted, fontSize: 12, lineHeight: 18 },
  friendMetaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  moodChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 149, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201, 218, 185, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  moodChipText: { color: FOREST.textSoft, fontSize: 11, fontWeight: '700' },
  trustPill: { backgroundColor: 'rgba(255, 210, 122, 0.18)' },
  familyPill: { backgroundColor: 'rgba(140, 205, 180, 0.18)' },
  familyPillText: { color: FOREST.text, fontSize: 11, fontWeight: '800' },
  listAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 122, 0.36)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  listAvatarImage: { width: '100%', height: '100%', borderRadius: 21 },
  listAvatarText: { color: FOREST.text, fontSize: 16, fontWeight: '800' },
  profileHero: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: 'rgba(210, 229, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: { width: '100%', height: '100%' },
  profileAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 122, 0.36)',
  },
  profileAvatarText: { color: FOREST.text, fontSize: 28, fontWeight: '800' },
  profileMeta: { flex: 1, gap: 3 },
  profileStatus: { color: FOREST.text, fontSize: 14, fontWeight: '600' },
  profileCabinCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileCabinText: { flex: 1, gap: 4 },
  appUpdateCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 10,
  },
  appUpdateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  appUpdateMetaLabel: { color: FOREST.textMuted, fontSize: 12, fontWeight: '700' },
  appUpdateMetaValue: { color: FOREST.text, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  appUpdateNotesBlock: { gap: 6 },
  appUpdateNotes: { color: FOREST.textSoft, fontSize: 12, lineHeight: 18 },
  appUpdateHint: { color: FOREST.textMuted, fontSize: 11, lineHeight: 17 },
  appUpdateButton: { marginTop: 2 },
  stat: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 3,
  },
  logoutBtn: {
    borderRadius: 14,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(255, 122, 154, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,187,187,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutText: { color: '#D05E85', fontSize: 14, fontWeight: '800' },
  appVersionText: {
    alignSelf: 'center',
    marginTop: 2,
    color: FOREST.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabs: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 22,
    padding: 7,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    gap: 7,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    minHeight: 64,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabOn: {
    backgroundColor: 'rgba(139, 149, 255, 0.14)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  tabText: { color: FOREST.text, fontSize: 14, fontWeight: '700' },
  tabHint: { color: FOREST.textMuted, fontSize: 10, fontWeight: '700' },
  bubbleRow: { width: '100%' },
  mineRow: { alignItems: 'flex-end' },
  otherRow: { alignItems: 'flex-start' },
  otherRowWithAvatar: { paddingLeft: 34 },
  messageAvatarDock: { position: 'absolute', left: 0, top: 0 },
  messageAvatar: { width: 26, height: 26, borderRadius: 13 },
  messageAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 122, 0.36)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  messageAvatarText: { color: FOREST.text, fontSize: 11, fontWeight: '800' },
  bubble: {
    maxWidth: '88%',
    borderRadius: 20,
    padding: 13,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  roomSender: {
    marginBottom: 4,
    paddingHorizontal: 4,
    color: FOREST.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  mineBubble: { backgroundColor: FOREST.mineBubble },
  otherBubble: {
    backgroundColor: FOREST.otherBubble,
    borderWidth: 1,
    borderColor: 'rgba(146,175,137,0.22)',
  },
  msg: { color: '#1D3528', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  msgMine: { color: '#FFFFFF' },
  msgLink: { color: '#2D6EEA', textDecorationLine: 'underline', fontWeight: '700' },
  msgLinkMine: { color: '#FFFFFF' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 5 },
  meta: { color: 'rgba(26,53,37,0.6)', fontSize: 11, fontWeight: '600' },
  metaMine: { color: 'rgba(255,255,255,0.82)' },
  receiptWrap: { minWidth: 12, alignItems: 'center', justifyContent: 'center' },
  receiptBadge: { color: '#FFDB66', fontSize: 11, fontWeight: '900' },
  receiptCheck: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  readersText: { marginTop: 4, color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '700', textAlign: 'right' },
  system: { color: '#355B3A', fontSize: 12, fontWeight: '700' },
  media: { width: 196, height: 136, borderRadius: 12, backgroundColor: '#31563A' },
  video: { alignItems: 'center', justifyContent: 'center' },
  videoCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2E5237',
  },
  videoCardText: { color: '#E7F4FF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  roomSceneCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(240, 208, 162, 0.14)',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  roomSceneIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 149, 255, 0.08)',
  },
  roomSceneText: { color: FOREST.textSoft, fontSize: 12, lineHeight: 18 },
  roomDayChip: { alignItems: 'center', marginTop: 2 },
  roomDayChipText: {
    color: FOREST.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(139, 149, 255, 0.08)',
  },
  viewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  viewerStage: {
    width: '100%',
    maxWidth: 520,
    gap: 12,
    alignItems: 'center',
  },
  avatarViewerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  viewerMedia: {
    width: '100%',
    height: 520,
    borderRadius: 18,
    backgroundColor: 'rgba(11,25,16,0.92)',
  },
  avatarViewerMedia: {
    width: '100%',
    height: 420,
    borderRadius: 24,
    backgroundColor: 'rgba(11,25,16,0.92)',
  },
  viewerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  viewerHint: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  viewerActions: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  composer: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 22,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 8,
  },
  composerHint: { color: FOREST.textMuted, fontSize: 12, fontWeight: '600' },
  draft: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: 'rgba(229,246,220,0.12)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftNest: { backgroundColor: 'rgba(229,246,220,0.14)' },
  draftCopy: { flex: 1, gap: 2 },
  field: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: FOREST.inputBg,
    color: FOREST.inputText,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(167, 177, 230, 0.24)',
  },
  familyStructureCard: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  familyStructureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  familyAliasInput: {
    minHeight: 44,
  },
  familyStructureLabel: {
    color: FOREST.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  familyChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  familyChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: FOREST.buttonSoft,
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  familyChipOn: {
    backgroundColor: 'rgba(255, 214, 122, 0.22)',
    borderColor: 'rgba(255, 214, 122, 0.7)',
  },
  familyChipText: {
    color: FOREST.text,
    fontSize: 13,
    fontWeight: '700',
  },
  familyRelationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: FOREST.inputBg,
    color: FOREST.inputText,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(167, 177, 230, 0.24)',
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 149, 255, 0.08)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FOREST.button,
    borderWidth: 1,
    borderColor: FOREST.buttonBorder,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FOREST.badge,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: {
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  emptyCove: { paddingVertical: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: FOREST.overlay },
  sheetWrap: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  sheetScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheetScrollContentRoomy: { paddingTop: 20, paddingBottom: 20 },
  sheet: {
    margin: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: FOREST.sheetBg,
    borderWidth: 1,
    borderColor: FOREST.sheetBorder,
    gap: 10,
  },
  cropViewport: {
    width: PROFILE_CROP_BOX,
    height: PROFILE_CROP_BOX,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(11,25,16,0.7)',
  },
  cropImage: {
    position: 'absolute',
  },
  cropFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(243,248,234,0.92)',
  },
  cropCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: 'rgba(243,248,234,0.98)',
  },
  cropCornerTL: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cropCornerTR: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cropCornerBL: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cropCornerBR: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  cropCenterIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: FOREST.text,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  profilePhotoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  profilePhotoPreview: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#2E5237' },
  profilePhotoPreviewFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(141,191,121,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  profilePhotoActions: { gap: 8, flex: 1 },
});

export default App;

