import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from './Avatar';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { User } from '../types';

type UserProfileModalProps = {
  user: User | null;
  onClose: () => void;
};

export function UserProfileModal({ user, onClose }: UserProfileModalProps) {
  const displayName = user?.alias || user?.name || '';

  return (
    <Modal
      visible={!!user}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="상대방 프로필 닫기" style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="상대방 프로필 닫기" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>

          <View style={styles.photoStage}>
            {user?.avatarUri ? (
              <Image source={{ uri: user.avatarUri }} resizeMode="contain" style={styles.photo} />
            ) : user ? (
              <Avatar name={displayName} color={user.color} size={180} online={user.online} />
            ) : null}
          </View>

          <View style={styles.copy}>
            <Text style={styles.name}>{displayName}</Text>
            {user?.alias && user.alias !== user.name ? <Text style={styles.realName}>{user.name}</Text> : null}
            <View style={styles.statusCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.tealDark} />
              <Text style={styles.status}>{user?.status?.trim() || '상태 메시지가 없습니다.'}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 11, 0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    paddingTop: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  photoStage: {
    width: '100%',
    height: 320,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  copy: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  name: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  realName: {
    marginTop: 3,
    color: colors.inkMuted,
    fontSize: type.small,
    fontWeight: '700',
  },
  statusCard: {
    width: '100%',
    minHeight: 54,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#DDF4EF',
  },
  status: {
    flexShrink: 1,
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
});
