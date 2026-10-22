import type { ComponentProps } from 'react';
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
  { key: 'family', label: '가족', icon: 'shield-checkmark-outline' },
  { key: 'me', label: '프로필', icon: 'person-circle-outline' },
];

type BottomNavProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => onChange(item.key)}
            style={[styles.item, selected && styles.itemOn]}
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
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  item: {
    flex: 1,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemOn: {
    backgroundColor: colors.surfaceWarm,
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
