import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeEventEmitter,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { NativeAiModelStorage, type NativeAiModelFile } from '../native';
import {
  getOnDeviceModels,
  isFolderPickerCancellation,
  normalizeOnDeviceAiError,
  onDeviceAiEngine,
  pickOnDeviceModelsDirectory,
  type OnDeviceChatMessage,
  type OnDeviceModelLoadProgress,
} from '../services/onDeviceAi';
import { colors, radius, spacing, type } from '../theme';

const guardianMascot = require('../../assets/forest-guardian.png');
const SELECTED_MODEL_KEY = 'on_device_ai:selected_model_v1';
const SELECTED_PROJECTOR_KEY = 'on_device_ai:selected_projector_v1';
const HISTORY_KEY = 'on_device_ai:history_v1';
const MAX_IMAGE_SIDE = 1280;

const STARTER_PROMPTS = [
  '오늘 있었던 일을 차분히 정리해 줘',
  '우리 가족이 함께할 작은 놀이를 추천해 줘',
  '내가 고른 사진을 같이 살펴봐 줘',
];

type Phase = 'idle' | 'scanning' | 'preparing' | 'loading' | 'ready' | 'generating' | 'stopping';
type StoredHistory = { modelUri: string; messages: OnDeviceChatMessage[] };
type LocalImage = { uri: string; width: number; height: number };

function createMessage(
  role: OnDeviceChatMessage['role'],
  content: string,
  imageUri?: string
): OnDeviceChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    imageUri,
  };
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '크기 정보 없음';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

function isVisionProjector(model: NativeAiModelFile) {
  return /(^|[-_.\s])(mmproj|projector)([-_.\s]|$)/i.test(model.name);
}

