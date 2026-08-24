import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { GuardianConversationLog } from '../services/guardianLogSync';
import { colors, radius, spacing } from '../theme';

type GuardianLogsModalProps = {
  visible: boolean;
  childName: string;
  loading: boolean;
  logs: GuardianConversationLog[];
  onClose: () => void;
};

function formatTime(value?: string) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatMessageTime(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function GuardianLogsModal({
  visible,
  childName,
  loading,
  logs,
  onClose,
}: GuardianLogsModalProps) {
  const [expandedId, setExpandedId] = useState('');

  useEffect(() => {
    if (!visible) setExpandedId('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{childName} 지키미 사용 내역</Text>
            <Text style={styles.detail}>관계 수락 시 동의된 열람 범위 내에서만 제공됩니다.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지키미 사용 내역 닫기"
            onPress={onClose}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.tealDark} />
            <Text style={styles.helper}>사용 내역을 불러오고 있어요.</Text>
          </View>
        ) : logs.length ? (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const expanded = expandedId === item.id;
              const preview = [...item.messages].reverse().find((message) => message.content.trim());
              return (
                <View style={styles.logCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setExpandedId(expanded ? '' : item.id)}
                  >
                    <View style={styles.logHeader}>
                      <Ionicons name="sparkles-outline" size={17} color={colors.tealDark} />
                      <View style={styles.logCopy}>
                        <Text style={styles.logTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.logMeta}>
                          {formatTime(item.updatedAt)} · {item.messageCount}개 메시지
                        </Text>
                      </View>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
                    </View>
                    {!expanded && preview ? (
                      <Text style={styles.preview} numberOfLines={1}>{preview.content}</Text>
                    ) : null}
                  </Pressable>
                  {expanded ? (
                    <ScrollView style={styles.messagesBox} showsVerticalScrollIndicator>
                      {item.messages.map((message) => (
                        <View
                          key={message.id}
                          style={[styles.messageRow, message.role === 'user' && styles.messageRowMine]}
                        >
                          <Text style={styles.messageRole}>
                            {message.role === 'user' ? '나' : '지키미'} · {formatMessageTime(message.createdAt)}
                          </Text>
                          <Text style={styles.messageBody}>{message.content}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.loading}>
            <Ionicons name="leaf-outline" size={34} color={colors.tealDark} />
            <Text style={styles.helper}>아직 동기화된 지키미 대화가 없어요.</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    minHeight: 84,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: '900', color: colors.ink },
  detail: { marginTop: spacing.xs, fontSize: 12, color: colors.inkMuted },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  helper: { fontSize: 13, color: colors.inkMuted },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  logCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logCopy: { flex: 1 },
  logTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  logMeta: { marginTop: 2, fontSize: 12, color: colors.inkMuted },
  preview: { marginTop: spacing.sm, fontSize: 12, color: colors.inkSoft },
  messagesBox: { maxHeight: 320, marginTop: spacing.sm },
  messageRow: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  messageRowMine: { alignSelf: 'flex-end', backgroundColor: colors.canvasDeep },
  messageRole: { fontSize: 11, color: colors.inkMuted, marginBottom: 2 },
  messageBody: { fontSize: 14, lineHeight: 20, color: colors.ink },
});
