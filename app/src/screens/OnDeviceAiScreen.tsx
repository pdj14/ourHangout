import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { cancelGuardianWebTool } from '../services/guardianWebTools';
import {
  connectOpenRouter,
  disconnectOpenRouter,
  hasOpenRouterConnection,
  importOpenRouterApiKey,
} from '../services/openRouterAuth';
import {
  cancelOpenRouterCompletion,
  fetchOpenRouterModels,
  formatOpenRouterModelName,
  OpenRouterClientError,
  type OpenRouterModel,
} from '../services/openRouterClient';
import { colors, radius, spacing, type } from '../theme';

const guardianMascot = require('../../assets/forest-guardian.png');
const SELECTED_MODEL_KEY = 'on_device_ai:selected_model_v1';
const LEGACY_SELECTED_PROJECTOR_KEY = 'on_device_ai:selected_projector_v1';
const HISTORY_KEY = 'on_device_ai:history_v1';

const STARTER_PROMPTS = [
  '오늘 있었던 일을 차분히 정리해 줘',
  '우리 가족이 함께할 작은 놀이를 추천해 줘',
  '오늘 마음이 편해질 이야기를 들려줘',
];

type Phase = 'idle' | 'scanning' | 'preparing' | 'loading' | 'ready' | 'generating' | 'stopping';
type StoredHistory = { modelUri: string; messages: OnDeviceChatMessage[] };
type RetryState = { baseMessages: OnDeviceChatMessage[]; content: string };

function createMessage(
  role: OnDeviceChatMessage['role'],
  content: string
): OnDeviceChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function isProjectorFile(model: NativeAiModelFile) {
  return /(^|[-_.\s])(mmproj|projector)([-_.\s]|$)/i.test(model.name);
}

function normalizeGuardianError(error: unknown) {
  if (error instanceof OpenRouterClientError) return error.message;
  return normalizeOnDeviceAiError(error);
}

