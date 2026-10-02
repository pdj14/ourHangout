import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../theme';

type ScreenHeaderProps = {
  title: string;
  detail?: string;
  action?: ReactNode;
};

export function ScreenHeader({ title, detail, action }: ScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: type.hero,
    fontWeight: '800',
  },
  detail: {
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 19,
    marginTop: 6,
  },
  action: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
