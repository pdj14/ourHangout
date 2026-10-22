import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

import { colors, radius, spacing, type } from '../theme';
import type { Message, User } from '../types';

type MessageBubbleProps = {
  message: Message;
  sender?: User;
  mine: boolean;
  roomIsGroup?: boolean;
  directReadCutoff?: number;
  showSender: boolean;
  onOpenMedia?: (message: Message) => void;
};

function VideoAttachment({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.video}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        nativeControls
      />
    </View>
  );
}

export function MessageBubble({
  message,
  sender,
  mine,
  roomIsGroup = false,
  directReadCutoff = 0,
  showSender,
  onOpenMedia,
}: MessageBubbleProps) {
  const senderName = sender?.alias || sender?.name || message.senderName;
  const read = message.delivery === 'read' || message.unreadCount === 0 || (!roomIsGroup && directReadCutoff >= message.at);
  const unreadCount =
    typeof message.unreadCount === 'number' && message.unreadCount > 0 ? Math.min(99, message.unreadCount) : 0;

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.wrap, mine && styles.wrapMine]}>
        {showSender && !mine ? (
          <Text style={styles.sender} numberOfLines={1}>
            {senderName}
          </Text>
        ) : null}
        <View style={[styles.bubble, mine ? styles.mine : styles.other, message.kind !== 'text' && styles.mediaBubble]}>
          {message.kind === 'text' || message.kind === 'system' ? (
            <Text style={[styles.body, mine && styles.mineText]}>{message.text}</Text>
          ) : null}

          {message.kind === 'image' && message.uri ? (
            <Pressable onPress={() => onOpenMedia?.(message)}>
              <Image source={{ uri: message.uri }} resizeMode="cover" style={styles.image} />
            </Pressable>
          ) : null}

          {message.kind === 'video' && message.uri ? <VideoAttachment uri={message.uri} /> : null}

          {message.kind !== 'text' && !message.uri ? (
            <View style={styles.mediaFallback}>
              <Ionicons name={message.kind === 'video' ? 'videocam-outline' : 'image-outline'} size={20} color={colors.inkMuted} />
              <Text style={styles.mediaFallbackText}>{message.kind === 'video' ? '영상 파일' : '이미지 파일'}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.meta, mine && styles.metaMine]}>
          {mine ? (
            <View style={styles.receiptWrap}>
              {read ? (
                <Ionicons name="checkmark-done" size={14} color={colors.tealDark} />
              ) : unreadCount > 0 ? (
                <Text style={styles.receiptBadge}>{unreadCount}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.time}>{message.time}</Text>
          {mine && message.delivery ? (
            <Text style={[styles.delivery, message.delivery === 'failed' && styles.failed]}>
              {message.delivery === 'read'
                ? '읽음'
                : message.delivery === 'sending'
                  ? '전송중'
                  : message.delivery === 'failed'
                    ? '실패'
                    : '전송됨'}
            </Text>
          ) : null}
        </View>
        {mine && roomIsGroup && message.readByNames?.length ? (
          <Text style={styles.readers} numberOfLines={1}>
            {`Read ${message.readByNames.slice(0, 3).join(', ')}${
              message.readByNames.length > 3 ? ` +${message.readByNames.length - 3}` : ''
            }`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

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
    marginLeft: spacing.xs,
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
});
