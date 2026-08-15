import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { colors, radius, spacing, type } from '../theme';
import type { FamilyRoomRelationship, FamilyRoomStructure, Room } from '../types';

type RelationshipRequestAs = 'guardian' | 'child';

type FamilyRelationshipModalProps = {
  visible: boolean;
  room: Room | null;
  structure?: FamilyRoomStructure;
  currentUserId: string;
  loading: boolean;
  actionKey: string;
  onRefresh: (roomId: string) => void;
  onRequest: (roomId: string, targetUserId: string, requestAs: RelationshipRequestAs) => void;
  onRespond: (roomId: string, relationshipId: string, decision: 'accept' | 'reject') => void;
  onDelete: (roomId: string, relationshipId: string) => void;
  onClose: () => void;
};

export function FamilyRelationshipModal({
  visible,
  room,
  structure,
  currentUserId,
  loading,
  actionKey,
  onRefresh,
  onRequest,
  onRespond,
  onDelete,
  onClose,
}: FamilyRelationshipModalProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [requestAs, setRequestAs] = useState<RelationshipRequestAs>('guardian');
  const profiles = structure?.profiles || [];
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.userId, profile])),
    [profiles]
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedUserId('');
    setRequestAs('guardian');
  }, [room?.id, visible]);

  const displayName = (userId: string, fallback = '') => {
    const profile = profileById.get(userId);
    return profile?.alias || profile?.name || fallback || '가족';
  };
  const relationText = (relationship: FamilyRoomRelationship) =>
    `${displayName(relationship.guardianUserId, relationship.guardianName)} → ${displayName(
      relationship.childUserId,
      relationship.childName
    )}`;
  const relatesToMe = (relationship: FamilyRoomRelationship) =>
    relationship.guardianUserId === currentUserId || relationship.childUserId === currentUserId;
  const occupiedUserIds = useMemo(
    () =>
      new Set(
        [
          ...(structure?.relationships || []),
          ...(structure?.pendingIncoming || []),
          ...(structure?.pendingOutgoing || []),
        ]
          .filter(
            (relationship) =>
              relationship.guardianUserId === currentUserId ||
              relationship.childUserId === currentUserId
          )
          .map((relationship) =>
            relationship.guardianUserId === currentUserId
              ? relationship.childUserId
              : relationship.guardianUserId
          )
      ),
    [currentUserId, structure]
  );
  useEffect(() => {
    if (selectedUserId && occupiedUserIds.has(selectedUserId)) setSelectedUserId('');
  }, [occupiedUserIds, selectedUserId]);
  const candidates = profiles.filter(
    (profile) => profile.userId !== currentUserId && !occupiedUserIds.has(profile.userId)
  );
  const busy = !!actionKey;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>가족 관계 관리</Text>
            <Text style={styles.detail}>{room?.title || '가족방'} · 기존 관계를 확인하고 새 관계를 요청할 수 있어요.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="가족 관계 관리 닫기" onPress={onClose} style={styles.iconButton} disabled={busy}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading && !structure ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.tealDark} />
              <Text style={styles.helper}>기존 가족 관계를 불러오고 있어요.</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.headerCopy}>
                  <Text style={styles.sectionTitle}>현재 가족 관계</Text>
                  <Text style={styles.helper}>화살표는 보호자 → 자녀 순서예요.</Text>
                </View>
                {room ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="가족 관계 새로고침" onPress={() => onRefresh(room.id)} style={styles.refreshButton} disabled={loading || busy}>
                    {loading ? <ActivityIndicator size="small" color={colors.tealDark} /> : <Ionicons name="refresh" size={18} color={colors.tealDark} />}
                  </Pressable>
                ) : null}
              </View>

              {structure?.relationships.length ? (
                <View style={styles.stack}>
                  {structure.relationships.map((relationship) => (
                    <View key={relationship.id} style={styles.relationRow}>
                      <View style={styles.relationIcon}>
                        <Ionicons name="shield-checkmark-outline" size={18} color={colors.tealDark} />
                      </View>
                      <View style={styles.relationCopy}>
                        <Text style={styles.relationTitle}>{relationText(relationship)}</Text>
                        <Text style={styles.relationDetail}>연결됨</Text>
                      </View>
                      {relatesToMe(relationship) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${relationText(relationship)} 관계 해제`}
                          disabled={busy}
                          onPress={() => room && onDelete(room.id, relationship.id)}
                          style={styles.deleteButton}
                        >
                          {actionKey === `delete:${relationship.id}` ? <ActivityIndicator size="small" color={colors.coral} /> : <Ionicons name="trash-outline" size={18} color={colors.coral} />}
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>설정된 보호자·자녀 관계가 없어요.</Text>
                  <Text style={styles.helper}>아래에서 가족방 멤버를 선택해 관계 요청을 보내세요.</Text>
                </View>
              )}

              {structure?.pendingIncoming.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>받은 요청</Text>
                  <View style={styles.stack}>
                    {structure.pendingIncoming.map((relationship) => (
                      <View key={relationship.id} style={styles.requestRow}>
                        <View style={styles.relationCopy}>
                          <Text style={styles.relationTitle}>{relationText(relationship)}</Text>
                          <Text style={styles.relationDetail}>{relationship.requestedByName || '가족'}님이 보낸 요청</Text>
                        </View>
                        <Pressable disabled={busy} onPress={() => room && onRespond(room.id, relationship.id, 'reject')} style={styles.lightAction}>
                          <Text style={styles.lightActionText}>거절</Text>
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => room && onRespond(room.id, relationship.id, 'accept')} style={styles.primaryAction}>
                          {actionKey === `respond:accept:${relationship.id}` ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryActionText}>수락</Text>}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {structure?.pendingOutgoing.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>보낸 요청</Text>
                  <View style={styles.stack}>
                    {structure.pendingOutgoing.map((relationship) => (
                      <View key={relationship.id} style={styles.requestRow}>
                        <View style={styles.relationCopy}>
                          <Text style={styles.relationTitle}>{relationText(relationship)}</Text>
                          <Text style={styles.relationDetail}>상대방의 응답을 기다리고 있어요.</Text>
                        </View>
                        <Pressable disabled={busy} onPress={() => room && onDelete(room.id, relationship.id)} style={styles.lightAction}>
                          <Text style={styles.lightActionText}>취소</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>새 관계 요청</Text>
                <Text style={styles.helper}>한 사람을 선택한 뒤 나와의 관계를 지정해 주세요.</Text>
                {candidates.length ? (
                  <View style={styles.memberGrid}>
                    {candidates.map((profile) => {
                      const selected = selectedUserId === profile.userId;
                      return (
                        <Pressable
                          key={profile.userId}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          disabled={busy}
                          onPress={() => setSelectedUserId(profile.userId)}
                          style={[styles.memberCard, selected && styles.memberCardSelected]}
                        >
                          <Avatar name={profile.alias || profile.name} color={colors.teal} uri={profile.avatarUri} size={38} />
                          <Text style={styles.memberName} numberOfLines={1}>{profile.alias || profile.name}</Text>
                          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selected ? colors.tealDark : colors.inkMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.noCandidate}>새로 관계를 설정할 수 있는 멤버가 없어요.</Text>
                )}

                {candidates.length ? (
                  <>
                    <View style={styles.choiceRow}>
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: requestAs === 'guardian' }}
                        disabled={busy}
                        onPress={() => setRequestAs('guardian')}
                        style={[styles.choice, requestAs === 'guardian' && styles.choiceSelected]}
                      >
                        <Text style={[styles.choiceText, requestAs === 'guardian' && styles.choiceTextSelected]}>내 자녀로 지정</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: requestAs === 'child' }}
                        disabled={busy}
                        onPress={() => setRequestAs('child')}
                        style={[styles.choice, requestAs === 'child' && styles.choiceSelected]}
                      >
                        <Text style={[styles.choiceText, requestAs === 'child' && styles.choiceTextSelected]}>내 보호자로 지정</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!selectedUserId || busy}
                      onPress={() => room && onRequest(room.id, selectedUserId, requestAs)}
                      style={[styles.sendButton, (!selectedUserId || busy) && styles.disabled]}
                    >
                      {actionKey.startsWith('create:') ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.sendButtonText}>관계 요청 보내기</Text>}
                    </Pressable>
                  </>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
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
  iconButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: type.section, fontWeight: '900' },
  helper: { marginTop: 3, color: colors.inkMuted, fontSize: type.small, lineHeight: 17 },
  refreshButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  stack: { gap: spacing.sm },
  relationRow: { minHeight: 68, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.canvas },
  relationIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  relationCopy: { flex: 1, minWidth: 0 },
  relationTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  relationDetail: { marginTop: 4, color: colors.inkMuted, fontSize: type.small },
  deleteButton: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  emptyBox: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.canvas },
  emptyTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  requestRow: { minHeight: 68, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.canvas },
  lightAction: { minWidth: 48, height: 36, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface },
  lightActionText: { color: colors.inkSoft, fontSize: type.small, fontWeight: '900' },
  primaryAction: { minWidth: 48, height: 36, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealDark },
  primaryActionText: { color: '#FFFFFF', fontSize: type.small, fontWeight: '900' },
  memberGrid: { gap: spacing.sm },
  memberCard: { minHeight: 62, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface },
  memberCardSelected: { borderColor: colors.teal, backgroundColor: colors.surfaceSoft },
  memberName: { flex: 1, color: colors.ink, fontSize: type.body, fontWeight: '900' },
  noCandidate: { padding: spacing.md, color: colors.inkMuted, fontSize: type.small, backgroundColor: colors.canvas, borderRadius: radius.md },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  choiceSelected: { borderColor: colors.tealDark, backgroundColor: colors.surfaceSoft },
  choiceText: { color: colors.inkMuted, fontSize: type.small, fontWeight: '900' },
  choiceTextSelected: { color: colors.tealDark },
  sendButton: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealDark },
  sendButtonText: { color: '#FFFFFF', fontSize: type.body, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
