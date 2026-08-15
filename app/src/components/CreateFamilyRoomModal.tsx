import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { colors, radius, spacing, type } from '../theme';
import type { User } from '../types';

type CreateFamilyRoomModalProps = {
  visible: boolean;
  users: Record<string, User>;
  currentUserId: string;
  busy: boolean;
  onCreate: (title: string, memberUserIds: string[]) => void;
  onAddFriend: () => void;
  onClose: () => void;
};

export function CreateFamilyRoomModal({
  visible,
  users,
  currentUserId,
  busy,
  onCreate,
  onAddFriend,
  onClose,
}: CreateFamilyRoomModalProps) {
  const [title, setTitle] = useState('우리 가족');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const candidates = useMemo(
    () => Object.values(users).filter((user) => user.id !== currentUserId),
    [currentUserId, users]
  );

  useEffect(() => {
    if (!visible) return;
    setTitle('우리 가족');
    setSelectedIds([]);
  }, [visible]);

  const toggleMember = (userId: string) => {
    if (busy) return;
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const canCreate = !!title.trim() && selectedIds.length > 0 && !busy;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>가족 구성 시작</Text>
            <Text style={styles.detail}>먼저 가족방을 만들고, 방 안에서 보호자·자녀 관계를 설정해요.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="가족방 만들기 닫기" onPress={onClose} style={styles.iconButton} disabled={busy}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>가족 이름</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="예: 우리 가족"
            placeholderTextColor={colors.inkMuted}
            maxLength={100}
            editable={!busy}
            style={styles.input}
          />
          <View style={styles.memberTitleRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.label}>함께할 사람</Text>
              <Text style={styles.memberHint}>친구를 한 명 이상 선택해 주세요.</Text>
            </View>
            <Text style={styles.count}>{selectedIds.length}명 선택</Text>
          </View>
        </View>

        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${item.alias || item.name} 선택`}
                disabled={busy}
                onPress={() => toggleMember(item.id)}
                style={[styles.memberRow, selected && styles.memberRowSelected]}
              >
                <Avatar name={item.alias || item.name} color={item.color} uri={item.avatarUri} size={42} />
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{item.alias || item.name}</Text>
                  <Text style={styles.memberDetail}>{item.relation || item.status || '친구'}</Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? colors.tealDark : colors.inkMuted}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={30} color={colors.inkMuted} />
              <Text style={styles.emptyTitle}>먼저 친구를 추가해 주세요.</Text>
              <Text style={styles.emptyText}>가족방은 친구 관계인 사람과 만들 수 있어요.</Text>
              <Pressable accessibilityRole="button" onPress={onAddFriend} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>친구 추가하기</Text>
              </Pressable>
            </View>
          }
        />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="가족방 만들기"
            disabled={!canCreate}
            onPress={() => onCreate(title.trim(), selectedIds)}
            style={[styles.primaryButton, !canCreate && styles.disabled]}
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>가족방 만들기</Text>}
          </Pressable>
        </View>
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
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  detail: { marginTop: spacing.xs, color: colors.inkMuted, fontSize: type.small, lineHeight: 17 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  form: { padding: spacing.lg, paddingBottom: spacing.sm },
  label: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  input: {
    height: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: type.body,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  memberTitleRow: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberHint: { marginTop: 3, color: colors.inkMuted, fontSize: type.small },
  count: { color: colors.tealDark, fontSize: type.small, fontWeight: '900' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  memberRow: {
    minHeight: 70,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  memberRowSelected: { backgroundColor: colors.surfaceSoft },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: colors.ink, fontSize: type.section, fontWeight: '900' },
  memberDetail: { marginTop: 3, color: colors.inkMuted, fontSize: type.small },
  empty: { paddingVertical: 56, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.ink, fontSize: type.section, fontWeight: '900' },
  emptyText: { color: colors.inkMuted, fontSize: type.small },
  secondaryButton: {
    minHeight: 40,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
  },
  secondaryButtonText: { color: colors.tealDark, fontSize: type.body, fontWeight: '900' },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  primaryButton: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.tealDark,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
