import { useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppNavigationContext } from './AppNavigationContext';

import { colors, sectionTones, spacing, type } from '../theme';

type ScreenHeaderProps = {
  title: string;
  detail?: string;
  action?: ReactNode;
  tone?: keyof typeof sectionTones;
};

export function ScreenHeader({ title, detail, action, tone = 'ai' }: ScreenHeaderProps) {
  const navigation = useContext(AppNavigationContext);
  return (
    <View style={styles.wrap}>
      <View style={[styles.mark, { backgroundColor: sectionTones[tone].background }]}>
        {navigation.onBack ? <Pressable accessibilityRole="button" accessibilityLabel="이전 화면" onPress={navigation.onBack} style={styles.button}><Ionicons name="chevron-back" size={24} color={colors.ink} /></Pressable>
          : <Ionicons name={tone === 'diary' ? 'book-outline' : tone === 'people' ? 'people-outline' : tone === 'chats' ? 'chatbubbles-outline' : tone === 'settings' ? 'settings-outline' : 'sparkles-outline'} size={23} color={sectionTones[tone].foreground} />}
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
      {navigation.onSettings && !navigation.onBack ? <Pressable accessibilityRole="button" accessibilityLabel="설정 열기" onPress={navigation.onSettings} style={styles.button}><Ionicons name="settings-outline" size={23} color={colors.inkSoft} /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.canvas,
  },
  mark: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
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
