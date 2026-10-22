import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { GuardianConversationLog } from '../services/guardianLogSync';
import { colors, radius, spacing, type } from '../theme';

type GuardianLogsModalProps = {
  visible: boolean;
  childName: string;
  loading: boolean;
  logs: GuardianConversationLog[];
  errorMessage?: string;
  onRefresh?: () => void;
  onClose: () => void;
};

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatMessageTime(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function GuardianLogsModal({ visible, childName, loading, logs, errorMessage = '', onRefresh, onClose }: GuardianLogsModalProps) {
  const [selectedId, setSelectedId] = useState('');
  const selected = logs.find(log => log.id === selectedId);
  useEffect(() => { setSelectedId(''); }, [visible, childName]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={() => selected ? setSelectedId('') : onClose()}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.header}>
            {selected ? <Pressable accessibilityRole="button" accessibilityLabel="사용 내역 목록으로 돌아가기" onPress={() => setSelectedId('')} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable> : null}
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{selected ? selected.title || '지키미 대화' : `${childName} 사용 내역`}</Text>
              <Text style={styles.detail}>{selected ? `${childName} · ${selected.messages.length}개 메시지` : `${logs.length}개 대화`}</Text>
            </View>
            {!selected && onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel="지키미 사용 내역 새로고침" disabled={loading} onPress={onRefresh} style={styles.iconButton}>
              <Ionicons name="refresh" size={21} color={colors.tealDark} />
            </Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="지키미 사용 내역 닫기" onPress={onClose} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          {loading ? <View style={styles.empty}><ActivityIndicator color={colors.tealDark} /><Text style={styles.helper}>불러오는 중</Text></View>
            : errorMessage ? <View accessibilityRole="alert" style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.inkMuted} />
              <Text style={styles.emptyTitle}>사용 내역을 불러오지 못했어요</Text>
              <Text style={styles.helper}>{errorMessage}</Text>
              {onRefresh ? <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable> : null}
            </View>
            : selected ? <FlatList
              key={`messages:${selected.id}`} style={styles.list} data={selected.messages}
              keyExtractor={(message, index) => `${message.id}:${index}`} contentContainerStyle={styles.messages}
              initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} removeClippedSubviews={false} showsVerticalScrollIndicator
              renderItem={({ item }) => <View style={[styles.message, item.role === 'user' && styles.childMessage]}>
                <Text style={styles.messageRole}>{item.role === 'user' ? childName : '지키미'} · {formatMessageTime(item.createdAt)}</Text>
                <Text selectable style={styles.messageBody}>{item.content || '(빈 메시지)'}</Text>
                {item.truncated ? <Text style={styles.limited}>저장 한도로 본문 일부가 제한된 기록이에요.</Text> : null}
              </View>}
              ListEmptyComponent={<Text style={styles.helper}>저장된 메시지가 없어요.</Text>}
            />
            : <FlatList
              key="conversations" style={styles.list} data={logs} keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent} initialNumToRender={12} windowSize={5} showsVerticalScrollIndicator
              renderItem={({ item }) => {
                const preview = [...item.messages].reverse().find(message => message.content.trim());
                return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title || '지키미 대화'}, ${item.messages.length}개 메시지 전체 보기`} onPress={() => setSelectedId(item.id)} style={({ pressed }) => [styles.logCard, pressed && styles.pressed]}>
                  <View style={styles.logHeader}>
                    <View style={styles.logMark}><Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.tealDark} /></View>
                    <View style={styles.logCopy}>
                      <Text style={styles.logTitle} numberOfLines={2}>{item.title || '지키미 대화'}</Text>
                      <Text style={styles.logMeta}>{formatTime(item.updatedAt)} · {item.messages.length}개 메시지</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.inkMuted} />
                  </View>
                  {preview ? <Text style={styles.preview} numberOfLines={2}>{preview.content}</Text> : null}
                </Pressable>;
              }}
              ListEmptyComponent={<View style={styles.empty}><Ionicons name="leaf-outline" size={34} color={colors.tealDark} /><Text style={styles.helper}>아직 저장된 지키미 대화가 없어요.</Text></View>}
            />}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 80, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: type.section, fontWeight: '800', color: colors.ink },
  detail: { marginTop: spacing.xs, fontSize: type.small, color: colors.inkMuted },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  list: { flex: 1 },
  empty: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md, flexGrow: 1 },
  emptyTitle: { color: colors.ink, fontSize: type.section, fontWeight: '700', textAlign: 'center' },
  helper: { fontSize: type.body, lineHeight: 24, color: colors.inkMuted, textAlign: 'center' },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, flexGrow: 1 },
  logCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  pressed: { opacity: 0.75 },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logMark: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  logCopy: { flex: 1, minWidth: 0 },
  logTitle: { fontSize: type.body, fontWeight: '700', color: colors.ink },
  logMeta: { marginTop: spacing.xs, fontSize: type.small, color: colors.inkMuted },
  preview: { marginTop: spacing.md, fontSize: type.small, lineHeight: 20, color: colors.inkSoft },
  messages: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  message: { alignSelf: 'flex-start', maxWidth: '94%', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.other },
  childMessage: { alignSelf: 'flex-end', backgroundColor: colors.mine },
  messageRole: { fontSize: type.small, color: colors.inkSoft, marginBottom: spacing.sm },
  messageBody: { fontSize: type.body, lineHeight: 26, color: colors.ink },
  limited: { marginTop: spacing.sm, fontSize: type.small, color: colors.inkMuted },
  retry: { minHeight: 48, paddingHorizontal: spacing.xl, borderRadius: radius.md, backgroundColor: colors.action, justifyContent: 'center' },
  retryText: { color: colors.actionInk, fontSize: type.body, fontWeight: '700' },
});
