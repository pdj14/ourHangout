import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, type } from '../theme';
import type { RealtimeState } from '../hooks/useRealtimeConnection';

type ConnectionBannerProps = {
  state: RealtimeState;
  onRetry: () => void;
};

export function ConnectionBanner({ state, onRetry }: ConnectionBannerProps) {
  if (state !== 'reconnecting') return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={15} color={colors.coral} />
      <Text style={styles.text} numberOfLines={1}>실시간 연결을 복구하는 중입니다.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="정보 새로고침" onPress={onRetry} style={styles.retry}>
        <Ionicons name="refresh" size={16} color={colors.tealDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 36,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E8C1BA',
    backgroundColor: '#FFF1EE',
  },
  text: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '700',
  },
  retry: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
