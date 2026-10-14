import { memo } from 'react';
import { Image, Text, View } from 'react-native';

import { avatarPalette, colors, radius } from '../theme';

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
  const toneIndex = Array.from(`${name}:${color}`).reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarPalette.length;
  const tone = avatarPalette[toneIndex];

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
        <View
          style={{
            width: size,
            height: size,
            borderRadius,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.cream,
            backgroundColor: tone.background,
          }}
        >
          <Text style={{ color: tone.foreground, fontWeight: '800', fontSize: Math.max(13, size * 0.38) }}>
            {initial}
          </Text>
        </View>
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
