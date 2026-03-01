import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

type MessageKind = 'text' | 'image' | 'video';

type Message = {
  id: string;
  kind: MessageKind;
  mine: boolean;
  text?: string;
  uri?: string;
  timestamp: string;
};

type DraftMedia = {
  kind: 'image' | 'video';
  uri: string;
};

const LOCALE_STRINGS = {
  en: {
    appTitle: 'Our Hangout',
    safeModeEnabled: 'Safe mode enabled',
    seedMessageOther: 'How are you today? You can send photos too.',
    seedMessageMine: 'Great! I will show the drawing I made today.',
    autoReply: 'Looks great. Send the next one too.',
    videoMessage: 'Video message',
    videoPreviewHint: 'preview disabled in Expo Go',
    imageReady: 'Image ready',
    videoReady: 'Video ready',
    tapSendHint: 'Tap send to share.',
    inputPlaceholder: 'Type a message',
    linksBlocked: 'Links are blocked in this app.',
    linkBlockedInline: 'link blocked',
  },
  ko: {
    appTitle: '우리들의아지트',
    safeModeEnabled: '안전 모드 활성화',
    seedMessageOther: '오늘 기분 어때? 사진도 보내도 돼.',
    seedMessageMine: '좋아! 오늘 만든 그림 보여줄게.',
    autoReply: '잘 받았어. 다음 것도 보내줘.',
    videoMessage: '동영상 메시지',
    videoPreviewHint: 'Expo Go에서는 미리보기가 비활성화됩니다',
    imageReady: '이미지 준비 완료',
    videoReady: '동영상 준비 완료',
    tapSendHint: '전송 버튼을 눌러 공유하세요.',
    inputPlaceholder: '메시지를 입력하세요',
    linksBlocked: '이 앱에서는 링크가 차단됩니다.',
    linkBlockedInline: '링크 차단됨',
  },
} as const;

type LocaleKey = keyof typeof LOCALE_STRINGS;
type LocaleStrings = (typeof LOCALE_STRINGS)[LocaleKey];

const LINK_REGEX = /https?:\/\/\S+/gi;

const resolveLocaleKey = (): LocaleKey => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase() ?? 'en';
  return locale.startsWith('ko') ? 'ko' : 'en';
};

const seedMessages = (strings: LocaleStrings): Message[] => [
  {
    id: 'm1',
    kind: 'text',
    mine: false,
    text: strings.seedMessageOther,
    timestamp: '09:12',
  },
  {
    id: 'm2',
    kind: 'text',
    mine: true,
    text: strings.seedMessageMine,
    timestamp: '09:13',
  },
  {
    id: 'm3',
    kind: 'image',
    mine: true,
    uri: 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=800&q=80',
    timestamp: '09:14',
  },
];

const safeText = (value: string, blockedLabel: string) => value.replace(LINK_REGEX, `[${blockedLabel}]`);

const getStamp = () =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const makeId = () => `${Date.now()}-${Math.round(Math.random() * 100000)}`;

type BubbleProps = {
  message: Message;
  index: number;
  strings: LocaleStrings;
};

