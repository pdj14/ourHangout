import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';

import { colors, radius, spacing, type } from '../theme';
import type { ChatAttachment } from '../types';

type ChatMediaContentProps = {
  attachment: ChatAttachment;
  compact?: boolean;
  onOpenImage?: (uri: string) => void;
};

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

const VideoContent = memo(function VideoContent({ uri, compact }: { uri: string; compact?: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  return (
    <View style={[styles.videoWrap, compact && styles.videoCompact]}>
      <VideoView
        player={player}
        style={styles.video}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        nativeControls
      />
    </View>
  );
});

const AudioContent = memo(function AudioContent({ attachment, compact }: {
  attachment: ChatAttachment;
  compact?: boolean;
}) {
  const player = useAudioPlayer(attachment.uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish) void player.seekTo(0);
      player.play();
    }
  };
  return (
    <View style={[styles.audio, compact && styles.audioCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? '\uC624\uB514\uC624 \uC77C\uC2DC\uC815\uC9C0' : '\uC624\uB514\uC624 \uC7AC\uC0DD'}
        onPress={toggle}
        style={styles.audioButton}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={styles.audioCopy}>
        <Text style={styles.audioName} numberOfLines={1}>{attachment.fileName || '\uC624\uB514\uC624 \uD30C\uC77C'}</Text>
        <Text style={styles.audioTime}>{formatDuration(status.currentTime)} / {formatDuration(status.duration)}</Text>
      </View>
    </View>
  );
});

export const ChatMediaContent = memo(function ChatMediaContent({
  attachment,
  compact = false,
  onOpenImage,
}: ChatMediaContentProps) {
  if (attachment.kind === 'image') {
    return (
      <Pressable disabled={!onOpenImage} onPress={() => onOpenImage?.(attachment.uri)}>
        <Image
          source={{ uri: attachment.uri }}
          resizeMode="cover"
          style={[styles.image, compact && styles.imageCompact]}
        />
      </Pressable>
    );
  }
  if (attachment.kind === 'video') return <VideoContent uri={attachment.uri} compact={compact} />;
  return <AudioContent attachment={attachment} compact={compact} />;
});

const styles = StyleSheet.create({
  image: { width: 220, height: 220, borderRadius: radius.sm, backgroundColor: colors.surfaceSoft },
  imageCompact: { width: 54, height: 54 },
  videoWrap: { width: 240, height: 180, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.ink },
  videoCompact: { width: 76, height: 54 },
  video: { width: '100%', height: '100%' },
  audio: {
    width: 230,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
  },
  audioCompact: { width: 210, minHeight: 54 },
  audioButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDark,
  },
  audioCopy: { flex: 1, minWidth: 0 },
  audioName: { color: colors.ink, fontSize: type.small, fontWeight: '800' },
  audioTime: { color: colors.inkMuted, fontSize: type.tiny, marginTop: 3 },
});
