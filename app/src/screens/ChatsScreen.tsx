import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ChatListItem } from '../components/ChatListItem';
import { ScreenHeader } from '../components/ScreenHeader';
import { filterRooms } from '../utils/roomSearch';
import { colors, radius, spacing, type } from '../theme';
import type { Message, Room, User } from '../types';

const guardianMascot = require('../../assets/forest-guardian.png');

type ChatsScreenProps = {
  rooms: Room[];
  messages: Record<string, Message[]>;
  users: Record<string, User>;
  currentUserId: string;
  query: string;
  loading: boolean;
  syncMessage: string;
  onQueryChange: (value: string) => void;
  onOpenRoom: (roomId: string) => void;
  onRefresh: () => void;
  onStartChat: () => void;
};

export function ChatsScreen({
  rooms,
  messages,
  users,
  currentUserId,
  query,
  loading,
  syncMessage,
  onQueryChange,
  onOpenRoom,
  onRefresh,
  onStartChat,
}: ChatsScreenProps) {
  const normalized = query.trim().toLowerCase();
  const filteredRooms = useMemo(
    () => filterRooms(rooms, users, normalized),
    [normalized, rooms, users]
  );
  const unreadTotal = useMemo(() => rooms.reduce((sum, room) => sum + room.unread, 0), [rooms]);
  const renderRoom = useCallback(
    ({ item }: { item: Room }) => (
      <ChatListItem
        room={item}
        users={users}
        currentUserId={currentUserId}
        latest={(messages[item.id] || []).at(-1)}
        onOpenRoom={onOpenRoom}
      />
    ),
    [currentUserId, messages, onOpenRoom, users]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="대화"
        detail={unreadTotal ? `새 메시지 ${unreadTotal}개` : undefined}
        action={
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="새 대화 시작" style={[styles.iconBtn, styles.primaryIconBtn]} onPress={onStartChat}>
              <Ionicons name="create-outline" size={21} color={colors.surface} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="대화 목록 새로고침" style={styles.iconBtn} onPress={onRefresh} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={20} color={colors.ink} />}
            </Pressable>
          </View>
        }
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="대화 검색"
          placeholderTextColor={colors.inkMuted}
          style={styles.search}
          accessibilityLabel="대화방 검색"
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => onQueryChange('')} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {syncMessage ? <Text style={styles.syncMessage}>{syncMessage}</Text> : null}
      {normalized ? <Text accessibilityLiveRegion="polite" style={styles.searchResult}>검색 결과 {filteredRooms.length}개</Text> : null}
      <FlatList
        data={filteredRooms}
        keyExtractor={(room) => room.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={onRefresh}
        renderItem={renderRoom}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image source={guardianMascot} resizeMode="contain" style={styles.emptyMascot} />
            <Text style={styles.emptyTitle}>{loading ? '대화를 불러오는 중이에요' : normalized ? '검색 결과가 없어요' : '아직 대화방이 없어요'}</Text>
            <Text style={styles.emptyText}>
              {loading ? '잠시만 기다려 주세요.' : normalized ? '다른 이름으로 찾아보세요.' : '소중한 사람에게 안부를 건네보세요.'}
            </Text>
            {!loading ? <Pressable
              accessibilityRole="button"
              onPress={normalized ? () => onQueryChange('') : onStartChat}
              style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.emptyActionText}>{normalized ? '검색 초기화' : '첫 대화 시작하기'}</Text>
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
  searchWrap: {
    minHeight: 52,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  search: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '700',
    paddingVertical: 0,
  },
  clearSearch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncMessage: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: 0,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  primaryIconBtn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  searchResult: { marginHorizontal: spacing.lg, marginBottom: spacing.md, color: colors.inkSoft, fontSize: type.small },
  emptyAction: { minHeight: 44, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.tealDark, justifyContent: 'center' },
  emptyActionText: { color: colors.surface, fontSize: type.body, fontWeight: '700', textAlign: 'center' },
  empty: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
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
