import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  NativeEventEmitter,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatKeyboardLayout } from '../components/ChatKeyboardLayout';
import { ChatComposer } from '../components/ChatComposer';
import { ChatMediaContent } from '../components/ChatMediaContent';
import { GuardianConversationsModal } from '../components/GuardianConversationsModal';
import { GuardianSettingsModal } from '../components/GuardianSettingsModal';
import { ScreenHeader } from '../components/ScreenHeader';
import { useChatKeyboard } from '../hooks/useChatKeyboard';
import { NativeAiModelStorage, type NativeAiModelFile } from '../native';
import { completeGuardianConversation } from '../services/guardianConversation';
import {
  DEFAULT_GUARDIAN_PROFILE,
  readGuardianProfile,
  writeGuardianProfile,
  type GuardianProfile,
} from '../services/guardianProfile';
import {
  getOnDeviceModels,
  isFolderPickerCancellation,
  normalizeOnDeviceAiError,
  onDeviceAiEngine,
  pickOnDeviceModelsDirectory,
  type OnDeviceChatMessage,
  type OnDeviceModelLoadProgress,
} from '../services/onDeviceAi';
import {
  cancelGuardianWebTool,
  sanitizeGuardianVisibleContent,
} from '../services/guardianWebTools';
import {
  createGuardianConversationRoom,
  readGuardianConversationStore,
  updateGuardianConversationRoom,
  writeGuardianConversationStore,
  type GuardianConversationRoom,
} from '../services/guardianConversationStore';
import {
  connectOpenRouter,
} from '../services/openRouterAuth';
import {
  OpenAiProviderError,
  cancelOpenAiCompatibleCompletion,
  clearAiTransportLogs,
  getAiTransportLogs,
} from '../services/aiProviders';
import {
  disconnectGuardianCloudProvider,
  fetchGuardianCloudModels,
  getGuardianCloudProvider,
  hasGuardianCloudConnection,
  importGuardianCloudApiKey,
  type GuardianCloudModel,
} from '../services/guardianCloudProvider';
import { colors, radius, spacing, type } from '../theme';
import { pickChatAttachment } from '../services/chatAttachments';
import type { AttachmentDraft, ChatAttachment, ChatMediaKind } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');
const SELECTED_MODEL_KEY = 'on_device_ai:selected_model_v1';
const LEGACY_SELECTED_PROJECTOR_KEY = 'on_device_ai:selected_projector_v1';

const STARTER_PROMPTS = [
  '오늘 있었던 일을 차분히 정리해 줘',
  '우리 가족이 함께할 작은 놀이를 추천해 줘',
  '오늘 마음이 편해질 이야기를 들려줘',
];

type Phase = 'idle' | 'scanning' | 'preparing' | 'loading' | 'ready' | 'generating' | 'stopping';
type RetryState = { baseMessages: OnDeviceChatMessage[]; content: string };

function createMessage(
  role: OnDeviceChatMessage['role'],
  content: string,
  attachment?: ChatAttachment
): OnDeviceChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    ...(attachment ? { attachment } : {}),
  };
}

function isProjectorFile(model: NativeAiModelFile) {
  return /(^|[-_.\s])(mmproj|projector)([-_.\s]|$)/i.test(model.name);
}

function normalizeGuardianError(error: unknown) {
  if (error instanceof OpenAiProviderError) return error.message;
  return normalizeOnDeviceAiError(error);
}

