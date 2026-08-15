import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  NativeEventEmitter,
  Platform,
  Pressable,
  SafeAreaView,
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
import { colors, radius, shadow, spacing, type } from '../theme';

const SELECTED_MODEL_KEY = 'on_device_ai:selected_model_v1';
const HISTORY_KEY = 'on_device_ai:history_v1';

type Phase = 'idle' | 'scanning' | 'preparing' | 'loading' | 'ready' | 'generating' | 'stopping';
type StoredHistory = { modelUri: string; messages: OnDeviceChatMessage[] };

function createMessage(role: OnDeviceChatMessage['role'], content: string): OnDeviceChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '크기 정보 없음';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

export function OnDeviceAiScreen() {
  const [models, setModels] = useState<NativeAiModelFile[]>([]);
  const [directoryName, setDirectoryName] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [messages, setMessages] = useState<OnDeviceChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('scanning');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('AiModels 폴더를 확인하고 있습니다.');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const mountedRef = useRef(true);
  const messagesRef = useRef<OnDeviceChatMessage[]>([]);
  const selectedUriRef = useRef('');

  const selectedModel = useMemo(
    () => models.find((model) => model.uri === selectedUri) ?? null,
    [models, selectedUri]
  );
  const busy = ['scanning', 'preparing', 'loading', 'generating', 'stopping'].includes(phase);
  const canSend = phase === 'ready' && !!selectedModel && !!draft.trim();

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
    setStatusMessage(model.prepared ? '모델을 메모리에 불러오고 있습니다.' : '모델을 앱 저장소에 안전하게 준비하고 있습니다.');
    setPhase(model.prepared ? 'loading' : 'preparing');
    setProgress(0);
    try {
      await onDeviceAiEngine.loadModel(model, (update: OnDeviceModelLoadProgress) => {
        if (!mountedRef.current) return;
        setPhase(update.phase);
        setProgress(update.progress);
        setStatusMessage(
          update.phase === 'preparing'
            ? '모델 파일을 준비하고 있습니다. 앱을 종료하지 마세요.'
            : '모델을 메모리에 불러오고 있습니다.'
        );
      });
      if (!mountedRef.current || !onDeviceAiEngine.isLoaded(model.uri)) return;
      setModels((current) => current.map((item) => (
        item.uri === model.uri ? { ...item, prepared: true } : item
      )));
      setPhase('ready');
      setProgress(1);
      setStatusMessage('오프라인 대화 준비가 완료되었습니다.');
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, []);

  const applyDirectory = useCallback(async (
    result: Awaited<ReturnType<typeof getOnDeviceModels>>,
    preferredUri = ''
  ) => {
    const nextModels = result.models || [];
    setModels(nextModels);
    setDirectoryName(result.directoryName || '');
    if (!result.directoryUri) {
      setPhase('idle');
      setStatusMessage('먼저 스마트폰의 AiModels 폴더를 선택해 주세요.');
      return;
    }
    if (!nextModels.length) {
      setPhase('idle');
      setStatusMessage(`${result.directoryName || '선택한 폴더'}에 GGUF 모델이 없습니다.`);
      return;
    }

    const preferred = nextModels.find((model) => model.uri === preferredUri);
    if (preferred) {
      selectedUriRef.current = preferred.uri;
      setSelectedUri(preferred.uri);
      await loadSelectedModel(preferred);
    } else {
      setPhase('idle');
      setStatusMessage('사용할 GGUF 모델을 선택해 주세요.');
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
        const [storedUri, storedHistory, result] = await Promise.all([
          AsyncStorage.getItem(SELECTED_MODEL_KEY),
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
        await applyDirectory(result, storedUri || '');
      } catch (error) {
        if (!mountedRef.current) return;
        setPhase('idle');
        setStatusMessage(normalizeOnDeviceAiError(error));
      }
    })();

    return () => {
      mountedRef.current = false;
      subscription?.remove();
      void onDeviceAiEngine.unload();
    };
  }, [applyDirectory, commitMessages]);

  const pickDirectory = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('Android 폴더 선택기를 열고 있습니다.');
    try {
      await onDeviceAiEngine.unload();
      const result = await pickOnDeviceModelsDirectory();
      if (!mountedRef.current) return;
      setSelectedUri('');
      selectedUriRef.current = '';
      commitMessages([], '');
      await AsyncStorage.multiRemove([SELECTED_MODEL_KEY, HISTORY_KEY]);
      await applyDirectory(result);
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setStatusMessage(
        isFolderPickerCancellation(error)
          ? '기존 설정을 유지했습니다.'
          : normalizeOnDeviceAiError(error)
      );
    }
  }, [applyDirectory, commitMessages]);

  const refreshModels = useCallback(async () => {
    setPhase('scanning');
    setStatusMessage('GGUF 모델 목록을 새로 고치고 있습니다.');
    try {
      const result = await getOnDeviceModels();
      if (!mountedRef.current) return;
      await applyDirectory(result, selectedUri);
    } catch (error) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [applyDirectory, selectedUri]);

  const selectModel = useCallback(async (model: NativeAiModelFile) => {
    setSelectorOpen(false);
    if (model.uri === selectedUri && onDeviceAiEngine.isLoaded(model.uri)) return;
    await onDeviceAiEngine.unload();
    selectedUriRef.current = model.uri;
    setSelectedUri(model.uri);
    commitMessages([], model.uri);
    await AsyncStorage.setItem(SELECTED_MODEL_KEY, model.uri);
    await loadSelectedModel(model);
  }, [commitMessages, loadSelectedModel, selectedUri]);

  const clearConversation = useCallback(async () => {
    if (phase !== 'ready') return;
    await onDeviceAiEngine.clearConversation().catch(() => undefined);
    commitMessages([]);
    setStatusMessage('대화 기록과 모델 컨텍스트를 초기화했습니다.');
  }, [commitMessages, phase]);

  const stopGeneration = useCallback(async () => {
    if (phase !== 'generating') return;
    setPhase('stopping');
    setStatusMessage('답변 생성을 중지하고 있습니다.');
    await onDeviceAiEngine.stop().catch(() => undefined);
  }, [phase]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content || !canSend) return;
    const userMessage = createMessage('user', content);
    const assistantMessage = createMessage('assistant', '');
    const baseMessages = [...messagesRef.current, userMessage];
    setDraft('');
    commitMessages([...baseMessages, assistantMessage]);
    setPhase('generating');
    setStatusMessage('기기 안에서 답변을 생성하고 있습니다.');
    try {
      const finalText = await onDeviceAiEngine.complete(baseMessages, (partial) => {
        if (!mountedRef.current) return;
        const next = [...baseMessages, { ...assistantMessage, content: partial }];
        messagesRef.current = next;
        setMessages(next);
      });
      const next = [
        ...baseMessages,
        { ...assistantMessage, content: finalText || '답변 생성이 중지되었습니다.' },
      ];
      commitMessages(next);
      setPhase('ready');
      setStatusMessage(finalText ? '오프라인 대화 준비가 완료되었습니다.' : '답변 생성을 중지했습니다.');
    } catch (error) {
      if (!mountedRef.current) return;
      const partial = messagesRef.current.find((message) => message.id === assistantMessage.id)?.content.trim();
      const next = partial
        ? messagesRef.current
        : [...baseMessages, { ...assistantMessage, content: `오류: ${normalizeOnDeviceAiError(error)}` }];
      commitMessages(next);
      setPhase('ready');
      setStatusMessage(normalizeOnDeviceAiError(error));
    }
  }, [canSend, commitMessages, draft]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        eyebrow="Private AI"
        title="온디바이스 AI"
        detail="모델과 대화 내용은 스마트폰 안에서만 처리됩니다."
        action={
          <Pressable accessibilityRole="button" accessibilityLabel="모델 목록 새로고침" disabled={busy} onPress={() => void refreshModels()} style={styles.headerButton}>
            <Ionicons name="refresh" size={19} color={colors.tealDark} />
          </Pressable>
        }
      />

      <View style={styles.modelCard}>
        <View style={styles.modelIcon}>
          <Ionicons name="hardware-chip-outline" size={23} color={colors.tealDark} />
        </View>
        <View style={styles.modelCopy}>
          <Text style={styles.modelName} numberOfLines={1}>
            {selectedModel?.name || (directoryName ? '모델을 선택하세요' : 'AiModels 폴더가 필요합니다')}
          </Text>
          <Text style={styles.modelMeta} numberOfLines={1}>
            {selectedModel
              ? `${formatBytes(selectedModel.sizeBytes)} · ${selectedModel.prepared ? '준비됨' : '첫 사용 시 복사'}`
              : directoryName || 'Android 폴더 선택기로 연결'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={directoryName ? 'AI 모델 변경' : 'AiModels 폴더 선택'} disabled={busy} onPress={() => (directoryName ? setSelectorOpen(true) : void pickDirectory())} style={[styles.chooseButton, busy && styles.disabled]}>
          <Text style={styles.chooseButtonText}>{directoryName ? '변경' : '폴더 선택'}</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        {busy ? <ActivityIndicator size="small" color={colors.tealDark} /> : (
          <Ionicons name={phase === 'ready' ? 'checkmark-circle' : 'information-circle-outline'} size={17} color={phase === 'ready' ? colors.success : colors.inkMuted} />
        )}
        <Text style={styles.statusText} numberOfLines={2}>{statusMessage}</Text>
        {phase === 'ready' && messages.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="AI 대화 초기화" onPress={() => void clearConversation()}>
            <Text style={styles.clearText}>초기화</Text>
          </Pressable>
        ) : null}
      </View>
      {(phase === 'preparing' || phase === 'loading') ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={messages.length ? styles.messages : styles.emptyMessages}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.bubbleLabel, item.role === 'user' && styles.userBubbleText]}>
              {item.role === 'user' ? '나' : '로컬 AI'}
            </Text>
            <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>
              {item.content || '…'}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={38} color={colors.teal} />
            <Text style={styles.emptyTitle}>인터넷 없이 대화해 보세요</Text>
            <Text style={styles.emptyText}>AiModels 폴더의 GGUF 모델을 선택하면 질문과 답변이 외부 서버로 전송되지 않습니다.</Text>
          </View>
        }
      />

      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={phase === 'ready' ? '메시지를 입력하세요' : '모델 준비 후 입력할 수 있습니다'} placeholderTextColor={colors.inkMuted} editable={phase === 'ready'} multiline maxLength={2000} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel={phase === 'generating' ? '답변 생성 중지' : 'AI에게 보내기'} disabled={phase === 'stopping' || (phase !== 'generating' && !canSend)} onPress={() => phase === 'generating' ? void stopGeneration() : void sendMessage()} style={[styles.sendButton, phase === 'generating' && styles.stopButton, phase !== 'generating' && !canSend && styles.disabled]}>
          <Ionicons name={phase === 'generating' ? 'stop' : 'arrow-up'} size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal visible={selectorOpen} animationType="slide" onRequestClose={() => setSelectorOpen(false)}>
        <SafeAreaView style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>GGUF 모델 선택</Text>
              <Text style={styles.modalDetail}>{directoryName || 'AiModels'} · {models.length}개</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="모델 선택 닫기" onPress={() => setSelectorOpen(false)}>
              <Ionicons name="close" size={27} color={colors.ink} />
            </Pressable>
          </View>
          <FlatList
            data={models}
            keyExtractor={(item) => item.uri}
            contentContainerStyle={styles.modelList}
            renderItem={({ item }) => {
              const active = item.uri === selectedUri;
              return (
                <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 모델 선택`} onPress={() => void selectModel(item)} style={[styles.modelRow, active && styles.modelRowActive]}>
                  <Ionicons name="cube-outline" size={21} color={active ? colors.tealDark : colors.inkMuted} />
                  <View style={styles.modelRowCopy}>
                    <Text style={styles.modelRowName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.modelRowMeta}>{formatBytes(item.sizeBytes)} · {item.prepared ? '앱 저장소 준비됨' : '선택 후 준비 필요'}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.tealDark} /> : null}
                </Pressable>
              );
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="다른 AiModels 폴더 선택" onPress={() => { setSelectorOpen(false); void pickDirectory(); }} style={styles.folderButton}>
            <Ionicons name="folder-open-outline" size={19} color={colors.tealDark} />
            <Text style={styles.folderButtonText}>다른 AiModels 폴더 선택</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  headerButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  modelCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow },
  modelIcon: { width: 43, height: 43, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  modelCopy: { flex: 1, minWidth: 0 },
  modelName: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  modelMeta: { color: colors.inkMuted, fontSize: type.small, marginTop: 4 },
  chooseButton: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  chooseButtonText: { color: '#FFFFFF', fontSize: type.small, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  statusRow: { minHeight: 43, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 17 },
  clearText: { color: colors.coral, fontSize: type.small, fontWeight: '800' },
  progressTrack: { height: 3, marginHorizontal: spacing.lg, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line },
  progressFill: { height: '100%', backgroundColor: colors.tealDark },
  messages: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  emptyMessages: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyState: { alignItems: 'center', padding: spacing.xl },
  emptyTitle: { color: colors.ink, fontSize: type.section, fontWeight: '900', marginTop: spacing.md },
  emptyText: { color: colors.inkSoft, fontSize: type.body, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  bubble: { maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.mine },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bubbleLabel: { color: colors.tealDark, fontSize: type.tiny, fontWeight: '900', marginBottom: 4 },
  bubbleText: { color: colors.ink, fontSize: type.body, lineHeight: 21 },
  userBubbleText: { color: '#FFFFFF' },
  composer: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 43, maxHeight: 112, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, color: colors.ink, fontSize: type.body, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sendButton: { width: 43, height: 43, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealDark },
  stopButton: { backgroundColor: colors.coral },
  modalScreen: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  modalDetail: { color: colors.inkMuted, fontSize: type.small, marginTop: 4 },
  modelList: { padding: spacing.lg, gap: spacing.sm },
  modelRow: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modelRowActive: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  modelRowCopy: { flex: 1, minWidth: 0 },
  modelRowName: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  modelRowMeta: { color: colors.inkMuted, fontSize: type.small, marginTop: 5 },
  folderButton: { margin: spacing.lg, height: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.teal, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  folderButtonText: { color: colors.tealDark, fontSize: type.body, fontWeight: '900' },
});
