import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, type } from '../theme';

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
};

export function ScreenHeader({ eyebrow, title, detail, action }: ScreenHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        {eyebrow ? (
          <View style={styles.eyebrowRow}>
            <Ionicons name="leaf-outline" size={13} color={colors.tealDark} />
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  eyebrow: {
    color: colors.tealDark,
    fontSize: type.tiny,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: type.hero,
    fontWeight: '900',
  },
  detail: {
    color: colors.inkSoft,
    fontSize: type.body,
    lineHeight: 20,
    marginTop: 6,
  },
  action: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
