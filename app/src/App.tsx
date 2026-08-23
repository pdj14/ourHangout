import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { BottomNav } from './components/BottomNav';
import { ConnectionBanner } from './components/ConnectionBanner';
import { CreateFamilyRoomModal } from './components/CreateFamilyRoomModal';
import { FamilyRelationshipModal } from './components/FamilyRelationshipModal';
import { FriendSearchModal } from './components/FriendSearchModal';
import { ProfilePhotoCropModal } from './components/ProfilePhotoCropModal';
import { UserProfileModal } from './components/UserProfileModal';
import { getDeviceId, getRuntimeConfig } from './config';
import { useAppVisibility } from './hooks/useAppVisibility';
import { useKeyboardVisible } from './hooks/useChatKeyboard';
import { useRealtimeConnection, type RealtimeEvent } from './hooks/useRealtimeConnection';
import { NativeLocationCapture, NativePushToken } from './native';
import { ChatsScreen } from './screens/ChatsScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { LaunchScreen } from './screens/LaunchScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OnDeviceAiScreen } from './screens/OnDeviceAiScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RoomScreen } from './screens/RoomScreen';
import {
  asListItems,
  BackendClient,
  isSessionInvalidError,
  toWsBaseUrl,
} from './services/backend';
import {
  clearSession,
  readSession,
  writeSession,
  type PersistedSession,
} from './services/session';
import {
  baseUrlForServerEnvironment,
  nextServerEnvironment,
  readServerEnvironment,
  serverEnvironmentForBaseUrl,
  writeServerEnvironment,
} from './services/serverEnvironment';
import { uploadAttachment, uploadAvatar } from './services/media';
import { pickChatAttachment } from './services/chatAttachments';
import {
  compareVersionStrings,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  initialAppUpdateState,
  type AppUpdateInstallPhase,
  type BackendAppUpdateStatus,
} from './services/appUpdate';
import {
  colorForId,
  formatTime,
  mapFamilyRoomMemberProfiles,
  mapFamilyRoomRelationships,
  mapFriend,
  mapFriendRequest,
  mapMessage,
  mapProfile,
  mapRoom,
  mergeMessages,
  previewForMessage,
} from './services/mappers';
import { colors, gradients } from './theme';
import {
  createLocalId,
  mapFamilyLocations,
  normalizeErrorMessage,
  normalizeRoomTitle,
  resolveRemoteUri,
  roomIdFromUrl,
  sortRooms,
} from './utils/app';
import type {
  AttachmentDraft,
  AuthState,
  BackendAuthData,
  BackendAuthUser,
  BackendFamilyRoomLocationList,
  BackendFamilyRoomMemberProfileList,
  BackendFamilyRoomRelationshipList,
  BackendFriend,
  BackendFriendSearchUser,
  BackendFriendRequestList,
  BackendListData,
  BackendLocationRefreshRequest,
  BackendProfile,
  BackendRoom,
  BackendRoomMessage,
  BackendRoomRead,
  FamilyLocation,
  FamilyRoomStructure,
  FriendRequestView,
  FriendSearchResult,
  Message,
  Profile,
  Room,
  ServerState,
  TabKey,
  User,
  ChatMediaKind,
} from './types';

const REALTIME_UNSTABLE_MESSAGE = '실시간 연결이 불안정합니다. 자동으로 다시 연결합니다.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SyncInitialOptions = {
  fallbackUser?: BackendAuthUser;
  silent?: boolean;
};

type LocationPermissionState = {
  foreground: boolean;
  background: boolean;
};

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


