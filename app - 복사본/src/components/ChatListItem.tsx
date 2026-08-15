import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from './Avatar';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { Message, Room, User } from '../types';

type ChatListItemProps = {
  room: Room;
  users: Record<string, User>;
  currentUserId: string;
  latest?: Message;
  onPress: () => void;
};

const typeLabel = {
  direct: '1:1',
  group: '모임',
  family: '가족방',
};

export function ChatListItem({ room, users, currentUserId, latest, onPress }: ChatListItemProps) {
  const peer = room.memberIds.map((id) => users[id]).find((user) => user && user.id !== currentUserId);
  const avatarName = room.type === 'direct' ? peer?.alias || peer?.name || room.title : room.title;
  const avatarColor = room.type === 'family' ? colors.teal : peer?.color || colors.indigo;
  const title = room.type === 'direct' && peer ? peer.alias || peer.name : room.title;
  const preview = latest?.kind === 'image' ? '사진을 보냈어요' : latest?.kind === 'video' ? '영상을 보냈어요' : latest?.text || room.preview || '아직 나눈 이야기가 없어요.';

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Avatar
        name={avatarName}
        color={avatarColor}
        uri={room.type === 'direct' ? peer?.avatarUri : undefined}
        online={room.memberIds.some((id) => users[id]?.online)}
      />
      <View style={styles.copy}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.time} numberOfLines={1}>
            {latest?.time || room.lastActivity}
          </Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.pill, room.type === 'family' && styles.familyPill]}>
            <Text style={[styles.pillText, room.type === 'family' && styles.familyPillText]}>
              {typeLabel[room.type]}
            </Text>
          </View>
          {room.favorite ? <Ionicons name="star" size={13} color={colors.amber} /> : null}
          {room.familySignal ? <Text style={styles.signal}>{room.familySignal}</Text> : null}
          {room.muted ? <Ionicons name="notifications-off-outline" size={14} color={colors.inkMuted} /> : null}
        </View>
      </View>
      {room.unread > 0 ? (
        <View style={styles.unread}>
          <Text style={styles.unreadText}>{room.unread > 99 ? '99+' : room.unread}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontSize: type.section,
    fontWeight: '800',
  },
  time: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '700',
  },
  preview: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 19,
  },
  metaRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    height: 22,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  familyPill: {
    backgroundColor: colors.surfaceWarm,
  },
  pillText: {
    fontSize: type.tiny,
    fontWeight: '800',
    color: colors.inkSoft,
  },
  familyPillText: {
    color: colors.tealDark,
  },
  signal: {
    color: colors.tealDark,
    fontSize: type.tiny,
    fontWeight: '700',
  },
  unread: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: type.tiny,
    fontWeight: '900',
  },
});
