import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
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
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

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

const MY_ID = 'me';
const LINK = /https?:\/\/\S+/gi;

const TEXT = {
  en: {
    app: 'Our Hangout',
    login: 'Sign in',
    loginBody: 'Use Google sign-in, then set your profile.',
    google: 'Continue with Google',
    loginSkip: 'Continue without sign-in',
    loginHint: 'Set app.json extra.googleAuth to enable Google login.',
    loginFailed: 'Google sign-in failed.',
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
    safe: 'Browser links are blocked',
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
    loginHint: 'Google 로그인은 app.json extra.googleAuth 설정이 필요해요.',
    loginFailed: 'Google 로그인에 실패했어요.',
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
    safe: '브라우저 링크는 차단돼요',
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
const safeText = (value: string, blocked: string) => value.replace(LINK, `[${blocked}]`);

const randomReply = (isKo: boolean) => {
  const arr = isKo
    ? ['Sounds good!', 'Okay, I will reply soon.', 'Great idea.']
    : ['Looks good!', 'Got it!', 'Great idea.'];
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
};

function App() {
  const locale = useMemo(localeKey, []);
  const s = TEXT[locale];
  const isKo = locale === 'ko';
  const insets = useSafeAreaInsets();

  const g =
    ((Constants.expoConfig?.extra as {
      googleAuth?: { androidClientId?: string; iosClientId?: string; webClientId?: string };
    } | undefined)?.googleAuth ?? {});

  const hasGoogle = !!Platform.select({
    android: g.androidClientId,
    ios: g.iosClientId,
    default: g.webClientId,
  });

  const [googleReq, googleRes, googlePrompt] = Google.useAuthRequest({
    androidClientId: g.androidClientId,
    iosClientId: g.iosClientId,
    webClientId: g.webClientId,
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'ourhangout' }),
    scopes: ['openid', 'profile', 'email'],
  });

  const [stage, setStage] = useState<Stage>('login');
  const [tab, setTab] = useState<Tab>('chats');
  const [profile, setProfile] = useState<Profile>({ name: '', status: '', email: '', avatarUri: '' });
  const [nameDraft, setNameDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [profilePhotoDraft, setProfilePhotoDraft] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const activeRoomRef = useRef<string | null>(null);

  const [chatQuery, setChatQuery] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  const [input, setInput] = useState('');
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);

  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friendNameDraft, setFriendNameDraft] = useState('');
  const [friendStatusDraft, setFriendStatusDraft] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [roomMenuId, setRoomMenuId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!googleRes || googleRes.type !== 'success') return;
      const token = googleRes.authentication?.accessToken;
      if (!token) return;
      try {
        const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!me.ok) throw new Error('failed');
        const info = (await me.json()) as { name?: string; email?: string; picture?: string };
        if (cancelled) return;
        setProfile((p) => ({
          ...p,
          name: info.name?.trim() || p.name,
          email: info.email?.trim() || p.email,
          avatarUri: p.avatarUri || info.picture?.trim() || '',
        }));
        setNameDraft(info.name?.trim() || '');
        setStage('setup_name');
      } catch {
        if (!cancelled) setLoginErr(s.loginFailed);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [googleRes, s.loginFailed]);

  const setRoomMsgs = (rid: string, updater: (prev: Message[]) => Message[]) =>
    setMessages((p) => ({ ...p, [rid]: updater(p[rid] ?? []) }));

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
    const text = safeText(input.trim(), isKo ? '留곹겕李⑤떒' : 'blocked-link');
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
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'image' ? 'images' : 'videos'],
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: 120,
    });
    if (r.canceled || !r.assets.length) return;
    setDraftMedia({ kind: r.assets[0].type === 'video' ? 'video' : 'image', uri: r.assets[0].uri });
  };

  const pickProfilePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (r.canceled || !r.assets.length) return;
    setProfilePhotoDraft(r.assets[0].uri);
  };

  const startGoogle = async () => {
    setLoginErr('');
    if (!hasGoogle || !googleReq) {
      setLoginErr(s.loginHint);
      return;
    }
    const res = await googlePrompt();
    if (res.type !== 'success' && res.type !== 'dismiss' && res.type !== 'cancel') {
      setLoginErr(s.loginFailed);
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

  if (stage === 'login') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0A132F', '#1A3A7A']} style={styles.fill}>
          <View style={styles.centerCard}>
            <Text style={styles.brand}>{s.app}</Text>
            <Text style={styles.h1}>{s.login}</Text>
            <Text style={styles.sub}>{s.loginBody}</Text>
            <Pressable style={styles.btn} onPress={startGoogle}>
              <Text style={styles.btnText}>{s.google}</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => setStage('setup_name')}>
              <Text style={styles.link}>{s.loginSkip}</Text>
            </Pressable>
            <Text style={styles.sub}>{loginErr || s.loginHint}</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (stage === 'setup_name' || stage === 'setup_intro') {
    const isName = stage === 'setup_name';
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0A132F', '#1A3A7A']} style={styles.fill}>
          <KeyboardAvoidingView style={styles.fill} behavior={kbBehavior}>
            <View style={styles.centerCard}>
              <Text style={styles.h1}>{isName ? s.setup1 : s.setup2}</Text>
              {isName ? (
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={s.displayName}
                  style={styles.field}
                  placeholderTextColor="#7385A8"
                />
              ) : null}
              {!isName ? (
                <Pressable style={styles.linkBtn} onPress={() => setStage('setup_name')}>
                  <Text style={styles.link}>{s.editName}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.btn, isName && !nameDraft.trim() && styles.off]}
                onPress={() => {
                  if (isName) {
                    setProfile((p) => ({ ...p, name: nameDraft.trim() }));
                    setStage('setup_intro');
                    return;
                  }
                  if (!profile.status) {
                    setProfile((p) => ({ ...p, status: s.defaultStatus }));
                  }
                  setStage('app');
                }}
                disabled={isName && !nameDraft.trim()}
              >
                <Text style={styles.btnText}>{isName ? s.next : s.start}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0A132F', '#1A3A7A']} style={styles.fill}>
        <KeyboardAvoidingView
          style={[styles.fill, { paddingBottom: Math.max(8, insets.bottom) }]}
          behavior={kbBehavior}
        >
          {activeRoom ? (
            <>
              <View style={styles.header}>
                <Pressable style={styles.iconDark} onPress={() => setActiveRoomId(null)}>
                  <Ionicons name="chevron-back" size={16} color="#EFF9FF" />
                </Pressable>
                <Text style={styles.title}>{roomTitle(activeRoom)}</Text>
                <Pressable style={styles.iconDark} onPress={() => setRoomMenuId(activeRoom.id)}>
                  <Ionicons name="ellipsis-horizontal" size={16} color="#EFF9FF" />
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
                          {m.kind === 'text' ? <Text style={[styles.msg, m.mine && styles.msgMine]}>{m.text}</Text> : null}
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
                      <Ionicons name="close-circle" size={18} color="#E7F4FF" />
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <Pressable style={styles.iconLight} onPress={() => pickMedia('image')}>
                    <Ionicons name="image" size={16} color="#ECF9FF" />
                  </Pressable>
                  <Pressable style={styles.iconLight} onPress={() => pickMedia('video')}>
                    <Ionicons name="videocam" size={16} color="#ECF9FF" />
                  </Pressable>
                  <TextInput
                    style={styles.composerInput}
                    placeholder={s.msgInput}
                    placeholderTextColor="#7385A8"
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
                    <Ionicons name="person-circle" size={16} color="#EFF9FF" />
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
                      placeholderTextColor="#7385A8"
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
                                <Ionicons name={r.favorite ? 'star' : 'star-outline'} size={14} color={r.favorite ? '#FFD56A' : '#ECF9FF'} />
                              </Pressable>
                              <Pressable style={styles.iconLight} onPress={() => setRoomMenuId(r.id)}>
                                <Ionicons name="ellipsis-horizontal" size={14} color="#ECF9FF" />
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
                      placeholderTextColor="#7385A8"
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
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemTitle}>{f.name}</Text>
                              <Text style={styles.sub}>{f.status || s.startChat}</Text>
                            </View>
                            <Pressable style={styles.iconLight} onPress={() => toggleTrusted(f.id)}>
                              <Ionicons name={f.trusted ? 'shield-checkmark' : 'shield-outline'} size={14} color="#ECF9FF" />
                            </Pressable>
                            <Pressable style={styles.iconLight} onPress={() => openRoom(ensureDirectRoom(f.id))}>
                              <Ionicons name="chatbubble-ellipses" size={14} color="#ECF9FF" />
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
                  <Text style={styles.tabText}>{s.tabsChats}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'friends' && styles.tabOn]} onPress={() => setTab('friends')}>
                  <Text style={styles.tabText}>{s.tabsFriends}</Text>
                </Pressable>
                <Pressable style={[styles.tab, tab === 'profile' && styles.tabOn]} onPress={() => setTab('profile')}>
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
                  placeholderTextColor="#7385A8"
                  value={friendNameDraft}
                  onChangeText={setFriendNameDraft}
                />
                <TextInput
                  style={styles.field}
                  placeholder={s.friendStatus}
                  placeholderTextColor="#7385A8"
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
                  placeholderTextColor="#7385A8"
                  value={groupNameDraft}
                  onChangeText={setGroupNameDraft}
                />
                <Text style={styles.sub}>{s.groupHint}</Text>
                <ScrollView style={{ maxHeight: 180 }}>
                  {friends.map((f) => (
                    <Pressable key={f.id} style={styles.item} onPress={() => toggleGroupPick(f.id)}>
                      <Text style={styles.itemTitle}>{f.name}</Text>
                      <Ionicons name={groupPick.includes(f.id) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color="#E7F4FF" />
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
                <Text style={styles.sub}>{s.profilePhoto}</Text>
                <View style={styles.profilePhotoRow}>
                  {profilePhotoDraft ? (
                    <Image source={{ uri: profilePhotoDraft }} style={styles.profilePhotoPreview} />
                  ) : (
                    <View style={styles.profilePhotoPreviewFallback}>
                      <Ionicons name="person" size={24} color="#EAF7FF" />
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
                  </View>
                </View>
                <TextInput
                  style={styles.field}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder={s.displayName}
                  placeholderTextColor="#7385A8"
                />
                <TextInput
                  style={styles.field}
                  value={statusDraft}
                  onChangeText={setStatusDraft}
                  placeholder={s.myStatus}
                  placeholderTextColor="#7385A8"
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
  safe: { flex: 1, backgroundColor: '#0A132F' },
  fill: { flex: 1 },
  centerCard: {
    margin: 16,
    marginTop: 40,
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 10,
  },
  brand: { color: '#F7FAFF', fontSize: 28, textAlign: 'center', fontWeight: '700' },
  h1: { color: '#F7FAFF', fontSize: 18, fontWeight: '700' },
  title: { color: '#F7FAFF', fontSize: 16, fontWeight: '700', flex: 1 },
  sub: { color: 'rgba(245,250,255,0.78)', fontSize: 11 },
  btn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(114,214,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(170,232,255,0.5)',
  },
  btnText: { color: '#F2FAFF', fontSize: 12, fontWeight: '700' },
  smallBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(114,214,255,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(170,232,255,0.4)',
  },
  smallBtnText: { color: '#F2FAFF', fontSize: 11, fontWeight: '700' },
  linkBtn: { alignSelf: 'flex-start' },
  link: { color: '#CFEFFF', fontSize: 12, fontWeight: '700' },
  off: { opacity: 0.45 },
  header: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconDark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: { width: 24, height: 24, borderRadius: 12 },
  iconLight: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: 16,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  list: { gap: 8, paddingBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  item: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: { color: '#F7FAFF', fontSize: 13, fontWeight: '700' },
  itemRight: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  profileHero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: { width: '100%', height: '100%' },
  profileAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,214,255,0.32)',
  },
  profileAvatarText: { color: '#F7FAFF', fontSize: 24, fontWeight: '700' },
  profileMeta: { flex: 1, gap: 2 },
  profileStatus: { color: '#EAF7FF', fontSize: 12, fontWeight: '600' },
  stat: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tabs: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 14,
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    gap: 6,
  },
  tab: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  tabOn: { backgroundColor: 'rgba(114,214,255,0.28)' },
  tabText: { color: '#F2FAFF', fontSize: 11, fontWeight: '700' },
  bubbleRow: { width: '100%' },
  mineRow: { alignItems: 'flex-end' },
  otherRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '90%', borderRadius: 14, padding: 10 },
  mineBubble: { backgroundColor: '#2E88FF' },
  otherBubble: { backgroundColor: 'rgba(255,255,255,0.9)' },
  msg: { color: '#18305D', fontSize: 13, fontWeight: '600' },
  msgMine: { color: '#F4FBFF' },
  meta: { marginTop: 4, color: 'rgba(20,50,95,0.64)', fontSize: 10 },
  metaMine: { color: 'rgba(240,252,255,0.84)' },
  system: { color: '#604A14', fontSize: 11, fontWeight: '700' },
  media: { width: 180, height: 130, borderRadius: 10, backgroundColor: '#163A76' },
  video: { alignItems: 'center', justifyContent: 'center' },
  composer: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 14,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 6,
  },
  draft: {
    borderRadius: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  field: {
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F4F8FF',
    color: '#172A4E',
    fontSize: 13,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F4F8FF',
    color: '#172A4E',
    fontSize: 13,
  },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E88FF' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F86B8E' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  empty: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheetWrap: { width: '100%' },
  sheet: {
    margin: 14,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(8,20,48,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(157,224,255,0.4)',
    gap: 8,
  },
  profilePhotoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  profilePhotoPreview: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#163A76' },
  profilePhotoPreviewFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(114,214,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePhotoActions: { gap: 8 },
});

export default App;

