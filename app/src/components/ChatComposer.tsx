import { forwardRef, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, type } from '../theme';
import type { AttachmentDraft, ChatMediaKind } from '../types';
import { ChatMediaContent } from './ChatMediaContent';

type ChatComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  attachment: AttachmentDraft | null;
  supportedMedia: ChatMediaKind[];
  onPickAttachment: (kind: ChatMediaKind) => void;
  onRemoveAttachment: () => void;
  onRetryAttachment?: () => void;
  onSend: () => void;
  onStop?: () => void;
  onFocus?: () => void;
  placeholder: string;
  accessibilityLabel: string;
  editable?: boolean;
  sending?: boolean;
  stopping?: boolean;
  maxLength?: number;
  capabilityHint?: string;
};

const MEDIA_OPTIONS: Array<{
  kind: ChatMediaKind;
  label: string;
  icon: 'image-outline' | 'videocam-outline' | 'musical-notes-outline';
}> = [
  { kind: 'image', label: '\uC0AC\uC9C4', icon: 'image-outline' },
  { kind: 'video', label: '\uB3D9\uC601\uC0C1', icon: 'videocam-outline' },
  { kind: 'audio', label: '\uC624\uB514\uC624', icon: 'musical-notes-outline' },
];

export const ChatComposer = forwardRef<TextInput, ChatComposerProps>(function ChatComposer({
  value,
  onChangeText,
  attachment,
  supportedMedia,
  onPickAttachment,
  onRemoveAttachment,
  onRetryAttachment,
  onSend,
  onStop,
  onFocus,
  placeholder,
  accessibilityLabel,
  editable = true,
  sending = false,
  stopping = false,
  maxLength,
  capabilityHint,
}, ref) {
  const [menuOpen, setMenuOpen] = useState(false);
  const options = useMemo(
    () => MEDIA_OPTIONS.filter((option) => supportedMedia.includes(option.kind)),
    [supportedMedia]
  );
  const canSend = editable && (!!value.trim() || !!attachment) && attachment?.status !== 'uploading';
  const generating = sending && !!onStop;

  const pick = (kind: ChatMediaKind) => {
    setMenuOpen(false);
    onPickAttachment(kind);
  };

  return (
    <View style={styles.wrap}>
      {menuOpen ? (
        <View style={styles.attachmentMenu}>
          {options.length ? options.map((option) => (
            <Pressable
              key={option.kind}
              accessibilityRole="button"
              accessibilityLabel={`${option.label} \uCCA8\uBD80`}
              onPress={() => pick(option.kind)}
              style={styles.menuItem}
            >
              <Ionicons name={option.icon} size={20} color={colors.tealDark} />
              <Text style={styles.menuLabel}>{option.label}</Text>
            </Pressable>
          )) : (
            <Text style={styles.unsupportedText}>{capabilityHint || '현재 지키미는 글로만 대화할 수 있어요.'}</Text>
          )}
        </View>
      ) : null}

      {attachment ? (
        <View style={[styles.preview, attachment.status === 'failed' && styles.previewFailed]}>
          <ChatMediaContent attachment={attachment} compact />
          <View style={styles.previewCopy}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {attachment.fileName || MEDIA_OPTIONS.find((item) => item.kind === attachment.kind)?.label}
            </Text>
            <Text style={[styles.previewStatus, attachment.status === 'failed' && styles.failedText]} numberOfLines={2}>
              {attachment.status === 'uploading'
                ? '\uC5C5\uB85C\uB4DC \uC911'
                : attachment.status === 'failed'
                  ? attachment.error || '\uCCA8\uBD80 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694.'
                  : '\uC804\uC1A1 \uB300\uAE30'}
            </Text>
          </View>
          {attachment.status === 'failed' && onRetryAttachment ? (
            <Pressable accessibilityRole="button" accessibilityLabel="\uCCA8\uBD80 \uB2E4\uC2DC \uBCF4\uB0B4\uAE30" onPress={onRetryAttachment} style={styles.previewAction}>
              <Ionicons name="refresh" size={18} color={colors.coral} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="\uCCA8\uBD80 \uC0AD\uC81C" onPress={onRemoveAttachment} style={styles.previewAction}>
            <Ionicons name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="\uCCA8\uBD80 \uBA54\uB274"
          disabled={!editable || sending || !!attachment}
          onPress={() => setMenuOpen((current) => !current)}
          style={[styles.attachButton, (!editable || sending || !!attachment) && styles.disabled]}
        >
          <Ionicons name={menuOpen ? 'close' : 'add'} size={24} color={colors.inkSoft} />
        </Pressable>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkMuted}
          editable={editable}
          multiline
          maxLength={maxLength}
          onFocus={onFocus}
          accessibilityLabel={accessibilityLabel}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={generating ? '\uC751\uB2F5 \uC911\uC9C0' : '\uBA54\uC2DC\uC9C0 \uBCF4\uB0B4\uAE30'}
          disabled={stopping || (!generating && !canSend)}
          onPress={generating ? onStop : onSend}
          style={[styles.sendButton, generating && styles.stopButton, !generating && !canSend && styles.disabled]}
        >
          {sending && !onStop ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name={generating ? 'stop' : 'arrow-up'} size={20} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  attachButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  input: { flex: 1, minHeight: 44, maxHeight: 128, paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: colors.surfaceSoft, color: colors.ink, fontSize: type.body },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealDark },
  stopButton: { backgroundColor: colors.coral },
  disabled: { opacity: 0.42 },
  attachmentMenu: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 58, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  menuItem: { minWidth: 74, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSoft },
  menuLabel: { color: colors.ink, fontSize: type.small, fontWeight: '800' },
  unsupportedText: { flex: 1, color: colors.inkMuted, fontSize: type.small },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surfaceSoft },
  previewFailed: { borderColor: colors.coral },
  previewCopy: { flex: 1, minWidth: 0 },
  previewTitle: { color: colors.ink, fontSize: type.small, fontWeight: '800' },
  previewStatus: { color: colors.inkMuted, fontSize: type.tiny, marginTop: 2 },
  failedText: { color: colors.coral },
  previewAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