export function OnDeviceAiScreen() {
  const insets = useSafeAreaInsets();
  const [models, setModels] = useState<NativeAiModelFile[]>([]);
  const [directoryName, setDirectoryName] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [messages, setMessages] = useState<OnDeviceChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('scanning');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('지킴이가 기억을 살펴보고 있어요.');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guardianProfile, setGuardianProfile] = useState<GuardianProfile>(DEFAULT_GUARDIAN_PROFILE);
  const [openRouterConnected, setOpenRouterConnected] = useState(false);
  const [openRouterBusy, setOpenRouterBusy] = useState(false);
  const [openRouterMessage, setOpenRouterMessage] = useState('');
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [activeOpenRouterModelId, setActiveOpenRouterModelId] = useState(DEFAULT_GUARDIAN_PROFILE.openRouterModelId);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const mountedRef = useRef(true);
  const messagesRef = useRef<OnDeviceChatMessage[]>([]);
  const selectedUriRef = useRef('');
  const listRef = useRef<FlatList<OnDeviceChatMessage> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const stopRequestedRef = useRef(false);

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
    ? openRouterConnected && !!guardianProfile.openRouterModelId
    : !!selectedModel;
  const canSend = phase === 'ready'
    && engineReady
    && !!draft.trim();

  const commitMessages = useCallback((next: OnDeviceChatMessage[], modelUri?: string) => {
    messagesRef.current = next;
    setMessages(next);
    const historyModelUri = modelUri ?? selectedUriRef.current;
    if (historyModelUri) {
      const stored: StoredHistory = { modelUri: historyModelUri, messages: next.slice(-40) };
      void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
    }
  }, []);

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
        const [storedUri, storedHistory, result, storedGuardianProfile, connected] = await Promise.all([
          AsyncStorage.getItem(SELECTED_MODEL_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          getOnDeviceModels(),
          readGuardianProfile(),
          hasOpenRouterConnection().catch(() => false),
        ]);
        await AsyncStorage.removeItem(LEGACY_SELECTED_PROJECTOR_KEY);
        if (!mountedRef.current) return;
        setGuardianProfile(storedGuardianProfile);
        setActiveOpenRouterModelId(storedGuardianProfile.openRouterModelId);
        setOpenRouterConnected(connected);
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
        if (storedGuardianProfile.aiEngineType === 'openRouter') {
          await applyDirectory(result, storedUri || '', false);
          await onDeviceAiEngine.unload().catch(() => undefined);
          setPhase(connected ? 'ready' : 'idle');
          setStatusMessage(connected
            ? `${storedGuardianProfile.name}가 OpenRouter에서 기다리고 있어요.`
            : '지킴이 설정에서 OpenRouter 계정을 연결해 주세요.');
          if (connected) {
            try {
              const cloudModels = await fetchOpenRouterModels();
              if (mountedRef.current) {
                setOpenRouterModels(cloudModels);
                setOpenRouterMessage(`${cloudModels.length}개 모델을 불러왔어요.`);
              }
            } catch (error) {
              if (mountedRef.current) {
                const disconnected = error instanceof OpenRouterClientError
                  && (error.code === 'unauthorized' || error.code === 'not_connected');
                if (disconnected) {
                  void disconnectOpenRouter().catch(() => undefined);
                  setOpenRouterConnected(false);
                  setPhase('idle');
                  setStatusMessage('OpenRouter 연결을 다시 확인해 주세요.');
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
      cancelOpenRouterCompletion();
      void cancelGuardianWebTool();
      void onDeviceAiEngine.unload();
    };
  }, [applyDirectory, commitMessages]);

  const pickDirectory = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('Android 폴더 선택기를 열고 있어요.');
    try {
      await onDeviceAiEngine.unload();
      const result = await pickOnDeviceModelsDirectory();
      if (!mountedRef.current) return;
      setSelectedUri('');
      selectedUriRef.current = '';
      commitMessages([], '');
      await AsyncStorage.multiRemove([SELECTED_MODEL_KEY, LEGACY_SELECTED_PROJECTOR_KEY, HISTORY_KEY]);
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
  }, [applyDirectory, commitMessages, loadSelectedModel, selectedModel]);

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
    commitMessages([], model.uri);
    await AsyncStorage.setItem(SELECTED_MODEL_KEY, model.uri);
    await loadSelectedModel(model);
  }, [commitMessages, loadSelectedModel, selectedUri]);

  const refreshOpenRouterModels = useCallback(async () => {
    setOpenRouterBusy(true);
    setOpenRouterMessage('사용 가능한 모델을 불러오고 있어요.');
    try {
      const cloudModels = await fetchOpenRouterModels();
      if (!mountedRef.current) return;
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`${cloudModels.length}개 모델을 불러왔어요.`);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof OpenRouterClientError && (error.code === 'unauthorized' || error.code === 'not_connected')) {
        void disconnectOpenRouter().catch(() => undefined);
        setOpenRouterConnected(false);
        if (guardianProfile.aiEngineType === 'openRouter') setPhase('idle');
      }
      setOpenRouterMessage(normalizeGuardianError(error));
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile.aiEngineType]);

  const connectOpenRouterAccount = useCallback(async () => {
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
        setStatusMessage(`${guardianProfile.name}가 OpenRouter에서 기다리고 있어요.`);
      }
      const cloudModels = await fetchOpenRouterModels();
      if (!mountedRef.current) return;
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`연결 완료 · ${cloudModels.length}개 모델을 불러왔어요.`);
    } catch (error) {
      if (!mountedRef.current) return;
      const unauthorized = error instanceof OpenRouterClientError
        && (error.code === 'unauthorized' || error.code === 'not_connected');
      const connected = keyStored && !unauthorized;
      setOpenRouterConnected(connected);
      if (guardianProfile.aiEngineType === 'openRouter') setPhase(connected ? 'ready' : 'idle');
      const message = normalizeGuardianError(error);
      setOpenRouterMessage(connected ? `계정 연결은 완료됐지만 모델 목록을 불러오지 못했어요. ${message}` : message);
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile.aiEngineType, guardianProfile.name]);

  const importOpenRouterKey = useCallback(async (apiKey: string) => {
    let keyStored = false;
    setOpenRouterBusy(true);
    setOpenRouterMessage('API 키 유효성을 안전하게 확인하고 있어요.');
    try {
      const metadata = await importOpenRouterApiKey(apiKey);
      if (!mountedRef.current) return false;
      keyStored = true;
      setOpenRouterConnected(true);
      setOpenRouterMessage(metadata.label ? `${metadata.label} 키로 연결했어요. 모델 목록을 확인하고 있어요.` : 'API 키로 연결했어요. 모델 목록을 확인하고 있어요.');
      const cloudModels = await fetchOpenRouterModels();
      if (!mountedRef.current) return false;
      setOpenRouterModels(cloudModels);
      setOpenRouterMessage(`연결 완료 · ${cloudModels.length}개 모델을 불러왔어요.`);
      if (guardianProfile.aiEngineType === 'openRouter') {
        setPhase('ready');
        setStatusMessage(`${guardianProfile.name}가 OpenRouter에서 기다리고 있어요.`);
      }
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      const unauthorized = error instanceof OpenRouterClientError
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
  }, [guardianProfile.aiEngineType, guardianProfile.name]);

  const disconnectOpenRouterAccount = useCallback(async () => {
    setOpenRouterBusy(true);
    try {
      cancelOpenRouterCompletion();
      await disconnectOpenRouter();
      if (!mountedRef.current) return;
      setOpenRouterConnected(false);
      setOpenRouterModels([]);
      setOpenRouterMessage('이 기기에서 OpenRouter 연결을 해제했어요.');
      if (guardianProfile.aiEngineType === 'openRouter') {
        setPhase('idle');
        setStatusMessage('지킴이 설정에서 OpenRouter 계정을 연결해 주세요.');
      }
    } finally {
      if (mountedRef.current) setOpenRouterBusy(false);
    }
  }, [guardianProfile.aiEngineType]);

  const clearConversation = useCallback(async () => {
    if (phase !== 'ready') return;
    if (guardianProfile.aiEngineType === 'onDevice') {
      await onDeviceAiEngine.clearConversation().catch(() => undefined);
    }
    commitMessages([]);
    setRetryState(null);
    setStatusMessage('지킴이가 새 이야기로 기억을 비웠어요.');
  }, [commitMessages, guardianProfile.aiEngineType, phase]);

  const stopGeneration = useCallback(async () => {
    if (phase !== 'generating') return;
    stopRequestedRef.current = true;
    setPhase('stopping');
    setStatusMessage(`${guardianProfile.name}가 잠시 생각을 멈추고 있어요.`);
    await Promise.all([
      onDeviceAiEngine.stop().catch(() => undefined),
      cancelGuardianWebTool(),
      Promise.resolve(cancelOpenRouterCompletion()),
    ]);
  }, [guardianProfile.name, phase]);

  const saveGuardianProfile = useCallback(async (nextProfile: GuardianProfile) => {
    const previousEngine = guardianProfile.aiEngineType;
    const saved = await writeGuardianProfile(nextProfile);
    setGuardianProfile(saved);
    setActiveOpenRouterModelId(saved.openRouterModelId);
    if (previousEngine !== saved.aiEngineType) {
      commitMessages([]);
      setRetryState(null);
      if (saved.aiEngineType === 'openRouter') {
        await onDeviceAiEngine.unload().catch(() => undefined);
        setPhase(openRouterConnected ? 'ready' : 'idle');
        setStatusMessage(openRouterConnected
          ? `${saved.name}가 OpenRouter에서 기다리고 있어요.`
          : 'OpenRouter 계정을 연결하면 바로 대화할 수 있어요.');
      } else if (selectedModel) {
        await loadSelectedModel(selectedModel);
      } else {
        setPhase('idle');
        setStatusMessage('온디바이스 대화에 사용할 GGUF 모델을 선택해 주세요.');
      }
      return;
    }
    setStatusMessage(`${saved.name}의 설정을 저장했어요.`);
  }, [commitMessages, guardianProfile.aiEngineType, loadSelectedModel, openRouterConnected, selectedModel]);

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
      setActiveOpenRouterModelId(guardianProfile.openRouterModelId);
      setStatusMessage(`${guardianProfile.name}가 OpenRouter에 연결하고 있어요.`);
    } else {
      setStatusMessage(`${guardianProfile.name}가 기기 안에서 생각하고 있어요.`);
    }
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
        onModel: (modelId) => {
          if (mountedRef.current && !stopRequestedRef.current) setActiveOpenRouterModelId(modelId);
        },
        shouldStop: () => stopRequestedRef.current,
      });
      const next = [
        ...baseMessages,
        { ...assistantMessage, content: finalText || '생각을 잠시 멈췄어요.' },
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
      const next = partial || stopped
        ? messagesRef.current.filter((message) => message.id !== assistantMessage.id || !!message.content.trim())
        : [...baseMessages, { ...assistantMessage, content: `잠시 길을 잃었어요. ${message}` }];
      commitMessages(next);
      const disconnected = error instanceof OpenRouterClientError
        && (error.code === 'unauthorized' || error.code === 'not_connected');
      if (disconnected) {
        void disconnectOpenRouter().catch(() => undefined);
        setOpenRouterConnected(false);
      }
      setPhase(disconnected ? 'idle' : 'ready');
      setStatusMessage(stopped ? '답변 생성을 멈췄어요.' : message);
      setRetryState(stopped || disconnected ? null : { baseMessages, content: failedContent });
      stopRequestedRef.current = false;
    }
  }, [commitMessages, guardianProfile, scheduleScrollToLatest]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (phase !== 'ready' || !engineReady || !content) return;
    const userMessage = createMessage('user', content);
    const baseMessages = [...messagesRef.current, userMessage];
    setDraft('');
    await runCompletion(baseMessages, content);
  }, [draft, engineReady, phase, runCompletion]);

  const retryLastResponse = useCallback(async () => {
    if (!retryState || phase !== 'ready' || !engineReady) return;
    await runCompletion(retryState.baseMessages, retryState.content);
  }, [engineReady, phase, retryState, runCompletion]);

  const chooseStarter = useCallback((prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const displayedOpenRouterModelId = phase === 'generating'
    ? activeOpenRouterModelId
    : guardianProfile.openRouterModelId;
  const displayedOpenRouterModelName = formatOpenRouterModelName(displayedOpenRouterModelId, openRouterModels);
  const modelStateTitle = guardianProfile.aiEngineType === 'openRouter'
    ? openRouterConnected
      ? `${guardianProfile.name}가 클라우드에 연결되어 있어요`
      : 'OpenRouter 계정을 연결해 주세요'
    : selectedModel
      ? phase === 'ready' || phase === 'generating'
        ? `${guardianProfile.name}가 깨어 있어요`
        : `${guardianProfile.name}를 준비하고 있어요`
      : `${guardianProfile.name}의 기억을 연결해 주세요`;
  const modelStateDetail = guardianProfile.aiEngineType === 'openRouter'
    ? `${displayedOpenRouterModelName} · OpenRouter`
    : selectedModel
      ? `${selectedModel.name} · 기기 내 대화`
      : directoryName || 'AiModels 폴더가 필요해요';

  return (
    <ChatKeyboardLayout
      keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      style={styles.screen}
    >
      <ScreenHeader
        eyebrow="우리들의 아지트"
        title={guardianProfile.name}
        detail={guardianProfile.synopsis}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지킴이 설정"
            disabled={busy}
            onPress={() => setSettingsOpen(true)}
            style={[styles.headerButton, busy && styles.disabled]}
          >
            <Ionicons name="options-outline" size={20} color={colors.tealDark} />
          </Pressable>
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지킴이 설정 열기"
        disabled={busy}
        onPress={() => setSettingsOpen(true)}
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
        {phase === 'ready' && messages.length && !retryState ? (
          <Pressable accessibilityRole="button" accessibilityLabel="지킴이 대화 초기화" onPress={() => void clearConversation()}>
            <Text style={styles.clearText}>새 이야기</Text>
          </Pressable>
        ) : null}
        {phase === 'ready' && retryState ? (
          <Pressable accessibilityRole="button" accessibilityLabel="마지막 지킴이 답변 다시 시도" onPress={() => void retryLastResponse()} style={styles.retryButton}>
            <Ionicons name="refresh" size={15} color={colors.tealDark} />
            <Text style={styles.retryText}>재시도</Text>
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
          if (nearBottomRef.current) scrollToLatest(false);
        }}
        onScroll={handleKeyboardAwareScroll}
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
                  {user ? '나' : guardianProfile.aiEngineType === 'openRouter'
                    ? `${guardianProfile.name} · ${displayedOpenRouterModelName}`
                    : guardianProfile.name}
                </Text>
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
                <Text style={styles.emptyEyebrow}>{guardianProfile.name}</Text>
                <Text style={styles.emptyTitle}>오늘은 어떤 이야기를 지켜볼까요?</Text>
                <Text style={styles.emptyText}>{guardianProfile.aiEngineType === 'openRouter'
                  ? '마음속 이야기와 일상의 고민을 편하게 들려주세요. 답변 생성에 필요한 내용은 선택한 클라우드 모델로 안전하게 전송됩니다.'
                  : '마음속 이야기와 일상의 고민을 편하게 들려주세요. 이곳에서 나눈 내용은 기기 밖으로 나가지 않아요.'}</Text>
              </View>
            </View>

            {!engineReady ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={guardianProfile.aiEngineType === 'openRouter'
                  ? 'OpenRouter 계정 연결 설정 열기'
                  : directoryName ? '지킴이 모델 선택' : 'AiModels 폴더 연결'}
                onPress={() => guardianProfile.aiEngineType === 'openRouter'
                  ? setSettingsOpen(true)
                  : directoryName ? setSettingsOpen(true) : void pickDirectory()}
                style={styles.wakeButton}
              >
                <Ionicons name={guardianProfile.aiEngineType === 'openRouter' ? 'cloud-outline' : 'leaf-outline'} size={18} color="#FFFFFF" />
                <Text style={styles.wakeButtonText}>{guardianProfile.aiEngineType === 'openRouter'
                  ? 'OpenRouter 연결하기'
                  : directoryName ? '지킴이 깨우기' : '기억 폴더 연결하기'}</Text>
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

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={phase === 'ready' ? '지킴이에게 이야기해 보세요' : '지킴이가 깨어나면 이야기할 수 있어요'}
          placeholderTextColor={colors.inkMuted}
          editable={phase === 'ready'}
          multiline
          maxLength={2000}
          onFocus={handleComposerFocus}
          accessibilityLabel={`${guardianProfile.name}에게 보낼 메시지`}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={phase === 'generating' ? `${guardianProfile.name} 답변 중지` : `${guardianProfile.name}에게 보내기`}
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
    </ChatKeyboardLayout>
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
});