export function OnDeviceAiScreen() {
  const insets = useSafeAreaInsets();
  const [models, setModels] = useState<NativeAiModelFile[]>([]);
  const [directoryName, setDirectoryName] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [messages, setMessages] = useState<OnDeviceChatMessage[]>([]);
  const [conversations, setConversations] = useState<GuardianConversationRoom[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('지킴이가 기억을 살펴보고 있어요.');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [guardianProfile, setGuardianProfile] = useState<GuardianProfile>(DEFAULT_GUARDIAN_PROFILE);
  const [openRouterConnected, setOpenRouterConnected] = useState(false);
  const [openRouterBusy, setOpenRouterBusy] = useState(false);
  const [openRouterMessage, setOpenRouterMessage] = useState('');
  const [openRouterModels, setOpenRouterModels] = useState<GuardianCloudModel[]>([]);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLines, setDiagLines] = useState<string[]>([]);
  const mountedRef = useRef(true);
  const messagesRef = useRef<OnDeviceChatMessage[]>([]);
  const conversationsRef = useRef<GuardianConversationRoom[]>([]);
  const activeConversationIdRef = useRef('');
  const selectedUriRef = useRef('');
  const listRef = useRef<FlatList<OnDeviceChatMessage> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const stopRequestedRef = useRef(false);
  const diagLinesRef = useRef<string[]>([]);

  const {
    nearBottomRef,
    handleComposerFocus,
    handleScroll: handleKeyboardAwareScroll,
    scheduleScrollToLatest,
    scrollToLatest,
  } = useChatKeyboard(listRef);

  const chatModels = useMemo(() => models.filter((model) => !isProjectorFile(model)), [models]);
  const selectedModel = useMemo(
    () => chatModels.find((model) => model.uri === selectedUri) ?? null,
    [chatModels, selectedUri]
  );
  const busy = ['scanning', 'preparing', 'loading', 'generating', 'stopping'].includes(phase);
  const engineReady = guardianProfile.aiEngineType === 'openRouter'
    ? openRouterConnected && !!guardianProfile.cloudModelId
    : !!selectedModel;
  const selectedCloudModel = useMemo(
    () => openRouterModels.find((model) => model.id === guardianProfile.cloudModelId) ?? null,
    [guardianProfile.cloudModelId, openRouterModels]
  );
  const supportedMedia = useMemo<ChatMediaKind[]>(() => {
    if (guardianProfile.aiEngineType !== 'openRouter' || !selectedCloudModel) return [];
    return selectedCloudModel.inputModalities.filter(
      (modality): modality is ChatMediaKind => modality === 'image' || modality === 'video' || modality === 'audio'
    );
  }, [guardianProfile.aiEngineType, selectedCloudModel]);
  const attachmentMenuHint = engineReady
    ? '현재 지킴이는 글로만 대화할 수 있어요.'
    : '지킴이 준비가 끝나면 첨부 기능을 사용할 수 있어요.';
  const pushDiagLine = useCallback((line: string) => {
    diagLinesRef.current = [
      ...diagLinesRef.current.slice(-199),
      `[${new Date().toLocaleTimeString()}] ${line}`,
    ];
  }, []);
  const openDiagnostics = useCallback(() => {
    const transport = getAiTransportLogs().map((entry) => {
      const detail = entry.detail ? ` ${JSON.stringify(entry.detail)}` : '';
      return `[${entry.at}] ${entry.source}/${entry.event}${detail}`;
    });
    setDiagLines([...diagLinesRef.current, ...transport]);
    setDiagOpen(true);
  }, []);
  const clearDiagnostics = useCallback(() => {
    diagLinesRef.current = [];
    clearAiTransportLogs();
    setDiagLines([]);
  }, []);
  const commitConversationStore = useCallback((
    nextConversations: GuardianConversationRoom[],
    nextActiveConversationId: string
  ) => {
    conversationsRef.current = nextConversations;
    activeConversationIdRef.current = nextActiveConversationId;
    setConversations(nextConversations);
    setActiveConversationId(nextActiveConversationId);
    void writeGuardianConversationStore({
      activeConversationId: nextActiveConversationId,
      conversations: nextConversations,
    }).catch(() => undefined);
  }, []);

  const commitMessages = useCallback((next: OnDeviceChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    const currentId = activeConversationIdRef.current;
    const currentRoom = conversationsRef.current.find((room) => room.id === currentId)
      ?? createGuardianConversationRoom();
    const updatedRoom = updateGuardianConversationRoom(currentRoom, next);
    const nextConversations = [
      updatedRoom,
      ...conversationsRef.current.filter((room) => room.id !== currentRoom.id),
    ].slice(0, 30);
    commitConversationStore(nextConversations, currentRoom.id);
  }, [commitConversationStore]);

  const loadSelectedModel = useCallback(async (model: NativeAiModelFile) => {
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
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, []);

  const applyDirectory = useCallback(async (
    result: Awaited<ReturnType<typeof getOnDeviceModels>>,
    preferredUri = '',
    loadModel = true
  ) => {
    const nextModels = result.models || [];
    const nextChatModels = nextModels.filter((model) => !isProjectorFile(model));
    setModels(nextModels);
    setDirectoryName(result.directoryName || '');
    const preferred = nextChatModels.find((model) => model.uri === preferredUri);
    if (preferred) {
      selectedUriRef.current = preferred.uri;
      setSelectedUri(preferred.uri);
    }
    if (!loadModel) return;
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

    if (preferred) {
      await loadSelectedModel(preferred);
    } else {
      setPhase('idle');
      setStatusMessage('지킴이가 사용할 GGUF 모델을 선택해 주세요.');
      setSettingsOpen(true);
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
        const [storedUri, conversationStore, result, storedGuardianProfile] = await Promise.all([
          AsyncStorage.getItem(SELECTED_MODEL_KEY),
          readGuardianConversationStore(),
          getOnDeviceModels(),
          readGuardianProfile(),
        ]);
        const connected = await hasGuardianCloudConnection(storedGuardianProfile).catch(() => false);
        await AsyncStorage.removeItem(LEGACY_SELECTED_PROJECTOR_KEY);
        if (!mountedRef.current) return;
        setGuardianProfile(storedGuardianProfile);
        setOpenRouterConnected(connected);
        conversationsRef.current = conversationStore.conversations;
        activeConversationIdRef.current = conversationStore.activeConversationId;
        setConversations(conversationStore.conversations);
        setActiveConversationId(conversationStore.activeConversationId);
        const activeRoom = conversationStore.conversations.find(
          (room) => room.id === conversationStore.activeConversationId
        ) ?? conversationStore.conversations[0];
        const storedMessages = activeRoom?.messages ?? [];
        messagesRef.current = storedMessages;
        setMessages(storedMessages);
        if (storedGuardianProfile.aiEngineType === 'openRouter') {
          await applyDirectory(result, storedUri || '', false);
          await onDeviceAiEngine.unload().catch(() => undefined);
          setPhase(connected ? 'ready' : 'idle');
          setStatusMessage(connected
            ? `${storedGuardianProfile.name}가 이야기를 기다리고 있어요.`
            : '대화를 시작하려면 지킴이 설정을 확인해 주세요.');
          if (connected) {
            try {
              const cloudModels = await fetchGuardianCloudModels(storedGuardianProfile);
              if (mountedRef.current) {
                setOpenRouterModels(cloudModels);
                setOpenRouterMessage(`${cloudModels.length}개 모델을 불러왔어요.`);
              }
            } catch (error) {
              if (mountedRef.current) {
                const disconnected = error instanceof OpenAiProviderError
                  && (error.code === 'unauthorized' || error.code === 'not_connected');
                if (disconnected) {
                  void disconnectGuardianCloudProvider(storedGuardianProfile).catch(() => undefined);
                  setOpenRouterConnected(false);
                  setPhase('idle');
                  setStatusMessage('대화를 시작하려면 지킴이 설정을 다시 확인해 주세요.');
                }
                setOpenRouterMessage(normalizeGuardianError(error));
              }
            }
          }
        } else {
          await applyDirectory(result, storedUri || '');
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setPhase('idle');
        setStatusMessage(normalizeOnDeviceAiError(error));
      }
    })();

    return () => {
      mountedRef.current = false;
      subscription?.remove();
      stopRequestedRef.current = true;
      cancelOpenAiCompatibleCompletion();
      void cancelGuardianWebTool();
      void onDeviceAiEngine.unload();
    };
  }, [applyDirectory]);

  const pickDirectory = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('Android 폴더 선택기를 열고 있어요.');
    try {
      await onDeviceAiEngine.unload();
      const result = await pickOnDeviceModelsDirectory();
      if (!mountedRef.current) return;
      setSelectedUri('');
      selectedUriRef.current = '';
      await AsyncStorage.multiRemove([SELECTED_MODEL_KEY, LEGACY_SELECTED_PROJECTOR_KEY]);
      await applyDirectory(result);
    } catch (error) {
      if (!mountedRef.current) return;
      if (isFolderPickerCancellation(error) && selectedModel) {
        await loadSelectedModel(selectedModel);
        return;
      }
      setPhase('idle');
      setStatusMessage(isFolderPickerCancellation(error) ? '기존 설정을 유지했어요.' : normalizeOnDeviceAiError(error));
    }
  }, [applyDirectory, loadSelectedModel, selectedModel]);

  const refreshModels = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('지킴이의 기억 목록을 새로 살펴보고 있어요.');
    try {
      const result = await getOnDeviceModels();
      if (!mountedRef.current) return;
      await applyDirectory(result, selectedUriRef.current);
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase(onDeviceAiEngine.isLoaded() ? 'ready' : 'idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [applyDirectory]);

  const selectModel = useCallback(async (model: NativeAiModelFile) => {
    setSettingsOpen(false);
    if (model.uri === selectedUri && onDeviceAiEngine.isLoaded(model.uri)) return;
    await onDeviceAiEngine.unload();
    selectedUriRef.current = model.uri;
    setSelectedUri(model.uri);
    await AsyncStorage.setItem(SELECTED_MODEL_KEY, model.uri);
    await loadSelectedModel(model);
  }, [loadSelectedModel, selectedUri]);

  const refreshOpenRouterModels = useCallback(async () => {
    const provider = getGuardianCloudProvider(guardianProfile);
    setOpenRouterBusy(true);
    setOpenRouterMessage(`${provider.name} 모델을 불러오고 있어요.`);
    try {
      const cloudModels = await fetchGuardianCloudModels(guardianProfile);
      if (!mountedRef.current) return;
      setOpenRouterConnected(true);
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`${cloudModels.length}개 모델을 불러왔어요.`);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof OpenAiProviderError && (error.code === 'unauthorized' || error.code === 'not_connected')) {
        void disconnectGuardianCloudProvider(guardianProfile).catch(() => undefined);
        setOpenRouterConnected(false);
        if (guardianProfile.aiEngineType === 'openRouter') setPhase('idle');
      }
      setOpenRouterMessage(normalizeGuardianError(error));
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile]);

  const connectOpenRouterAccount = useCallback(async () => {
    const provider = getGuardianCloudProvider(guardianProfile);
    if (provider.id !== 'openRouter') {
      await refreshOpenRouterModels();
      return;
    }
    let keyStored = false;
    setOpenRouterBusy(true);
    setOpenRouterMessage('OpenRouter 승인 페이지를 열고 있어요.');
    try {
      const result = await connectOpenRouter();
      if (!mountedRef.current) return;
      if (result.status === 'cancelled') {
        setOpenRouterMessage('계정 연결을 취소했어요. 기존 설정은 그대로 유지됩니다.');
        return;
      }
      keyStored = true;
      setOpenRouterConnected(true);
      setOpenRouterMessage('계정 연결이 완료됐어요. 모델 목록을 확인하고 있어요.');
      if (guardianProfile.aiEngineType === 'openRouter') {
        setPhase('ready');
        setStatusMessage(`${guardianProfile.name}가 이야기를 기다리고 있어요.`);
      }
      const cloudModels = await fetchGuardianCloudModels(guardianProfile);
      if (!mountedRef.current) return;
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`연결 완료 · ${cloudModels.length}개 모델을 불러왔어요.`);
    } catch (error) {
      if (!mountedRef.current) return;
      const unauthorized = error instanceof OpenAiProviderError
        && (error.code === 'unauthorized' || error.code === 'not_connected');
      const connected = keyStored && !unauthorized;
      setOpenRouterConnected(connected);
      if (guardianProfile.aiEngineType === 'openRouter') setPhase(connected ? 'ready' : 'idle');
      const message = normalizeGuardianError(error);
      setOpenRouterMessage(connected ? `계정 연결은 완료됐지만 모델 목록을 불러오지 못했어요. ${message}` : message);
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile, refreshOpenRouterModels]);

  const importOpenRouterKey = useCallback(async (apiKey: string) => {
    let keyStored = false;
    setOpenRouterBusy(true);
    setOpenRouterMessage('API 키 유효성을 안전하게 확인하고 있어요.');
    try {
      const cloudModels = await importGuardianCloudApiKey(guardianProfile, apiKey);
      if (!mountedRef.current) return false;
      keyStored = true;
      setOpenRouterConnected(true);
      setOpenRouterMessage('API 키를 확인했어요. 모델 목록을 불러오고 있어요.');
      if (!mountedRef.current) return false;
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`연결 완료 · ${cloudModels.length}개 모델을 불러왔어요.`);
      if (guardianProfile.aiEngineType === 'openRouter') {
        setPhase('ready');
        setStatusMessage(`${guardianProfile.name}가 이야기를 기다리고 있어요.`);
      }
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      const unauthorized = error instanceof OpenAiProviderError
        && (error.code === 'unauthorized' || error.code === 'not_connected');
      const connected = keyStored && !unauthorized;
      setOpenRouterConnected(connected);
      if (guardianProfile.aiEngineType === 'openRouter') setPhase(connected ? 'ready' : 'idle');
      const message = normalizeGuardianError(error);
      setOpenRouterMessage(connected ? `API 키는 안전하게 저장했지만 모델 목록을 불러오지 못했어요. ${message}` : message);
      return connected;
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile]);

  const disconnectOpenRouterAccount = useCallback(async () => {
    setOpenRouterBusy(true);
    try {
      cancelOpenAiCompatibleCompletion();
      await disconnectGuardianCloudProvider(guardianProfile);
      if (!mountedRef.current) return;
      setOpenRouterConnected(false);
      setOpenRouterModels([]);
      setOpenRouterMessage(`이 기기에서 ${getGuardianCloudProvider(guardianProfile).name} 연결을 해제했어요.`);
      if (guardianProfile.aiEngineType === 'openRouter') {
        setPhase('idle');
        setStatusMessage('대화를 시작하려면 지킴이 설정을 확인해 주세요.');
      }
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile]);

  const createNewConversation = useCallback(async () => {
    if (phase === 'generating' || phase === 'stopping') return;
    const currentRoom = conversationsRef.current.find(
      (room) => room.id === activeConversationIdRef.current
    );
    if (currentRoom && currentRoom.messages.length === 0) {
      setConversationsOpen(false);
      setStatusMessage('이미 비어 있는 새 이야기에 있어요.');
      return;
    }
    if (guardianProfile.aiEngineType === 'onDevice') {
      await onDeviceAiEngine.clearConversation().catch(() => undefined);
    }
    const room = createGuardianConversationRoom();
    commitConversationStore([room, ...conversationsRef.current].slice(0, 30), room.id);
    messagesRef.current = [];
    setMessages([]);
    setRetryState(null);
    setDraft('');
    setConversationsOpen(false);
    setStatusMessage('새 대화방을 만들었어요. 이전 이야기는 대화 목록에 남아 있어요.');
  }, [commitConversationStore, guardianProfile.aiEngineType, phase]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (phase === 'generating' || phase === 'stopping') return;
    const room = conversationsRef.current.find((item) => item.id === conversationId);
    if (!room) return;
    if (guardianProfile.aiEngineType === 'onDevice') {
      await onDeviceAiEngine.clearConversation().catch(() => undefined);
    }
    activeConversationIdRef.current = room.id;
    setActiveConversationId(room.id);
    messagesRef.current = room.messages;
    setMessages(room.messages);
    setRetryState(null);
    setDraft('');
    setConversationsOpen(false);
    void writeGuardianConversationStore({
      activeConversationId: room.id,
      conversations: conversationsRef.current,
    }).catch(() => undefined);
    setStatusMessage(`“${room.title}” 이야기를 이어서 나눌 수 있어요.`);
    scheduleScrollToLatest(false);
  }, [guardianProfile.aiEngineType, phase, scheduleScrollToLatest]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (phase === 'generating' || phase === 'stopping') return;
    let remaining = conversationsRef.current.filter((room) => room.id !== conversationId);
    if (!remaining.length) remaining = [createGuardianConversationRoom()];
    const deletingActive = activeConversationIdRef.current === conversationId;
    const nextActiveId = deletingActive ? remaining[0].id : activeConversationIdRef.current;
    commitConversationStore(remaining, nextActiveId);
    if (deletingActive) {
      const nextRoom = remaining.find((room) => room.id === nextActiveId) ?? remaining[0];
      messagesRef.current = nextRoom.messages;
      setMessages(nextRoom.messages);
      setRetryState(null);
      setDraft('');
      if (guardianProfile.aiEngineType === 'onDevice') {
        void onDeviceAiEngine.clearConversation().catch(() => undefined);
      }
    }
    setStatusMessage('선택한 대화를 이 기기에서 삭제했어요.');
  }, [commitConversationStore, guardianProfile.aiEngineType, phase]);

  const stopGeneration = useCallback(async () => {
    if (phase !== 'generating') return;
    stopRequestedRef.current = true;
    setPhase('stopping');
    setStatusMessage(`${guardianProfile.name}가 잠시 생각을 멈추고 있어요.`);
    await Promise.all([
      onDeviceAiEngine.stop().catch(() => undefined),
      cancelGuardianWebTool(),
      Promise.resolve(cancelOpenAiCompatibleCompletion()),
    ]);
  }, [guardianProfile.name, phase]);

  const saveGuardianProfile = useCallback(async (nextProfile: GuardianProfile) => {
    const previousEngine = guardianProfile.aiEngineType;
    const providerChanged = guardianProfile.cloudProviderId !== nextProfile.cloudProviderId
      || guardianProfile.cloudBaseUrl !== nextProfile.cloudBaseUrl;
    const saved = await writeGuardianProfile(nextProfile);
    setGuardianProfile(saved);
    if (previousEngine !== saved.aiEngineType) {
      setRetryState(null);
      if (saved.aiEngineType === 'openRouter') {
        await onDeviceAiEngine.unload().catch(() => undefined);
        setPhase(openRouterConnected ? 'ready' : 'idle');
        setStatusMessage(openRouterConnected
          ? `${saved.name}가 이야기를 기다리고 있어요.`
          : '대화를 시작하려면 지킴이 설정을 확인해 주세요.');
      } else if (selectedModel) {
        await loadSelectedModel(selectedModel);
      } else {
        setPhase('idle');
        setStatusMessage('온디바이스 대화에 사용할 GGUF 모델을 선택해 주세요.');
      }
      return;
    }
    if (saved.aiEngineType === 'openRouter' && providerChanged) {
      const connected = await hasGuardianCloudConnection(saved).catch(() => false);
      setOpenRouterConnected(connected);
      setOpenRouterModels([]);
      setPhase(connected ? 'ready' : 'idle');
      setOpenRouterMessage(connected
        ? `${getGuardianCloudProvider(saved).name} 모델 목록을 새로고침해 주세요.`
        : `${getGuardianCloudProvider(saved).name} API 키 또는 서버 주소를 확인해 주세요.`);
      setStatusMessage(connected
        ? `${saved.name}가 이야기를 기다리고 있어요.`
        : '대화를 시작하려면 지킴이 설정을 확인해 주세요.');
      return;
    }
    setStatusMessage(`${saved.name}의 설정을 저장했어요.`);
  }, [guardianProfile, loadSelectedModel, openRouterConnected, selectedModel]);

  const runCompletion = useCallback(async (
    baseMessages: OnDeviceChatMessage[],
    failedContent: string
  ) => {
    const assistantMessage = createMessage('assistant', '');
    stopRequestedRef.current = false;
    setRetryState(null);
    commitMessages([...baseMessages, assistantMessage]);
    setPhase('generating');
    if (guardianProfile.aiEngineType === 'openRouter') {
      setStatusMessage(`${guardianProfile.name}가 답변을 준비하고 있어요.`);
    } else {
      setStatusMessage(`${guardianProfile.name}가 기기 안에서 생각하고 있어요.`);
    }
    pushDiagLine(`전송 시작 · engine=${guardianProfile.aiEngineType} · provider=${guardianProfile.cloudProviderId || '-'} · model=${guardianProfile.cloudModelId || '-'} · messages=${baseMessages.length}`);
    scheduleScrollToLatest(false);
    try {
      const finalText = await completeGuardianConversation(baseMessages, guardianProfile, {
        onPartial: (partial) => {
          if (!mountedRef.current || stopRequestedRef.current) return;
          const next = [...baseMessages, { ...assistantMessage, content: partial }];
          messagesRef.current = next;
          setMessages(next);
        },
        onStatus: (message) => {
          if (mountedRef.current && !stopRequestedRef.current) setStatusMessage(message);
        },
        shouldStop: () => stopRequestedRef.current,
      });
      pushDiagLine(`응답 완료 · ${finalText.length}자`);
      const next = [
        ...baseMessages,
        { ...assistantMessage, content: finalText || '답변 본문을 만들지 못했어요. 다시 시도해 주세요.' },
      ];
      commitMessages(next);
      setPhase('ready');
      setRetryState(null);
      setStatusMessage(finalText ? `${guardianProfile.name}가 다음 이야기를 기다리고 있어요.` : '답변 생성을 멈췄어요.');
      scheduleScrollToLatest(false);
    } catch (error) {
      if (!mountedRef.current) return;
      const partial = messagesRef.current.find((message) => message.id === assistantMessage.id)?.content.trim();
      const stopped = stopRequestedRef.current;
      const message = normalizeGuardianError(error);
      const providerCode = error instanceof OpenAiProviderError ? error.code : '';
      pushDiagLine(`오류 발생 · ${error instanceof Error ? error.name : typeof error}${providerCode ? ` · code=${providerCode}` : ''} · ${message}`);
      const next = partial || stopped
        ? messagesRef.current.filter((message) => message.id !== assistantMessage.id || !!message.content.trim())
        : [...baseMessages, { ...assistantMessage, content: `잠시 길을 잃었어요. ${message}` }];
      commitMessages(next);
      const disconnected = error instanceof OpenAiProviderError
        && (error.code === 'unauthorized' || error.code === 'not_connected');
      if (disconnected) {
        void disconnectGuardianCloudProvider(guardianProfile).catch(() => undefined);
        setOpenRouterConnected(false);
      }
      setPhase(disconnected ? 'idle' : 'ready');
      setStatusMessage(stopped ? '답변 생성을 멈췄어요.' : message);
      setRetryState(stopped || disconnected ? null : { baseMessages, content: failedContent });
      stopRequestedRef.current = false;
    }
  }, [commitMessages, guardianProfile, pushDiagLine, scheduleScrollToLatest]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    const media = attachment;
    if (phase !== 'ready' || !engineReady || (!content && !media)) return;
    if (media && !supportedMedia.includes(media.kind)) {
      Alert.alert('\uC774 \uBAA8\uB378\uC5D0\uC11C\uB294 \uCCA8\uBD80\uD560 \uC218 \uC5C6\uC5B4\uC694', '\uBAA8\uB378 \uC785\uB825 \uC9C0\uC6D0 \uD615\uC2DD\uC744 \uD655\uC778\uD558\uAC70\uB098 \uB2E4\uB978 \uBAA8\uB378\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.');
      return;
    }
    const userMessage = createMessage(
      'user',
      content || '\uCCA8\uBD80 \uC790\uB8CC\uB97C \uD655\uC778\uD574 \uC918.',
      media || undefined
    );
    const baseMessages = [...messagesRef.current, userMessage];
    setDraft('');
    setAttachment(null);
    await runCompletion(baseMessages, userMessage.content);
  }, [attachment, draft, engineReady, phase, runCompletion, supportedMedia]);

  const pickAttachment = useCallback(async (kind: ChatMediaKind) => {
    if (!supportedMedia.includes(kind)) {
      Alert.alert('\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC785\uB825', '\uD604\uC7AC \uC120\uD0DD\uD55C \uBAA8\uB378\uC740 \uC774 \uC785\uB825 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC544\uC694.');
      return;
    }
    try {
      const picked = await pickChatAttachment(kind);
      if (picked) setAttachment(picked);
    } catch (error) {
      Alert.alert(normalizeGuardianError(error));
    }
  }, [supportedMedia]);

  useEffect(() => {
    if (attachment && !supportedMedia.includes(attachment.kind)) setAttachment(null);
  }, [attachment, supportedMedia]);

  const retryLastResponse = useCallback(async () => {
    if (!retryState || phase !== 'ready' || !engineReady) return;
    await runCompletion(retryState.baseMessages, retryState.content);
  }, [engineReady, phase, retryState, runCompletion]);

  const chooseStarter = useCallback((prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const activeConversation = conversations.find((room) => room.id === activeConversationId)
    ?? conversations[0]
    ?? null;
  const showStatusRow = phase !== 'ready' || !!retryState;

  return (
    <ChatKeyboardLayout style={styles.screen}>
      <ScreenHeader
        eyebrow="우리들의 아지트"
        title={guardianProfile.name}
        detail={guardianProfile.synopsis}
        action={
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지킴이 진단 로그"
              onPress={openDiagnostics}
              style={styles.headerButton}
            >
              <Ionicons name="bug-outline" size={20} color={colors.tealDark} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`지킴이 대화 목록, ${conversations.length}개`}
              disabled={busy}
              onPress={() => setConversationsOpen(true)}
              style={[styles.headerButton, busy && styles.disabled]}
            >
              <Ionicons name="chatbubbles-outline" size={20} color={colors.tealDark} />
              {conversations.length > 1 ? (
                <View style={styles.conversationCount}>
                  <Text style={styles.conversationCountText}>{Math.min(conversations.length, 99)}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지킴이 설정"
              disabled={busy}
              onPress={() => setSettingsOpen(true)}
              style={[styles.headerButton, busy && styles.disabled]}
            >
              <Ionicons name="options-outline" size={20} color={colors.tealDark} />
            </Pressable>
          </View>
        }
      />

      <View style={styles.conversationBar}>
        <View style={styles.conversationMark}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.tealDark} />
        </View>
        <View style={styles.conversationCopy}>
          <Text style={styles.conversationEyebrow}>지금 나누는 이야기</Text>
          <Text style={styles.conversationTitle} numberOfLines={1}>{activeConversation?.title || '새 이야기'}</Text>
        </View>
        {phase === 'ready' && messages.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="새 지킴이 대화 만들기"
            onPress={() => void createNewConversation()}
            style={styles.newConversationButton}
          >
            <Ionicons name="add" size={17} color={colors.coral} />
            <Text style={styles.newConversationText}>새 이야기</Text>
          </Pressable>
        ) : null}
      </View>

      {showStatusRow ? (
        <View style={styles.statusRow}>
          {busy ? <ActivityIndicator size="small" color={colors.tealDark} /> : (
            <Ionicons name="information-circle-outline" size={17} color={colors.inkMuted} />
          )}
          <Text style={styles.statusText} numberOfLines={2}>{statusMessage}</Text>
          {phase === 'idle' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지킴이 준비하기"
              onPress={() => guardianProfile.aiEngineType === 'openRouter' || directoryName
                ? setSettingsOpen(true)
                : void pickDirectory()}
              style={styles.statusAction}
            >
              <Text style={styles.statusActionText}>준비하기</Text>
            </Pressable>
          ) : phase === 'ready' && retryState ? (
            <Pressable accessibilityRole="button" accessibilityLabel="마지막 지킴이 답변 다시 시도" onPress={() => void retryLastResponse()} style={styles.retryButton}>
              <Ionicons name="refresh" size={15} color={colors.tealDark} />
              <Text style={styles.retryText}>재시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
          if (nearBottomRef.current) scrollToLatest(false);
        }}
        onScroll={handleKeyboardAwareScroll}
        scrollEventThrottle={32}
        renderItem={({ item }) => {
          const user = item.role === 'user';
          const visibleContent = user
            ? item.content
            : sanitizeGuardianVisibleContent(item.content);
          return (
            <View style={[styles.messageRow, user && styles.userMessageRow]}>
              {!user ? (
                <View style={styles.guardianAvatar}>
                  <Image source={guardianMascot} resizeMode="contain" style={styles.guardianAvatarImage} />
                </View>
              ) : null}
              <View style={[styles.bubble, user ? styles.userBubble : styles.assistantBubble]}>
                <Text style={[styles.bubbleLabel, user && styles.userBubbleText]}>
                  {user ? '나' : guardianProfile.name}
                </Text>
                {item.attachment ? <ChatMediaContent attachment={item.attachment} /> : null}
                <Text style={[styles.bubbleText, user && styles.userBubbleText]}>{visibleContent || '…'}</Text>
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
                <Text style={styles.emptyEyebrow}>{guardianProfile.name}</Text>
                <Text style={styles.emptyTitle}>오늘은 어떤 이야기를 지켜볼까요?</Text>
                <Text style={styles.emptyText}>마음속 이야기와 일상의 고민을 편하게 들려주세요. 천천히 듣고 함께 정리해 드릴게요.</Text>
              </View>
            </View>

            {!engineReady ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="지킴이 준비하기"
                onPress={() => guardianProfile.aiEngineType === 'openRouter'
                  ? setSettingsOpen(true)
                  : directoryName ? setSettingsOpen(true) : void pickDirectory()}
                style={styles.wakeButton}
              >
                <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
                <Text style={styles.wakeButtonText}>{directoryName || guardianProfile.aiEngineType === 'openRouter'
                  ? '지킴이 준비하기'
                  : '기억 폴더 연결하기'}</Text>
              </Pressable>
            ) : phase === 'ready' ? (
              <View style={styles.starters}>
                {STARTER_PROMPTS.map((prompt, index) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                    onPress={() => chooseStarter(prompt)}
                    style={styles.starterRow}
                  >
                    <Ionicons name={index === 2 ? 'leaf-outline' : index === 1 ? 'home-outline' : 'chatbubble-ellipses-outline'} size={18} color={colors.tealDark} />
                    <Text style={styles.starterText}>{prompt}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.inkMuted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
      />

      <ChatComposer
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        attachment={attachment}
        supportedMedia={supportedMedia}
        onPickAttachment={(kind) => void pickAttachment(kind)}
        onRemoveAttachment={() => setAttachment(null)}
        onSend={() => void sendMessage()}
        onStop={() => void stopGeneration()}
        onFocus={handleComposerFocus}
        placeholder={phase === 'ready' ? '지킴이에게 이야기해 보세요' : '지킴이가 깨어나면 이야기할 수 있어요'}
        accessibilityLabel={`${guardianProfile.name}에게 보낼 메시지`}
        editable={phase === 'ready'}
        sending={phase === 'generating'}
        stopping={phase === 'stopping'}
        maxLength={2000}
        capabilityHint={attachmentMenuHint}
      />

      <GuardianSettingsModal
        visible={settingsOpen}
        profile={guardianProfile}
        models={chatModels}
        selectedUri={selectedUri}
        directoryName={directoryName}
        busy={busy}
        openRouterConnected={openRouterConnected}
        openRouterBusy={openRouterBusy}
        openRouterMessage={openRouterMessage}
        openRouterModels={openRouterModels}
        onClose={() => setSettingsOpen(false)}
        onConnectOpenRouter={() => void connectOpenRouterAccount()}
        onImportOpenRouterApiKey={importOpenRouterKey}
        onDisconnectOpenRouter={() => void disconnectOpenRouterAccount()}
        onRefreshOpenRouterModels={() => void refreshOpenRouterModels()}
        onSaveProfile={saveGuardianProfile}
        onSelectModel={(model) => void selectModel(model)}
        onRefreshModels={() => void refreshModels()}
        onPickDirectory={() => {
          setSettingsOpen(false);
          void pickDirectory();
        }}
      />
      <GuardianConversationsModal
        visible={conversationsOpen}
        guardianName={guardianProfile.name}
        conversations={conversations}
        activeConversationId={activeConversationId}
        busy={busy}
        onClose={() => setConversationsOpen(false)}
        onCreate={() => void createNewConversation()}
        onSelect={(conversationId) => void selectConversation(conversationId)}
        onDelete={deleteConversation}
      />

      <Modal
        visible={diagOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDiagOpen(false)}
      >
        <View style={styles.diagOverlay}>
          <View style={[styles.diagSheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.diagHeader}>
              <Text style={styles.diagTitle}>지킴이 진단 로그</Text>
              <View style={styles.diagHeaderButtons}>
                <Pressable accessibilityRole="button" accessibilityLabel="진단 로그 비우기" onPress={clearDiagnostics} style={styles.diagButton}>
                  <Text style={styles.diagButtonText}>비우기</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="진단 로그 닫기" onPress={() => setDiagOpen(false)} style={styles.diagButton}>
                  <Text style={styles.diagButtonText}>닫기</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.diagHint}>로그를 길게 눌러 선택하면 복사할 수 있어요. 오류가 난 직후에 열면 원인이 기록되어 있어요.</Text>
            <FlatList
              data={diagLines.length ? diagLines : ['기록된 진단 로그가 없습니다. 대화를 한 번 시도한 뒤 다시 열어 주세요.']}
              keyExtractor={(item, index) => `${index}-${item.slice(0, 24)}`}
              renderItem={({ item }) => (
                <Text selectable style={styles.diagLine}>{item}</Text>
              )}
              contentContainerStyle={styles.diagListContent}
            />
          </View>
        </View>
      </Modal>
    </ChatKeyboardLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  conversationCount: { position: 'absolute', right: -3, top: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral, borderWidth: 2, borderColor: colors.canvas },
  conversationCountText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  conversationBar: { minHeight: 62, marginHorizontal: spacing.lg, marginBottom: spacing.xs, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  conversationMark: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  conversationCopy: { flex: 1, minWidth: 0 },
  conversationEyebrow: { color: colors.inkMuted, fontSize: type.tiny, fontWeight: '800' },
  conversationTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900', marginTop: 2 },
  newConversationButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceWarm },
  newConversationText: { color: colors.coral, fontSize: type.small, fontWeight: '900' },
  statusRow: { minHeight: 42, marginHorizontal: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSoft, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 17 },
  statusAction: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  statusActionText: { color: colors.tealDark, fontSize: type.small, fontWeight: '900' },
  retryButton: { minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  retryText: { color: colors.tealDark, fontSize: type.small, fontWeight: '900' },
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
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 43, maxHeight: 112, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, color: colors.ink, fontSize: type.body, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sendButton: { width: 43, height: 43, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealDark },
  stopButton: { backgroundColor: colors.coral },
  diagOverlay: { flex: 1, backgroundColor: 'rgba(23, 32, 28, 0.45)', justifyContent: 'flex-end' },
  diagSheet: { maxHeight: '78%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  diagHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  diagHeaderButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  diagTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  diagButton: { minHeight: 34, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  diagButtonText: { color: colors.tealDark, fontSize: type.small, fontWeight: '900' },
  diagHint: { color: colors.inkMuted, fontSize: type.tiny, marginBottom: spacing.sm },
  diagLine: { color: colors.inkSoft, fontSize: type.tiny, lineHeight: 16, paddingVertical: 2 },
  diagListContent: { paddingBottom: spacing.md },
});
