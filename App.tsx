import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

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
};

type Friend = { id: string; name: string; status: string; trusted: boolean };
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
type Profile = { name: string; status: string; email: string; avatarUri: string };
type DraftMedia = { kind: 'image' | 'video'; uri: string };
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
};
type BackendFriend = {
  id?: string;
  name?: string;
  status?: string;
  trusted?: boolean;
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
const PROFILE_CROP_BOX = 260;
const SESSION_STORAGE_KEY = 'ourhangout.session.v1';
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

const TEXT = {
  en: {
    app: 'Our Hangout',
    login: 'Sign in',
    loginBody: 'Use Google sign-in, then set your profile.',
    google: 'Continue with Google',
    loginSkip: 'Continue without sign-in',
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
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove',
    startChat: 'Start chat',
    profileEdit: 'Edit profile',
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
    loginSkip: '로그인 없이 계속',
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
    save: '저장',
    cancel: '취소',
    remove: '삭제',
    startChat: '대화 시작',
    profileEdit: '프로필 수정',
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
  gradientTop: '#183127',
  gradientMid: '#31563A',
  gradientBottom: '#7FAA72',
  deep: '#102218',
  card: 'rgba(244,251,238,0.14)',
  cardStrong: 'rgba(244,251,238,0.2)',
  border: 'rgba(191,219,178,0.42)',
  text: '#F3F8EA',
  textSoft: 'rgba(227,242,218,0.88)',
  textMuted: 'rgba(208,229,198,0.78)',
  link: '#E8F7DC',
  button: '#6E9A5B',
  buttonBorder: '#A6C694',
  buttonSoft: 'rgba(162,208,146,0.3)',
  inputBg: '#F5F8EE',
  inputText: '#1D3527',
  placeholder: '#70856B',
  mineBubble: '#557F49',
  otherBubble: '#F2F7EC',
  sheetBg: 'rgba(16,39,26,0.98)',
  sheetBorder: 'rgba(178,213,163,0.45)',
  overlay: 'rgba(3,13,8,0.52)',
  iconDark: 'rgba(20,53,35,0.48)',
  iconLight: 'rgba(226,244,214,0.26)',
  badge: '#DF8058',
};

function App() {
  const locale = useMemo(localeKey, []);
  const s = TEXT[locale];
  const isKo = locale === 'ko';
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
  const toGoogleNativeRedirectUri = (clientId?: string): string => {
    const trimmed = (clientId || '').trim();
    const suffix = '.apps.googleusercontent.com';
    if (!trimmed || !trimmed.endsWith(suffix)) return '';
    const guid = trimmed.slice(0, -suffix.length);
    return guid ? `com.googleusercontent.apps.${guid}:/oauthredirect` : '';
  };
  const g = {
    androidClientId: pickValue(
      extra.googleAuth?.androidClientId,
      runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    ),
    iosClientId: pickValue(extra.googleAuth?.iosClientId, runtimeEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    webClientId: pickValue(extra.googleAuth?.webClientId, runtimeEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  };
  const androidGoogleClientId = pickValue(g.androidClientId, g.webClientId);
  const backendBaseUrl = pickValue(
    extra.backend?.baseUrl,
    runtimeEnv.EXPO_PUBLIC_BACKEND_BASE_URL
  )
    .replace(/\/+$/, '') || 'http://wowjini0228.synology.me:7083';

  const hasGoogle = !!Platform.select({
    android: androidGoogleClientId,
    ios: g.iosClientId || g.webClientId,
    default: g.webClientId,
  });
  const googleRedirectUri =
    Platform.OS === 'android'
      ? toGoogleNativeRedirectUri(androidGoogleClientId) || undefined
      : undefined;

  const [googleReq, googleRes, googlePrompt] = Google.useAuthRequest({
    androidClientId: androidGoogleClientId,
    iosClientId: g.iosClientId,
    webClientId: g.webClientId,
    redirectUri: googleRedirectUri,
    scopes: ['openid', 'profile', 'email'],
  });

  const [stage, setStage] = useState<Stage>('login');
  const [tab, setTab] = useState<Tab>('chats');
  const [profile, setProfile] = useState<Profile>({ name: '', status: '', email: '', avatarUri: '' });
  const [nameDraft, setNameDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [profilePhotoDraft, setProfilePhotoDraft] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [backendStateMsg, setBackendStateMsg] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [isSessionRestoring, setIsSessionRestoring] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(MY_ID);

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
  const [friendNameDraft, setFriendNameDraft] = useState('');
  const [friendStatusDraft, setFriendStatusDraft] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [roomMenuId, setRoomMenuId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const cropOpenedAtRef = useRef(0);
  const sessionRestoreStartedRef = useRef(false);

  const getFriend = (fid: string) => friends.find((f) => f.id === fid);
  const roomTitle = (room: Room) =>
    room.isGroup
      ? room.title
      : getFriend(room.members.find((m) => m !== MY_ID) ?? '')?.name ?? room.title;
  const roomMembers = (room: Room) =>
    room.members
      .filter((m) => m !== MY_ID)
      .map((m) => getFriend(m)?.name ?? '')
      .filter(Boolean)
      .join(', ');

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((a, b) =>
        a.favorite === b.favorite ? b.updatedAt - a.updatedAt : a.favorite ? -1 : 1
      ),
    [rooms]
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

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [activeRoomId, activeMsgs.length]);

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
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (!headers['Content-Type'] && init?.body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${backendBaseUrl}${path}`, { ...(init || {}), headers });
    const txt = await res.text();
    let json: unknown = null;
    if (txt) {
      try {
        json = JSON.parse(txt);
      } catch {
        json = {};
      }
    }
    if (!res.ok) {
      const body = (json || {}) as BackendEnvelope<unknown>;
      throw new Error(body.error?.message || body.message || `HTTP ${res.status}`);
    }
    return unwrapEnvelope<T>(json || {});
  };

  const parseTimestamp = (value: string | number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const ms = value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(ms) ? ms : Date.now();
  };

  const asListItems = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object' && Array.isArray((value as BackendListData<T>).items)) {
      return (value as BackendListData<T>).items ?? [];
    }
    return [];
  };

  const syncInitialFromBackend = async (
    token: string,
    fallbackUser?: BackendAuthUser
  ): Promise<{ hasProfileName: boolean }> => {
    const me = await backendRequest<BackendProfile>('/v1/me', { method: 'GET' }, token).catch(
      () => null
    );
    const nextUserId = (me?.id || fallbackUser?.id || MY_ID).trim();
    const resolvedName = (me?.name || fallbackUser?.name || fallbackUser?.displayName || '').trim();
    setCurrentUserId(nextUserId || MY_ID);
    setProfile((prev) => ({
      ...prev,
      name: resolvedName || prev.name || '',
      status: (me?.status || prev.status || '').trim(),
      email: (me?.email || fallbackUser?.email || prev.email || '').trim(),
      avatarUri: (me?.avatarUri || fallbackUser?.avatarUri || prev.avatarUri || '').trim(),
    }));
    setNameDraft(resolvedName);

    const backFriendsRaw = await backendRequest<BackendFriend[] | BackendListData<BackendFriend>>(
      '/v1/friends',
      { method: 'GET' },
      token
    ).catch(() => []);
    const backFriends = asListItems<BackendFriend>(backFriendsRaw);
    if (Array.isArray(backFriends)) {
      setFriends(
        backFriends
          .filter((f) => !!f?.id && !!f?.name)
          .map((f) => ({
            id: String(f.id),
            name: String(f.name),
            status: String(f.status || ''),
            trusted: !!f.trusted,
          }))
      );
    }

    const backRoomsRaw = await backendRequest<BackendRoom[] | BackendListData<BackendRoom>>(
      '/v1/rooms',
      { method: 'GET' },
      token
    ).catch(() => []);
    const backRooms = asListItems<BackendRoom>(backRoomsRaw);
    if (Array.isArray(backRooms)) {
      const mapped = backRooms
        .filter((r) => !!r?.id)
        .map((r) => ({
          id: String(r.id),
          title: String(r.title || s.directRoomFallback),
          members:
            Array.isArray(r.members) && r.members.length
              ? r.members.map((m) => String(m))
              : [nextUserId || MY_ID],
          isGroup: !!r.isGroup,
          favorite: !!r.favorite,
          muted: !!r.muted,
          unread: Math.max(0, Number(r.unread || 0)),
          preview: String(r.preview || ''),
          updatedAt: parseTimestamp(r.updatedAt),
        }));
      setRooms(mapped);
      setMessages((prev) => {
        const next = { ...prev };
        mapped.forEach((room) => {
          if (!next[room.id]) next[room.id] = [];
        });
        return next;
        });
    }
    return { hasProfileName: resolvedName.length > 0 };
  };

  useEffect(() => {
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
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [backendBaseUrl, s.loginServerError, s.loginServerReady]);

  useEffect(() => {
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
          const synced = await syncInitialFromBackend(nextAccessToken, user);
          if (cancelled) return;
          setStage(synced.hasProfileName ? 'app' : 'setup_name');
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
  }, [backendState]);

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
    let cancelled = false;
    const run = async () => {
      if (!googleRes) return;
      if (googleRes.type === 'error') {
        const maybeErr = (googleRes as { error?: { message?: string } }).error;
        const msg = (maybeErr?.message || '').trim();
        if (!cancelled) setLoginErr(msg ? `${s.loginFailed} (${msg})` : s.loginFailed);
        return;
      }
      if (googleRes.type !== 'success') return;
      const gParams = (googleRes.params as Record<string, string | undefined> | undefined) ?? {};
      const gAccessToken =
        googleRes.authentication?.accessToken || gParams.access_token || gParams.accessToken || '';
      const gIdToken =
        (googleRes.authentication as { idToken?: string } | undefined)?.idToken ||
        gParams.id_token ||
        gParams.idToken ||
        '';
      if (!gIdToken.trim()) {
        if (!cancelled) setLoginErr(s.loginFailed);
        return;
      }
      try {
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

        const authData = await postGoogleAuth(gIdToken, gAccessToken);
        if (cancelled) return;
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
        if (cancelled) return;
        setStage('setup_name');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setLoginErr(msg ? `${s.loginBackendAuthFailed} (${msg})` : s.loginBackendAuthFailed);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [googleRes, s.loginBackendAuthFailed, s.loginFailed]);

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

  const ensureDirectRoom = (fid: string) => {
    const old = rooms.find(
      (r) =>
        !r.isGroup &&
        r.members.length === 2 &&
        r.members.includes(MY_ID) &&
        r.members.includes(fid)
    );
    if (old) return old.id;

    const rid = uid();
    const room: Room = {
      id: rid,
      title: getFriend(fid)?.name ?? s.directRoomFallback,
      members: [MY_ID, fid],
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

  const openRoom = (rid: string) => {
    setActiveRoomId(rid);
    setTab('chats');
    setInput('');
    setDraftMedia(null);
    setRooms((p) => p.map((r) => (r.id === rid ? { ...r, unread: 0 } : r)));
  };

  const addFriend = () => {
    const name = friendNameDraft.trim();
    if (!name) return;
    if (friends.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      setShowFriendModal(false);
      return;
    }
    setFriends((p) => [
      ...p,
      { id: uid(), name, status: friendStatusDraft.trim(), trusted: false },
    ]);
    setFriendNameDraft('');
    setFriendStatusDraft('');
    setShowFriendModal(false);
  };

  const createGroup = () => {
    if (groupPick.length < 2) return;
    const rid = uid();
    const title =
      groupNameDraft.trim() ||
      groupPick
        .map((idv) => getFriend(idv)?.name ?? '')
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');

    const room: Room = {
      id: rid,
      title,
      members: [MY_ID, ...groupPick],
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

  const send = () => {
    if (!activeRoom) return;
    const text = input.trim();
    if (!text && !draftMedia) return;

    const out: Message[] = [];
    if (text) {
      out.push({
        id: uid(),
        roomId: activeRoom.id,
        senderId: MY_ID,
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
        senderId: MY_ID,
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

    const others = activeRoom.members.filter((m) => m !== MY_ID);
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
      if (r.canceled || !r.assets.length || !r.assets[0].uri) return;
      if (r.assets[0].type === 'video' || kind === 'video') {
        setDraftMedia({ kind: 'video', uri: r.assets[0].uri });
        return;
      }
      await openImageCrop(r.assets[0].uri, 'chat');
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
    if (!hasGoogle || !googleReq) {
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
      const res = await googlePrompt();
      if (res.type === 'success') return;
      if (res.type === 'cancel') {
        setLoginErr(s.loginCanceled);
        return;
      }
      if (res.type === 'dismiss') {
        setLoginErr(s.loginDismissed);
        return;
      }
      const maybeErr = (res as { error?: { message?: string } }).error;
      const msg = (maybeErr?.message || '').trim();
      setLoginErr(msg ? `${s.loginFailed} (${msg})` : s.loginFailed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setLoginErr(msg ? `${s.loginFailed} (${msg})` : s.loginFailed);
    }
  };

  const saveProfile = () => {
    const n = nameDraft.trim();
    if (!n) return;
    setProfile((p) => ({
      ...p,
      name: n,
      status: statusDraft.trim(),
      avatarUri: profilePhotoDraft.trim(),
    }));
    setShowProfileModal(false);
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
        setDraftMedia({ kind: 'image', uri: out.uri });
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

  const toggleFavorite = (rid: string) =>
    setRooms((p) => p.map((r) => (r.id === rid ? { ...r, favorite: !r.favorite } : r)));
  const toggleMute = (rid: string) =>
    setRooms((p) => p.map((r) => (r.id === rid ? { ...r, muted: !r.muted } : r)));
  const toggleTrusted = (fid: string) =>
    setFriends((p) => p.map((f) => (f.id === fid ? { ...f, trusted: !f.trusted } : f)));
  const toggleGroupPick = (fid: string) =>
    setGroupPick((p) => (p.includes(fid) ? p.filter((x) => x !== fid) : [...p, fid]));

  const deleteRoom = (rid: string) => {
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

  const kbBehavior = Platform.OS === 'ios' ? 'padding' : 'height';
  const sheetBottomInset = Math.max(insets.bottom, 12);
  const ForestBackdrop = () => (
    <>
      <View pointerEvents="none" style={styles.bgOrbTop} />
      <View pointerEvents="none" style={styles.bgOrbMid} />
      <View pointerEvents="none" style={styles.bgOrbBottom} />
    </>
  );

  if (stage === 'login') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={[FOREST.gradientTop, FOREST.gradientMid, FOREST.gradientBottom]} style={styles.fill}>
          <ForestBackdrop />
          <View style={styles.centerCard}>
            <Text style={styles.brand}>{s.app}</Text>
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
                    setStatusDraft((prev) => prev || profile.status || s.defaultStatus);
                    setProfilePhotoDraft((prev) => prev || profile.avatarUri || '');
                    setStage('setup_intro');
                    return;
                  }
                  setProfile((p) => ({
                    ...p,
                    name: nameDraft.trim() || p.name,
                    status: statusDraft.trim() || p.status || s.defaultStatus,
                    avatarUri: profilePhotoDraft.trim() || p.avatarUri,
                  }));
                  setStage('app');
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
              <View style={styles.header}>
                <Pressable style={styles.iconDark} onPress={() => setActiveRoomId(null)}>
                  <Ionicons name="chevron-back" size={18} color={FOREST.text} />
                </Pressable>
                <Text style={styles.title}>{roomTitle(activeRoom)}</Text>
                <Pressable style={styles.iconDark} onPress={() => setRoomMenuId(activeRoom.id)}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={FOREST.text} />
                </Pressable>
              </View>

              <View style={styles.main}>
                <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
                  {activeMsgs.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.sub}>{s.noMsg}</Text>
                      <Pressable style={styles.btn} onPress={() => setInput(s.hello)}>
                        <Text style={styles.btnText}>{s.firstMsg}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    activeMsgs.map((m) => (
                      <View key={m.id} style={[styles.bubbleRow, m.mine ? styles.mineRow : styles.otherRow]}>
                        <View style={[styles.bubble, m.mine ? styles.mineBubble : styles.otherBubble]}>
                          {m.kind === 'text' ? renderMessageText(m.text || '', m.mine) : null}
                          {m.kind === 'image' ? <Image source={{ uri: m.uri }} style={styles.media} /> : null}
                          {m.kind === 'video' ? (
                            <View style={[styles.media, styles.video]}>
                              <Ionicons name="play-circle" size={34} color="#E7F4FF" />
                            </View>
                          ) : null}
                          {m.kind === 'system' ? <Text style={styles.system}>{m.text}</Text> : null}
                          <Text style={[styles.meta, m.mine && styles.metaMine]}>
                            {tLabel(m.at)}
                            {m.mine && m.delivery
                              ? ` · ${m.delivery === 'sending' ? s.sending : m.delivery === 'sent' ? s.sent : s.read}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>

              <View style={styles.composer}>
                {draftMedia ? (
                  <View style={styles.draft}>
                    <Text style={styles.sub}>{draftMedia.kind === 'image' ? s.imageSelected : s.videoSelected}</Text>
                    <Pressable onPress={() => setDraftMedia(null)}>
                      <Ionicons name="close-circle" size={18} color={FOREST.text} />
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Pressable style={styles.iconLight} onPress={() => pickMedia('image')}>
                    <Ionicons name="image" size={16} color={FOREST.text} />
                  </Pressable>
                  <Pressable style={styles.iconLight} onPress={() => pickMedia('video')}>
                    <Ionicons name="videocam" size={16} color={FOREST.text} />
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
                    style={[styles.send, !input.trim() && !draftMedia && styles.off]}
                    disabled={!input.trim() && !draftMedia}
                    onPress={send}
                  >
                    <Ionicons name="arrow-up" size={16} color="#fff" />
                  </Pressable>
                </View>
                <Text style={styles.sub}>{s.safe}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>{s.app}</Text>
                <Pressable
                  style={styles.iconDark}
                  onPress={() => {
                    setNameDraft(profile.name);
                    setStatusDraft(profile.status);
                    setProfilePhotoDraft(profile.avatarUri);
                    setShowProfileModal(true);
                  }}
                >
                  {profile.avatarUri ? (
                    <Image source={{ uri: profile.avatarUri }} style={styles.headerAvatar} />
                  ) : (
                    <Ionicons name="person-circle" size={18} color={FOREST.text} />
                  )}
                </Pressable>
              </View>

              <View style={styles.main}>
                {tab === 'chats' ? (
                  <>
                    <View style={styles.row}>
                      <Pressable style={styles.smallBtn} onPress={() => setShowGroupModal(true)}>
                        <Text style={styles.smallBtnText}>{s.newGroup}</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtn} onPress={() => setTab('friends')}>
                        <Text style={styles.smallBtnText}>{s.goFriends}</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.field}
                      placeholder={s.searchChats}
                      placeholderTextColor={FOREST.placeholder}
                      value={chatQuery}
                      onChangeText={setChatQuery}
                    />
                    {sortedRooms.length === 0 ? (
                      <View style={styles.empty}>
                        <Text style={styles.h1}>{s.noRooms}</Text>
                        <Text style={styles.sub}>{s.noRoomsBody}</Text>
                      </View>
                    ) : filteredRooms.length === 0 ? (
                      <View style={styles.empty}>
                        <Text style={styles.sub}>{s.noSearchRooms}</Text>
                      </View>
                    ) : (
                      <ScrollView contentContainerStyle={styles.list}>
                        {filteredRooms.map((r) => (
                          <Pressable key={r.id} style={styles.item} onPress={() => openRoom(r.id)}>
                            <View style={styles.listAvatar}>
                              <Text style={styles.listAvatarText}>
                                {roomTitle(r).slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemTitle}>{roomTitle(r)}</Text>
                              <Text style={styles.sub} numberOfLines={1}>{r.preview || roomMembers(r)}</Text>
                            </View>
                            <View style={styles.itemRight}>
                              {r.unread > 0 ? (
                                <View style={styles.badge}>
                                  <Text style={styles.badgeText}>{r.unread > 99 ? '99+' : r.unread}</Text>
                                </View>
                              ) : null}
                              <Pressable style={styles.iconLight} onPress={() => toggleFavorite(r.id)}>
                                <Ionicons name={r.favorite ? 'star' : 'star-outline'} size={16} color={r.favorite ? '#FFD27A' : FOREST.text} />
                              </Pressable>
                              <Pressable style={styles.iconLight} onPress={() => setRoomMenuId(r.id)}>
                                <Ionicons name="ellipsis-horizontal" size={16} color={FOREST.text} />
                              </Pressable>
                            </View>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </>
                ) : null}

                {tab === 'friends' ? (
                  <>
                    <View style={styles.row}>
                      <Pressable style={styles.smallBtn} onPress={() => setShowFriendModal(true)}>
                        <Text style={styles.smallBtnText}>{s.addFriend}</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtn} onPress={() => setShowGroupModal(true)}>
                        <Text style={styles.smallBtnText}>{s.newGroup}</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.field}
                      placeholder={s.searchFriends}
                      placeholderTextColor={FOREST.placeholder}
                      value={friendQuery}
                      onChangeText={setFriendQuery}
                    />
                    {friends.length === 0 ? (
                      <View style={styles.empty}><Text style={styles.sub}>{s.noFriends}</Text></View>
                    ) : filteredFriends.length === 0 ? (
                      <View style={styles.empty}><Text style={styles.sub}>{s.noSearchFriends}</Text></View>
                    ) : (
                      <ScrollView contentContainerStyle={styles.list}>
                        {filteredFriends.map((f) => (
                          <View key={f.id} style={styles.item}>
                            <View style={styles.listAvatar}>
                              <Text style={styles.listAvatarText}>
                                {f.name.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemTitle}>{f.name}</Text>
                              <Text style={styles.sub}>{f.status || s.startChat}</Text>
                            </View>
                            <Pressable style={styles.iconLight} onPress={() => toggleTrusted(f.id)}>
                              <Ionicons name={f.trusted ? 'shield-checkmark' : 'shield-outline'} size={16} color={FOREST.text} />
                            </Pressable>
                            <Pressable style={styles.iconLight} onPress={() => openRoom(ensureDirectRoom(f.id))}>
                              <Ionicons name="chatbubble-ellipses" size={16} color={FOREST.text} />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </>
                ) : null}

                {tab === 'profile' ? (
                  <ScrollView contentContainerStyle={styles.list}>
                    <View style={styles.item}>
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
                      <View style={styles.profileMeta}>
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
                    </View>
                    <View style={styles.row}>
                      <View style={styles.stat}><Text style={styles.itemTitle}>{stats.friends}</Text><Text style={styles.sub}>{s.statsFriends}</Text></View>
                      <View style={styles.stat}><Text style={styles.itemTitle}>{stats.rooms}</Text><Text style={styles.sub}>{s.statsRooms}</Text></View>
                      <View style={styles.stat}><Text style={styles.itemTitle}>{stats.favs}</Text><Text style={styles.sub}>{s.statsFavs}</Text></View>
                    </View>
                  </ScrollView>
                ) : null}
              </View>

              <View style={styles.tabs}>
                <Pressable style={[styles.tab, tab === 'chats' && styles.tabOn]} onPress={() => setTab('chats')}>
                  <Ionicons name="chatbubbles" size={18} color={tab === 'chats' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{s.tabsChats}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'friends' && styles.tabOn]} onPress={() => setTab('friends')}>
                  <Ionicons name="people" size={18} color={tab === 'friends' ? FOREST.text : FOREST.textMuted} />
                  <Text style={styles.tabText}>{s.tabsFriends}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'profile' && styles.tabOn]} onPress={() => setTab('profile')}>
                  <Ionicons name="leaf" size={18} color={tab === 'profile' ? FOREST.text : FOREST.textMuted} />
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
              behavior={kbBehavior}
            >
              <View style={styles.sheet}>
                <Text style={styles.h1}>{s.addFriend}</Text>
                <TextInput
                  style={styles.field}
                  placeholder={s.friendName}
                  placeholderTextColor={FOREST.placeholder}
                  value={friendNameDraft}
                  onChangeText={setFriendNameDraft}
                />
                <TextInput
                  style={styles.field}
                  placeholder={s.friendStatus}
                  placeholderTextColor={FOREST.placeholder}
                  value={friendStatusDraft}
                  onChangeText={setFriendStatusDraft}
                />
                <View style={styles.row}>
                  <Pressable style={styles.smallBtn} onPress={() => setShowFriendModal(false)}>
                    <Text style={styles.smallBtnText}>{s.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, !friendNameDraft.trim() && styles.off]}
                    disabled={!friendNameDraft.trim()}
                    onPress={addFriend}
                  >
                    <Text style={styles.smallBtnText}>{s.save}</Text>
                  </Pressable>
                </View>
              </View>
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
                    onPress={createGroup}
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
                    <Pressable style={styles.item} onPress={() => toggleFavorite(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.favorite ? s.favoriteOff : s.favoriteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => toggleMute(roomMenuId)}>
                      <Text style={styles.itemTitle}>{roomMap.get(roomMenuId)?.muted ? s.muteOff : s.muteOn}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => reportRoom(roomMenuId)}>
                      <Text style={styles.itemTitle}>{s.report}</Text>
                    </Pressable>
                    <Pressable style={styles.item} onPress={() => deleteRoom(roomMenuId)}>
                      <Text style={[styles.itemTitle, { color: '#FFD4DE' }]}>
                        {roomMap.get(roomMenuId)?.isGroup ? s.leaveRoom : s.deleteRoom}
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
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(202,228,166,0.24)',
  },
  bgOrbMid: {
    position: 'absolute',
    top: 210,
    left: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(124,170,114,0.23)',
  },
  bgOrbBottom: {
    position: 'absolute',
    bottom: -90,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(235,209,156,0.2)',
  },
  centerCard: {
    margin: 16,
    marginTop: 54,
    borderRadius: 24,
    padding: 18,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 12,
  },
  brand: { color: FOREST.text, fontSize: 31, textAlign: 'center', fontWeight: '800', letterSpacing: 0.3 },
  h1: { color: FOREST.text, fontSize: 20, fontWeight: '800' },
  title: { color: FOREST.text, fontSize: 18, fontWeight: '800', flex: 1 },
  sub: { color: FOREST.textSoft, fontSize: 13, lineHeight: 19 },
  btn: {
    borderRadius: 14,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FOREST.button,
    borderWidth: 1,
    borderColor: FOREST.buttonBorder,
  },
  btnText: { color: FOREST.text, fontSize: 15, fontWeight: '800' },
  smallBtn: {
    borderRadius: 12,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 13,
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
    borderRadius: 20,
    padding: 12,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconDark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: FOREST.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: { width: 30, height: 30, borderRadius: 15 },
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
    borderRadius: 20,
    padding: 12,
    backgroundColor: FOREST.card,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 10,
  },
  list: { gap: 10, paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  item: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(246,252,241,0.16)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: { color: FOREST.text, fontSize: 15, fontWeight: '700' },
  itemRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(141,191,121,0.36)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  listAvatarText: { color: FOREST.text, fontSize: 15, fontWeight: '800' },
  profileHero: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: 'rgba(232,246,220,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: { width: '100%', height: '100%' },
  profileAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(141,191,121,0.38)',
  },
  profileAvatarText: { color: FOREST.text, fontSize: 24, fontWeight: '800' },
  profileMeta: { flex: 1, gap: 3 },
  profileStatus: { color: FOREST.text, fontSize: 14, fontWeight: '600' },
  stat: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 3,
  },
  tabs: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    padding: 7,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    gap: 7,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    minHeight: 62,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabOn: {
    backgroundColor: FOREST.buttonSoft,
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  tabText: { color: FOREST.text, fontSize: 14, fontWeight: '700' },
  bubbleRow: { width: '100%' },
  mineRow: { alignItems: 'flex-end' },
  otherRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 12 },
  mineBubble: { backgroundColor: FOREST.mineBubble },
  otherBubble: {
    backgroundColor: FOREST.otherBubble,
    borderWidth: 1,
    borderColor: 'rgba(146,175,137,0.35)',
  },
  msg: { color: '#1D3528', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  msgMine: { color: FOREST.text },
  msgLink: { color: '#2D6EEA', textDecorationLine: 'underline', fontWeight: '700' },
  msgLinkMine: { color: '#F0FFD8' },
  meta: { marginTop: 5, color: 'rgba(26,53,37,0.6)', fontSize: 11, fontWeight: '600' },
  metaMine: { color: 'rgba(238,249,232,0.88)' },
  system: { color: '#355B3A', fontSize: 12, fontWeight: '700' },
  media: { width: 196, height: 136, borderRadius: 12, backgroundColor: '#31563A' },
  video: { alignItems: 'center', justifyContent: 'center' },
  composer: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    padding: 10,
    backgroundColor: FOREST.cardStrong,
    borderWidth: 1,
    borderColor: FOREST.border,
    gap: 8,
  },
  draft: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(229,246,220,0.22)',
    borderWidth: 1,
    borderColor: FOREST.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  field: {
    width: '100%',
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: FOREST.inputBg,
    color: FOREST.inputText,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(157,189,147,0.55)',
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: FOREST.inputBg,
    color: FOREST.inputText,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(157,189,147,0.55)',
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(246,252,241,0.15)',
    borderWidth: 1,
    borderColor: FOREST.border,
  },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: FOREST.overlay },
  sheetWrap: { width: '100%' },
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

