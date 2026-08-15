import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NativeAiModelFile } from '../native';
import {
  createGuardianRule,
  normalizeGuardianProfile,
  type GuardianProfile,
  type GuardianRule,
} from '../services/guardianProfile';
import type { OpenRouterModel } from '../services/openRouterClient';
import { colors, radius, spacing, type } from '../theme';

type GuardianSettingsModalProps = {
  visible: boolean;
  profile: GuardianProfile;
  models: NativeAiModelFile[];
  selectedUri: string;
  directoryName: string;
  busy: boolean;
  openRouterConnected: boolean;
  openRouterBusy: boolean;
  openRouterMessage: string;
  openRouterModels: OpenRouterModel[];
  onClose: () => void;
  onConnectOpenRouter: () => void;
  onDisconnectOpenRouter: () => void;
  onRefreshOpenRouterModels: () => void;
  onSaveProfile: (profile: GuardianProfile) => Promise<void>;
  onSelectModel: (model: NativeAiModelFile) => void;
  onRefreshModels: () => void;
  onPickDirectory: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '크기 정보 없음';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

export function GuardianSettingsModal({
  visible,
  profile,
  models,
  selectedUri,
  directoryName,
  busy,
  openRouterConnected,
  openRouterBusy,
  openRouterMessage,
  openRouterModels,
  onClose,
  onConnectOpenRouter,
  onDisconnectOpenRouter,
  onRefreshOpenRouterModels,
  onSaveProfile,
  onSelectModel,
  onRefreshModels,
  onPickDirectory,
}: GuardianSettingsModalProps) {
  const [draft, setDraft] = useState(profile);
  const [editingRule, setEditingRule] = useState<GuardianRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(profile);
    setEditingRule(null);
    setModelPickerOpen(false);
  }, [profile, visible]);

  useEffect(() => {
    if (visible) setSaveMessage('');
  }, [visible]);

  const profileDirty = useMemo(
    () => draft.name !== profile.name
      || draft.synopsis !== profile.synopsis
      || draft.webBrowsingEnabled !== profile.webBrowsingEnabled
      || draft.aiEngineType !== profile.aiEngineType
      || draft.openRouterModelId !== profile.openRouterModelId,
    [draft, profile]
  );

  const save = async (next: GuardianProfile) => {
    setSaving(true);
    setSaveMessage('');
    try {
      const normalized = normalizeGuardianProfile(next);
      await onSaveProfile(normalized);
      setDraft(normalized);
      setSaveMessage('설정을 저장했어요. 다음 답변부터 적용됩니다.');
    } catch {
      setSaveMessage('설정을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const saveBasics = () => void save(draft);

  const saveRule = () => {
    if (!editingRule?.instruction.trim()) return;
    const now = Date.now();
    const nextRule = {
      ...editingRule,
      title: editingRule.title.trim() || `규칙 ${draft.rules.length + 1}`,
      instruction: editingRule.instruction.trim(),
      updatedAt: now,
    };
    const exists = draft.rules.some((rule) => rule.id === nextRule.id);
    const rules = exists
      ? draft.rules.map((rule) => rule.id === nextRule.id ? nextRule : rule)
      : [...draft.rules, nextRule];
    setEditingRule(null);
    void save({ ...draft, rules });
  };

  const deleteRule = (rule: GuardianRule) => {
    Alert.alert(
      '이 규칙을 삭제할까요?',
      rule.title,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => void save({ ...draft, rules: draft.rules.filter((item) => item.id !== rule.id) }),
        },
      ]
    );
  };

  const controlsDisabled = busy || saving || openRouterBusy;
  const selectedOpenRouterModel = openRouterModels.find((model) => model.id === draft.openRouterModelId);

  const selectEngine = (aiEngineType: GuardianProfile['aiEngineType']) => {
    if (draft.aiEngineType === aiEngineType || controlsDisabled) return;
    const next = { ...draft, aiEngineType };
    setDraft(next);
    setModelPickerOpen(false);
    void save(next);
  };

  const selectOpenRouterModel = (openRouterModelId: string) => {
    const next = { ...draft, openRouterModelId };
    setDraft(next);
    setModelPickerOpen(false);
    void save(next);
  };

  const confirmDisconnectOpenRouter = () => {
    Alert.alert(
      'OpenRouter 연결을 해제할까요?',
      '이 기기에 저장된 OpenRouter API 키가 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '연결 해제', style: 'destructive', onPress: onDisconnectOpenRouter },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
          style={styles.screen}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>지킴이 설정</Text>
              <Text style={styles.detail}>AI 방식, 이름과 행동 규칙을 대화 기준으로 사용해요.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="지킴이 설정 닫기" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={25} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>AI 엔진</Text>
              <Text style={styles.sectionDetail}>대화는 선택한 방식으로만 처리됩니다.</Text>
            </View>
            <View style={styles.engineGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="OpenRouter 클라우드 AI 선택"
                accessibilityState={{ selected: draft.aiEngineType === 'openRouter' }}
                disabled={controlsDisabled}
                onPress={() => selectEngine('openRouter')}
                style={[styles.engineOption, draft.aiEngineType === 'openRouter' && styles.engineOptionActive, controlsDisabled && styles.disabled]}
              >
                <Ionicons name="cloud-outline" size={22} color={draft.aiEngineType === 'openRouter' ? colors.tealDark : colors.inkMuted} />
                <Text style={styles.engineTitle}>OpenRouter</Text>
                <Text style={styles.engineDetail}>빠른 클라우드 AI</Text>
                {draft.aiEngineType === 'openRouter' ? <Ionicons name="checkmark-circle" size={20} color={colors.tealDark} /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="온디바이스 오프라인 AI 선택"
                accessibilityState={{ selected: draft.aiEngineType === 'onDevice' }}
                disabled={controlsDisabled}
                onPress={() => selectEngine('onDevice')}
                style={[styles.engineOption, draft.aiEngineType === 'onDevice' && styles.engineOptionActive, controlsDisabled && styles.disabled]}
              >
                <Ionicons name="hardware-chip-outline" size={22} color={draft.aiEngineType === 'onDevice' ? colors.tealDark : colors.inkMuted} />
                <Text style={styles.engineTitle}>온디바이스</Text>
                <Text style={styles.engineDetail}>인터넷 없는 기기 내 AI</Text>
                {draft.aiEngineType === 'onDevice' ? <Ionicons name="checkmark-circle" size={20} color={colors.tealDark} /> : null}
              </Pressable>
            </View>

            {draft.aiEngineType === 'openRouter' ? (
              <View style={styles.cloudPanel}>
                <View style={styles.connectionRow}>
                  <View style={[styles.connectionDot, openRouterConnected && styles.connectionDotActive]} />
                  <View style={styles.connectionCopy}>
                    <Text style={styles.connectionTitle}>{openRouterConnected ? 'OpenRouter 연결됨' : 'OpenRouter 미연결'}</Text>
                    <Text accessibilityLiveRegion="polite" style={styles.connectionDetail}>
                      {openRouterMessage || (openRouterConnected ? '사용할 클라우드 모델을 선택하세요.' : '계정 승인 후 자동으로 앱에 돌아옵니다.')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={openRouterConnected ? 'OpenRouter 연결 해제' : 'OpenRouter 계정 연결'}
                  disabled={controlsDisabled}
                  onPress={openRouterConnected ? confirmDisconnectOpenRouter : onConnectOpenRouter}
                  style={[openRouterConnected ? styles.disconnectButton : styles.connectButton, controlsDisabled && styles.disabled]}
                >
                  {openRouterBusy ? <ActivityIndicator size="small" color={openRouterConnected ? colors.coral : '#FFFFFF'} /> : (
                    <Ionicons name={openRouterConnected ? 'unlink-outline' : 'log-in-outline'} size={18} color={openRouterConnected ? colors.coral : '#FFFFFF'} />
                  )}
                  <Text style={openRouterConnected ? styles.disconnectButtonText : styles.connectButtonText}>
                    {openRouterConnected ? '연결 해제' : 'OpenRouter 계정 연결'}
                  </Text>
                </Pressable>

                {openRouterConnected ? (
                  <View style={styles.cloudModelBlock}>
                    <View style={styles.modelLabelRow}>
                      <Text style={styles.fieldLabel}>클라우드 모델</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="OpenRouter 모델 목록 새로고침"
                        disabled={controlsDisabled}
                        onPress={onRefreshOpenRouterModels}
                        style={styles.inlineRefreshButton}
                      >
                        <Ionicons name="refresh" size={16} color={colors.tealDark} />
                        <Text style={styles.inlineRefreshText}>새로고침</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="OpenRouter 모델 선택 목록 열기"
                      accessibilityState={{ expanded: modelPickerOpen }}
                      disabled={controlsDisabled || !openRouterModels.length}
                      onPress={() => setModelPickerOpen((current) => !current)}
                      style={[styles.modelPicker, (controlsDisabled || !openRouterModels.length) && styles.disabled]}
                    >
                      <View style={styles.modelCopy}>
                        <Text style={styles.modelName} numberOfLines={2}>{selectedOpenRouterModel?.name || draft.openRouterModelId}</Text>
                        <Text style={styles.modelMeta}>{selectedOpenRouterModel?.free ? '무료 모델' : 'OpenRouter 사용량에 따라 과금'}</Text>
                      </View>
                      {selectedOpenRouterModel?.free ? <Text style={styles.freeBadge}>무료</Text> : null}
                      <Ionicons name={modelPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
                    </Pressable>
                    {modelPickerOpen ? (
                      <View style={styles.cloudModelList}>
                        {openRouterModels.slice(0, 40).map((model) => {
                          const active = model.id === draft.openRouterModelId;
                          return (
                            <Pressable
                              key={model.id}
                              accessibilityRole="button"
                              accessibilityLabel={`${model.name}${model.free ? ' 무료' : ''} 모델 선택`}
                              accessibilityState={{ selected: active }}
                              disabled={controlsDisabled}
                              onPress={() => selectOpenRouterModel(model.id)}
                              style={[styles.cloudModelRow, active && styles.modelRowActive]}
                            >
                              <View style={styles.modelCopy}>
                                <Text style={styles.modelName} numberOfLines={2}>{model.name}</Text>
                                <Text style={styles.modelMeta} numberOfLines={1}>{model.id}</Text>
                              </View>
                              {model.free ? <Text style={styles.freeBadge}>무료</Text> : null}
                              {active ? <Ionicons name="checkmark-circle" size={20} color={colors.tealDark} /> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.cloudPrivacyNote}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.blue} />
                  <Text style={styles.cloudPrivacyText}>클라우드 모드에서는 지킴이 규칙, 대화 내용과 필요한 웹 검색 자료가 OpenRouter 및 선택 모델 제공자에게 전송됩니다. API 키는 기기 보안 저장소에만 보관됩니다.</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.sectionHeadingSpaced}>
              <Text style={styles.sectionTitle}>이름과 역할</Text>
              <Text style={styles.sectionDetail}>모든 답변의 기본 성격과 관점을 정합니다.</Text>
            </View>
            <View style={styles.formBlock}>
              <Text style={styles.fieldLabel}>이름</Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="예: 우리집 지킴이"
                placeholderTextColor={colors.inkMuted}
                maxLength={30}
                accessibilityLabel="지킴이 이름"
                style={styles.textInput}
              />
              <Text style={styles.fieldLabel}>시놉시스</Text>
              <TextInput
                value={draft.synopsis}
                onChangeText={(synopsis) => setDraft((current) => ({ ...current, synopsis }))}
                placeholder="어떤 존재이며 무엇을 도와야 하는지 편하게 적어 주세요."
                placeholderTextColor={colors.inkMuted}
                maxLength={1000}
                multiline
                accessibilityLabel="지킴이 시놉시스"
                style={[styles.textInput, styles.synopsisInput]}
              />
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>필요할 때 웹에서 확인</Text>
                  <Text style={styles.switchDetail}>사용할 때만 시스템 알림이 표시되며, 끝나면 자동으로 꺼집니다.</Text>
                </View>
                <Switch
                  value={draft.webBrowsingEnabled}
                  onValueChange={(webBrowsingEnabled) => setDraft((current) => ({ ...current, webBrowsingEnabled }))}
                  trackColor={{ false: colors.line, true: colors.teal }}
                  thumbColor={colors.surface}
                  accessibilityLabel="지킴이 웹 확인 허용"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="지킴이 기본 정보 저장"
                disabled={!profileDirty || controlsDisabled || !draft.name.trim() || !draft.synopsis.trim()}
                onPress={saveBasics}
                style={[styles.primaryButton, (!profileDirty || controlsDisabled) && styles.disabled]}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                <Text style={styles.primaryButtonText}>기본 정보 저장</Text>
              </Pressable>
              {saveMessage ? <Text accessibilityLiveRegion="polite" style={styles.saveMessage}>{saveMessage}</Text> : null}
            </View>

            <View style={styles.ruleHeading}>
              <View style={styles.ruleHeadingCopy}>
                <Text style={styles.sectionTitle}>행동 규칙</Text>
                <Text style={styles.sectionDetail}>위에서 아래 순서로 지킴이의 답변에 적용됩니다.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="지킴이 규칙 추가"
                disabled={controlsDisabled || draft.rules.length >= 30}
                onPress={() => setEditingRule(createGuardianRule())}
                style={[styles.addButton, controlsDisabled && styles.disabled]}
              >
                <Ionicons name="add" size={18} color={colors.tealDark} />
                <Text style={styles.addButtonText}>추가</Text>
              </Pressable>
            </View>

            {editingRule ? (
              <View style={styles.ruleEditor}>
                <Text style={styles.editorTitle}>{draft.rules.some((rule) => rule.id === editingRule.id) ? '규칙 수정' : '새 규칙'}</Text>
                <Text style={styles.fieldLabel}>규칙 이름</Text>
                <TextInput
                  value={editingRule.title}
                  onChangeText={(title) => setEditingRule((current) => current ? { ...current, title } : current)}
                  placeholder="예: 아이에게 설명할 때"
                  placeholderTextColor={colors.inkMuted}
                  maxLength={60}
                  accessibilityLabel="규칙 이름"
                  style={styles.textInput}
                />
                <Text style={styles.fieldLabel}>구체적인 지침</Text>
                <TextInput
                  value={editingRule.instruction}
                  onChangeText={(instruction) => setEditingRule((current) => current ? { ...current, instruction } : current)}
                  placeholder="예: 어려운 용어를 피하고 짧은 예시를 함께 든다."
                  placeholderTextColor={colors.inkMuted}
                  maxLength={1000}
                  multiline
                  accessibilityLabel="규칙 내용"
                  style={[styles.textInput, styles.ruleInput]}
                />
                <View style={styles.editorActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="규칙 편집 취소" onPress={() => setEditingRule(null)} style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>취소</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="규칙 저장"
                    disabled={!editingRule.instruction.trim() || controlsDisabled}
                    onPress={saveRule}
                    style={[styles.saveRuleButton, (!editingRule.instruction.trim() || controlsDisabled) && styles.disabled]}
                  >
                    <Text style={styles.saveRuleButtonText}>규칙 저장</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.ruleList}>
              {draft.rules.length ? draft.rules.map((rule, index) => (
                <View key={rule.id} style={styles.ruleRow}>
                  <View style={styles.ruleIndex}><Text style={styles.ruleIndexText}>{index + 1}</Text></View>
                  <View style={styles.ruleCopy}>
                    <Text style={styles.ruleTitle}>{rule.title}</Text>
                    <Text style={styles.ruleText} numberOfLines={3}>{rule.instruction}</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${rule.title} 수정`} onPress={() => setEditingRule(rule)} style={styles.iconButton}>
                      <Ionicons name="create-outline" size={18} color={colors.tealDark} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${rule.title} 삭제`} onPress={() => deleteRule(rule)} style={styles.iconButton}>
                      <Ionicons name="trash-outline" size={18} color={colors.coral} />
                    </Pressable>
                  </View>
                </View>
              )) : (
                <View style={styles.emptyRules}>
                  <Text style={styles.emptyRulesTitle}>추가된 규칙이 없어요.</Text>
                  <Text style={styles.emptyRulesText}>시놉시스만으로 동작하거나, 필요한 규칙을 자유롭게 추가할 수 있어요.</Text>
                </View>
              )}
            </View>

            {draft.aiEngineType === 'onDevice' ? (
              <>
                <View style={styles.sectionHeadingSpaced}>
                  <Text style={styles.sectionTitle}>대화 모델</Text>
                  <Text style={styles.sectionDetail}>{directoryName || 'AiModels 폴더를 연결해 주세요.'}</Text>
                </View>
                <View style={styles.modelList}>
                  {models.length ? models.map((model) => {
                    const active = model.uri === selectedUri;
                    return (
                      <Pressable
                        key={model.uri}
                        accessibilityRole="button"
                        accessibilityLabel={`${model.name} 대화 모델 선택`}
                        disabled={controlsDisabled}
                        onPress={() => onSelectModel(model)}
                        style={[styles.modelRow, active && styles.modelRowActive, controlsDisabled && styles.disabled]}
                      >
                        <Ionicons name="hardware-chip-outline" size={21} color={active ? colors.tealDark : colors.inkMuted} />
                        <View style={styles.modelCopy}>
                          <Text style={styles.modelName} numberOfLines={2}>{model.name}</Text>
                          <Text style={styles.modelMeta}>{formatBytes(model.sizeBytes)} · {model.prepared ? '기기 준비됨' : '선택 후 준비'}</Text>
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={22} color={colors.tealDark} /> : null}
                      </Pressable>
                    );
                  }) : <Text style={styles.emptyModelText}>대화용 GGUF 모델이 없어요.</Text>}
                </View>
              </>
            ) : null}

            <View style={styles.localNote}>
              <Ionicons name={draft.aiEngineType === 'onDevice' ? 'phone-portrait-outline' : 'information-circle-outline'} size={18} color={colors.tealDark} />
              <Text style={styles.localNoteText}>{draft.aiEngineType === 'onDevice'
                ? '설정과 대화 내용은 기기에 저장됩니다. 웹 확인을 켠 경우 지킴이가 선택한 공개 페이지 주소와 내용만 기기의 숨겨진 브라우저에서 처리합니다.'
                : '대화 기록은 이 기기에 저장되지만, 답변 생성에 필요한 대화와 지킴이 설정은 선택한 클라우드 모델로 전송됩니다.'}</Text>
            </View>
          </ScrollView>

          {draft.aiEngineType === 'onDevice' ? <View style={styles.footer}>
            <Pressable accessibilityRole="button" accessibilityLabel="모델 목록 새로고침" disabled={controlsDisabled} onPress={onRefreshModels} style={[styles.secondaryButton, controlsDisabled && styles.disabled]}>
              <Ionicons name="refresh" size={18} color={colors.tealDark} />
              <Text style={styles.secondaryButtonText}>새로고침</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="다른 AiModels 폴더 선택" disabled={controlsDisabled} onPress={onPickDirectory} style={[styles.folderButton, controlsDisabled && styles.disabled]}>
              <Ionicons name="folder-open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.folderButtonText}>폴더 바꾸기</Text>
            </Pressable>
          </View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  disabled: { opacity: 0.42 },
  header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  headerCopy: { flex: 1, paddingRight: spacing.md },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  detail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17, marginTop: 4 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionHeading: { marginBottom: spacing.md },
  sectionHeadingSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: type.section, fontWeight: '900' },
  sectionDetail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17, marginTop: 4 },
  engineGrid: { flexDirection: 'row', gap: spacing.sm },
  engineOption: { flex: 1, minHeight: 118, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs },
  engineOptionActive: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  engineTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  engineDetail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17 },
  cloudPanel: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: spacing.md },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  connectionDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.inkMuted },
  connectionDotActive: { backgroundColor: colors.success },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  connectionDetail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17, marginTop: 3 },
  connectButton: { minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tealDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  connectButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  disconnectButton: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: '#E7C2BB', backgroundColor: '#FFF8F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  disconnectButtonText: { color: colors.coral, fontSize: type.body, fontWeight: '900' },
  cloudModelBlock: { gap: spacing.sm },
  modelLabelRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineRefreshButton: { minHeight: 36, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inlineRefreshText: { color: colors.tealDark, fontSize: type.small, fontWeight: '800' },
  modelPicker: { minHeight: 58, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surfaceSoft, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cloudModelList: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cloudModelRow: { minHeight: 62, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  freeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: '#E4F3E7', color: colors.success, fontSize: type.tiny, fontWeight: '900' },
  cloudPrivacyNote: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#EEF4F8', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cloudPrivacyText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 18 },
  formBlock: { padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm },
  fieldLabel: { color: colors.inkSoft, fontSize: type.small, fontWeight: '900', marginTop: spacing.xs },
  textInput: { minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, fontSize: type.body },
  synopsisInput: { minHeight: 100, textAlignVertical: 'top', lineHeight: 20 },
  ruleInput: { minHeight: 112, textAlignVertical: 'top', lineHeight: 20 },
  switchRow: { minHeight: 64, marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchCopy: { flex: 1 },
  switchTitle: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  switchDetail: { color: colors.inkMuted, fontSize: type.small, lineHeight: 17, marginTop: 3 },
  primaryButton: { minHeight: 46, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.tealDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primaryButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  saveMessage: { color: colors.inkSoft, fontSize: type.small, lineHeight: 17, textAlign: 'center' },
  ruleHeading: { marginTop: spacing.xxl, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ruleHeadingCopy: { flex: 1 },
  addButton: { minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface },
  addButtonText: { color: colors.tealDark, fontSize: type.small, fontWeight: '900' },
  ruleEditor: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surfaceSoft, gap: spacing.sm },
  editorTitle: { color: colors.tealDark, fontSize: type.body, fontWeight: '900' },
  editorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  cancelButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cancelButtonText: { color: colors.inkSoft, fontSize: type.body, fontWeight: '800' },
  saveRuleButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealDark },
  saveRuleButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  ruleList: { gap: spacing.sm },
  ruleRow: { minHeight: 76, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ruleIndex: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  ruleIndexText: { color: colors.tealDark, fontSize: type.tiny, fontWeight: '900' },
  ruleCopy: { flex: 1, minWidth: 0 },
  ruleTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  ruleText: { color: colors.inkSoft, fontSize: type.small, lineHeight: 18, marginTop: 4 },
  rowActions: { flexDirection: 'row' },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emptyRules: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  emptyRulesTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  emptyRulesText: { color: colors.inkMuted, fontSize: type.small, lineHeight: 18, marginTop: 4 },
  modelList: { gap: spacing.sm },
  modelRow: { minHeight: 64, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modelRowActive: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  modelCopy: { flex: 1, minWidth: 0 },
  modelName: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  modelMeta: { color: colors.inkMuted, fontSize: type.small, marginTop: 5 },
  emptyModelText: { color: colors.inkMuted, fontSize: type.body, lineHeight: 20, paddingVertical: spacing.md },
  localNote: { marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceWarm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  localNoteText: { flex: 1, color: colors.inkSoft, fontSize: type.small, lineHeight: 18 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  secondaryButtonText: { color: colors.tealDark, fontSize: type.body, fontWeight: '900' },
  folderButton: { flex: 1, minHeight: 48, borderRadius: radius.lg, backgroundColor: colors.tealDark, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  folderButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
});
