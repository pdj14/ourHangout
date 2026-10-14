import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { OnDeviceChatMessage } from '../services/onDeviceAi';
import { sanitizeGuardianVisibleContent } from '../services/guardianWebTools';
import { colors, radius, spacing, type } from '../theme';
import { ChatMediaContent } from './ChatMediaContent';

export const GuardianMessageBubble = memo(function GuardianMessageBubble({
  message, name, avatarUri,
}: { message: OnDeviceChatMessage; name: string; avatarUri?: string }) {
  const user = message.role === 'user';
  const text = user ? message.content : sanitizeGuardianVisibleContent(message.content);
  return (
    <View testID={user ? 'guardian-message-outgoing' : 'guardian-message-incoming'} style={[styles.row, user && styles.userRow]}>
      {!user ? <Image
        source={avatarUri ? { uri: avatarUri } : require('../../assets/forest-guardian.png')}
        resizeMode={avatarUri ? 'cover' : 'contain'} style={styles.avatar}
      /> : null}
      <View style={[styles.bubble, user ? styles.userBubble : styles.assistantBubble]}>
        {message.attachment ? <ChatMediaContent attachment={message.attachment} /> : null}
        <Text accessibilityLabel={user ? `나: ${text}` : `${name}: ${text || '답변 생성 중'}`} selectable style={[styles.text, user && styles.userText]}>{text || '…'}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-end', gap: spacing.sm },
  userRow: { justifyContent: 'flex-end' },
  avatar: { width: 32, height: 36, borderRadius: radius.pill },
  bubble: { maxWidth: '86%', flexShrink: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  userBubble: { backgroundColor: colors.mine, borderBottomRightRadius: radius.sm },
  assistantBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: radius.sm },
  text: { color: colors.ink, fontSize: type.body, lineHeight: 26 },
  userText: { color: colors.surface },
});
