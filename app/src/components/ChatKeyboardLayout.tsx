import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

type ChatKeyboardLayoutProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function ChatKeyboardLayout({ children, style }: ChatKeyboardLayoutProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
