import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing, type } from '../theme';
import type { FriendRequestView, User } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

type PeopleScreenProps = {
  users: Record<string, User>;
  currentUserId: string;
  requests: FriendRequestView[];
  loading: boolean;
  actionKey: string;
  onRefresh: () => void;
  onAddFriend: () => void;
  onOpenPerson: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
};

export function PeopleScreen({
  users,
  currentUserId,
  requests,
  loading,
  actionKey,
  onRefresh,
  onAddFriend,
  onOpenPerson,
  onOpenProfile,
  onAcceptRequest,
  onRejectRequest,
}: PeopleScreenProps) {
  const { family, friends, sortedPeople } = useMemo(() => {
    const people = Object.values(users).filter((user) => user.id !== currentUserId);
    const familyItems = people.filter((user) => user.role === 'family');
    const friendItems = people.filter((user) => user.role === 'friend');
    return {
      family: familyItems,
      friends: friendItems,
      sortedPeople: [...familyItems, ...friendItems],
    };
  }, [currentUserId, users]);
  const incomingRequests = useMemo(
    () => requests.filter((request) => request.direction === 'incoming' && request.status === 'pending'),
    [requests]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="사람"
        detail={`가족 ${family.length}명 · 친구 ${friends.length}명`}
        action={
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="친구 추가" style={[styles.iconBtn, styles.primaryIconBtn]} onPress={onAddFriend}>
              <Ionicons name="person-add-outline" size={20} color={colors.surface} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="사람 목록 새로고침" style={styles.iconBtn} onPress={onRefresh} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={21} color={colors.ink} />}
            </Pressable>
          </View>
        }
      />
      <FlatList
        data={sortedPeople}
        keyExtractor={(user) => user.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={onRefresh}
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.headerStack}>
            {incomingRequests.length ? (
              <View style={styles.requestGroup}>
                {incomingRequests.map((request) => (
                  <View key={request.id} style={styles.requestCard}>
                    <Avatar name={request.name} color={colors.coral} uri={request.avatarUri} size={38} />
                    <View style={styles.requestCopy}>
                      <Text style={styles.requestTitle} numberOfLines={2}>{request.name}</Text>
                      <Text style={styles.requestText}>친구 요청을 보냈어요.</Text>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${request.name} 친구 요청 수락`}
                        style={styles.miniBtn}
                        disabled={!!actionKey}
                        onPress={() => onAcceptRequest(request.id)}
                      >
                        {actionKey === `accept:${request.id}` ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={17} color="#FFFFFF" />}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${request.name} 친구 요청 거절`}
                        style={[styles.miniBtn, styles.miniBtnLight]}
                        disabled={!!actionKey}
                        onPress={() => onRejectRequest(request.id)}
                      >
                        {actionKey === `reject:${request.id}` ? <ActivityIndicator size="small" color={colors.inkSoft} /> : <Ionicons name="close" size={17} color={colors.inkSoft} />}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const sectionStart = index === 0 || sortedPeople[index - 1]?.role !== item.role;
          return (
            <View>
              {sectionStart ? (
                <Text accessibilityRole="header" style={styles.section}>{item.role === 'family' ? `가족 ${family.length}` : `친구 ${friends.length}`}</Text>
              ) : null}
              <View style={styles.personCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.alias || item.name} 프로필 보기`}
                  onPress={() => onOpenProfile(item.id)}
                  style={styles.avatarButton}
                >
                  <Avatar name={item.alias || item.name} color={item.color} uri={item.avatarUri} online={item.online} />
                </Pressable>
                <View style={styles.personCopy}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {item.alias ? `${item.alias} · ${item.name}` : item.name}
                  </Text>
                  <Text style={styles.personStatus} numberOfLines={1}>
                    {item.relation ? `${item.relation} · ${item.status || '상태 메시지 없음'}` : item.status || '상태 메시지 없음'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.alias || item.name}님과 대화하기`}
                  style={styles.iconSmall}
                  disabled={!!actionKey}
                  onPress={() => onOpenPerson(item.id)}
                >
                  {actionKey === `chat:${item.id}` ? <ActivityIndicator size="small" color={colors.tealDark} /> : <Ionicons name="chatbubble-outline" size={18} color={colors.tealDark} />}
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image source={guardianMascot} resizeMode="contain" style={styles.emptyMascot} />
            {loading ? <ActivityIndicator color={colors.tealDark} style={styles.emptySpinner} /> : null}
            <Text style={styles.emptyTitle}>{loading ? '불러오는 중' : '함께할 사람을 찾아볼까요?'}</Text>
            <Text style={styles.emptyText}>{loading ? '잠시만 기다려 주세요.' : '친구를 추가하고 이야기를 시작해요.'}</Text>
            {!loading ? <Pressable accessibilityRole="button" accessibilityLabel="친구 추가하기" onPress={onAddFriend} style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.75 }]}>
              <Ionicons name="person-add-outline" size={18} color={colors.surface} />
              <Text style={styles.emptyActionText}>친구 추가하기</Text>
            </Pressable> : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerStack: {
    gap: spacing.md,
  },
  requestGroup: {
    gap: spacing.sm,
  },
  requestCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E8C2AF',
    backgroundColor: colors.surface,
  },
  requestCopy: {
    flex: 1,
    minWidth: 0,
  },
  requestTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '900',
    marginBottom: 3,
  },
  requestText: {
    color: colors.coral,
    fontSize: type.small,
    fontWeight: '800',
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  miniBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  miniBtnLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  section: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '900',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  personCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  avatarButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '900',
  },
  personStatus: {
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 20,
    marginTop: 5,
  },
  iconSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  empty: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  primaryIconBtn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  emptySpinner: { marginBottom: spacing.md },
  emptyAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.tealDark },
  emptyActionText: { color: colors.surface, fontSize: type.body, fontWeight: '700' },
  emptyMascot: {
    width: 72,
    height: 72,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 24,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
