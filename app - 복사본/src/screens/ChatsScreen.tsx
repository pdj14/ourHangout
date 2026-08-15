import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ChatListItem } from '../components/ChatListItem';
import { ScreenHeader } from '../components/ScreenHeader';
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
}: ChatsScreenProps) {
  const normalized = query.trim().toLowerCase();
  const filteredRooms = normalized
    ? rooms.filter((room) => {
        const memberNames = room.memberIds.map((id) => users[id]?.name || '').join(' ');
        return `${room.title} ${room.preview} ${memberNames}`.toLowerCase().includes(normalized);
      })
    : rooms;
  const unreadTotal = rooms.reduce((sum, room) => sum + room.unread, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Chats"
        title="대화"
        detail={`${rooms.length}개 방 · 읽지 않은 메시지 ${unreadTotal}개`}
        action={
          <Pressable style={styles.iconBtn} onPress={onRefresh}>
            {loading ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={20} color={colors.ink} />}
          </Pressable>
        }
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="대화방 검색"
          placeholderTextColor={colors.inkMuted}
          style={styles.search}
        />
      </View>
      {syncMessage ? <Text style={styles.syncMessage}>{syncMessage}</Text> : null}
      <FlatList
        data={filteredRooms}
        keyExtractor={(room) => room.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={onRefresh}
        renderItem={({ item }) => (
          <ChatListItem
            room={item}
            users={users}
            currentUserId={currentUserId}
            latest={(messages[item.id] || []).at(-1)}
            onPress={() => onOpenRoom(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image source={guardianMascot} resizeMode="contain" style={styles.emptyMascot} />
            <Text style={styles.emptyTitle}>{loading ? '대화를 불러오는 중이에요' : '아직 대화방이 없어요'}</Text>
            <Text style={styles.emptyText}>
              {loading ? '서버에서 가족과 친구의 대화방을 가져오고 있어요.' : '사람 탭에서 친구와 대화를 시작하면 이곳에 모여요.'}
            </Text>
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
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchWrap: {
    height: 50,
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
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '700',
    paddingVertical: 0,
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
    gap: spacing.md,
  },
  empty: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  emptyMascot: {
    width: 100,
    height: 100,
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
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
