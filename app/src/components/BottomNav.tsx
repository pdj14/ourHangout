import { memo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, type } from '../theme';
import type { TabKey } from '../types';

type IconName = ComponentProps<typeof Ionicons>['name'];

type NavItem = {
  key: TabKey;
  label: string;
  icon: IconName;
};

const items: NavItem[] = [
  { key: 'people', label: '사람', icon: 'people-outline' },
  { key: 'chats', label: '대화', icon: 'chatbubbles-outline' },
  { key: 'ai', label: '지킴이', icon: 'leaf-outline' },
  { key: 'family', label: '가족', icon: 'shield-checkmark-outline' },
  { key: 'me', label: '프로필', icon: 'person-circle-outline' },
];

type BottomNavProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

export const BottomNav = memo(function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} 탭`}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [styles.item, selected && styles.itemOn, pressed && styles.itemPressed]}
          >
            <Ionicons name={item.icon} size={20} color={selected ? colors.tealDark : colors.inkMuted} />
            <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemOn: {
    backgroundColor: colors.surfaceSoft,
  },
  itemPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: type.tiny,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  labelOn: {
    color: colors.tealDark,
  },
});