function MessageBubble({ message, index, strings }: BubbleProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 320,
        delay: index * 45,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 420,
        delay: index * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise, index]);

  const body = (
    <>
      {message.kind === 'text' && <Text style={[styles.messageText, message.mine && styles.messageTextMine]}>{message.text}</Text>}
      {message.kind === 'image' && (
        <Image source={{ uri: message.uri }} style={styles.messageMedia} resizeMode="cover" />
      )}
      {message.kind === 'video' && (
        <View style={[styles.messageMedia, styles.videoCard]}>
          <Ionicons name="play-circle" size={40} color="#E7F4FF" />
          <Text style={styles.videoCardTitle}>{strings.videoMessage}</Text>
          <Text style={styles.videoCardHint}>{strings.videoPreviewHint}</Text>
        </View>
      )}
      <Text style={[styles.timestamp, message.mine && styles.timestampMine]}>{message.timestamp}</Text>
    </>
  );

  return (
    <Animated.View
      style={[
        styles.messageRow,
        message.mine ? styles.mineRow : styles.otherRow,
        {
          opacity: fade,
          transform: [{ translateY: rise }],
        },
      ]}
    >
      {!message.mine && (
        <View style={styles.avatarMini}>
          <Text style={styles.avatarMiniText}>A</Text>
        </View>
      )}
      {message.mine ? (
        <LinearGradient colors={['#4DCEFF', '#2D8FFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.myBubble}>
          {body}
        </LinearGradient>
      ) : (
        <View style={styles.otherBubble}>{body}</View>
      )}
    </Animated.View>
  );
}

export default function App() {
  const [localeKey] = useState<LocaleKey>(resolveLocaleKey());
  const strings = LOCALE_STRINGS[localeKey];

  const [messages, setMessages] = useState<Message[]>(() => seedMessages(strings));
  const [input, setInput] = useState('');
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const headerIn = useRef(new Animated.Value(0)).current;
  const chatIn = useRef(new Animated.Value(0)).current;
  const composerIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerIn, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(chatIn, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(composerIn, {
          toValue: 1,
          duration: 420,
          delay: 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [headerIn, chatIn, composerIn]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 90);
    return () => clearTimeout(timer);
  }, [messages, draftMedia]);

  const sendMessage = () => {
    const sanitized = safeText(input.trim(), strings.linkBlockedInline);
    if (!sanitized && !draftMedia) {
      return;
    }

    const now = getStamp();

    if (sanitized) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          kind: 'text',
          mine: true,
          text: sanitized,
          timestamp: now,
        },
      ]);
    }

    if (draftMedia) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          kind: draftMedia.kind,
          mine: true,
          uri: draftMedia.uri,
          timestamp: now,
        },
      ]);
      setDraftMedia(null);
    }

    setInput('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          kind: 'text',
          mine: false,
          text: strings.autoReply,
          timestamp: getStamp(),
        },
      ]);
    }, 850);
  };

  const pickMedia = async (kind: 'image' | 'video') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'image' ? 'images' : 'videos'],
      allowsEditing: kind === 'image',
      quality: 0.9,
      videoMaxDuration: 120,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const asset = result.assets[0];
    const pickedKind: DraftMedia['kind'] = asset.type === 'video' ? 'video' : 'image';

    setDraftMedia({
      kind: pickedKind,
      uri: asset.uri,
    });
  };

  const canSend = input.trim().length > 0 || !!draftMedia;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={['#060C21', '#123070', '#1C5DA5']} style={styles.gradient}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerIn,
                transform: [
                  {
                    translateY: headerIn.interpolate({
                      inputRange: [0, 1],
                      outputRange: [26, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.headerLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>AK</Text>
              </View>
              <View>
                <Text style={styles.title}>{strings.appTitle}</Text>
                <Text style={styles.subtitle}>{strings.safeModeEnabled}</Text>
              </View>
            </View>
            <View style={styles.headerBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#0D3C8F" />
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.chatCard,
              {
                opacity: chatIn,
                transform: [
                  {
                    translateY: chatIn.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.messagesWrap}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((message, index) => (
                <MessageBubble key={message.id} message={message} index={index} strings={strings} />
              ))}
            </ScrollView>
          </Animated.View>

          <Animated.View
            style={[
              styles.composerWrap,
              {
                opacity: composerIn,
                transform: [
                  {
                    translateY: composerIn.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {draftMedia && (
              <View style={styles.draftCard}>
                {draftMedia.kind === 'image' ? (
                  <Image source={{ uri: draftMedia.uri }} style={styles.draftMedia} resizeMode="cover" />
                ) : (
                  <View style={[styles.draftMedia, styles.videoDraftCard]}>
                    <Ionicons name="videocam" size={22} color="#E9F5FF" />
                  </View>
                )}
                <View style={styles.draftMeta}>
                  <Text style={styles.draftTitle}>
                    {draftMedia.kind === 'image' ? strings.imageReady : strings.videoReady}
                  </Text>
                  <Text style={styles.draftHint}>{strings.tapSendHint}</Text>
                </View>
                <Pressable style={styles.draftRemove} onPress={() => setDraftMedia(null)}>
                  <Ionicons name="close" size={18} color="#ffffff" />
                </Pressable>
              </View>
            )}

            <View style={styles.inputRow}>
              <Pressable style={styles.iconBtn} onPress={() => pickMedia('image')}>
                <Ionicons name="image" size={20} color="#0D3C8F" />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => pickMedia('video')}>
                <Ionicons name="videocam" size={20} color="#0D3C8F" />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={strings.inputPlaceholder}
                placeholderTextColor="#7C8AAC"
                style={styles.input}
                multiline
                maxLength={700}
                autoCorrect={false}
                autoComplete="off"
              />
              <Pressable onPress={sendMessage} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend}>
                <LinearGradient colors={canSend ? ['#52D8FF', '#2D8FFF'] : ['#A7B6D6', '#A7B6D6']} style={styles.sendGradient}>
                  <Ionicons name="arrow-up" size={18} color="#ffffff" />
                </LinearGradient>
              </Pressable>
            </View>

            <Text style={styles.guardText}>{strings.linksBlocked}</Text>
          </Animated.View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060C21',
  },
  loading: {
    flex: 1,
    backgroundColor: '#060C21',
  },
  gradient: {
    flex: 1,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(94, 229, 255, 0.18)',
  },
  glowTop: {
    top: -120,
    right: -90,
  },
  glowBottom: {
    bottom: -120,
    left: -80,
  },
  keyboard: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 12,
  },
  header: {
    marginTop: 4,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DFF7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#0C3586',
    fontFamily: 'Baloo2_700Bold',
    fontSize: 16,
  },
  title: {
    color: '#F8FBFF',
    fontFamily: 'Baloo2_700Bold',
    fontSize: 26,
    lineHeight: 28,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
  },
  headerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D5EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCard: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
  },
  messagesWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  messageRow: {
    maxWidth: '92%',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-end',
  },
  mineRow: {
    alignSelf: 'flex-end',
  },
  otherRow: {
    alignSelf: 'flex-start',
  },
  avatarMini: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220, 241, 255, 0.78)',
    marginBottom: 4,
  },
  avatarMiniText: {
    color: '#0C367F',
    fontFamily: 'Baloo2_700Bold',
    fontSize: 11,
  },
  myBubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  otherBubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.82)',
    maxWidth: '100%',
  },
  messageText: {
    color: '#1D2D53',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 21,
  },
  messageTextMine: {
    color: '#F8FDFF',
  },
  messageMedia: {
    width: 220,
    height: 160,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: '#071633',
  },
  videoCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#194A87',
  },
  videoCardTitle: {
    color: '#F1FAFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  videoCardHint: {
    color: 'rgba(232,245,255,0.85)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },
  timestamp: {
    color: 'rgba(36, 61, 97, 0.6)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10,
    marginTop: 4,
  },
  timestampMine: {
    color: 'rgba(255,255,255,0.8)',
  },
  composerWrap: {
    borderRadius: 24,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    gap: 8,
  },
  draftCard: {
    backgroundColor: 'rgba(7, 20, 50, 0.6)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  draftMedia: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#0A1836',
  },
  videoDraftCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#265F9E',
  },
  draftMeta: {
    flex: 1,
  },
  draftTitle: {
    color: '#F3FAFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  draftHint: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },
  draftRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF3FF',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 18,
    backgroundColor: '#F4F8FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#172646',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
  },
  sendBtn: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    opacity: 0.86,
  },
  sendGradient: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardText: {
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },
});
