import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GuardianConversationRoom } from '../services/guardianConversationStore';
import { colors, radius, spacing, type } from '../theme';

type GuardianConversationsModalProps = {
  visible: boolean;
  guardianName: string;
  conversations: GuardianConversationRoom[];
  activeConversationId: string;
  busy: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
};

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function roomPreview(room: GuardianConversationRoom) {
  const latest = [...room.messages].reverse().find((message) => message.content.trim());
  return latest?.content.replace(/\s+/g, ' ').trim() || '아직 나눈 이야기가 없어요.';
}

export function GuardianConversationsModal({
  visible,
  guardianName,
  conversations,
  activeConversationId,
  busy,
  onClose,
  onCreate,
  onSelect,
  onDelete,
}: GuardianConversationsModalProps) {
  const insets = useSafeAreaInsets();

  const confirmDelete = (room: GuardianConversationRoom) => {
    Alert.alert(
      '이 대화를 삭제할까요?',
      `“${room.title}” 대화와 메시지가 이 기기에서 삭제됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete(room.id) },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, spacing.md) }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{guardianName}</Text>
            <Text style={styles.title}>지킴이 대화</Text>
            <Text style={styles.detail}>이전 이야기를 이어가거나 새 대화를 시작할 수 있어요.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="지킴이 대화 목록 닫기" onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 지킴이 대화 만들기"
          disabled={busy}
          onPress={onCreate}
          style={[styles.newButton, busy && styles.disabled]}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.newButtonText}>새 이야기 시작</Text>
        </Pressable>

        <FlatList
          data={conversations}
          keyExtractor={(room) => room.id}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
          renderItem={({ item }) => {
            const active = item.id === activeConversationId;
            return (
              <View style={[styles.room, active && styles.activeRoom]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} 대화 열기${active ? ', 현재 대화' : ''}`}
                  disabled={busy}
                  onPress={() => onSelect(item.id)}
                  style={styles.roomMain}
                >
                  <View style={[styles.roomIcon, active && styles.activeRoomIcon]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={19} color={active ? '#FFFFFF' : colors.tealDark} />
                  </View>
                  <View style={styles.roomCopy}>
                    <View style={styles.roomTitleRow}>
                      <Text style={styles.roomTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.roomTime}>{formatUpdatedAt(item.updatedAt)}</Text>
                    </View>
                    <Text style={styles.roomPreview} numberOfLines={2}>{roomPreview(item)}</Text>
                    <Text style={styles.roomMeta}>{item.messages.length}개 메시지{active ? ' · 현재 대화' : ''}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} 대화 삭제`}
                  disabled={busy}
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteButton}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.coral} />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.tealDark, fontSize: type.tiny, fontWeight: '900', marginBottom: spacing.xs },
  title: { color: colors.ink, fontSize: type.hero, fontWeight: '900' },
  detail: { color: colors.inkSoft, fontSize: type.body, lineHeight: 20, marginTop: spacing.xs },
  iconButton: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  newButton: { minHeight: 48, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tealDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  newButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  room: { minHeight: 92, flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  activeRoom: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  roomMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  roomIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  activeRoomIcon: { backgroundColor: colors.tealDark },
  roomCopy: { flex: 1, minWidth: 0 },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roomTitle: { flex: 1, color: colors.ink, fontSize: type.section, fontWeight: '900' },
  roomTime: { color: colors.inkMuted, fontSize: type.tiny, fontWeight: '700' },
  roomPreview: { color: colors.inkSoft, fontSize: type.small, lineHeight: 17, marginTop: 5 },
  roomMeta: { color: colors.tealDark, fontSize: type.tiny, fontWeight: '800', marginTop: 5 },
  deleteButton: { width: 46, minHeight: 60, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
});
