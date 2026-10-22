import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { BottomNav } from './components/BottomNav';
import { ChatsScreen } from './screens/ChatsScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { LaunchScreen } from './screens/LaunchScreen';
import { LoginScreen } from './screens/LoginScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RoomScreen } from './screens/RoomScreen';
import {
  asListItems,
  BackendClient,
  isSessionInvalidError,
  normalizeBackendBaseUrl,
  reconnectDelayMs,
  toWsBaseUrl,
} from './services/backend';
import {
  clearSession,
  readSession,
  writeSession,
  type PersistedSession,
} from './services/session';
import { uploadAttachment, uploadAvatar } from './services/media';
import {
  colorForId,
  formatTime,
  mapFriend,
  mapFriendRequest,
  mapMessage,
  mapProfile,
  mapRoom,
  mergeMessages,
  previewForMessage,
} from './services/mappers';
import { colors } from './theme';
import type {
  AttachmentDraft,
  AuthState,
  BackendAuthData,
  BackendAuthUser,
  BackendFamilyRoomLocationList,
  BackendFriend,
  BackendFriendRequestList,
  BackendListData,
  BackendLocationRefreshRequest,
  BackendProfile,
  BackendRoom,
  BackendRoomMessage,
  BackendRoomRead,
  BackendUserLocation,
  FamilyLocation,
  FriendRequestView,
  Message,
  Profile,
  Room,
  ServerState,
  TabKey,
  User,
} from './types';

const DEFAULT_BACKEND_BASE_URL = 'http://wowjini0228.synology.me:7083';
const DEFAULT_GOOGLE_ANDROID_CLIENT_ID =
  '599659668409-311tkiv1ikkk55apu33h9j9pfk2rkvof.apps.googleusercontent.com';
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '599659668409-jo6tdh99iht1tle9mf089k8ba3en08ou.apps.googleusercontent.com';
const REALTIME_UNSTABLE_MESSAGE = '실시간 연결이 불안정합니다. 자동으로 다시 연결합니다.';

type RuntimeExtra = {
  backend?: {
    baseUrl?: string;
  };
  googleAuth?: {
    androidClientId?: string;
    iosClientId?: string;
    webClientId?: string;
  };
};

type SyncInitialOptions = {
  fallbackUser?: BackendAuthUser;
  silent?: boolean;
};

type NativeLocationCaptureModule = {
  storeSession: (accessToken: string, refreshToken?: string) => Promise<boolean>;
  clearSession: () => Promise<boolean>;
  startCapture: (
    baseUrl: string,
    accessToken: string,
    refreshToken: string,
    source: string,
    precise: boolean
  ) => Promise<boolean>;
  startCaptureWithRequest: (
    baseUrl: string,
    requestToken: string,
    source: string,
    precise: boolean
  ) => Promise<boolean>;
};

type NativePushTokenModule = {
  getToken: () => Promise<string>;
  deleteToken?: () => Promise<boolean>;
};

type LocationPermissionState = {
  foreground: boolean;
  background: boolean;
};

const NativeLocationCapture = NativeModules.LocationCaptureModule as
  | NativeLocationCaptureModule
  | undefined;
const NativePushToken = NativeModules.PushTokenModule as NativePushTokenModule | undefined;

const initialProfile: Profile = {
  id: 'me',
  role: 'me',
  name: '나',
  alias: '나',
  status: '',
  color: colorForId('me'),
  online: true,
  locationSharingEnabled: false,
};

