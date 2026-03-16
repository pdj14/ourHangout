import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  Alert,
  AppState,
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
type MsgKind = 'text' | 'image' | 'video' | 'system';
type Delivery = 'sending' | 'sent' | 'read';

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

type Friend = { id: string; name: string; status: string; avatarUri: string; trusted: boolean };
type Room = {
  id: string;
  title: string;
  members: string[];
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
  status?: string;
  avatarUri?: string;
  trusted?: boolean;
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
type BackendRoom = {
  id?: string;
  title?: string;
  members?: string[];
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
type AppExtra = {
  googleAuth?: { androidClientId?: string; iosClientId?: string; webClientId?: string };
  backend?: { baseUrl?: string };
};
type PersistedSession = {
  accessToken: string;
  refreshToken?: string;
};

const MY_ID = 'me';
const URL_REGEX = /https?:\/\/\S+/gi;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PROFILE_CROP_BOX = 260;

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
  ];

  for (const [source, ko, en] of map) {
    if (normalized === source) {
      return isKo ? ko : en;
    }
  }

  return normalized;
};
const SESSION_STORAGE_KEY = 'ourhangout.session.v1';
const BACKEND_OVERRIDE_STORAGE_KEY = 'ourhangout.backend-override.v1';
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

const TEXT = {
  en: {
    app: 'Our Hangout',
    login: 'Sign in',
    loginBody: 'Use Google sign-in, then set your profile.',
    google: 'Continue with Google',
    loginSkip: 'Preview demo',
    needsLoginTitle: 'Sign in needed',
    needsLoginBody: 'This part of the hideout opens after sign-in.',
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
    denGreeting: 'Welcome back to the hideout',
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
    denFriendHint: 'The people who make the hideout feel lived in.',
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
    needsLoginBody: '이 공간은 로그인 후 사용할 수 있어요.',
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
    denGreeting: '숲속 아지트에 다시 왔어요',
    denGreetingBody: '바깥의 소음을 잠시 내려두고, 이끼 냄새와 등불빛 사이에서 천천히 쉬어가요.',
    denChatsTitle: '오늘의 아지트 대화',
    denChatsBody: '중요한 대화를 조용히 이어가는 공간이에요.',
    denFriendsTitle: '아지트를 함께할 사람들',
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
    denFriendHint: '이 아지트를 함께 채워 줄 사람들을 가까이 두세요.',
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
  const [friendActionKey, setFriendActionKey] = useState('');
  const [isFriendSyncing, setIsFriendSyncing] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRoomTitleModal, setShowRoomTitleModal] = useState(false);
  const [roomTitleDraft, setRoomTitleDraft] = useState('');
  const [mediaViewer, setMediaViewer] = useState<MediaViewer | null>(null);
  const [roomMenuId, setRoomMenuId] = useState<string | null>(null);
  const [wsRetryTick, setWsRetryTick] = useState(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [directReadCutoffs, setDirectReadCutoffs] = useState<Record<string, number>>({});

  const scrollRef = useRef<ScrollView>(null);
  const cropOpenedAtRef = useRef(0);
  const sessionRestoreStartedRef = useRef(false);
  const hiddenServerTapCountRef = useRef(0);
  const hiddenServerTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomGroupRef = useRef<Record<string, boolean>>({});
  const sendLockRef = useRef(false);
  const pushTokenRef = useRef('');
  const registeredPushTokenRef = useRef('');
  const notificationResponseSubRef = useRef<Notifications.EventSubscription | null>(null);
  const backendBaseUrl = normalizeBackendBaseUrl(backendOverrideUrl) || defaultBackendBaseUrl;
  const backendOrigin = useMemo(() => {
    try {
      return new URL(backendBaseUrl).origin;
    } catch {
      return '';
    }
  }, [backendBaseUrl]);

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

  const getFriend = (fid: string) => friends.find((f) => f.id === fid);
  const getBot = (botUserId: string) => bots.find((bot) => bot.userId === botUserId);
  const isOpenClawAssistantBotUser = (botUserId: string) => getBot(botUserId)?.botKey === 'openclaw-assistant';
  const roomAvatarUri = (room: Room) => {
    if (room.isGroup) return '';
    const peerId = room.members.find((member) => member !== currentUserId) ?? '';
    return getFriend(peerId)?.avatarUri || '';
  };
  const messageAvatarUri = (message: Message) => getFriend(message.senderId)?.avatarUri || '';
  const roomTitle = (room: Room) =>
    room.isGroup
      ? room.title
      : getFriend(room.members.find((m) => m !== currentUserId) ?? '')?.name ?? room.title;
  const roomMembers = (room: Room) =>
    room.members
      .filter((m) => m !== currentUserId)
      .map((m) => getFriend(m)?.name ?? getBot(m)?.name ?? '')
        .filter(Boolean)
        .join(', ');
  const openServerMenu = () => {
    setServerMenuDraft(backendBaseUrl);
    setShowServerMenu(true);
  };
  const shouldAutoMarkRoomRead = (roomId: string) =>
    !!roomId && appVisibility === 'active' && activeRoomRef.current === roomId;
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
      const members = roomMembers(room).toLowerCase();
      const preview = room.preview.toLowerCase();
      return title.includes(q) || members.includes(q) || preview.includes(q);
    });
  }, [chatQuery, sortedRooms]);

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => `${f.name} ${f.status}`.toLowerCase().includes(q));
  }, [friendQuery, friends]);

  const favoriteRooms = useMemo(() => sortedRooms.filter((room) => room.favorite), [sortedRooms]);
  const otherRooms = useMemo(() => sortedRooms.filter((room) => !room.favorite), [sortedRooms]);
  const sortedFriendsByTrust = useMemo(
    () =>
      [...friends].sort((a, b) =>
        a.trusted === b.trusted ? a.name.localeCompare(b.name) : a.trusted ? -1 : 1
      ),
    [friends]
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
      <View style={styles.listAvatar}>
        {roomAvatarUri(room) ? (
          <Image source={{ uri: roomAvatarUri(room) }} style={styles.listAvatarImage} />
        ) : (
          <Text style={styles.listAvatarText}>{roomTitle(room).slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.roomItemCopy}>
        <View style={styles.roomItemHead}>
          <Text style={[styles.itemTitle, { flex: 1 }]}>{roomTitle(room)}</Text>
          <Text style={styles.roomItemTime}>{roomTimeLabel(room.updatedAt)}</Text>
        </View>
        <Text style={styles.roomPreview} numberOfLines={1}>
          {room.preview || roomMembers(room) || s.startChat}
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
    return (
      <View key={friend.id} style={styles.friendItem}>
        <View style={styles.listAvatar}>
          {friend.avatarUri ? (
            <Image source={{ uri: friend.avatarUri }} style={styles.listAvatarImage} />
          ) : (
            <Text style={styles.listAvatarText}>{friend.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.friendItemCopy}>
          <Text style={styles.itemTitle}>{friend.name}</Text>
          <Text style={styles.friendStatusText} numberOfLines={1}>
            {friend.status || s.startChat}
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
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (isSessionRestoring) return;
      if (backendState !== 'ready') return;
      const token = accessToken.trim();
      if (!token) return;
      void Promise.all([refreshFriendsAndRequests(token), refreshRoomsFromBackend(token)]).catch(() => null);
      if (activeRoomRef.current) {
        void syncRoomMessagesFromBackend(token, activeRoomRef.current).catch(() => null);
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
      void markRoomAsRead(token, activeRoomId, latest.id);
    }
  }, [activeRoomId, activeMsgs.length, accessToken, appVisibility]);

  useEffect(() => {
    const token = accessToken.trim();
    if (!activeRoomId || !token) return;
    if (!shouldAutoMarkRoomRead(activeRoomId)) return;
    let cancelled = false;
    const run = async () => {
      try {
        const synced = await syncRoomMessagesFromBackend(token, activeRoomId);
        await maybeMarkLatestIncomingMessageRead(token, activeRoomId, synced);
        if (!cancelled) {
          await markRoomAsRead(token, activeRoomId);
        }
      } catch {
        if (cancelled) return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeRoomId, accessToken, appVisibility]);

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
      throw new Error(body.error?.message || body.message || 'Request failed');
    }
    if (body.data !== undefined) return body.data;
    return raw as T;
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
      const res = await fetch(requestUrl, { ...(init || {}), headers });
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

    const shouldAttemptRefresh =
      normalizedPath !== '/v1/auth/refresh' &&
      normalizedPath !== '/v1/auth/google' &&
      normalizedPath !== '/health' &&
      !!refreshToken.trim();

    let resolvedToken = token;
    let response = await perform(resolvedToken);

    if (response.res.status === 401 && shouldAttemptRefresh) {
      try {
        const refreshResponse = await perform(undefined);
        void refreshResponse;
      } catch {
        // noop
      }
      try {
        const refreshed = await fetch(`${backendBaseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refreshToken.trim() }),
        });
        const refreshText = await refreshed.text();
        let refreshJson: unknown = null;
        if (refreshText) {
          try {
            refreshJson = JSON.parse(refreshText);
          } catch {
            refreshJson = {};
          }
        }
        if (refreshed.ok) {
          const refreshData = unwrapEnvelope<BackendAuthData>(refreshJson || {});
          const nextAccessToken = (refreshData.accessToken || refreshData.tokens?.accessToken || '').trim();
          const nextRefreshToken =
            (refreshData.refreshToken || refreshData.tokens?.refreshToken || refreshToken).trim();
          if (nextAccessToken) {
            setAccessToken(nextAccessToken);
            setRefreshToken(nextRefreshToken);
            await writeSessionToStorage({
              accessToken: nextAccessToken,
              ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
            });
            resolvedToken = nextAccessToken;
            response = await perform(resolvedToken);
          }
        }
      } catch {
        // Keep the original 401 handling below.
      }
    }

    if (!response.res.ok) {
      const body = (response.json || {}) as BackendEnvelope<unknown>;
      throw new Error(body.error?.message || body.message || `HTTP ${response.res.status}`);
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

  const mapBackendRoom = (room: BackendRoom, fallbackUserId?: string): Room => ({
    id: String(room.id || uid()),
    title: String(room.title || s.directRoomFallback),
    members:
      Array.isArray(room.members) && room.members.length
        ? room.members.map((member) => String(member))
        : [(fallbackUserId || currentUserId || MY_ID).trim() || MY_ID],
    isGroup: !!room.isGroup,
    favorite: !!room.favorite,
    muted: !!room.muted,
    unread: Math.max(0, Number(room.unread || 0)),
    preview: String(room.preview || ''),
    updatedAt: parseTimestamp(room.updatedAt),
  });

  const mapBackendMessage = (message: BackendRoomMessage): Message => {
    const senderId = String(message.senderId || '');
    return {
      id: String(message.id || uid()),
      roomId: String(message.roomId || activeRoomId || ''),
      senderId,
      senderName: String(message.senderName || getFriend(senderId)?.name || profile.name || s.me),
      mine: !!senderId && senderId === currentUserId,
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

  const markRoomAsRead = async (token: string, roomId: string, lastReadMessageId?: string) => {
    if (!token || !roomId) return;
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
    if (activeRoomRef.current === roomId) {
      await syncRoomMessagesFromBackend(token, roomId).catch(() => null);
    }
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

  const refreshFriendsAndRequests = async (token: string) => {
    const [backFriendsRaw, requestsRaw] = await Promise.all([
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
              status: String(f.status || ''),
              avatarUri: resolveBackendMediaUrl(String(f.avatarUri || '')),
              trusted: !!f.trusted,
            }))
        );
      }
    }

    if (requestsRaw) {
      setFriendRequestsIncoming(mapFriendRequests(requestsRaw.incoming));
      setFriendRequestsOutgoing(mapFriendRequests(requestsRaw.outgoing));
    }
  };

  const refreshRoomsFromBackend = async (token: string, fallbackUserId?: string): Promise<Room[] | null> => {
    const backRoomsRaw = await backendRequest<BackendRoom[] | BackendListData<BackendRoom>>(
      '/v1/rooms',
      { method: 'GET' },
      token
    ).catch(() => null);
    if (!backRoomsRaw) return null;
    const backRooms = asListItems<BackendRoom>(backRoomsRaw);
    if (!Array.isArray(backRooms)) return null;
    const mapped = backRooms
      .filter((r) => !!r?.id)
      .map((r) => mapBackendRoom(r, fallbackUserId));
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

  const syncInitialFromBackend = async (
    token: string,
    fallbackUser?: BackendAuthUser
  ): Promise<{ hasProfileName: boolean }> => {
    const tokenPayload = decodeJwtPayload(token);
    const me = await backendRequest<BackendProfile>('/v1/me', { method: 'GET' }, token).catch(
      () => null
    );
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

    await syncLocaleWithBackend(token, me?.locale);

    await refreshFriendsAndRequests(token);

    await refreshRoomsFromBackend(token, nextUserId);
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
            if (activeRoomRef.current === roomId) {
              void syncRoomMessagesFromBackend(token, roomId).catch(() => null);
            }
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
            void syncRoomMessagesFromBackend(token, roomId).catch(() => null);
          }
          return;
        }

        if (payload.event === 'room.unread.updated' && payload.data) {
          const roomId = typeof payload.data.roomId === 'string' ? payload.data.roomId : '';
          const unread = Number(payload.data.unread ?? Number.NaN);
          if (roomId && Number.isFinite(unread)) {
            setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, unread } : room)));
            if (unread === 0) {
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
          void Promise.all([refreshFriendsAndRequests(token), refreshRoomsFromBackend(token)]).catch(() => null);
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
      try {
        await backendRequest('/health', { method: 'GET' });
        if (cancelled) return;
        setBackendState('ready');
        setBackendStateMsg(s.loginServerReady);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setBackendState('error');
        setBackendStateMsg(msg ? `${s.loginServerError} (${msg})` : s.loginServerError);
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
    if (sessionRestoreStartedRef.current) return;
    sessionRestoreStartedRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const stored = await readSessionFromStorage();
        if (!stored?.accessToken) return;

        const applySession = async (nextAccessToken: string, nextRefreshToken?: string, user?: BackendAuthUser) => {
          setAccessToken(nextAccessToken);
          setRefreshToken((nextRefreshToken || '').trim());
          await syncInitialFromBackend(nextAccessToken, user);
          if (cancelled) return;
          setStage('app');
        };

        try {
          await applySession(stored.accessToken, stored.refreshToken);
          return;
        } catch {
          const storedRefreshToken = (stored.refreshToken || '').trim();
          if (!storedRefreshToken) throw new Error('missing refresh token');
          const refreshed = await backendRequest<BackendAuthData>('/v1/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });
          const nextAccessToken = (refreshed.accessToken || refreshed.tokens?.accessToken || '').trim();
          const nextRefreshToken =
            (refreshed.refreshToken || refreshed.tokens?.refreshToken || storedRefreshToken).trim();
          if (!nextAccessToken) throw new Error('missing access token');
          await writeSessionToStorage({
            accessToken: nextAccessToken,
            ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {})
          });
          await applySession(nextAccessToken, nextRefreshToken, refreshed.user);
        }
      } catch {
        if (cancelled) return;
        setAccessToken('');
        setRefreshToken('');
        await clearSessionInStorage();
      } finally {
        if (!cancelled) setIsSessionRestoring(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [backendState, isBackendConfigReady]);

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
        appVersion: Constants.expoConfig?.version || '1.0.0',
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
    setMessages((p) => ({ ...p, [rid]: updater(p[rid] ?? []) }));

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
    try {
      const normalized = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: 0 }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return normalized.uri || uri;
    } catch {
      return uri;
    }
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
    setRoomMsgs(rid, (prev) => [...prev, m]);
    touchRoom(rid, text, false);
  };

  const applyRealtimeMessage = async (token: string, roomId: string, rawMessage: BackendRoomMessage) => {
    const mapped = mapBackendMessage({ ...rawMessage, roomId: rawMessage.roomId || roomId });
    let inserted = false;

    setMessages((prev) => {
      const existing = prev[roomId] ?? [];
      const index = existing.findIndex((message) => message.id === mapped.id);
      if (index >= 0) {
        const next = [...existing];
        next[index] = { ...next[index], ...mapped };
        next.sort((a, b) => a.at - b.at);
        return { ...prev, [roomId]: next };
      }
      inserted = true;
      return { ...prev, [roomId]: [...existing, mapped].sort((a, b) => a.at - b.at) };
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
      title: getFriend(fid)?.name ?? s.directRoomFallback,
      members: [currentUserId, fid],
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

  const openRoom = (rid: string) => {
    activeRoomRef.current = rid;
    foregroundNotificationRoomId = rid;
    setActiveRoomId(rid);
    setTab('chats');
    setInput('');
    setDraftMedia(null);
    setRooms((p) => p.map((r) => (r.id === rid ? { ...r, unread: 0 } : r)));
    void dismissPresentedNotificationsForRoom(rid).catch(() => null);
    const token = accessToken.trim();
    if (token && appVisibility === 'active') {
      void markRoomAsRead(token, rid).catch(() => null);
    }
  };
  const closeActiveRoom = async () => {
    const rid = activeRoomRef.current;
    activeRoomRef.current = null;
    foregroundNotificationRoomId = '';
    const token = accessToken.trim();
    if (rid && token && appVisibility === 'active') {
      await markRoomAsRead(token, rid).catch(() => null);
      await refreshRoomsFromBackend(token).catch(() => null);
    }
    setActiveRoomId(null);
  };

  const refreshFriendTabData = async () => {
    const token = accessToken.trim();
    if (!token) return;
    setIsFriendSyncing(true);
    try {
      await refreshFriendsAndRequests(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg) Alert.alert(msg);
    } finally {
      setIsFriendSyncing(false);
    }
  };

  const openFriendModal = () => {
    setFriendLookupQuery('');
    setFriendLookupResults([]);
    setFriendLookupMsg('');
    setShowFriendModal(true);
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

  const createGroup = async () => {
    if (groupPick.length < 2) return;
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
          '/v1/rooms/group',
          {
            method: 'POST',
            body: JSON.stringify({ title, memberUserIds: groupPick }),
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
      title,
      members: [currentUserId, ...groupPick],
      isGroup: true,
      favorite: false,
      muted: false,
      unread: 0,
      preview: '',
      updatedAt: Date.now(),
    };
    setRooms((p) => [room, ...p]);
    setMessages((p) => ({ ...p, [rid]: [] }));
    appendSystem(rid, roomMembers(room));
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
            setRoomMsgs(activeRoom.id, (prev) => [...prev, mappedText]);
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
            setRoomMsgs(activeRoom.id, (prev) => [...prev, mappedMedia]);
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
    await openImageCrop(asset.uri, 'chat');
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
        quality: 0.9,
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
        quality: 0.9,
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
        quality: 0.9,
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
      setAccessToken(nextAccessToken);
      setRefreshToken(nextRefreshToken);
      await syncInitialFromBackend(nextAccessToken, authData.user);
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
      const renderWidth = Math.max(1, Math.round(crop.renderWidth));
      const renderHeight = Math.max(1, Math.round(crop.renderHeight));
      const resized = await ImageManipulator.manipulateAsync(
        crop.uri,
        [{ resize: { width: renderWidth, height: renderHeight } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const viewportW = Math.max(1, Math.round(viewport.width));
      const viewportH = Math.max(1, Math.round(viewport.height));
      const side = Math.max(1, Math.min(viewportW, viewportH, renderWidth, renderHeight));
      const maxOriginX = Math.max(0, renderWidth - side);
      const maxOriginY = Math.max(0, renderHeight - side);
      const originX = clamp(Math.round(-crop.offsetX), 0, maxOriginX);
      const originY = clamp(Math.round(-crop.offsetY), 0, maxOriginY);
      const out = await ImageManipulator.manipulateAsync(
        resized.uri,
        [
          { crop: { originX, originY, width: side, height: side } },
          { resize: { width: 640, height: 640 } },
        ],
        {
          compress: 0.9,
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
    if (!room || !room.isGroup) return;
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

  const reportRoom = (rid: string) => {
    appendSystem(rid, s.reported);
    setRoomMenuId(null);
  };

  const resetForLogout = () => {
    setAccessToken('');
    setRefreshToken('');
    pushTokenRef.current = '';
    registeredPushTokenRef.current = '';
    setCurrentUserId(MY_ID);
    setStage('login');
    setTab('chats');
    setActiveRoomId(null);
    setProfile({ name: '', status: '', email: '', avatarUri: '', localeTag: appLocaleTag });
    setNameDraft('');
    setStatusDraft('');
    setProfilePhotoDraft('');
    setFriends([]);
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
    setFriendActionKey('');
    setIsFriendSyncing(false);
    setInput('');
    setDraftMedia(null);
    setShowProfileModal(false);
    setShowFriendModal(false);
    setShowGroupModal(false);
    setRoomMenuId(null);
    setLoginErr('');
  };

  const switchBackendServer = async (nextUrl: string) => {
    const normalized = normalizeBackendBaseUrl(nextUrl);
    if (!normalized) {
      Alert.alert(isKo ? '서버 주소를 입력해 주세요.' : 'Enter a server URL.');
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
                  <Image source={{ uri: roomAvatarUri(activeRoom) }} style={styles.headerAvatar} />
                ) : (
                  <View style={[styles.headerAvatar, styles.headerAvatarFallbackSmall]}>
                    <Text style={styles.headerAvatarSmallText}>{roomTitle(activeRoom).slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>{roomTitle(activeRoom)}</Text>
                  {activeRoom.isGroup ? (
                    <Text style={styles.headerMeta}>
                      {`${activeRoomCompanions} ${isKo ? '명과 함께' : 'companions nearby'}`}
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
                              m.mine ? styles.mineRow : styles.otherRow,
                              !m.mine && m.kind !== 'system' ? styles.otherRowWithAvatar : null,
                            ]}
                          >
                            {!m.mine && m.kind !== 'system' ? (
                              <View style={styles.messageAvatarDock}>
                                {messageAvatarUri(m) ? (
                                  <Image source={{ uri: messageAvatarUri(m) }} style={styles.messageAvatar} />
                                ) : (
                                  <View style={styles.messageAvatarFallback}>
                                    <Text style={styles.messageAvatarText}>
                                      {(m.senderName || '?').slice(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            ) : null}
                            {!m.mine && m.kind !== 'system' ? (
                              <Text style={styles.roomSender}>{m.senderName}</Text>
                            ) : null}
                        <View style={[styles.bubble, m.mine ? styles.mineBubble : styles.otherBubble]}>
                          {m.kind === 'text' ? renderMessageText(m.text || '', m.mine) : null}
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
                            {m.mine ? (
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
                            <Text style={[styles.meta, m.mine && styles.metaMine]}>
                              {tLabel(m.at)}
                              {m.mine && m.delivery
                                ? ` · ${m.delivery === 'sending' ? s.sending : m.delivery === 'sent' ? s.sent : s.read}`
                                : ''}
                            </Text>
                          </View>
                          {m.mine && activeRoom.isGroup && m.readByNames?.length ? (
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
                    <Text style={styles.headerSection}>
                      {tab === 'friends' ? s.tabsFriends : tab === 'chats' ? s.tabsChats : s.tabsProfile}
                    </Text>
                  </View>
                </View>
                {tab === 'friends' ? (
                  <Pressable style={styles.iconDark} onPress={openFriendModal}>
                    <Ionicons name="person-add" size={18} color={FOREST.text} />
                  </Pressable>
                ) : tab === 'chats' ? (
                  <Pressable style={styles.iconDark} onPress={() => setShowGroupModal(true)}>
                    <Ionicons name="add" size={20} color={FOREST.text} />
                  </Pressable>
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
                    {sortedRooms.length === 0 && visibleBots.length === 0 ? (
                      <View style={[styles.empty, styles.emptyCove]}>
                        <Text style={styles.h1}>{s.noRooms}</Text>
                        <Text style={styles.sub}>{s.noRoomsBody}</Text>
                      </View>
                    ) : (
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
                        {favoriteRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '즐겨찾기' : 'Favorites'}</Text> : null}
                        {favoriteRooms.map(renderRoomRow)}
                        {otherRooms.length > 0 ? <Text style={styles.sectionTitle}>{isKo ? '대화방' : 'Chats'}</Text> : null}
                        {otherRooms.map(renderRoomRow)}
                      </>
                    )}
                  </ScrollView>
                ) : null}

                {tab === 'friends' ? (
                  <ScrollView contentContainerStyle={styles.list}>
                    {isFriendSyncing ? <Text style={styles.sub}>{s.friendLoading}</Text> : null}
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
                    <Pressable style={styles.logoutBtn} onPress={requestLogout}>
                      <Ionicons name="log-out-outline" size={16} color="#FFDADD" />
                      <Text style={styles.logoutText}>{s.logout}</Text>
                    </Pressable>
                  </ScrollView>
                ) : null}
              </View>

              <View style={styles.tabs}>
                <Pressable style={[styles.tab, tab === 'friends' && styles.tabOn]} onPress={() => setTab('friends')}>
                  <Ionicons name="people" size={18} color={tab === 'friends' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{s.tabsFriends}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'chats' && styles.tabOn]} onPress={() => setTab('chats')}>
                  <Ionicons name="chatbubbles" size={18} color={tab === 'chats' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{s.tabsChats}</Text>
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
                <Text style={styles.h1}>{s.groupTitle}</Text>
                <TextInput
                  style={styles.field}
                  placeholder={s.groupName}
                  placeholderTextColor={FOREST.placeholder}
                  value={groupNameDraft}
                  onChangeText={setGroupNameDraft}
                />
                <Text style={styles.sub}>{s.groupHint}</Text>
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
                    style={[styles.smallBtn, groupPick.length < 2 && styles.off]}
                    disabled={groupPick.length < 2}
                    onPress={() => {
                      void createGroup();
                    }}
                  >
                    <Text style={styles.smallBtnText}>{s.createRoom}</Text>
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
              behavior={kbBehavior}
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
                    <Pressable style={styles.item} onPress={() => toggleFavorite(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.favorite ? s.favoriteOff : s.favoriteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => toggleMute(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.muted ? s.muteOff : s.muteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => reportRoom(roomMenuId)}>
                      <Text style={styles.itemTitle}>{s.report}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => void deleteRoom(roomMenuId)}>
                      <Text style={[styles.itemTitle, { color: '#FFD4DE' }]}>
                        {s.leaveRoom}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
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
  viewerMedia: {
    width: '100%',
    height: 520,
    borderRadius: 18,
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

