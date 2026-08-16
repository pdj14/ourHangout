import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from './Avatar';
import { ChatMediaContent } from './ChatMediaContent';
import { colors, radius, spacing, type } from '../theme';
import type { Message, User } from '../types';

type MessageBubbleProps = {
  message: Message;
  sender?: User;
  mine: boolean;
  roomIsGroup?: boolean;
  showSender: boolean;
  retrying?: boolean;
  onRetry?: (messageId: string) => void;
  onOpenMedia?: (message: Message) => void;
  onOpenProfile?: (userId: string) => void;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  sender,
  mine,
  roomIsGroup = false,
  showSender,
  retrying = false,
  onRetry,
  onOpenMedia,
  onOpenProfile,
}: MessageBubbleProps) {
  const senderName = sender?.alias || sender?.name || message.senderName;
  const unreadCount =
    typeof message.unreadCount === 'number' && message.unreadCount > 0 ? Math.min(99, message.unreadCount) : 0;
  const explicitlyUnread = unreadCount > 0;
  const read = roomIsGroup
    ? message.delivery === 'read' && (typeof message.unreadCount !== 'number' || message.unreadCount === 0)
    : !explicitlyUnread && message.delivery === 'read';
  const waitingForDirectRead =
    !roomIsGroup && !read && (message.delivery === 'sent' || message.delivery === 'delivered');
  const isMedia = message.kind === 'image' || message.kind === 'video' || message.kind === 'audio';

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.wrap, mine && styles.wrapMine]}>
        {showSender && !mine ? (
          <Pressable
            accessibilityRole={sender ? 'button' : undefined}
            accessibilityLabel={sender ? `${senderName} 프로필 보기` : undefined}
            disabled={!sender}
            onPress={() => sender && onOpenProfile?.(sender.id)}
            style={styles.senderRow}
          >
            <Avatar name={senderName} color={sender?.color || colors.teal} uri={sender?.avatarUri} online={sender?.online} size={28} />
            <Text style={styles.sender} numberOfLines={1}>
              {senderName}
            </Text>
          </Pressable>
        ) : null}
        <View style={[styles.bubble, mine ? styles.mine : styles.other, isMedia && styles.mediaBubble]}>
          {message.kind === 'text' || message.kind === 'system' ? (
            <Text style={[styles.body, mine && styles.mineText]}>{message.text}</Text>
          ) : null}

          {isMedia && message.uri ? (
            <ChatMediaContent
              attachment={{
                id: message.id,
                kind: message.kind as 'image' | 'video' | 'audio',
                uri: message.uri,
                mimeType: message.mimeType,
                fileName: message.fileName,
                fileSize: message.fileSize,
              }}
              onOpenImage={() => onOpenMedia?.(message)}
            />
          ) : null}

          {isMedia && !message.uri ? (
            <View style={styles.mediaFallback}>
              <Ionicons name={message.kind === 'video' ? 'videocam-outline' : message.kind === 'audio' ? 'musical-notes-outline' : 'image-outline'} size={20} color={colors.inkMuted} />
              <Text style={styles.mediaFallbackText}>{message.kind === 'video' ? '영상 파일' : message.kind === 'audio' ? '오디오 파일' : '이미지 파일'}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.meta, mine && styles.metaMine]}>
          {mine ? (
            <View style={styles.receiptWrap}>
              {read ? (
                <Ionicons name="checkmark-done" size={14} color={colors.tealDark} />
              ) : waitingForDirectRead ? (
                <Text style={styles.receiptBadge}>1</Text>
              ) : unreadCount > 0 ? (
                <Text style={styles.receiptBadge}>{unreadCount}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.time}>{message.time}</Text>
          {mine && message.delivery ? (
            <Text style={[styles.delivery, message.delivery === 'failed' && styles.failed]}>
              {read
                ? '읽음'
                : message.delivery === 'sending'
                  ? '전송 중'
                  : message.delivery === 'delivered' || message.delivery === 'read'
                    ? '전달됨'
                  : message.delivery === 'failed'
                    ? '실패'
                    : '전송됨'}
            </Text>
          ) : null}
        </View>
        {mine && roomIsGroup && message.readByNames?.length ? (
          <Text style={styles.readers} numberOfLines={1}>
            {`읽음 ${message.readByNames.slice(0, 3).join(', ')}${
              message.readByNames.length > 3 ? ` +${message.readByNames.length - 3}` : ''
            }`}
          </Text>
        ) : null}
        {mine && message.delivery === 'failed' && onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메시지 다시 보내기"
            disabled={retrying}
            onPress={() => onRetry(message.id)}
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          >
            {retrying ? (
              <ActivityIndicator size="small" color={colors.coral} />
            ) : (
              <Ionicons name="refresh" size={13} color={colors.coral} />
            )}
            <Text style={styles.retryText}>{retrying ? '다시 보내는 중' : '다시 보내기'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginVertical: 5,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  wrap: {
    maxWidth: '82%',
    gap: 4,
  },
  wrapMine: {
    alignItems: 'flex-end',
  },
  sender: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '800',
  },
  senderRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  mediaBubble: {
    padding: 4,
    overflow: 'hidden',
  },
  mine: {
    backgroundColor: colors.mine,
    borderColor: colors.mine,
  },
  other: {
    backgroundColor: colors.other,
    borderColor: colors.line,
  },
  body: {
    color: colors.ink,
    fontSize: type.body,
    lineHeight: 20,
  },
  mineText: {
    color: '#FFFFFF',
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
  },
  videoWrap: {
    width: 240,
    height: 180,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    width: 220,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mediaFallbackText: {
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '800',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.xs,
  },
  metaMine: {
    justifyContent: 'flex-end',
    marginRight: spacing.xs,
  },
  time: {
    color: colors.inkMuted,
    fontSize: type.tiny,
    fontWeight: '700',
  },
  delivery: {
    color: colors.tealDark,
    fontSize: type.tiny,
    fontWeight: '800',
  },
  failed: {
    color: colors.coral,
  },
  receiptWrap: {
    minWidth: 18,
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceWarm,
    color: colors.coral,
    fontSize: type.tiny,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  readers: {
    maxWidth: 220,
    color: colors.inkMuted,
    fontSize: type.tiny,
    lineHeight: 16,
    fontWeight: '700',
  },
  retry: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E7B5AB',
    backgroundColor: colors.surface,
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: colors.coral,
    fontSize: type.tiny,
    fontWeight: '800',
  },
});