function RenewalApp() {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const appState = useAppVisibility();
  const config = useMemo(getRuntimeConfig, []);
  const defaultServerEnvironment = useMemo(
    () => serverEnvironmentForBaseUrl(config.baseUrl),
    [config.baseUrl]
  );
  const [serverEnvironment, setServerEnvironment] = useState(defaultServerEnvironment);
  const [serverPreferenceReady, setServerPreferenceReady] = useState(false);
  const backendBaseUrl = useMemo(
    () => baseUrlForServerEnvironment(config.baseUrl, serverEnvironment),
    [config.baseUrl, serverEnvironment]
  );
  const currentAppVersion = useMemo(getCurrentAppVersion, []);
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
  const [friendRequests, setFriendRequests] = useState<FriendRequestView[]>([]);
  const [friendSearchOpen, setFriendSearchOpen] = useState(false);
  const [viewingUserId, setViewingUserId] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<FriendSearchResult[]>([]);
  const [friendSearchMessage, setFriendSearchMessage] = useState('');
  const [friendSearching, setFriendSearching] = useState(false);
  const [familyLocations, setFamilyLocations] = useState<FamilyLocation[]>([]);
  const [familyLocationRoomId, setFamilyLocationRoomId] = useState<string | null>(null);
  const [familyLocationLoading, setFamilyLocationLoading] = useState(false);
  const [familyLocationActionKey, setFamilyLocationActionKey] = useState('');
  const [familyStructures, setFamilyStructures] = useState<Record<string, FamilyRoomStructure>>({});
  const [familyStructureLoading, setFamilyStructureLoading] = useState(false);
  const [familyStructureActionKey, setFamilyStructureActionKey] = useState('');
  const [familyRelationshipRoomId, setFamilyRelationshipRoomId] = useState('');
  const [familyCreateOpen, setFamilyCreateOpen] = useState(false);
  const [familyCreateBusy, setFamilyCreateBusy] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomInitialUnread, setActiveRoomInitialUnread] = useState(0);
  const [activeRoomFirstUnreadMessageId, setActiveRoomFirstUnreadMessageId] = useState('');
  const [pendingRoomId, setPendingRoomId] = useState('');
  const activeRoomRef = useRef<string | null>(null);
  const currentUserIdRef = useRef(initialProfile.id);
  const [chatQuery, setChatQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [peopleActionKey, setPeopleActionKey] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileCropSourceUri, setProfileCropSourceUri] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomErrorMessage, setRoomErrorMessage] = useState('');
  const [roomActionKey, setRoomActionKey] = useState('');
  const [sending, setSending] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [appUpdate, setAppUpdate] = useState(initialAppUpdateState);
  const [appUpdateInstallPhase, setAppUpdateInstallPhase] = useState<AppUpdateInstallPhase>('idle');
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
  const previousAppStateRef = useRef(appState);
  const previousBackendBaseUrlRef = useRef('');

  useEffect(() => {
    let alive = true;
    void readServerEnvironment(defaultServerEnvironment).then((storedEnvironment) => {
      if (!alive) return;
      setServerEnvironment(storedEnvironment);
      setServerPreferenceReady(true);
    });
    return () => {
      alive = false;
    };
  }, [defaultServerEnvironment]);

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
        baseUrl: backendBaseUrl,
        getSession: () => sessionRef.current,
        saveSession: saveSessionSynced,
        onSessionExpired: (error) => {
          setAuthState('signedOut');
          setErrorMessage(normalizeErrorMessage(error));
        },
      }),
    [backendBaseUrl, saveSessionSynced]
  );

  const toggleServerEnvironment = useCallback(() => {
    setServerEnvironment((current) => {
      const next = nextServerEnvironment(current);
      void writeServerEnvironment(next);
      return next;
    });
  }, []);

  const checkAppUpdate = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setAppUpdate((current) => ({ ...current, checking: true, errorMessage: '' }));
    try {
      const params = new URLSearchParams({ currentVersion: currentAppVersion });
      const status = await client.request<BackendAppUpdateStatus>(
        `/v1/app-updates/latest?${params.toString()}`,
        { method: 'GET' },
        { auth: false, queue: false, rateLimitRetries: 1, timeoutMs: 15000 }
      );
      const release = status.release || null;
      const latestVersion = String(status.latestVersion || release?.version || '').trim();
      const rawDownloadUrl = String(release?.latestDownloadUrl || release?.downloadUrl || '').trim();
      const downloadUrl = /^https?:\/\//i.test(rawDownloadUrl)
        ? rawDownloadUrl
        : rawDownloadUrl
          ? `${client.getBaseUrl()}/${rawDownloadUrl.replace(/^\/+/, '')}`
          : '';
      const needsUpdate =
        !!release &&
        !!downloadUrl &&
        !!latestVersion &&
        (status.isLatest === false || compareVersionStrings(currentAppVersion, latestVersion) < 0);
      setAppUpdate({
        checked: true,
        checking: false,
        needsUpdate,
        latestVersion,
        downloadUrl: needsUpdate ? downloadUrl : '',
        release,
        errorMessage: '',
      });
    } catch (error) {
      setAppUpdate({
        ...initialAppUpdateState,
        checked: true,
        errorMessage:
          error instanceof Error ? error.message : '지금은 최신 버전을 확인하지 못했습니다.',
      });
    }
  }, [client, currentAppVersion]);

  const installAppUpdate = useCallback(async () => {
    if (!appUpdate.needsUpdate || !appUpdate.downloadUrl || !appUpdate.latestVersion) return;
    if (appUpdateInstallPhase !== 'idle') return;
    setAppUpdateInstallPhase('downloading');
    try {
      await downloadAndInstallAppUpdate(
        appUpdate.downloadUrl,
        appUpdate.latestVersion,
        setAppUpdateInstallPhase
      );
    } finally {
      setAppUpdateInstallPhase('idle');
    }
  }, [appUpdate, appUpdateInstallPhase]);

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
      const [friendRaw, requestRaw] = await Promise.all([
        client.request<BackendFriend[] | BackendListData<BackendFriend>>(
          '/v1/friends',
          { method: 'GET' },
          { rateLimitRetries: 1 }
        ),
        client
          .request<BackendFriendRequestList>(
            '/v1/friends/requests',
            { method: 'GET' },
            { rateLimitRetries: 0 }
          )
          .catch(() => null),
      ]);

      const friends = asListItems<BackendFriend>(friendRaw)
        .map(mapFriendForApp)
        .filter((friend): friend is User => !!friend);
      commitFriends(friends);
      if (requestRaw) {
        const incoming = (requestRaw.incoming || [])
          .map((item) => mapFriendRequest(item, 'incoming'))
          .filter((item): item is FriendRequestView => !!item);
        const outgoing = (requestRaw.outgoing || [])
          .map((item) => mapFriendRequest(item, 'outgoing'))
          .filter((item): item is FriendRequestView => !!item);
        setFriendRequests([...incoming, ...outgoing]);
      }
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

  const fetchFamilyStructure = useCallback(
    async (roomId: string): Promise<FamilyRoomStructure> => {
      const [profilesRaw, relationshipsRaw] = await Promise.all([
        client.request<BackendFamilyRoomMemberProfileList>(
          `/v1/rooms/${roomId}/member-profiles`,
          { method: 'GET' },
          { rateLimitRetries: 1 }
        ),
        client.request<BackendFamilyRoomRelationshipList>(
          `/v1/rooms/${roomId}/relationships`,
          { method: 'GET' },
          { rateLimitRetries: 1 }
        ),
      ]);
      return {
        roomId,
        canManage: !!profilesRaw.canManage,
        profiles: mapFamilyRoomMemberProfiles(profilesRaw.items, resolveUri),
        relationships: mapFamilyRoomRelationships(relationshipsRaw.items),
        pendingIncoming: mapFamilyRoomRelationships(relationshipsRaw.pendingIncoming),
        pendingOutgoing: mapFamilyRoomRelationships(relationshipsRaw.pendingOutgoing),
      };
    },
    [client, resolveUri]
  );

  const refreshFamilyStructure = useCallback(
    async (roomId: string) => {
      if (!roomId) return null;
      setFamilyStructureLoading(true);
      try {
        const structure = await fetchFamilyStructure(roomId);
        setFamilyStructures((current) => ({ ...current, [roomId]: structure }));
        return structure;
      } finally {
        setFamilyStructureLoading(false);
      }
    },
    [fetchFamilyStructure]
  );

  const refreshFamilyStructures = useCallback(
    async (familyRooms: Room[]) => {
      if (!familyRooms.length) {
        setFamilyStructures({});
        return;
      }
      setFamilyStructureLoading(true);
      try {
        const results = await Promise.allSettled(
          familyRooms.map((room) => fetchFamilyStructure(room.id))
        );
        setFamilyStructures((current) => {
          const next: Record<string, FamilyRoomStructure> = {};
          results.forEach((result, index) => {
            const roomId = familyRooms[index]?.id;
            if (!roomId) return;
            if (result.status === 'fulfilled') next[roomId] = result.value;
            else if (current[roomId]) next[roomId] = current[roomId];
          });
          return next;
        });
      } finally {
        setFamilyStructureLoading(false);
      }
    },
    [fetchFamilyStructure]
  );

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
          const localPending = (prev[roomId] || []).filter(
            (message) => message.delivery === 'sending' || message.delivery === 'failed'
          );
          const next = { ...prev, [roomId]: mergeMessages(localPending, mapped) };
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
        const nextRooms = prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                unread,
                ...(unread === 0 ? { firstUnreadMessageId: undefined } : {}),
              }
            : room
        );
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

        setSyncMessage('친구와 대화방을 동기화하는 중입니다.');
        const syncResults = await Promise.allSettled([refreshPeople(), refreshRooms()]);
        for (const result of syncResults) {
          if (result.status === 'fulfilled') continue;
          if (isSessionInvalidError(result.reason)) throw result.reason;
          syncWarning = normalizeErrorMessage(result.reason);
          setErrorMessage(syncWarning);
        }
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
    if (!serverPreferenceReady) return;
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
  }, [client, serverPreferenceReady]);

  useEffect(() => {
    if (!serverPreferenceReady) return;
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
  }, [serverPreferenceReady, syncInitial]);

  useEffect(() => {
    if (!serverPreferenceReady) return;
    const previousBaseUrl = previousBackendBaseUrlRef.current;
    previousBackendBaseUrlRef.current = backendBaseUrl;
    if (!previousBaseUrl || previousBaseUrl === backendBaseUrl) return;

    registeredPushTokenRef.current = '';
    setAppUpdate(initialAppUpdateState);
    if (
      sessionRef.current?.accessToken &&
      (authStateRef.current === 'ready' || authStateRef.current === 'degraded')
    ) {
      const reconnectToSelectedServer = async () => {
        const activeSync = syncInitialRef.current;
        if (activeSync) await activeSync.catch(() => false);
        await syncInitial({ silent: true });
      };
      void reconnectToSelectedServer();
    }
  }, [backendBaseUrl, serverPreferenceReady, syncInitial]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (
      appState !== 'active' ||
      serverState !== 'ready' ||
      (authState !== 'ready' && authState !== 'degraded') ||
      !session?.accessToken
    ) return;

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
    appState,
    authState,
    registerPushTokenWithBackend,
    requestDevicePushToken,
    serverState,
    session?.accessToken,
  ]);

  useEffect(() => {
    const previousState = previousAppStateRef.current;
    previousAppStateRef.current = appState;
    if (
      appState !== 'active' ||
      previousState === 'active' ||
      (authState !== 'ready' && authState !== 'degraded') ||
      !sessionRef.current?.accessToken
    ) return;

    void client
      .request('/health', { method: 'GET' }, { auth: false, timeoutMs: 6000, rateLimitRetries: 0 })
      .then(() => setServerState('ready'))
      .catch(() => null);

    const activeRoomId = activeRoomRef.current;
    const refreshForegroundData = async () => {
      await Promise.allSettled([refreshPeople(), refreshRooms()]);
      if (!activeRoomId) return;
      const roomMessages = await loadRoomMessages(activeRoomId).catch(() => null);
      if (
        roomMessages &&
        appState === 'active' &&
        tabRef.current === 'chats' &&
        activeRoomRef.current === activeRoomId
      ) {
        await markRoomAsRead(activeRoomId, roomMessages).catch(() => null);
      }
    };
    void refreshForegroundData();
  }, [appState, authState, client, loadRoomMessages, markRoomAsRead, refreshPeople, refreshRooms]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncInitial({ silent: true });
    } finally {
      setRefreshing(false);
    }
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
              deviceId: getDeviceId(),
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
      tabHistoryRef.current = [];
      tabRef.current = 'people';
      setTab('people');
      setUsers(usersRef.current);
      setRooms([]);
      setMessages({});
      setFriendRequests([]);
      setFriendSearchOpen(false);
      setViewingUserId('');
      setFriendSearchQuery('');
      setFriendSearchResults([]);
      setFriendSearchMessage('');
      setFriendSearching(false);
      setFamilyLocations([]);
      setFamilyLocationRoomId(null);
      setFamilyLocationLoading(false);
      setFamilyLocationActionKey('');
      setFamilyStructures({});
      setFamilyStructureLoading(false);
      setFamilyStructureActionKey('');
      setFamilyRelationshipRoomId('');
      setFamilyCreateOpen(false);
      setFamilyCreateBusy(false);
      setPeopleActionKey('');
      setProfileBusy(false);
      setProfileCropSourceUri('');
      setRefreshing(false);
      setActiveRoomId(null);
      setActiveRoomInitialUnread(0);
      setActiveRoomFirstUnreadMessageId('');
      setDraft('');
      setAttachment(null);
      setRoomErrorMessage('');
      setRoomActionKey('');
      setRetryingMessageId('');
      setErrorMessage('');
    }
  }, [client, saveSessionSynced]);

  const isRoomVisible = useCallback(
    (roomId: string) =>
      appState === 'active' && tabRef.current === 'chats' && activeRoomRef.current === roomId,
    [appState]
  );

  const touchRoom = useCallback((roomId: string, message: Message, incoming: boolean) => {
    setRooms((prev) => {
      const roomVisible = isRoomVisible(roomId);
      const nextRooms = sortRooms(
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                preview: previewForMessage(message),
                updatedAt: message.at,
                lastActivity: formatTime(message.at),
                unread:
                  incoming && !roomVisible && message.senderId !== currentUserIdRef.current
                    ? room.unread + 1
                    : roomVisible
                      ? 0
                      : room.unread,
                firstUnreadMessageId:
                  incoming && !roomVisible && message.senderId !== currentUserIdRef.current
                    ? room.firstUnreadMessageId || message.id
                    : roomVisible
                      ? undefined
                      : room.firstUnreadMessageId,
              }
            : room
        )
      );
      roomsRef.current = nextRooms;
      return nextRooms;
    });
  }, [isRoomVisible]);

  const upsertMessage = useCallback(
    (roomId: string, message: Message, incoming = false) => {
      setMessages((prev) => {
        const next = {
          ...prev,
          [roomId]: mergeMessages(prev[roomId] || [], [message]),
        };
        messagesRef.current = next;
        return next;
      });
      touchRoom(roomId, message, incoming);
    },
    [touchRoom]
  );

  const openRoom = useCallback(
    async (roomId: string) => {
      const roomBeforeOpen = roomsRef.current.find((room) => room.id === roomId);
      const initialUnread = Math.max(0, roomBeforeOpen?.unread || 0);
      setActiveRoomInitialUnread(initialUnread);
      setActiveRoomFirstUnreadMessageId(roomBeforeOpen?.firstUnreadMessageId || '');
      setActiveRoomId(roomId);
      setDraft('');
      setAttachment(null);
      setRoomErrorMessage('');
      setRooms((prev) => {
        const nextRooms = prev.map((room) =>
          room.id === roomId ? { ...room, unread: 0, firstUnreadMessageId: undefined } : room
        );
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

  const handleExternalUrl = useCallback((url?: string | null) => {
    const roomId = roomIdFromUrl(url);
    if (!roomId) return;
    setFriendSearchOpen(false);
    setPendingRoomId(roomId);
    navigateTab('chats');
  }, [navigateTab]);

  useEffect(() => {
    let mounted = true;
    void Linking.getInitialURL().then((url) => {
      if (mounted) handleExternalUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handleExternalUrl(url));
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [handleExternalUrl]);

  useEffect(() => {
    if (!pendingRoomId || (authState !== 'ready' && authState !== 'degraded')) return;
    let cancelled = false;
    const openPendingRoom = async () => {
      let exists = roomsRef.current.some((room) => room.id === pendingRoomId);
      if (!exists) {
        const refreshed = await refreshRooms().catch(() => []);
        exists = refreshed.some((room) => room.id === pendingRoomId);
      }
      if (cancelled || !exists) return;
      const roomId = pendingRoomId;
      setPendingRoomId('');
      await openRoom(roomId);
    };
    void openPendingRoom();
    return () => {
      cancelled = true;
    };
  }, [authState, openRoom, pendingRoomId, refreshRooms]);

  const closeRoom = useCallback(() => {
    setActiveRoomId(null);
    setActiveRoomInitialUnread(0);
    setActiveRoomFirstUnreadMessageId('');
    setDraft('');
    setAttachment(null);
    setRoomErrorMessage('');
  }, []);

  const updateRoomSettings = useCallback(
    async (roomId: string, patch: { favorite?: boolean; muted?: boolean }) => {
      const previous = roomsRef.current.find((room) => room.id === roomId);
      if (!previous || roomActionKey) return;
      const action = patch.favorite !== undefined ? 'favorite' : 'muted';
      setRoomActionKey(`${action}:${roomId}`);

      const applyPatch = (rooms: Room[], values: { favorite?: boolean; muted?: boolean }) =>
        sortRooms(
          rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  ...values,
                  ...(values.favorite !== undefined ? { pinned: values.favorite } : {}),
                }
              : room
          )
        );

      setRooms((current) => {
        const next = applyPatch(current, patch);
        roomsRef.current = next;
        return next;
      });

      try {
        const saved = await client.request<Partial<BackendRoom>>(
          `/v1/rooms/${roomId}/settings`,
          { method: 'PATCH', body: JSON.stringify(patch) },
          { rateLimitRetries: 1 }
        );
        const confirmed = {
          ...(saved.favorite !== undefined ? { favorite: !!saved.favorite } : {}),
          ...(saved.muted !== undefined ? { muted: !!saved.muted } : {}),
        };
        if (Object.keys(confirmed).length) {
          setRooms((current) => {
            const next = applyPatch(current, confirmed);
            roomsRef.current = next;
            return next;
          });
        }
      } catch (error) {
        setRooms((current) => {
          const next = applyPatch(current, {
            favorite: previous.favorite,
            muted: previous.muted,
          });
          roomsRef.current = next;
          return next;
        });
        Alert.alert('대화방 설정을 저장하지 못했습니다.', normalizeErrorMessage(error));
      } finally {
        setRoomActionKey('');
      }
    },
    [client, roomActionKey]
  );

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
      setPeopleActionKey(`chat:${userId}`);
      try {
        const roomId = await ensureDirectRoom(userId);
        await openRoom(roomId);
        navigateTab('chats');
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setPeopleActionKey('');
      }
    },
    [ensureDirectRoom, navigateTab, openRoom]
  );

  const pickAttachment = useCallback(async (kind: ChatMediaKind) => {
    try {
      const picked = await pickChatAttachment(kind);
      if (picked) setAttachment(picked);
    } catch (error) {
      Alert.alert(normalizeErrorMessage(error));
    }
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
        tempTextId = createLocalId('text');
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
        const mediaClientMessageId = createLocalId('media-message');
        const created = await client.request<BackendRoomMessage>(`/v1/rooms/${activeRoom.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: mediaClientMessageId,
            kind: media.kind,
            uri: uploadedUri,
            mimeType: media.mimeType,
            fileName: media.fileName,
            fileSize: media.fileSize,
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

  const retryMessage = useCallback(
    async (messageId: string) => {
      const roomId = activeRoomRef.current;
      const failed = roomId
        ? (messagesRef.current[roomId] || []).find((message) => message.id === messageId)
        : undefined;
      if (!roomId || !failed?.text || failed.kind !== 'text' || retryingMessageId) return;

      setRetryingMessageId(messageId);
      setMessages((prev) => {
        const next = {
          ...prev,
          [roomId]: (prev[roomId] || []).map((message) =>
            message.id === messageId ? { ...message, delivery: 'sending' as const } : message
          ),
        };
        messagesRef.current = next;
        return next;
      });

      try {
        const clientMessageId = failed.clientMessageId || failed.id;
        const created = await client.request<BackendRoomMessage>(
          `/v1/rooms/${roomId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              clientMessageId,
              kind: 'text',
              text: failed.text,
            }),
          },
          { queue: false, rateLimitRetries: 1 }
        );
        const mapped = mapMessageForApp(
          { ...created, clientMessageId: created.clientMessageId || clientMessageId },
          roomId
        );
        if (!mapped) throw new Error('메시지 전송 결과를 확인하지 못했습니다.');
        upsertMessage(roomId, mapped, false);
      } catch (error) {
        setMessages((prev) => {
          const next = {
            ...prev,
            [roomId]: (prev[roomId] || []).map((message) =>
              message.id === messageId ? { ...message, delivery: 'failed' as const } : message
            ),
          };
          messagesRef.current = next;
          return next;
        });
        Alert.alert('메시지를 다시 보내지 못했습니다.', normalizeErrorMessage(error));
      } finally {
        setRetryingMessageId('');
      }
    },
    [client, mapMessageForApp, retryingMessageId, upsertMessage]
  );

  const pickProfileAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('프로필 사진 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setProfileCropSourceUri(result.assets[0].uri);
  }, []);

  const applyCroppedProfileAvatar = useCallback(async (uri: string, mimeType: string) => {
    setProfileBusy(true);
    setSyncMessage('프로필 사진을 업로드하는 중입니다.');
    try {
      const avatarUri = await uploadAvatar(client, uri, mimeType);
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
      setProfileCropSourceUri('');
    } catch (error) {
      Alert.alert('프로필 사진을 업데이트하지 못했습니다.', normalizeErrorMessage(error));
    } finally {
      setSyncMessage('');
      setProfileBusy(false);
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

  const createFamilyRoom = useCallback(
    async (title: string, memberUserIds: string[]) => {
      if (!title.trim() || !memberUserIds.length || familyCreateBusy) return;
      setFamilyCreateBusy(true);
      try {
        const raw = await client.request<BackendRoom>('/v1/rooms', {
          method: 'POST',
          body: JSON.stringify({ type: 'family', title: title.trim(), memberUserIds }),
        });
        const mapped = mapRoom(raw, currentUserIdRef.current);
        if (!mapped) throw new Error('가족방을 만들지 못했습니다.');
        const room = normalizeRoomTitle(mapped, usersRef.current, currentUserIdRef.current);
        setRooms((current) => {
          const next = sortRooms([room, ...current.filter((item) => item.id !== room.id)]);
          roomsRef.current = next;
          return next;
        });
        setMessages((current) => {
          const next = { ...current, [room.id]: current[room.id] || [] };
          messagesRef.current = next;
          return next;
        });
        setFamilyCreateOpen(false);
        setFamilyRelationshipRoomId(room.id);
        await refreshFamilyStructure(room.id);
      } catch (error) {
        Alert.alert('가족방을 만들지 못했어요', normalizeErrorMessage(error));
      } finally {
        setFamilyCreateBusy(false);
      }
    },
    [client, familyCreateBusy, refreshFamilyStructure]
  );

  const openFamilyRelationships = useCallback(
    (roomId: string) => {
      setFamilyRelationshipRoomId(roomId);
      void refreshFamilyStructure(roomId).catch((error) => {
        Alert.alert('가족 관계를 불러오지 못했어요', normalizeErrorMessage(error));
      });
    },
    [refreshFamilyStructure]
  );

  const createFamilyRelationship = useCallback(
    async (roomId: string, targetUserId: string, requestAs: 'guardian' | 'child') => {
      const actionKey = `create:${requestAs}:${targetUserId}`;
      setFamilyStructureActionKey(actionKey);
      try {
        await client.request(`/v1/rooms/${roomId}/relationships`, {
          method: 'POST',
          body: JSON.stringify({ targetUserId, as: requestAs }),
        });
        await refreshFamilyStructure(roomId);
      } catch (error) {
        Alert.alert('가족 관계 요청을 보내지 못했어요', normalizeErrorMessage(error));
      } finally {
        setFamilyStructureActionKey('');
      }
    },
    [client, refreshFamilyStructure]
  );

  const respondFamilyRelationship = useCallback(
    async (roomId: string, relationshipId: string, decision: 'accept' | 'reject') => {
      setFamilyStructureActionKey(`respond:${decision}:${relationshipId}`);
      try {
        await client.request(`/v1/rooms/${roomId}/relationships/${relationshipId}/respond`, {
          method: 'POST',
          body: JSON.stringify({ decision }),
        });
        await refreshFamilyStructure(roomId);
        await refreshPeople().catch(() => null);
      } catch (error) {
        Alert.alert('가족 관계 요청을 처리하지 못했어요', normalizeErrorMessage(error));
      } finally {
        setFamilyStructureActionKey('');
      }
    },
    [client, refreshFamilyStructure, refreshPeople]
  );

  const deleteFamilyRelationship = useCallback(
    async (roomId: string, relationshipId: string) => {
      setFamilyStructureActionKey(`delete:${relationshipId}`);
      try {
        await client.request(`/v1/rooms/${roomId}/relationships/${relationshipId}`, { method: 'DELETE' });
        await refreshFamilyStructure(roomId);
        await refreshPeople().catch(() => null);
      } catch (error) {
        Alert.alert('가족 관계를 변경하지 못했어요', normalizeErrorMessage(error));
      } finally {
        setFamilyStructureActionKey('');
      }
    },
    [client, refreshFamilyStructure, refreshPeople]
  );

  const searchFriendCandidates = useCallback(async () => {
    const query = friendSearchQuery.trim().toLowerCase();
    if (!query) {
      setFriendSearchMessage('검색할 이메일을 입력해 주세요.');
      setFriendSearchResults([]);
      return;
    }
    if (!EMAIL_PATTERN.test(query)) {
      setFriendSearchMessage('올바른 이메일 형식으로 입력해 주세요.');
      setFriendSearchResults([]);
      return;
    }

    setFriendSearching(true);
    setFriendSearchMessage('');
    try {
      const raw = await client.request<BackendFriendSearchUser[] | BackendListData<BackendFriendSearchUser>>(
        `/v1/friends/search?q=${encodeURIComponent(query)}&limit=20`,
        { method: 'GET' },
        { queue: false, rateLimitRetries: 1 }
      );
      const results = asListItems<BackendFriendSearchUser>(raw)
        .filter((item) =>
          !!item.id &&
          !!item.name &&
          String(item.email || '').trim().toLowerCase() === query
        )
        .map((item): FriendSearchResult => ({
          id: String(item.id),
          name: String(item.name),
          status: String(item.status || '').trim(),
          email: String(item.email || '').trim(),
          avatarUri: resolveUri(item.avatarUri) || undefined,
          isFriend: !!item.isFriend,
          outgoingPending: !!item.outgoingPending,
          incomingPending: !!item.incomingPending,
        }));
      setFriendSearchResults(results);
      if (!results.length) setFriendSearchMessage('일치하는 사용자를 찾지 못했습니다.');
    } catch (error) {
      setFriendSearchResults([]);
      setFriendSearchMessage(normalizeErrorMessage(error));
    } finally {
      setFriendSearching(false);
    }
  }, [client, friendSearchQuery, resolveUri]);

  const sendFriendRequest = useCallback(
    async (targetUserId: string) => {
      setPeopleActionKey(`send:${targetUserId}`);
      try {
        await client.request('/v1/friends/requests', {
          method: 'POST',
          body: JSON.stringify({ targetUserId }),
        });
        setFriendSearchResults((prev) =>
          prev.map((item) =>
            item.id === targetUserId ? { ...item, outgoingPending: true, incomingPending: false } : item
          )
        );
        await refreshPeople();
      } catch (error) {
        Alert.alert('친구 요청을 보내지 못했습니다.', normalizeErrorMessage(error));
      } finally {
        setPeopleActionKey('');
      }
    },
    [client, refreshPeople]
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string) => {
      const acceptedUserId = friendRequests.find((request) => request.id === requestId)?.userId || '';
      setPeopleActionKey(`accept:${requestId}`);
      try {
        await client.request(`/v1/friends/requests/${requestId}/accept`, { method: 'POST' });
        setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
        if (acceptedUserId) {
          setFriendSearchResults((prev) =>
            prev.map((item) =>
              item.id === acceptedUserId
                ? { ...item, isFriend: true, incomingPending: false, outgoingPending: false }
                : item
            )
          );
        }
        await Promise.all([refreshPeople(), refreshRooms()]);
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setPeopleActionKey('');
      }
    },
    [client, friendRequests, refreshPeople, refreshRooms]
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string) => {
      setPeopleActionKey(`reject:${requestId}`);
      try {
        await client.request(`/v1/friends/requests/${requestId}/reject`, { method: 'POST' });
        setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
        await refreshPeople();
      } catch (error) {
        Alert.alert(normalizeErrorMessage(error));
      } finally {
        setPeopleActionKey('');
      }
    },
    [client, refreshPeople]
  );

  const handleRealtimeEvent = useCallback(
    (payload: RealtimeEvent) => {
      if (payload.event === 'message.new' && payload.data) {
        const roomId = String(payload.data.roomId || '');
        const rawMessage = payload.data.message as BackendRoomMessage | undefined;
        if (!roomId || !rawMessage) return;
        const mapped = mapMessageForApp({ ...rawMessage, roomId: rawMessage.roomId || roomId }, roomId);
        if (!mapped) return;
        const incoming = mapped.senderId !== currentUserIdRef.current;
        upsertMessage(roomId, mapped, incoming);
        if (isRoomVisible(roomId)) {
          void markRoomAsRead(roomId, [mapped]).catch(() => null);
        }
        return;
      }

      if (payload.event === 'message.delivery' && payload.data) {
        const roomId = String(payload.data.roomId || '');
        const messageId = String(payload.data.messageId || '');
        const delivery = String(payload.data.delivery || '') as Message['delivery'];
        const readByUserId = String(payload.data.byUserId || '').trim();
        if (
          !roomId ||
          !messageId ||
          !delivery ||
          !['sent', 'delivered', 'read'].includes(delivery)
        ) return;
        const deliveryAt = Date.parse(String(payload.data.at || ''));
        const roomType = roomsRef.current.find((room) => room.id === roomId)?.type;
        const roomIsGroup = roomType === 'group' || roomType === 'family';
        setMessages((prev) => {
          const roomMessages = prev[roomId] || [];
          const readThroughIndex =
            delivery === 'read' && !roomIsGroup && readByUserId !== currentUserIdRef.current
              ? roomMessages.findIndex((message) => message.id === messageId)
              : -1;
          const next = {
            ...prev,
            [roomId]: roomMessages.map((message, index) => {
              const peerActuallyRead =
                delivery === 'read' &&
                !roomIsGroup &&
                !!readByUserId &&
                readByUserId !== currentUserIdRef.current;
              const withinPeerReadRange =
                readThroughIndex >= 0
                  ? index <= readThroughIndex
                  : Number.isFinite(deliveryAt) && message.at <= deliveryAt;
              if (
                peerActuallyRead &&
                withinPeerReadRange &&
                message.senderId === currentUserIdRef.current
              ) {
                return { ...message, delivery: 'read' as const, unreadCount: 0 };
              }
              return message.id === messageId
                ? {
                    ...message,
                    ...(delivery !== 'read' || roomIsGroup || peerActuallyRead ? { delivery } : {}),
                    ...(peerActuallyRead ? { unreadCount: 0 } : {}),
                  }
                : message;
            }),
          };
          messagesRef.current = next;
          return next;
        });
        if (delivery === 'read' && roomIsGroup && activeRoomRef.current === roomId) {
          setTimeout(() => void loadRoomMessages(roomId).catch(() => null), 250);
        }
        return;
      }

      if (payload.event === 'room.unread.updated' && payload.data) {
        const roomId = String(payload.data.roomId || '');
        const unread = Number(payload.data.unread || 0);
        if (!roomId || !Number.isFinite(unread)) return;
        setRooms((prev) => {
          const next = prev.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  unread: isRoomVisible(roomId) ? 0 : Math.max(0, unread),
                  ...(isRoomVisible(roomId) || unread === 0 ? { firstUnreadMessageId: undefined } : {}),
                }
              : room
          );
          roomsRef.current = next;
          return next;
        });
        return;
      }

      if (payload.event === 'room.updated' || payload.event === 'room.invitation.updated') {
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
    },
    [
      loadRoomMessages,
      isRoomVisible,
      mapMessageForApp,
      markRoomAsRead,
      refreshPeople,
      refreshRooms,
      startLocationCapture,
      upsertMessage,
    ]
  );

  const realtimeUrl = session?.accessToken
    ? `${toWsBaseUrl(client.getBaseUrl())}/v1/ws?token=${encodeURIComponent(session.accessToken)}`
    : '';
  const realtimeState = useRealtimeConnection({
    enabled:
      appState === 'active' &&
      serverState === 'ready' &&
      (authState === 'ready' || authState === 'degraded') &&
      !!session?.accessToken,
    url: realtimeUrl,
    onEvent: handleRealtimeEvent,
    onConnected: () => {
      setErrorMessage((current) => (current === REALTIME_UNSTABLE_MESSAGE ? '' : current));
    },
    onUnstable: () => {
      setErrorMessage((current) => current || REALTIME_UNSTABLE_MESSAGE);
    },
  });

  const activeRoom = useMemo(
    () => (activeRoomId ? rooms.find((room) => room.id === activeRoomId) || null : null),
    [activeRoomId, rooms]
  );
  const viewingUser = viewingUserId ? users[viewingUserId] || null : null;

  useEffect(() => {
    if (Platform.OS !== 'android' || tab !== 'me' || serverState !== 'ready') return;
    if (authState !== 'ready' && authState !== 'degraded') return;
    if (appUpdate.checked || appUpdate.checking) return;
    void checkAppUpdate();
  }, [appUpdate.checked, appUpdate.checking, authState, checkAppUpdate, serverState, tab]);

  const visibleRooms = useMemo(
    () => rooms.map((room) => normalizeRoomTitle(room, users, profile.id)),
    [profile.id, rooms, users]
  );

  const familyRooms = useMemo(
    () => visibleRooms.filter((room) => room.type === 'family'),
    [visibleRooms]
  );
  const primaryFamilyRoom = familyRooms[0] || null;
  const familyRelationshipRoom = familyRelationshipRoomId
    ? familyRooms.find((room) => room.id === familyRelationshipRoomId) || null
    : null;

  useEffect(() => {
    if (tab !== 'family' || !sessionRef.current?.accessToken) return;
    void refreshFamilyStructures(familyRooms);
    if (primaryFamilyRoom) void refreshFamilyRoomLocations(primaryFamilyRoom.id);
  }, [familyRooms, primaryFamilyRoom, refreshFamilyRoomLocations, refreshFamilyStructures, tab]);

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
        <ConnectionBanner state={realtimeState} onRetry={() => void refreshAll()} />
        <RoomScreen
          room={normalizeRoomTitle(activeRoom, users, profile.id)}
          users={users}
          currentUserId={profile.id}
          messages={messages[activeRoom.id] || []}
          initialUnreadCount={activeRoomInitialUnread}
          firstUnreadMessageId={activeRoomFirstUnreadMessageId}
          draft={draft}
          attachment={attachment}
          loading={roomLoading}
          errorMessage={roomErrorMessage}
          sending={sending}
          retryingMessageId={retryingMessageId}
          roomActionKey={roomActionKey}
          onDraftChange={setDraft}
          onBack={closeRoom}
          onRetryLoad={() => void openRoom(activeRoom.id)}
          onSend={sendMessage}
          onPickAttachment={(kind) => void pickAttachment(kind)}
          onRemoveAttachment={() => setAttachment(null)}
          onRetryAttachment={sendMessage}
          onRetryMessage={retryMessage}
          onOpenProfile={setViewingUserId}
          onToggleFavorite={() => void updateRoomSettings(activeRoom.id, { favorite: !activeRoom.favorite })}
          onToggleMuted={() => void updateRoomSettings(activeRoom.id, { muted: !activeRoom.muted })}
        />
        <UserProfileModal user={viewingUser} onClose={() => setViewingUserId('')} />
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ConnectionBanner state={realtimeState} onRetry={() => void refreshAll()} />
      <View style={styles.body}>
        {tab === 'chats' ? (
          <ChatsScreen
            rooms={visibleRooms}
            messages={messages}
            users={users}
            currentUserId={profile.id}
            query={chatQuery}
            loading={refreshing}
            syncMessage={syncMessage || (errorMessage === REALTIME_UNSTABLE_MESSAGE ? '' : errorMessage)}
            onQueryChange={setChatQuery}
            onOpenRoom={openRoom}
            onRefresh={() => void refreshAll()}
          />
        ) : null}
        {tab === 'people' ? (
          <PeopleScreen
            users={users}
            currentUserId={profile.id}
            requests={friendRequests}
            loading={refreshing}
            actionKey={peopleActionKey}
            onRefresh={() => void refreshAll()}
            onAddFriend={() => setFriendSearchOpen(true)}
            onOpenPerson={openPerson}
            onOpenProfile={setViewingUserId}
            onAcceptRequest={acceptFriendRequest}
            onRejectRequest={rejectFriendRequest}
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
            familyStructures={familyStructures}
            familyStructureLoading={familyStructureLoading}
            onToggleLocationConsent={() => void toggleLocationConsent()}
            onRefresh={() => void refreshAll()}
            onCreateFamily={() => setFamilyCreateOpen(true)}
            onManageRelationships={openFamilyRelationships}
            onOpenRoom={openRoom}
            onRefreshLocations={(roomId) => void refreshFamilyRoomLocations(roomId)}
            onRequestLocation={(roomId, userId) => void requestFamilyLocationRefresh(roomId, userId)}
            onOpenLocationMap={(latitude, longitude) => void openLocationMap(latitude, longitude)}
          />
        ) : null}
        {tab === 'ai' ? <OnDeviceAiScreen /> : null}
        {tab === 'me' ? (
          <ProfileScreen
            profile={profile}
            rooms={visibleRooms}
            serverLabel={serverEnvironment}
            syncMessage={syncMessage}
            busy={profileBusy}
            updateSupported={Platform.OS === 'android'}
            currentAppVersion={currentAppVersion}
            appUpdate={appUpdate}
            appUpdateInstallPhase={appUpdateInstallPhase}
            onPickAvatar={() => void pickProfileAvatar()}
            onCheckUpdate={() => void checkAppUpdate()}
            onInstallUpdate={() => void installAppUpdate()}
            onToggleServer={toggleServerEnvironment}
            onSignOut={() => void handleSignOut()}
          />
        ) : null}
      </View>
      {!keyboardVisible ? (
        <LinearGradient
          colors={gradients.nav}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <BottomNav active={tab} onChange={navigateTab} />
        </LinearGradient>
      ) : null}
      <FriendSearchModal
        visible={friendSearchOpen}
        query={friendSearchQuery}
        results={friendSearchResults}
        requests={friendRequests}
        message={friendSearchMessage}
        searching={friendSearching}
        actionKey={peopleActionKey}
        onQueryChange={(value) => {
          setFriendSearchQuery(value);
          setFriendSearchMessage('');
          if (!value.trim()) setFriendSearchResults([]);
        }}
        onSearch={() => void searchFriendCandidates()}
        onSendRequest={(userId) => void sendFriendRequest(userId)}
        onAcceptRequest={(requestId) => void acceptFriendRequest(requestId)}
        onClose={() => setFriendSearchOpen(false)}
      />
      <CreateFamilyRoomModal
        visible={familyCreateOpen}
        users={users}
        currentUserId={profile.id}
        busy={familyCreateBusy}
        onCreate={(title, memberUserIds) => void createFamilyRoom(title, memberUserIds)}
        onAddFriend={() => {
          setFamilyCreateOpen(false);
          setFriendSearchOpen(true);
        }}
        onClose={() => {
          if (!familyCreateBusy) setFamilyCreateOpen(false);
        }}
      />
      <FamilyRelationshipModal
        visible={!!familyRelationshipRoom}
        room={familyRelationshipRoom}
        structure={familyRelationshipRoom ? familyStructures[familyRelationshipRoom.id] : undefined}
        currentUserId={profile.id}
        loading={familyStructureLoading}
        actionKey={familyStructureActionKey}
        onRefresh={(roomId) => void refreshFamilyStructure(roomId)}
        onRequest={(roomId, targetUserId, requestAs) => void createFamilyRelationship(roomId, targetUserId, requestAs)}
        onRespond={(roomId, relationshipId, decision) => void respondFamilyRelationship(roomId, relationshipId, decision)}
        onDelete={(roomId, relationshipId) => {
          Alert.alert(
            '가족 관계를 변경할까요?',
            '연결된 관계는 해제되고, 대기 중인 요청은 취소됩니다.',
            [
              { text: '돌아가기', style: 'cancel' },
              { text: '변경', style: 'destructive', onPress: () => void deleteFamilyRelationship(roomId, relationshipId) },
            ]
          );
        }}
        onClose={() => {
          if (!familyStructureActionKey) setFamilyRelationshipRoomId('');
        }}
      />
      <ProfilePhotoCropModal
        sourceUri={profileCropSourceUri}
        onCancel={() => {
          if (!profileBusy) setProfileCropSourceUri('');
        }}
        onApply={applyCroppedProfileAvatar}
      />
      <UserProfileModal user={viewingUser} onClose={() => setViewingUserId('')} />
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