export function OnDeviceAiScreen() {
  const [models, setModels] = useState<NativeAiModelFile[]>([]);
  const [directoryName, setDirectoryName] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [selectedProjectorUri, setSelectedProjectorUri] = useState('');
  const [visionReady, setVisionReady] = useState(false);
  const [messages, setMessages] = useState<OnDeviceChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachedImage, setAttachedImage] = useState<LocalImage | null>(null);
  const [viewImageUri, setViewImageUri] = useState('');
  const [phase, setPhase] = useState<Phase>('scanning');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('지킴이가 기억을 살펴보고 있어요.');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const mountedRef = useRef(true);
  const messagesRef = useRef<OnDeviceChatMessage[]>([]);
  const selectedUriRef = useRef('');
  const selectedProjectorUriRef = useRef('');
  const listRef = useRef<FlatList<OnDeviceChatMessage> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const isNearBottomRef = useRef(true);
  const keyboardTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const chatModels = useMemo(() => models.filter((model) => !isVisionProjector(model)), [models]);
  const projectorModels = useMemo(() => models.filter(isVisionProjector), [models]);
  const selectedModel = useMemo(
    () => chatModels.find((model) => model.uri === selectedUri) ?? null,
    [chatModels, selectedUri]
  );
  const selectedProjector = useMemo(
    () => projectorModels.find((model) => model.uri === selectedProjectorUri) ?? null,
    [projectorModels, selectedProjectorUri]
  );
  const busy = ['scanning', 'preparing', 'loading', 'generating', 'stopping'].includes(phase);
  const canSend = phase === 'ready'
    && !!selectedModel
    && (!!draft.trim() || !!attachedImage)
    && (!attachedImage || visionReady);

  const clearKeyboardTimers = useCallback(() => {
    keyboardTimersRef.current.forEach((timer) => clearTimeout(timer));
    keyboardTimersRef.current = [];
  }, []);

  const scrollToLatest = useCallback((animated = false) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  const scheduleScrollToLatest = useCallback((animated = false) => {
    clearKeyboardTimers();
    [0, 80, 220].forEach((delayMs) => {
      const timer = setTimeout(() => scrollToLatest(animated && delayMs === 220), delayMs);
      keyboardTimersRef.current.push(timer);
    });
  }, [clearKeyboardTimers, scrollToLatest]);

  const commitMessages = useCallback((next: OnDeviceChatMessage[], modelUri?: string) => {
    messagesRef.current = next;
    setMessages(next);
    const historyModelUri = modelUri ?? selectedUriRef.current;
    if (historyModelUri) {
      const stored: StoredHistory = { modelUri: historyModelUri, messages: next.slice(-40) };
      void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
    }
  }, []);

  const prepareVision = useCallback(async (projector: NativeAiModelFile) => {
    setVisionReady(false);
    setPhase(projector.prepared ? 'loading' : 'preparing');
    setProgress(0);
    setStatusMessage(
      projector.prepared
        ? '지킴이에게 사진을 보는 눈을 연결하고 있어요.'
        : '비전 프로젝터를 앱 저장소에 준비하고 있어요.'
    );
    try {
      await onDeviceAiEngine.configureVision(projector, (update: OnDeviceModelLoadProgress) => {
        if (!mountedRef.current) return;
        setPhase(update.phase);
        setProgress(update.progress);
        setStatusMessage(
          update.phase === 'preparing'
            ? '비전 프로젝터를 준비하고 있어요. 앱을 종료하지 마세요.'
            : '지킴이에게 사진을 보는 눈을 연결하고 있어요.'
        );
      });
      if (!mountedRef.current || !onDeviceAiEngine.isVisionReady(projector.uri)) return false;
      setModels((current) => current.map((item) => (
        item.uri === projector.uri ? { ...item, prepared: true } : item
      )));
      setVisionReady(true);
      setPhase('ready');
      setProgress(1);
      setStatusMessage('지킴이가 사진도 함께 볼 수 있어요.');
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      setVisionReady(false);
      setPhase(onDeviceAiEngine.isLoaded() ? 'ready' : 'idle');
      setStatusMessage(`텍스트 대화는 가능해요. 사진 기능: ${normalizeOnDeviceAiError(error)}`);
      return false;
    }
  }, []);

  const loadSelectedModel = useCallback(async (
    model: NativeAiModelFile,
    projector?: NativeAiModelFile | null
  ) => {
    setVisionReady(false);
    setStatusMessage(model.prepared ? '지킴이를 깨우고 있어요.' : '지킴이의 기억을 앱 저장소에 준비하고 있어요.');
    setPhase(model.prepared ? 'loading' : 'preparing');
    setProgress(0);
    try {
      await onDeviceAiEngine.loadModel(model, (update: OnDeviceModelLoadProgress) => {
        if (!mountedRef.current) return;
        setPhase(update.phase);
        setProgress(update.progress);
        setStatusMessage(
          update.phase === 'preparing'
            ? '모델 파일을 준비하고 있어요. 앱을 종료하지 마세요.'
            : '지킴이를 깨우고 있어요.'
        );
      });
      if (!mountedRef.current || !onDeviceAiEngine.isLoaded(model.uri)) return;
      setModels((current) => current.map((item) => (
        item.uri === model.uri ? { ...item, prepared: true } : item
      )));
      setPhase('ready');
      setProgress(1);
      setStatusMessage('지킴이가 아지트에서 기다리고 있어요.');
      if (projector) await prepareVision(projector);
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [prepareVision]);

  const applyDirectory = useCallback(async (
    result: Awaited<ReturnType<typeof getOnDeviceModels>>,
    preferredUri = '',
    preferredProjectorUri = ''
  ) => {
    const nextModels = result.models || [];
    const nextChatModels = nextModels.filter((model) => !isVisionProjector(model));
    const nextProjectors = nextModels.filter(isVisionProjector);
    setModels(nextModels);
    setDirectoryName(result.directoryName || '');
    if (!result.directoryUri) {
      setPhase('idle');
      setStatusMessage('먼저 스마트폰의 AiModels 폴더를 연결해 주세요.');
      return;
    }
    if (!nextChatModels.length) {
      setPhase('idle');
      setStatusMessage(`${result.directoryName || '선택한 폴더'}에 대화용 GGUF 모델이 없습니다.`);
      return;
    }

    const preferred = nextChatModels.find((model) => model.uri === preferredUri);
    const preferredProjector = nextProjectors.find((model) => model.uri === preferredProjectorUri);
    if (preferredProjector) {
      selectedProjectorUriRef.current = preferredProjector.uri;
      setSelectedProjectorUri(preferredProjector.uri);
      void AsyncStorage.setItem(SELECTED_PROJECTOR_KEY, preferredProjector.uri);
    } else if (preferredProjectorUri) {
      selectedProjectorUriRef.current = '';
      setSelectedProjectorUri('');
      void AsyncStorage.removeItem(SELECTED_PROJECTOR_KEY);
    }

    if (preferred) {
      selectedUriRef.current = preferred.uri;
      setSelectedUri(preferred.uri);
      await loadSelectedModel(preferred, preferredProjector);
    } else {
      setPhase('idle');
      setStatusMessage('지킴이가 사용할 GGUF 모델을 선택해 주세요.');
      setSelectorOpen(true);
    }
  }, [loadSelectedModel]);

  useEffect(() => {
    mountedRef.current = true;
    let subscription: { remove: () => void } | undefined;
    if (Platform.OS === 'android' && NativeAiModelStorage) {
      subscription = new NativeEventEmitter(NativeAiModelStorage).addListener(
        'AiModelCopyProgress',
        (event: { copiedBytes?: number; totalBytes?: number }) => {
          const copied = Number(event.copiedBytes || 0);
          const total = Number(event.totalBytes || 0);
          if (total > 0) setProgress(Math.max(0, Math.min(1, copied / total)));
        }
      );
    }

    void (async () => {
      try {
        const [storedUri, storedProjectorUri, storedHistory, result] = await Promise.all([
          AsyncStorage.getItem(SELECTED_MODEL_KEY),
          AsyncStorage.getItem(SELECTED_PROJECTOR_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          getOnDeviceModels(),
        ]);
        if (!mountedRef.current) return;
        if (storedHistory) {
          try {
            const parsed = JSON.parse(storedHistory) as StoredHistory;
            if (parsed.modelUri === storedUri && Array.isArray(parsed.messages)) {
              commitMessages(parsed.messages.slice(-40), parsed.modelUri);
            }
          } catch {
            await AsyncStorage.removeItem(HISTORY_KEY);
          }
        }
        await applyDirectory(result, storedUri || '', storedProjectorUri || '');
      } catch (error) {
        if (!mountedRef.current) return;
        setPhase('idle');
        setStatusMessage(normalizeOnDeviceAiError(error));
      }
    })();

    return () => {
      mountedRef.current = false;
      subscription?.remove();
      clearKeyboardTimers();
      void onDeviceAiEngine.unload();
    };
  }, [applyDirectory, clearKeyboardTimers, commitMessages]);

  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(eventName, () => {
      if (isNearBottomRef.current) scheduleScrollToLatest(false);
    });
    return () => subscription.remove();
  }, [scheduleScrollToLatest]);

  const pickDirectory = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('Android 폴더 선택기를 열고 있어요.');
    try {
      await onDeviceAiEngine.unload();
      const result = await pickOnDeviceModelsDirectory();
      if (!mountedRef.current) return;
      setSelectedUri('');
      setSelectedProjectorUri('');
      setVisionReady(false);
      setAttachedImage(null);
      selectedUriRef.current = '';
      selectedProjectorUriRef.current = '';
      commitMessages([], '');
      await AsyncStorage.multiRemove([SELECTED_MODEL_KEY, SELECTED_PROJECTOR_KEY, HISTORY_KEY]);
      await applyDirectory(result);
    } catch (error) {
      if (!mountedRef.current) return;
      if (isFolderPickerCancellation(error) && selectedModel) {
        await loadSelectedModel(selectedModel, selectedProjector);
        return;
      }
      setPhase('idle');
      setStatusMessage(isFolderPickerCancellation(error) ? '기존 설정을 유지했어요.' : normalizeOnDeviceAiError(error));
    }
  }, [applyDirectory, commitMessages, loadSelectedModel, selectedModel, selectedProjector]);

  const refreshModels = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('지킴이의 기억 목록을 새로 살펴보고 있어요.');
    try {
      const result = await getOnDeviceModels();
      if (!mountedRef.current) return;
      await applyDirectory(result, selectedUriRef.current, selectedProjectorUriRef.current);
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase(onDeviceAiEngine.isLoaded() ? 'ready' : 'idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [applyDirectory]);

  const selectModel = useCallback(async (model: NativeAiModelFile) => {
    setSelectorOpen(false);
    if (model.uri === selectedUri && onDeviceAiEngine.isLoaded(model.uri)) return;
    await onDeviceAiEngine.unload();
    setVisionReady(false);
    setAttachedImage(null);
    selectedUriRef.current = model.uri;
    setSelectedUri(model.uri);
    commitMessages([], model.uri);
    await AsyncStorage.setItem(SELECTED_MODEL_KEY, model.uri);
    await loadSelectedModel(model, selectedProjector);
  }, [commitMessages, loadSelectedModel, selectedProjector, selectedUri]);

  const selectProjector = useCallback(async (projector: NativeAiModelFile | null) => {
    setSelectorOpen(false);
    setAttachedImage(null);
    if (!projector) {
      selectedProjectorUriRef.current = '';
      setSelectedProjectorUri('');
      setVisionReady(false);
      await AsyncStorage.removeItem(SELECTED_PROJECTOR_KEY);
      await onDeviceAiEngine.disableVision();
      setStatusMessage('텍스트로만 이야기할 수 있어요.');
      return;
    }

    selectedProjectorUriRef.current = projector.uri;
    setSelectedProjectorUri(projector.uri);
    await AsyncStorage.setItem(SELECTED_PROJECTOR_KEY, projector.uri);
    if (selectedModel && onDeviceAiEngine.isLoaded(selectedModel.uri)) {
      await prepareVision(projector);
    }
  }, [prepareVision, selectedModel]);

  const clearConversation = useCallback(async () => {
    if (phase !== 'ready') return;
    await onDeviceAiEngine.clearConversation().catch(() => undefined);
    commitMessages([]);
    setAttachedImage(null);
    setStatusMessage('지킴이가 새 이야기로 기억을 비웠어요.');
  }, [commitMessages, phase]);

  const stopGeneration = useCallback(async () => {
    if (phase !== 'generating') return;
    setPhase('stopping');
    setStatusMessage('지킴이가 잠시 생각을 멈추고 있어요.');
    await onDeviceAiEngine.stop().catch(() => undefined);
  }, [phase]);

  const pickImage = useCallback(async () => {
    if (!selectedProjector) {
      setStatusMessage('사진 대화를 위해 이 VLM과 맞는 mmproj 파일을 먼저 골라 주세요.');
      setSelectorOpen(true);
      return;
    }
    if (!visionReady) {
      const prepared = await prepareVision(selectedProjector);
      if (!prepared) return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요합니다', '기기 안에서 사진을 살펴보려면 사진 보관함 접근을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    try {
      const asset = result.assets[0];
      const width = asset.width || MAX_IMAGE_SIDE;
      const height = asset.height || MAX_IMAGE_SIDE;
      const maxSide = Math.max(width, height);
      const actions: ImageManipulator.Action[] = maxSide > MAX_IMAGE_SIDE
        ? [{ resize: width >= height ? { width: MAX_IMAGE_SIDE } : { height: MAX_IMAGE_SIDE } }]
        : [];
      const prepared = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setAttachedImage({ uri: prepared.uri, width: prepared.width, height: prepared.height });
      setStatusMessage('이 사진은 서버로 보내지 않고 기기 안에서만 살펴봐요.');
      scheduleScrollToLatest(false);
    } catch (error) {
      setStatusMessage(`사진을 준비하지 못했어요. ${normalizeOnDeviceAiError(error)}`);
    }
  }, [prepareVision, scheduleScrollToLatest, selectedProjector, visionReady]);

  const sendMessage = useCallback(async () => {
    if (!canSend) return;
    const image = attachedImage;
    const content = draft.trim() || '이 사진에 무엇이 보이는지 자세히 알려줘.';
    const userMessage = createMessage('user', content, image?.uri);
    const assistantMessage = createMessage('assistant', '');
    const baseMessages = [...messagesRef.current, userMessage];
    setDraft('');
    setAttachedImage(null);
    commitMessages([...baseMessages, assistantMessage]);
    setPhase('generating');
    setStatusMessage(image ? '지킴이가 기기 안에서 사진을 살펴보고 있어요.' : '지킴이가 기기 안에서 생각하고 있어요.');
    scheduleScrollToLatest(false);
    try {
      const finalText = await onDeviceAiEngine.complete(baseMessages, (partial) => {
        if (!mountedRef.current) return;
        const next = [...baseMessages, { ...assistantMessage, content: partial }];
        messagesRef.current = next;
        setMessages(next);
      }, image?.uri);
      const next = [
        ...baseMessages,
        { ...assistantMessage, content: finalText || '생각을 잠시 멈췄어요.' },
      ];
      commitMessages(next);
      setPhase('ready');
      setStatusMessage(finalText ? '지킴이가 다음 이야기를 기다리고 있어요.' : '답변 생성을 멈췄어요.');
      scheduleScrollToLatest(false);
    } catch (error) {
      if (!mountedRef.current) return;
      const partial = messagesRef.current.find((message) => message.id === assistantMessage.id)?.content.trim();
      const next = partial
        ? messagesRef.current
        : [...baseMessages, { ...assistantMessage, content: `잠시 길을 잃었어요. ${normalizeOnDeviceAiError(error)}` }];
      commitMessages(next);
      setPhase('ready');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [attachedImage, canSend, commitMessages, draft, scheduleScrollToLatest]);

  const chooseStarter = useCallback((prompt: string, index: number) => {
    if (index === 2) {
      void pickImage();
      return;
    }
    setDraft(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pickImage]);

  const modelStateTitle = selectedModel
    ? phase === 'ready' || phase === 'generating'
      ? '지킴이가 깨어 있어요'
      : '지킴이를 준비하고 있어요'
    : '지킴이의 기억을 연결해 주세요';
  const modelStateDetail = selectedModel
    ? `${selectedModel.name} · ${visionReady ? '사진 대화 가능' : '텍스트 대화'}`
    : directoryName || 'AiModels 폴더가 필요해요';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader
        eyebrow="우리들의 아지트"
        title="숲 지킴이"
        detail="조용히 곁을 지키며, 기기 안에서만 이야기를 나눠요."
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지킴이 기억 설정"
            disabled={busy}
            onPress={() => setSelectorOpen(true)}
            style={[styles.headerButton, busy && styles.disabled]}
          >
            <Ionicons name="options-outline" size={20} color={colors.tealDark} />
          </Pressable>
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지킴이 모델 설정 열기"
        disabled={busy}
        onPress={() => setSelectorOpen(true)}
        style={[styles.memoryStrip, busy && styles.disabled]}
      >
        <View style={[styles.stateDot, phase === 'ready' && styles.stateDotReady]} />
        <View style={styles.memoryCopy}>
          <Text style={styles.memoryTitle}>{modelStateTitle}</Text>
          <Text style={styles.memoryDetail} numberOfLines={1}>{modelStateDetail}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </Pressable>

      <View style={styles.statusRow}>
        {busy ? <ActivityIndicator size="small" color={colors.tealDark} /> : (
          <Ionicons
            name={phase === 'ready' ? 'shield-checkmark-outline' : 'information-circle-outline'}
            size={17}
            color={phase === 'ready' ? colors.success : colors.inkMuted}
          />
        )}
        <Text style={styles.statusText} numberOfLines={2}>{statusMessage}</Text>
        {phase === 'ready' && messages.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="지킴이 대화 초기화" onPress={() => void clearConversation()}>
            <Text style={styles.clearText}>새 이야기</Text>
          </Pressable>
        ) : null}
      </View>
      {(phase === 'preparing' || phase === 'loading') ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={messages.length ? styles.messages : styles.emptyMessages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => {
          if (isNearBottomRef.current) scrollToLatest(false);
        }}
        onScroll={({ nativeEvent }) => {
          const distanceFromEnd = nativeEvent.contentSize.height
            - nativeEvent.layoutMeasurement.height
            - nativeEvent.contentOffset.y;
          isNearBottomRef.current = distanceFromEnd < 96;
        }}
        scrollEventThrottle={32}
        renderItem={({ item }) => {
          const user = item.role === 'user';
          return (
            <View style={[styles.messageRow, user && styles.userMessageRow]}>
              {!user ? (
                <View style={styles.guardianAvatar}>
                  <Image source={guardianMascot} resizeMode="contain" style={styles.guardianAvatarImage} />
                </View>
              ) : null}
              <View style={[styles.bubble, user ? styles.userBubble : styles.assistantBubble]}>
                <Text style={[styles.bubbleLabel, user && styles.userBubbleText]}>
                  {user ? '나' : '숲 지킴이'}
                </Text>
                {item.imageUri ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="첨부한 사진 크게 보기" onPress={() => setViewImageUri(item.imageUri || '')}>
                    <Image source={{ uri: item.imageUri }} resizeMode="cover" style={styles.messageImage} />
                  </Pressable>
                ) : null}
                <Text style={[styles.bubbleText, user && styles.userBubbleText]}>{item.content || '…'}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.guardianScene}>
              <View style={styles.lanternGlow} />
              <Image source={guardianMascot} resizeMode="contain" style={styles.guardianImage} />
              <View style={styles.guardianWelcome}>
                <Text style={styles.emptyEyebrow}>작은 숲 지킴이</Text>
                <Text style={styles.emptyTitle}>오늘은 어떤 이야기를 지켜볼까요?</Text>
                <Text style={styles.emptyText}>마음속 이야기부터 사진 속 장면까지, 이곳에서 나눈 내용은 기기 밖으로 나가지 않아요.</Text>
              </View>
            </View>

            {!selectedModel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={directoryName ? '지킴이 모델 선택' : 'AiModels 폴더 연결'}
                onPress={() => directoryName ? setSelectorOpen(true) : void pickDirectory()}
                style={styles.wakeButton}
              >
                <Ionicons name="leaf-outline" size={18} color="#FFFFFF" />
                <Text style={styles.wakeButtonText}>{directoryName ? '지킴이 깨우기' : '기억 폴더 연결하기'}</Text>
              </Pressable>
            ) : phase === 'ready' ? (
              <View style={styles.starters}>
                {STARTER_PROMPTS.map((prompt, index) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                    onPress={() => chooseStarter(prompt, index)}
                    style={styles.starterRow}
                  >
                    <Ionicons name={index === 2 ? 'image-outline' : index === 1 ? 'home-outline' : 'chatbubble-ellipses-outline'} size={18} color={colors.tealDark} />
                    <Text style={styles.starterText}>{prompt}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.inkMuted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
      />

      {attachedImage ? (
        <View style={styles.imageDraft}>
          <Pressable accessibilityRole="button" accessibilityLabel="선택한 사진 크게 보기" onPress={() => setViewImageUri(attachedImage.uri)}>
            <Image source={{ uri: attachedImage.uri }} resizeMode="cover" style={styles.imageDraftPreview} />
          </Pressable>
          <View style={styles.imageDraftCopy}>
            <Text style={styles.imageDraftTitle}>지킴이와 함께 볼 사진</Text>
            <Text style={styles.imageDraftDetail}>최대 {MAX_IMAGE_SIDE}px · 기기 안에서만 처리</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="첨부 사진 삭제" onPress={() => setAttachedImage(null)} style={styles.imageDraftRemove}>
            <Ionicons name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지킴이에게 사진 보여주기"
          disabled={phase !== 'ready'}
          onPress={() => void pickImage()}
          style={[styles.attachButton, phase !== 'ready' && styles.disabled]}
        >
          <Ionicons name="image-outline" size={21} color={visionReady ? colors.tealDark : colors.inkMuted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={phase === 'ready' ? '지킴이에게 이야기해 보세요' : '지킴이가 깨어나면 이야기할 수 있어요'}
          placeholderTextColor={colors.inkMuted}
          editable={phase === 'ready'}
          multiline
          maxLength={2000}
          onFocus={() => {
            isNearBottomRef.current = true;
            scheduleScrollToLatest(false);
          }}
          accessibilityLabel="숲 지킴이에게 보낼 메시지"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={phase === 'generating' ? '지킴이 답변 중지' : '지킴이에게 보내기'}
          disabled={phase === 'stopping' || (phase !== 'generating' && !canSend)}
          onPress={() => phase === 'generating' ? void stopGeneration() : void sendMessage()}
          style={[
            styles.sendButton,
            phase === 'generating' && styles.stopButton,
            phase !== 'generating' && !canSend && styles.disabled,
          ]}
        >
          <Ionicons name={phase === 'generating' ? 'stop' : 'arrow-up'} size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal visible={selectorOpen} animationType="slide" onRequestClose={() => setSelectorOpen(false)}>
        <SafeAreaView style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>지킴이의 기억</Text>
              <Text style={styles.modalDetail}>{directoryName || 'AiModels 폴더를 연결해 주세요'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="지킴이 기억 설정 닫기" onPress={() => setSelectorOpen(false)} style={styles.modalClose}>
              <Ionicons name="close" size={25} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modelList}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>대화 모델</Text>
              <Text style={styles.sectionDetail}>지킴이가 생각하고 답할 GGUF 모델</Text>
            </View>
            {chatModels.length ? chatModels.map((item) => {
              const active = item.uri === selectedUri;
              return (
                <Pressable
                  key={item.uri}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} 대화 모델 선택`}
                  disabled={busy}
                  onPress={() => void selectModel(item)}
                  style={[styles.modelRow, active && styles.modelRowActive, busy && styles.disabled]}
                >
                  <Ionicons name="hardware-chip-outline" size={21} color={active ? colors.tealDark : colors.inkMuted} />
                  <View style={styles.modelRowCopy}>
                    <Text style={styles.modelRowName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.modelRowMeta}>{formatBytes(item.sizeBytes)} · {item.prepared ? '기기 준비됨' : '선택 후 준비'}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.tealDark} /> : null}
                </Pressable>
              );
            }) : <Text style={styles.emptyModelText}>대화용 GGUF 모델이 없어요.</Text>}

            <View style={[styles.sectionHeading, styles.visionHeading]}>
              <Text style={styles.sectionTitle}>사진을 보는 눈</Text>
              <Text style={styles.sectionDetail}>VLM과 정확히 짝이 맞는 mmproj GGUF가 필요해요</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진 기능 사용 안 함"
              disabled={busy}
              onPress={() => void selectProjector(null)}
              style={[styles.modelRow, !selectedProjectorUri && styles.modelRowActive, busy && styles.disabled]}
            >
              <Ionicons name="eye-off-outline" size={21} color={!selectedProjectorUri ? colors.tealDark : colors.inkMuted} />
              <View style={styles.modelRowCopy}>
                <Text style={styles.modelRowName}>사진 기능 사용 안 함</Text>
                <Text style={styles.modelRowMeta}>메모리를 아끼고 텍스트로만 대화해요</Text>
              </View>
              {!selectedProjectorUri ? <Ionicons name="checkmark-circle" size={22} color={colors.tealDark} /> : null}
            </Pressable>
            {projectorModels.map((item) => {
              const active = item.uri === selectedProjectorUri;
              return (
                <Pressable
                  key={item.uri}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} 비전 프로젝터 선택`}
                  disabled={busy}
                  onPress={() => void selectProjector(item)}
                  style={[styles.modelRow, active && styles.modelRowActive, busy && styles.disabled]}
                >
                  <Ionicons name="eye-outline" size={21} color={active ? colors.tealDark : colors.inkMuted} />
                  <View style={styles.modelRowCopy}>
                    <Text style={styles.modelRowName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.modelRowMeta}>{formatBytes(item.sizeBytes)} · {item.prepared ? '기기 준비됨' : '선택 후 준비'}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.tealDark} /> : null}
                </Pressable>
              );
            })}
            {!projectorModels.length ? (
              <Text style={styles.emptyModelText}>폴더에서 mmproj 또는 projector 이름의 GGUF를 찾지 못했어요.</Text>
            ) : null}

            <View style={styles.localNote}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.tealDark} />
              <Text style={styles.localNoteText}>모델과 사진은 APK에 포함되거나 서버로 업로드되지 않고, 선택한 기기 안에서만 사용돼요.</Text>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="모델 목록 새로고침" disabled={busy} onPress={() => void refreshModels()} style={[styles.secondaryButton, busy && styles.disabled]}>
              <Ionicons name="refresh" size={18} color={colors.tealDark} />
              <Text style={styles.secondaryButtonText}>새로고침</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="다른 AiModels 폴더 선택" disabled={busy} onPress={() => { setSelectorOpen(false); void pickDirectory(); }} style={[styles.folderButton, busy && styles.disabled]}>
              <Ionicons name="folder-open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.folderButtonText}>폴더 바꾸기</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!viewImageUri} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewImageUri('')}>
        <View style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 크게 보기 닫기" onPress={() => setViewImageUri('')} style={styles.viewerClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          {viewImageUri ? <Image source={{ uri: viewImageUri }} resizeMode="contain" style={styles.viewerImage} /> : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  headerButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  disabled: { opacity: 0.4 },
  memoryStrip: { marginHorizontal: spacing.lg, minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stateDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.inkMuted },
  stateDotReady: { backgroundColor: colors.success },
  memoryCopy: { flex: 1, minWidth: 0 },
  memoryTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  memoryDetail: { color: colors.inkMuted, fontSize: type.small, marginTop: 3 },
  statusRow: { minHeight: 42, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 17 },
  clearText: { color: colors.coral, fontSize: type.small, fontWeight: '800' },
  progressTrack: { height: 3, marginHorizontal: spacing.lg, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line },
  progressFill: { height: '100%', backgroundColor: colors.tealDark },
  messageList: { flex: 1 },
  messages: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  emptyMessages: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emptyState: { gap: spacing.md },
  guardianScene: { minHeight: 218, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceWarm, borderWidth: 1, borderColor: '#E9D9BE', flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.md },
  lanternGlow: { position: 'absolute', left: 26, bottom: 38, width: 116, height: 116, borderRadius: radius.pill, backgroundColor: '#FFE4A8', opacity: 0.55 },
  guardianImage: { width: 132, height: 188, alignSelf: 'flex-end' },
  guardianWelcome: { flex: 1, alignSelf: 'center', paddingLeft: spacing.sm, paddingRight: spacing.sm, paddingBottom: spacing.md },
  emptyEyebrow: { color: colors.bark, fontSize: type.small, fontWeight: '900', marginBottom: spacing.sm },
  emptyTitle: { color: colors.ink, fontSize: type.title, lineHeight: 26, fontWeight: '900' },
  emptyText: { color: colors.inkSoft, fontSize: type.body, lineHeight: 20, marginTop: spacing.sm },
  wakeButton: { minHeight: 48, borderRadius: radius.lg, backgroundColor: colors.tealDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  wakeButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  starters: { gap: spacing.sm },
  starterRow: { minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  starterText: { flex: 1, color: colors.ink, fontSize: type.body, lineHeight: 19, fontWeight: '700' },
  messageRow: { maxWidth: '90%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  userMessageRow: { alignSelf: 'flex-end' },
  guardianAvatar: { width: 34, height: 34, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceWarm, borderWidth: 1, borderColor: '#E9D9BE' },
  guardianAvatarImage: { width: '100%', height: '100%' },
  bubble: { flexShrink: 1, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  userBubble: { backgroundColor: colors.mine },
  assistantBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bubbleLabel: { color: colors.tealDark, fontSize: type.tiny, fontWeight: '900', marginBottom: 4 },
  bubbleText: { color: colors.ink, fontSize: type.body, lineHeight: 21 },
  userBubbleText: { color: '#FFFFFF' },
  messageImage: { width: 196, height: 144, maxWidth: '100%', borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.canvasDeep },
  imageDraft: { minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  imageDraftPreview: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.canvasDeep },
  imageDraftCopy: { flex: 1 },
  imageDraftTitle: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  imageDraftDetail: { color: colors.inkMuted, fontSize: type.small, marginTop: 4 },
  imageDraftRemove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  composer: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  attachButton: { width: 43, height: 43, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  input: { flex: 1, minHeight: 43, maxHeight: 112, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, color: colors.ink, fontSize: type.body, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sendButton: { width: 43, height: 43, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealDark },
  stopButton: { backgroundColor: colors.coral },
  modalScreen: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  modalDetail: { color: colors.inkMuted, fontSize: type.small, marginTop: 4 },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modelList: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  sectionHeading: { marginBottom: spacing.xs },
  visionHeading: { marginTop: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: type.section, fontWeight: '900' },
  sectionDetail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17, marginTop: 4 },
  modelRow: { minHeight: 64, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modelRowActive: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  modelRowCopy: { flex: 1, minWidth: 0 },
  modelRowName: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  modelRowMeta: { color: colors.inkMuted, fontSize: type.small, marginTop: 5 },
  emptyModelText: { color: colors.inkMuted, fontSize: type.body, lineHeight: 20, paddingVertical: spacing.md },
  localNote: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceWarm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  localNoteText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 18 },
  modalActions: { padding: spacing.lg, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  secondaryButtonText: { color: colors.tealDark, fontSize: type.body, fontWeight: '900' },
  folderButton: { flex: 1, minHeight: 48, borderRadius: radius.lg, backgroundColor: colors.tealDark, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  folderButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  viewer: { flex: 1, backgroundColor: 'rgba(12, 18, 14, 0.94)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 48, right: spacing.lg, zIndex: 1, width: 44, height: 44, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '82%' },
});