function uid(prefix = 'local'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function runtimeConfig() {
  const extra = (Constants.expoConfig?.extra || {}) as RuntimeExtra;
  return {
    baseUrl: normalizeBackendBaseUrl(extra.backend?.baseUrl || DEFAULT_BACKEND_BASE_URL),
    googleAndroidClientId: String(extra.googleAuth?.androidClientId || DEFAULT_GOOGLE_ANDROID_CLIENT_ID).trim(),
    googleIosClientId: String(extra.googleAuth?.iosClientId || '').trim(),
    googleWebClientId: String(extra.googleAuth?.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID).trim(),
    appVersion: String(Constants.expoConfig?.version || '0.1.0').trim(),
  };
}

function constantsDeviceId(): string {
  const constants = Constants as typeof Constants & {
    deviceName?: string;
    sessionId?: string;
  };
  return String(constants.deviceName || constants.sessionId || 'unknown').trim();
}

function normalizeErrorMessage(error: unknown): string {
  if (isSessionInvalidError(error)) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  if (error instanceof Error) {
    const code = String((error as { code?: string }).code || '').trim();
    const message = String(error.message || '').trim();
    if (code === 'DEVELOPER_ERROR' || message.includes('DEVELOPER_ERROR')) {
      return 'Google 로그인 설정이 패키지명(com.ourhangout)에 맞게 등록되지 않았습니다. OAuth Android client의 package name과 SHA-1을 확인해 주세요.';
    }
    if (code === 'NETWORK_TIMEOUT') {
      return '서버 응답이 지연되고 있습니다. 네트워크 상태를 확인해 주세요.';
    }
    if ((error as { status?: number }).status === 429) {
      return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if ((error as { status?: number }).status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    if (message) return message;
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

function resolveRemoteUri(baseUrl: string, value?: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^(https?|file|content):\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
  return trimmed;
}

function normalizeRoomTitle(room: Room, users: Record<string, User>, currentUserId: string): Room {
  if (room.type !== 'direct') return room;
  const peer = room.memberIds.map((id) => users[id]).find((user) => user && user.id !== currentUserId);
  if (!peer) return room;
  const title = peer.alias || peer.name;
  return title && title !== room.title ? { ...room, title } : room;
}

function mapFamilyLocations(value: BackendUserLocation[] | undefined): FamilyLocation[] {
  return (value || [])
    .map((item) => {
      const userId = String(item.userId || '').trim();
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      if (!userId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        userId,
        name: String(item.name || '').trim(),
        latitude,
        longitude,
        ...(Number.isFinite(Number(item.accuracyM)) ? { accuracyM: Number(item.accuracyM) } : {}),
        ...(item.capturedAt ? { capturedAt: String(item.capturedAt) } : {}),
        ...(item.source ? { source: String(item.source) } : {}),
        locationSharingEnabled: item.locationSharingEnabled !== false,
      };
    })
    .filter((item): item is FamilyLocation => !!item);
}

function formatLocationTime(value?: string): string {
  if (!value) return '아직 없음';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '최근 위치';
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return new Date(timestamp).toLocaleDateString('ko-KR');
}

function RenewalApp() {
  const insets = useSafeAreaInsets();
  const config = useMemo(runtimeConfig, []);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [serverState, setServerState] = useState<ServerState>('checking');
  const [session, setSession] = useState<PersistedSession | null>(null);
  const sessionRef = useRef<PersistedSession | null>(null);
  const pushTokenRef = useRef('');
  const registeredPushTokenRef = useRef('');
  const [tab, setTab] = useState<TabKey>('people');
  const tabRef = useRef<TabKey>('people');
  const tabHistoryRef = useRef<TabKey[]>([]);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const profileRef = useRef<Profile>(initialProfile);
  const [users, setUsers] = useState<Record<string, User>>({ [initialProfile.id]: initialProfile });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [directReadCutoffs, setDirectReadCutoffs] = useState<Record<string, number>>({});
  const [friendRequests, setFriendRequests] = useState<FriendRequestView[]>([]);
  const [familyLocations, setFamilyLocations] = useState<FamilyLocation[]>([]);
  const [familyLocationRoomId, setFamilyLocationRoomId] = useState<string | null>(null);
  const [familyLocationLoading, setFamilyLocationLoading] = useState(false);
  const [familyLocationActionKey, setFamilyLocationActionKey] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomInitialUnread, setActiveRoomInitialUnread] = useState(0);
  const activeRoomRef = useRef<string | null>(null);
  const currentUserIdRef = useRef(initialProfile.id);
  const [chatQuery, setChatQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomErrorMessage, setRoomErrorMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [wsAttempt, setWsAttempt] = useState(0);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const authStateRef = useRef<AuthState>('checking');
  const usersRef = useRef<Record<string, User>>({ [initialProfile.id]: initialProfile });
  const roomsRef = useRef<Room[]>([]);
  const messagesRef = useRef<Record<string, Message[]>>({});
  const bootstrapStartedRef = useRef(false);
  const syncInitialRef = useRef<Promise<boolean> | null>(null);
  const peopleRefreshRef = useRef<Promise<User[]> | null>(null);
  const roomsRefreshRef = useRef<Promise<Room[]> | null>(null);
  const roomMessagesRefreshRef = useRef<Partial<Record<string, Promise<Message[]>>>>({});

  useEffect(() => {
    profileRef.current = profile;
    currentUserIdRef.current = profile.id;
  }, [profile]);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);

  const navigateTab = useCallback((nextTab: TabKey) => {
    setTab((currentTab) => {
      if (currentTab === nextTab) return currentTab;
      tabHistoryRef.current = [...tabHistoryRef.current, currentTab].slice(-8);
      tabRef.current = nextTab;
      return nextTab;
    });
  }, []);

  const saveSessionSynced = useCallback(async (nextSession: PersistedSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (nextSession) {
      if (Platform.OS === 'android') {
        await NativeLocationCapture?.storeSession(
          nextSession.accessToken,
          nextSession.refreshToken || ''
        ).catch(() => false);
      }
      await writeSession(nextSession);
    } else {
      if (Platform.OS === 'android') {
        await NativeLocationCapture?.clearSession().catch(() => false);
      }
      await clearSession();
    }
  }, []);

  const client = useMemo(
    () =>
      new BackendClient({
        baseUrl: config.baseUrl,
        getSession: () => sessionRef.current,
        saveSession: saveSessionSynced,
        onSessionExpired: (error) => {
          setAuthState('signedOut');
          setErrorMessage(normalizeErrorMessage(error));
        },
      }),
    [config.baseUrl, saveSessionSynced]
  );

  const resolveUri = useCallback(
    (value?: string | null) => resolveRemoteUri(client.getBaseUrl(), value),
    [client]
  );

  const mapProfileForApp = useCallback(
    (raw: BackendProfile, fallback?: Partial<Profile>): Profile => {
      const mapped = mapProfile(raw, fallback);
      const avatarUri = resolveUri(mapped.avatarUri);
      return {
        ...mapped,
        ...(avatarUri ? { avatarUri } : { avatarUri: undefined }),
      };
    },
    [resolveUri]
  );

  const mapFriendForApp = useCallback(
    (raw: BackendFriend): User | null => {
      const mapped = mapFriend(raw);
      if (!mapped) return null;
      const avatarUri = resolveUri(mapped.avatarUri);
      return {
        ...mapped,
        ...(avatarUri ? { avatarUri } : { avatarUri: undefined }),
      };
    },
    [resolveUri]
  );

  const mapMessageForApp = useCallback(
    (raw: BackendRoomMessage, fallbackRoomId = ''): Message | null => {
      const mapped = mapMessage(raw, currentUserIdRef.current, fallbackRoomId);
      if (!mapped) return null;
      const uri = resolveUri(mapped.uri);
      return {
        ...mapped,
        ...(uri ? { uri } : { uri: undefined }),
      };
    },
    [resolveUri]
  );

  const commitProfile = useCallback((nextProfile: Profile) => {
    profileRef.current = nextProfile;
    currentUserIdRef.current = nextProfile.id;
    setProfile(nextProfile);
    const nextUsers = {
      ...usersRef.current,
      [nextProfile.id]: nextProfile,
    };
    usersRef.current = nextUsers;
    setUsers(nextUsers);
  }, []);

  const commitFriends = useCallback((friends: User[]) => {
    const currentProfile = profileRef.current;
    const nextUsers: Record<string, User> = {
      [currentProfile.id]: currentProfile,
    };
    friends.forEach((friend) => {
      nextUsers[friend.id] = friend;
    });
    usersRef.current = nextUsers;
    setUsers(nextUsers);
    setRooms((prev) => {
      const nextRooms = prev.map((room) => normalizeRoomTitle(room, nextUsers, currentProfile.id));
      roomsRef.current = nextRooms;
      return nextRooms;
    });
  }, []);

  const refreshPeople = useCallback(async () => {
    if (peopleRefreshRef.current) return peopleRefreshRef.current;

    const request = (async () => {
      const friendRaw = await client.request<BackendFriend[] | BackendListData<BackendFriend>>(
        '/v1/friends',
        { method: 'GET' },
        { rateLimitRetries: 1 }
      );
      const requestRaw = await client
        .request<BackendFriendRequestList>(
          '/v1/friends/requests',
          { method: 'GET' },
          { rateLimitRetries: 0 }
        )
        .catch(() => ({ incoming: [], outgoing: [] }));

      const friends = asListItems<BackendFriend>(friendRaw)
        .map(mapFriendForApp)
        .filter((friend): friend is User => !!friend);
      const incoming = (requestRaw.incoming || [])
        .map((item) => mapFriendRequest(item, 'incoming'))
        .filter((item): item is FriendRequestView => !!item);
      const outgoing = (requestRaw.outgoing || [])
        .map((item) => mapFriendRequest(item, 'outgoing'))
        .filter((item): item is FriendRequestView => !!item);

      commitFriends(friends);
      setFriendRequests([...incoming, ...outgoing]);
      return friends;
    })();

    peopleRefreshRef.current = request;
    try {
      return await request;
    } finally {
      if (peopleRefreshRef.current === request) peopleRefreshRef.current = null;
    }
  }, [client, commitFriends, mapFriendForApp]);

  const refreshRooms = useCallback(async () => {
    if (roomsRefreshRef.current) return roomsRefreshRef.current;

    const request = (async () => {
      const raw = await client.request<BackendRoom[] | BackendListData<BackendRoom>>(
        '/v1/rooms',
        { method: 'GET' },
        { rateLimitRetries: 2, timeoutMs: 15000 }
      );
      const nextRooms = asListItems<BackendRoom>(raw)
        .map((item) => mapRoom(item, currentUserIdRef.current))
        .filter((room): room is Room => !!room)
        .map((room) => normalizeRoomTitle(room, usersRef.current, currentUserIdRef.current));
      const sorted = sortRooms(nextRooms);
      roomsRef.current = sorted;
      setRooms(sorted);
      setMessages((prev) => {
        const next = { ...prev };
        sorted.forEach((room) => {
          if (!next[room.id]) next[room.id] = [];
        });
        messagesRef.current = next;
        return next;
      });
      return sorted;
    })();

    roomsRefreshRef.current = request;
    try {
      return await request;
    } finally {
      if (roomsRefreshRef.current === request) roomsRefreshRef.current = null;
    }
  }, [client]);

  const requestLocationPermissions = useCallback(async (): Promise<LocationPermissionState> => {
    if (Platform.OS !== 'android') return { foreground: true, background: true };

    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
    const foregroundResult = await PermissionsAndroid.requestMultiple([fine, coarse]);
    const foreground =
      foregroundResult[fine] === PermissionsAndroid.RESULTS.GRANTED ||
      foregroundResult[coarse] === PermissionsAndroid.RESULTS.GRANTED;

    if (!foreground) {
      Alert.alert('위치 권한이 필요해요', '가족 위치 확인을 사용하려면 위치 권한을 허용해 주세요.');
      return { foreground: false, background: false };
    }

    const androidVersion = Number(Platform.Version);
    if (Number.isFinite(androidVersion) && androidVersion >= 33) {
      const notificationPermission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      const hasNotificationPermission = await PermissionsAndroid.check(notificationPermission).catch(() => true);
      if (!hasNotificationPermission) {
        await PermissionsAndroid.request(notificationPermission).catch(() => PermissionsAndroid.RESULTS.DENIED);
      }
    }

    let background = true;
    if (Number.isFinite(androidVersion) && androidVersion >= 29) {
      const backgroundPermission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
      const currentBackground = await PermissionsAndroid.check(backgroundPermission).catch(() => false);
      background = currentBackground;
      if (!background) {
        const requested = await PermissionsAndroid.request(backgroundPermission).catch(() => 'denied');
        background = requested === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!background) {
        Alert.alert(
          '항상 허용이 필요할 수 있어요',
          '아이 앱이 백그라운드에 있을 때도 위치 요청에 응답하려면 Android 설정에서 위치 권한을 항상 허용으로 바꿔 주세요.',
          [
            { text: '나중에' },
            { text: '설정 열기', onPress: () => void Linking.openSettings() },
          ]
        );
      }
    }

    return { foreground, background };
  }, []);

  const startLocationCapture = useCallback(
    async (source: string, precise = true, requestToken = '') => {
      if (Platform.OS !== 'android' || !NativeLocationCapture) return false;
      const baseUrl = client.getBaseUrl();
      if (!baseUrl) return false;
      if (requestToken) {
        return NativeLocationCapture.startCaptureWithRequest(baseUrl, requestToken, source, precise).catch(() => false);
      }

      const accessToken = String(sessionRef.current?.accessToken || '').trim();
      const refreshToken = String(sessionRef.current?.refreshToken || '').trim();
      if (!accessToken && !refreshToken) return false;
      return NativeLocationCapture.startCapture(baseUrl, accessToken, refreshToken, source, precise).catch(() => false);
    },
    [client]
  );

  const requestDevicePushToken = useCallback(async (): Promise<string> => {
    if (Platform.OS !== 'android' || !NativePushToken?.getToken) return '';

    const androidVersion = Number(Platform.Version);
    if (Number.isFinite(androidVersion) && androidVersion >= 33) {
      const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      const granted = await PermissionsAndroid.check(permission).catch(() => false);
      if (!granted) {
        await PermissionsAndroid.request(permission).catch(() => PermissionsAndroid.RESULTS.DENIED);
      }
    }

    const pushToken = await NativePushToken.getToken().catch(() => '');
    const normalized = String(pushToken || '').trim();
    if (normalized) {
      pushTokenRef.current = normalized;
    }
    return normalized;
  }, []);

  const registerPushTokenWithBackend = useCallback(
    async (pushToken: string) => {
      if (Platform.OS !== 'android') return;
      const normalized = String(pushToken || '').trim();
      const accessToken = String(sessionRef.current?.accessToken || '').trim();
      if (!normalized || !accessToken) return;

      const registrationKey = `${client.getBaseUrl()}|android|${normalized}`;
      if (registeredPushTokenRef.current === registrationKey) return;

      await client.request(
        '/v1/push-tokens',
        {
          method: 'POST',
          body: JSON.stringify({
            platform: 'android',
            pushToken: normalized,
          }),
        },
        { queue: false, rateLimitRetries: 1 }
      );
      registeredPushTokenRef.current = registrationKey;
    },
    [client]
  );

  const refreshFamilyRoomLocations = useCallback(
    async (roomId: string) => {
      if (!roomId) return [];
      setFamilyLocationRoomId(roomId);
      setFamilyLocationLoading(true);
      try {
        const raw = await client.request<BackendFamilyRoomLocationList>(
          `/v1/rooms/${roomId}/locations`,
          { method: 'GET' },
          { queue: false, rateLimitRetries: 1, timeoutMs: 10000 }
        );
        const next = mapFamilyLocations(raw.items);
        setFamilyLocations(next);
        return next;
      } catch (error) {
        setFamilyLocations([]);
        setErrorMessage(normalizeErrorMessage(error));
        return [];
      } finally {
        setFamilyLocationLoading(false);
      }
    },
    [client]
  );

  const waitForFamilyLocationUpdate = useCallback(
    async (roomId: string, targetUserId: string, previousCapturedAt?: string) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 22000) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const items = await refreshFamilyRoomLocations(roomId);
        const matched = items.find((item) => item.userId === targetUserId);
        if (matched && matched.capturedAt && matched.capturedAt !== previousCapturedAt) {
          return matched;
        }
      }
      return null;
    },
    [refreshFamilyRoomLocations]
  );

  const requestFamilyLocationRefresh = useCallback(
    async (roomId: string, targetUserId: string) => {
      if (!roomId || !targetUserId) return;
      const actionKey = `${roomId}:${targetUserId}`;
      setFamilyLocationActionKey(actionKey);
      try {
        const previousCapturedAt = familyLocations.find((item) => item.userId === targetUserId)?.capturedAt;
        const refresh = await client.request<BackendLocationRefreshRequest>(
          `/v1/rooms/${roomId}/locations/${targetUserId}/refresh`,
          { method: 'POST' },
          { queue: false, rateLimitRetries: 1, timeoutMs: 10000 }
        );

        const requestToken = String(refresh.requestToken || '').trim();
        if (requestToken && targetUserId === currentUserIdRef.current) {
          const permission = await requestLocationPermissions();
          if (permission.foreground) {
            await startLocationCapture('manual_refresh', true, requestToken);
          }
        }

        const updated = await waitForFamilyLocationUpdate(roomId, targetUserId, previousCapturedAt);
        if (!updated) {
          Alert.alert('위치 확인 대기 중', '상대방 앱이 위치 요청에 아직 응답하지 않았어요. 앱이 열려 있거나 백그라운드 위치 권한이 필요합니다.');
        }
      } catch (error) {
        Alert.alert('위치 확인 실패', normalizeErrorMessage(error));
      } finally {
        setFamilyLocationActionKey('');
      }
    },
    [client, familyLocations, requestLocationPermissions, startLocationCapture, waitForFamilyLocationUpdate]
  );

  const openLocationMap = useCallback(async (latitude: number, longitude: number) => {
    const url = `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
    const webUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    await Linking.openURL(canOpen ? url : webUrl).catch(() => null);
  }, []);

  const loadRoomMessages = useCallback(
    async (roomId: string) => {
      if (roomMessagesRefreshRef.current[roomId]) return roomMessagesRefreshRef.current[roomId];

      const request = (async () => {
        const raw = await client.request<BackendRoomMessage[] | BackendListData<BackendRoomMessage>>(
          `/v1/rooms/${roomId}/messages?limit=100`,
          { method: 'GET' },
          { rateLimitRetries: 2, timeoutMs: 15000, queue: false }
        );
        const mapped = asListItems<BackendRoomMessage>(raw)
          .map((item) => mapMessageForApp({ ...item, roomId: item.roomId || roomId }, roomId))
          .filter((message): message is Message => !!message);
        setMessages((prev) => {
          const next = { ...prev, [roomId]: mapped };
          messagesRef.current = next;
          return next;
        });
        return mapped;
      })();

      roomMessagesRefreshRef.current[roomId] = request;
      try {
        return await request;
      } finally {
        if (roomMessagesRefreshRef.current[roomId] === request) {
          delete roomMessagesRefreshRef.current[roomId];
        }
      }
    },
    [client, mapMessageForApp]
  );

  const markRoomAsRead = useCallback(
    async (roomId: string, roomMessages?: Message[]) => {
      const latest = (roomMessages || messagesRef.current[roomId] || [])
        .filter((message) => message.kind !== 'system')
        .at(-1);
      const result = await client.request<BackendRoomRead>(
        `/v1/rooms/${roomId}/read`,
        {
          method: 'POST',
          ...(latest?.id ? { body: JSON.stringify({ lastReadMessageId: latest.id }) } : {}),
        },
        { queue: false, rateLimitRetries: 0 }
      );
      const unread = Math.max(0, Number(result.unread || 0));
      setRooms((prev) => {
        const nextRooms = prev.map((room) => (room.id === roomId ? { ...room, unread } : room));
        roomsRef.current = nextRooms;
        return nextRooms;
      });
      const roomType = roomsRef.current.find((room) => room.id === roomId)?.type;
      if (activeRoomRef.current === roomId && (roomType === 'group' || roomType === 'family')) {
        setTimeout(() => {
          void loadRoomMessages(roomId).catch(() => null);
        }, 250);
      }
      return unread;
    },
    [client, loadRoomMessages]
  );

  const syncInitial = useCallback(
    async ({ fallbackUser, silent = false }: SyncInitialOptions = {}) => {
      if (syncInitialRef.current) return syncInitialRef.current;

      const request = (async () => {
      const alreadyShowingApp = authStateRef.current === 'ready' || authStateRef.current === 'degraded';
      if (!silent && !alreadyShowingApp) {
        setAuthState('syncing');
      }
      setSyncMessage('계정 정보를 불러오는 중입니다.');
      try {
        let syncWarning = '';
        const rawProfile = await client.request<BackendProfile>('/v1/me', { method: 'GET' });
        const nextProfile = mapProfileForApp(
          {
            ...rawProfile,
            id: rawProfile.id || fallbackUser?.id,
            name: rawProfile.name || fallbackUser?.name || fallbackUser?.displayName,
            email: rawProfile.email || fallbackUser?.email,
            avatarUri: rawProfile.avatarUri || fallbackUser?.avatarUri,
          },
          profileRef.current
        );
        commitProfile(nextProfile);

        setSyncMessage('친구와 요청을 동기화하는 중입니다.');
        await refreshPeople().catch((error) => {
          if (isSessionInvalidError(error)) throw error;
          syncWarning = normalizeErrorMessage(error);
          setErrorMessage(syncWarning);
        });

        setSyncMessage('대화방을 동기화하는 중입니다.');
        await refreshRooms().catch((error) => {
          if (isSessionInvalidError(error)) throw error;
          syncWarning = normalizeErrorMessage(error);
          setErrorMessage(syncWarning);
          return [];
        });
        setServerState('ready');
        setAuthState('ready');
        if (!syncWarning) setErrorMessage('');
        return true;
      } catch (error) {
        const message = normalizeErrorMessage(error);
        setErrorMessage(message);
        if (isSessionInvalidError(error)) {
          await saveSessionSynced(null);
          setAuthState('signedOut');
        } else {
          setAuthState(sessionRef.current ? 'degraded' : 'signedOut');
        }
        return false;
      } finally {
        setSyncMessage('');
      }
      })();

      syncInitialRef.current = request;
      try {
        return await request;
      } finally {
        if (syncInitialRef.current === request) syncInitialRef.current = null;
      }
    },
    [client, commitProfile, mapProfileForApp, refreshPeople, refreshRooms, saveSessionSynced]
  );

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      ...(config.googleIosClientId ? { iosClientId: config.googleIosClientId } : {}),
      offlineAccess: false,
      profileImageSize: 256,
      scopes: ['profile', 'email'],
    });
  }, [config.googleIosClientId, config.googleWebClientId]);

  useEffect(() => {
    let alive = true;
    setServerState('checking');
    client
      .request('/health', { method: 'GET' }, { auth: false, timeoutMs: 6000, rateLimitRetries: 0, queue: false })
      .then(() => {
        if (alive) setServerState('ready');
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof Error && Number((error as { status?: number }).status || 0) === 429) {
          setServerState('ready');
          if (!sessionRef.current) {
            setErrorMessage(normalizeErrorMessage(error));
          }
          return;
        }
        setServerState('error');
        if (!sessionRef.current) {
          setErrorMessage(normalizeErrorMessage(error));
        }
      });
    return () => {
      alive = false;
    };
  }, [client]);

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;

    let alive = true;
    (async () => {
      setAuthState('checking');
      const stored = await readSession().catch(() => null);
      if (!alive) return;
      if (!stored) {
        setAuthState('signedOut');
        return;
      }
      sessionRef.current = stored;
      setSession(stored);
      if (Platform.OS === 'android') {
        await NativeLocationCapture?.storeSession(stored.accessToken, stored.refreshToken || '').catch(() => false);
      }
      await syncInitial();
    })();
    return () => {
      alive = false;
    };
  }, [syncInitial]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (serverState !== 'ready' || (authState !== 'ready' && authState !== 'degraded') || !session?.accessToken) return;

    let cancelled = false;
    const run = async () => {
      const pushToken = pushTokenRef.current || (await requestDevicePushToken());
      if (!pushToken || cancelled) return;
      await registerPushTokenWithBackend(pushToken).catch(() => {
        registeredPushTokenRef.current = '';
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    authState,
    registerPushTokenWithBackend,
    requestDevicePushToken,
    serverState,
    session?.accessToken,
  ]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await syncInitial({ silent: true });
    setLoading(false);
  }, [syncInitial]);

  const handleSignIn = useCallback(async () => {
    if (authState === 'signingIn' || authState === 'syncing') return;
    setErrorMessage('');
    setAuthState('signingIn');
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        setAuthState('signedOut');
        return;
      }
      const tokens = await GoogleSignin.getTokens();
      const authData = await client.request<BackendAuthData>(
        '/v1/auth/google',
        {
          method: 'POST',
          body: JSON.stringify({
            idToken: response.data.idToken || tokens.idToken,
            accessToken: tokens.accessToken,
            device: {
              platform: Platform.OS,
              appVersion: config.appVersion,
              deviceId: constantsDeviceId(),
            },
          }),
        },
        { auth: false }
      );
      const accessToken = String(authData.accessToken || authData.tokens?.accessToken || '').trim();
      const refreshToken = String(authData.refreshToken || authData.tokens?.refreshToken || '').trim();
      if (!accessToken) throw new Error('로그인 토큰을 받지 못했습니다.');
      await saveSessionSynced({
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
      });
      await syncInitial({ fallbackUser: authData.user });
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        setAuthState('signedOut');
        return;
      }
      setAuthState('signedOut');
      setErrorMessage(normalizeErrorMessage(error));
    }
  }, [authState, client, config.appVersion, saveSessionSynced, syncInitial]);

  const handleSignOut = useCallback(async () => {
    try {
      const token = pushTokenRef.current.trim();
      if (token && sessionRef.current?.accessToken) {
        await client
          .request(
            '/v1/push-tokens',
            {
              method: 'DELETE',
              body: JSON.stringify({ pushToken: token }),
            },
            { queue: false, rateLimitRetries: 0 }
          )
          .catch(() => null);
      }
      if (NativePushToken?.deleteToken) {
        await NativePushToken.deleteToken().catch(() => false);
      }
      await saveSessionSynced(null);
      await GoogleSignin.signOut().catch(() => null);
    } finally {
      pushTokenRef.current = '';
      registeredPushTokenRef.current = '';
      setAuthState('signedOut');
      setProfile(initialProfile);
      profileRef.current = initialProfile;
      currentUserIdRef.current = initialProfile.id;
      usersRef.current = { [initialProfile.id]: initialProfile };
      roomsRef.current = [];
      messagesRef.current = {};
      setDirectReadCutoffs({});
      tabHistoryRef.current = [];
      tabRef.current = 'people';
      setTab('people');
      setUsers(usersRef.current);
      setRooms([]);
      setMessages({});
      setFriendRequests([]);
      setActiveRoomId(null);
      setDraft('');
      setAttachment(null);
      setRoomErrorMessage('');
      setErrorMessage('');
    }
  }, [client, saveSessionSynced]);

  const touchRoom = useCallback((roomId: string, message: Message, incoming: boolean) => {
    setRooms((prev) => {
      const nextRooms = sortRooms(
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                preview: previewForMessage(message),
                updatedAt: message.at,
                lastActivity: formatTime(message.at),
                unread:
                  incoming && activeRoomRef.current !== roomId && message.senderId !== currentUserIdRef.current
                    ? room.unread + 1
                    : activeRoomRef.current === roomId
                      ? 0
                      : room.unread,
              }
            : room
        )
      );
      roomsRef.current = nextRooms;
      return nextRooms;
    });
  }, []);

  const upsertMessage = useCallback(
    (roomId: string, message: Message, incoming = false) => {
      setMessages((prev) => ({
        ...prev,
        [roomId]: mergeMessages(prev[roomId] || [], [message]),
      }));
      messagesRef.current = {
        ...messagesRef.current,
        [roomId]: mergeMessages(messagesRef.current[roomId] || [], [message]),
      };
      touchRoom(roomId, message, incoming);
    },
    [touchRoom]
  );

  const openRoom = useCallback(
    async (roomId: string) => {
      const initialUnread = Math.max(0, roomsRef.current.find((room) => room.id === roomId)?.unread || 0);
      setActiveRoomInitialUnread(initialUnread);
      setActiveRoomId(roomId);
      setDraft('');
      setAttachment(null);
      setRoomErrorMessage('');
      setRooms((prev) => {
        const nextRooms = prev.map((room) => (room.id === roomId ? { ...room, unread: 0 } : room));
        roomsRef.current = nextRooms;
        return nextRooms;
      });
      const hasCachedMessages = (messagesRef.current[roomId] || []).length > 0;
      setRoomLoading(!hasCachedMessages);
      try {
        const roomMessages = await loadRoomMessages(roomId);
        setRoomErrorMessage('');
        await markRoomAsRead(roomId, roomMessages).catch(() => null);
      } catch (error) {
        const message = normalizeErrorMessage(error);
        setRoomErrorMessage(message);
        setErrorMessage(message);
      } finally {
        setRoomLoading(false);
      }
    },
    [loadRoomMessages, markRoomAsRead]
  );

  const closeRoom = useCallback(() => {
    setActiveRoomId(null);
    setActiveRoomInitialUnread(0);
    setDraft('');
    setAttachment(null);
    setRoomErrorMessage('');
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeRoomRef.current) {
        closeRoom();
        return true;
      }

      let previousTab = tabHistoryRef.current.pop();
      while (previousTab && previousTab === tabRef.current) {
        previousTab = tabHistoryRef.current.pop();
      }

      if (previousTab) {
        tabRef.current = previousTab;
        setTab(previousTab);
        return true;
      }

      if (tabRef.current !== 'people') {
        tabRef.current = 'people';
        setTab('people');
        return true;
      }

      return false;
    });

    return () => {
      subscription.remove();
    };
  }, [closeRoom]);

  const ensureDirectRoom = useCallback(
    async (userId: string) => {
      const currentUserId = currentUserIdRef.current;
      const existing = roomsRef.current.find(
        (room) =>
          room.type === 'direct' &&
          room.memberIds.includes(currentUserId) &&
          room.memberIds.includes(userId)
      );
      if (existing) return existing.id;

      const raw = await client.request<BackendRoom>('/v1/rooms/direct', {
        method: 'POST',
        body: JSON.stringify({ friendUserId: userId }),
      }, { queue: false, rateLimitRetries: 1 });
      const mapped = mapRoom(raw, currentUserId);
      if (!mapped) throw new Error('대화방을 만들지 못했습니다.');
      const titled = normalizeRoomTitle(mapped, usersRef.current, currentUserId);
      setRooms((prev) => {
        const nextRooms = sortRooms([titled, ...prev.filter((room) => room.id !== titled.id)]);
        roomsRef.current = nextRooms;
        return nextRooms;
      });
      setMessages((prev) => {
        const next = { ...prev, [titled.id]: prev[titled.id] || [] };
        messagesRef.current = next;
        return next;
      });
      return titled.id;
    },
    [client]
  );

  const openPerson = useCallback(
    async (userId: string) => {
      setLoading(true);
      try {
        const roomId = await ensureDirectRoom(userId);
        await openRoom(roomId);
        navigateTab('chats');
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [ensureDirectRoom, navigateTab, openRoom]
  );

  const pickAttachment = useCallback(async (kind: 'image' | 'video') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진과 영상 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'image' ? 'images' : 'videos'],
      allowsEditing: false,
      quality: kind === 'image' ? 0.86 : 1,
      videoMaxDuration: 180,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const resolvedKind = asset.type === 'video' ? 'video' : 'image';
    setAttachment({
      id: uid('media'),
      kind: resolvedKind,
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      status: 'picked',
    });
  }, []);

  const sendMessage = useCallback(async () => {
    const activeRoom = rooms.find((room) => room.id === activeRoomRef.current);
    const text = draft.trim();
    const media = attachment;
    if (!activeRoom || (!text && !media) || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setErrorMessage('');

    const now = Date.now();
    let tempTextId = '';
    try {
      if (text) {
        tempTextId = uid('text');
        const optimistic: Message = {
          id: tempTextId,
          clientMessageId: tempTextId,
          roomId: activeRoom.id,
          senderId: currentUserIdRef.current,
          senderName: profileRef.current.name,
          kind: 'text',
          text,
          at: now,
          time: formatTime(now),
          delivery: 'sending',
        };
        setDraft('');
        upsertMessage(activeRoom.id, optimistic, false);
        const created = await client.request<BackendRoomMessage>(`/v1/rooms/${activeRoom.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: tempTextId,
            kind: 'text',
            text,
          }),
        }, { queue: false, rateLimitRetries: 1 });
        const mapped = mapMessageForApp(created, activeRoom.id);
        if (mapped) {
          setMessages((prev) => {
            const next = {
              ...prev,
              [activeRoom.id]: mergeMessages(
                (prev[activeRoom.id] || []).filter((message) => message.id !== tempTextId),
                [mapped]
              ),
            };
            messagesRef.current = next;
            return next;
          });
          touchRoom(activeRoom.id, mapped, false);
        }
      }

      if (media) {
        setAttachment((prev) => (prev?.id === media.id ? { ...prev, status: 'uploading', error: undefined } : prev));
        const uploadedUri = await uploadAttachment(client, media);
        const mediaClientMessageId = uid('media-message');
        const created = await client.request<BackendRoomMessage>(`/v1/rooms/${activeRoom.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: mediaClientMessageId,
            kind: media.kind,
            uri: uploadedUri,
          }),
        }, { queue: false, rateLimitRetries: 1 });
        const mapped = mapMessageForApp(created, activeRoom.id);
        if (mapped) upsertMessage(activeRoom.id, mapped, false);
        setAttachment(null);
      }
    } catch (error) {
      const message = normalizeErrorMessage(error);
      setErrorMessage(message);
      if (tempTextId) {
        setMessages((prev) => {
          const next = {
            ...prev,
            [activeRoom.id]: (prev[activeRoom.id] || []).map((item) =>
              item.id === tempTextId ? { ...item, delivery: 'failed' as const } : item
            ),
          };
          messagesRef.current = next;
          return next;
        });
      }
      if (media) {
        setAttachment((prev) => (prev?.id === media.id ? { ...prev, status: 'failed', error: message } : prev));
      }
      Alert.alert(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [attachment, client, draft, mapMessageForApp, rooms, touchRoom, upsertMessage]);

  const pickProfileAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('프로필 사진 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.86,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setLoading(true);
    setSyncMessage('프로필 사진을 업로드하는 중입니다.');
    try {
      const asset = result.assets[0];
      const avatarUri = await uploadAvatar(client, asset.uri, asset.mimeType);
      const saved = await client.request<BackendProfile>('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileRef.current.name,
          status: profileRef.current.status,
          avatarUri,
          locationSharingEnabled: profileRef.current.locationSharingEnabled,
        }),
      });
      const nextProfile = mapProfileForApp(
        {
          ...saved,
          avatarUri: saved.avatarUri || avatarUri,
        },
        profileRef.current
      );
      commitProfile(nextProfile);
    } catch (error) {
      Alert.alert(normalizeErrorMessage(error));
    } finally {
      setSyncMessage('');
      setLoading(false);
    }
  }, [client, commitProfile, mapProfileForApp]);

  const toggleLocationConsent = useCallback(async () => {
    const previous = profileRef.current;
    const nextEnabled = !previous.locationSharingEnabled;
    if (nextEnabled) {
      const permission = await requestLocationPermissions();
      if (!permission.foreground) return;
    }
    const optimistic = { ...previous, locationSharingEnabled: nextEnabled };
    commitProfile(optimistic);
    try {
      const saved = await client.request<BackendProfile>('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({ locationSharingEnabled: nextEnabled }),
      });
      const nextProfile = mapProfileForApp(saved, optimistic);
      commitProfile(nextProfile);
      if (nextEnabled) {
        await startLocationCapture('manual_enable', true);
      }
    } catch (error) {
      commitProfile(previous);
      Alert.alert(normalizeErrorMessage(error));
    }
  }, [client, commitProfile, mapProfileForApp, requestLocationPermissions, startLocationCapture]);

  const acceptFriendRequest = useCallback(
    async (requestId: string) => {
      setLoading(true);
      try {
        await client.request(`/v1/friends/requests/${requestId}/accept`, { method: 'POST' });
        setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
        await Promise.all([refreshPeople(), refreshRooms()]);
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [client, refreshPeople, refreshRooms]
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string) => {
      setLoading(true);
      try {
        await client.request(`/v1/friends/requests/${requestId}/reject`, { method: 'POST' });
        setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
        await refreshPeople();
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [client, refreshPeople]
  );

  useEffect(() => {
    if (serverState !== 'ready' || (authState !== 'ready' && authState !== 'degraded') || !session?.accessToken) {
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      return;
    }

    let disposed = false;
    const socket = new WebSocket(`${toWsBaseUrl(client.getBaseUrl())}/v1/ws?token=${encodeURIComponent(session.accessToken)}`);

    socket.onopen = () => {
      if (!disposed) {
        setWsAttempt(0);
        setErrorMessage((current) => (current === REALTIME_UNSTABLE_MESSAGE ? '' : current));
      }
    };

    socket.onmessage = (event) => {
      if (disposed) return;
      try {
        const payload = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data || '')) as {
          event?: string;
          data?: Record<string, unknown>;
        };
        if (payload.event === 'message.new' && payload.data) {
          const roomId = String(payload.data.roomId || '');
          const rawMessage = payload.data.message as BackendRoomMessage | undefined;
          if (!roomId || !rawMessage) return;
          const mapped = mapMessageForApp({ ...rawMessage, roomId: rawMessage.roomId || roomId }, roomId);
          if (!mapped) return;
          const incoming = mapped.senderId !== currentUserIdRef.current;
          upsertMessage(roomId, mapped, incoming);
          if (activeRoomRef.current === roomId) {
            void markRoomAsRead(roomId, [mapped]).catch(() => null);
          }
          return;
        }

        if (payload.event === 'message.delivery' && payload.data) {
          const roomId = String(payload.data.roomId || '');
          const messageId = String(payload.data.messageId || '');
          const delivery = String(payload.data.delivery || '') as Message['delivery'];
          if (!roomId || !messageId || !delivery) return;
          const deliveryAt = Date.parse(String(payload.data.at || ''));
          const roomType = roomsRef.current.find((room) => room.id === roomId)?.type;
          const roomIsGroup = roomType === 'group' || roomType === 'family';
          if (delivery === 'read' && !roomIsGroup && Number.isFinite(deliveryAt)) {
            setDirectReadCutoffs((prev) => ({
              ...prev,
              [roomId]: Math.max(prev[roomId] || 0, deliveryAt),
            }));
          }
          setMessages((prev) => {
            const next = {
              ...prev,
              [roomId]: (prev[roomId] || []).map((message) => {
                if (delivery === 'read' && !roomIsGroup && message.senderId === currentUserIdRef.current) {
                  return {
                    ...message,
                    delivery: 'read' as const,
                    unreadCount: 0,
                  };
                }
                return message.id === messageId
                  ? {
                      ...message,
                      delivery,
                      ...(delivery === 'read' ? { unreadCount: 0 } : {}),
                    }
                  : message;
              }),
            };
            messagesRef.current = next;
            return next;
          });
          if (delivery === 'read' && roomIsGroup && activeRoomRef.current === roomId) {
            setTimeout(() => {
              void loadRoomMessages(roomId).catch(() => null);
            }, 250);
          }
          return;
        }

        if (payload.event === 'room.unread.updated' && payload.data) {
          const roomId = String(payload.data.roomId || '');
          const unread = Number(payload.data.unread || 0);
          if (!roomId || !Number.isFinite(unread)) return;
          setRooms((prev) =>
            prev.map((room) =>
              room.id === roomId ? { ...room, unread: activeRoomRef.current === roomId ? 0 : Math.max(0, unread) } : room
            )
          );
          return;
        }

        if (payload.event === 'room.updated') {
          void refreshRooms().catch(() => null);
          if (activeRoomRef.current) {
            void loadRoomMessages(activeRoomRef.current).catch(() => null);
          }
          return;
        }

        if (payload.event === 'location.precision.requested' && payload.data) {
          const requestToken = String(payload.data.requestToken || '').trim();
          const locationAction = String(payload.data.locationAction || 'refresh').trim();
          if (requestToken && locationAction === 'refresh' && profileRef.current.locationSharingEnabled) {
            void startLocationCapture('precision_refresh', true, requestToken).catch(() => null);
          }
          return;
        }

        if (payload.event === 'friend.updated') {
          void refreshPeople().catch(() => null);
          void refreshRooms().catch(() => null);
        }
      } catch {
        // Ignore malformed realtime frames; the next sync keeps state authoritative.
      }
    };

    socket.onerror = () => {
      // The close handler drives reconnect. Avoid leaving a stale warning for transient socket errors.
    };

    socket.onclose = () => {
      if (disposed) return;
      if (wsAttempt > 0) {
        setErrorMessage((current) => current || REALTIME_UNSTABLE_MESSAGE);
      }
      const delay = reconnectDelayMs(wsAttempt);
      wsReconnectTimerRef.current = setTimeout(() => {
        setWsAttempt((attempt) => attempt + 1);
      }, delay);
    };

    return () => {
      disposed = true;
      socket.close();
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
    };
  }, [
    authState,
    client,
    loadRoomMessages,
    mapMessageForApp,
    markRoomAsRead,
    refreshPeople,
    refreshRooms,
    serverState,
    session?.accessToken,
    startLocationCapture,
    upsertMessage,
    wsAttempt,
  ]);

  const activeRoom = useMemo(
    () => (activeRoomId ? rooms.find((room) => room.id === activeRoomId) || null : null),
    [activeRoomId, rooms]
  );

  const visibleRooms = useMemo(
    () => rooms.map((room) => normalizeRoomTitle(room, users, profile.id)),
    [profile.id, rooms, users]
  );

  const primaryFamilyRoom = useMemo(
    () => visibleRooms.find((room) => room.type === 'family') || null,
    [visibleRooms]
  );

  useEffect(() => {
    if (tab !== 'family' || !primaryFamilyRoom || !sessionRef.current?.accessToken) return;
    void refreshFamilyRoomLocations(primaryFamilyRoom.id);
  }, [primaryFamilyRoom, refreshFamilyRoomLocations, tab]);

  const locationNotice = profile.locationSharingEnabled
    ? '가족방에서만 위치 확인을 허용 중입니다.'
    : '위치 공유가 꺼져 있습니다.';

  const signedIn = authState === 'ready' || authState === 'degraded';
  const booting = authState === 'checking' || authState === 'syncing';

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <LaunchScreen message={authState === 'syncing' ? '기존 계정을 불러오고 있습니다.' : '앱을 준비하고 있습니다.'} />
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <LoginScreen
          authState={authState}
          serverState={serverState}
          errorMessage={errorMessage}
          onSignIn={handleSignIn}
        />
      </SafeAreaView>
    );
  }

  if (activeRoom) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <RoomScreen
          room={normalizeRoomTitle(activeRoom, users, profile.id)}
          users={users}
          currentUserId={profile.id}
          messages={messages[activeRoom.id] || []}
          initialUnreadCount={activeRoomInitialUnread}
          directReadCutoff={directReadCutoffs[activeRoom.id] || 0}
          draft={draft}
          attachment={attachment}
          loading={roomLoading}
          errorMessage={roomErrorMessage}
          sending={sending}
          onDraftChange={setDraft}
          onBack={closeRoom}
          onRetryLoad={() => void openRoom(activeRoom.id)}
          onSend={sendMessage}
          onPickImage={() => void pickAttachment('image')}
          onPickVideo={() => void pickAttachment('video')}
          onRemoveAttachment={() => setAttachment(null)}
          onRetryAttachment={sendMessage}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        {tab === 'chats' ? (
          <ChatsScreen
            rooms={visibleRooms}
            messages={messages}
            users={users}
            currentUserId={profile.id}
            query={chatQuery}
            loading={loading}
            syncMessage={syncMessage || errorMessage}
            onQueryChange={setChatQuery}
            onOpenRoom={(roomId) => void openRoom(roomId)}
            onRefresh={() => void refreshAll()}
          />
        ) : null}
        {tab === 'people' ? (
          <PeopleScreen
            users={users}
            currentUserId={profile.id}
            requests={friendRequests}
            loading={loading}
            onRefresh={() => void refreshAll()}
            onOpenPerson={(userId) => void openPerson(userId)}
            onAcceptRequest={(requestId) => void acceptFriendRequest(requestId)}
            onRejectRequest={(requestId) => void rejectFriendRequest(requestId)}
          />
        ) : null}
        {tab === 'family' ? (
          <FamilyScreen
            profile={profile}
            users={users}
            rooms={visibleRooms}
            locations={familyLocations}
            locationRoomId={familyLocationRoomId || primaryFamilyRoom?.id || ''}
            locationLoading={familyLocationLoading}
            locationActionKey={familyLocationActionKey}
            locationNotice={locationNotice}
            onToggleLocationConsent={() => void toggleLocationConsent()}
            onRefresh={() => void refreshAll()}
            onOpenRoom={(roomId) => void openRoom(roomId)}
            onRefreshLocations={(roomId) => void refreshFamilyRoomLocations(roomId)}
            onRequestLocation={(roomId, userId) => void requestFamilyLocationRefresh(roomId, userId)}
            onOpenLocationMap={(latitude, longitude) => void openLocationMap(latitude, longitude)}
          />
        ) : null}
        {tab === 'me' ? (
          <ProfileScreen
            profile={profile}
            rooms={visibleRooms}
            backendBaseUrl={config.baseUrl}
            syncMessage={syncMessage}
            onPickAvatar={() => void pickProfileAvatar()}
            onSignOut={() => void handleSignOut()}
          />
        ) : null}
      </View>
      <View style={{ paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface }}>
        <BottomNav active={tab} onChange={navigateTab} />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RenewalApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  body: {
    flex: 1,
  },
});
