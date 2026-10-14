import { memo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, sectionTones, spacing, type } from '../theme';
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
  { key: 'ai', label: '지키미', icon: 'leaf-outline' },
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
        const tone = sectionTones[item.key];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} 탭`}
            aria-selected={selected}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [styles.item, selected && { backgroundColor: tone.background }, pressed && styles.itemPressed]}
          >
            <Ionicons name={selected ? item.icon.replace('-outline', '') as IconName : item.icon} size={23} color={selected ? tone.foreground : colors.inkMuted} />
            <Text style={[styles.label, selected && { color: tone.foreground }]}>
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
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    minHeight: 60,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  itemPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: type.small,
    fontWeight: '700',
    color: colors.inkMuted,
  },
});
