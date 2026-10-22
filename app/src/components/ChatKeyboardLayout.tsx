import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

type ChatKeyboardLayoutProps = PropsWithChildren<{
  keyboardVerticalOffset?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function ChatKeyboardLayout({
  children,
  keyboardVerticalOffset = 0,
  style,
}: ChatKeyboardLayoutProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
