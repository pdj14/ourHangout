import { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radius } from '../theme';

type AvatarProps = {
  name: string;
  color: string;
  size?: number;
  online?: boolean;
  uri?: string;
};

export const Avatar = memo(function Avatar({ name, color, size = 42, online = false, uri }: AvatarProps) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  const borderRadius = Math.max(radius.md, Math.round(size * 0.24));

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius,
            backgroundColor: colors.surfaceSoft,
          }}
        />
      ) : (
        <LinearGradient
          colors={[color, colors.tealDark]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.cream,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: Math.max(13, size * 0.38) }}>
            {initial}
          </Text>
        </LinearGradient>
      )}
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
});
