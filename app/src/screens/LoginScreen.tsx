import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, shadow, spacing, type } from '../theme';
import type { AuthState, ServerState } from '../types';

const appIcon = require('../../assets/icon.png');
const welcomeArtwork = require('../../assets/welcome-family.png');
const guardianMascot = require('../../assets/forest-guardian.png');

type LoginScreenProps = {
  authState: AuthState;
  serverState: ServerState;
  errorMessage: string;
  onSignIn: () => void;
};

export function LoginScreen({ authState, serverState, errorMessage, onSignIn }: LoginScreenProps) {
  const busy = authState === 'checking' || authState === 'signingIn' || authState === 'syncing';
  const serverLabel =
    serverState === 'ready'
      ? '가족 숲에 연결됐어요.'
      : serverState === 'checking'
        ? '가족 숲으로 가는 길을 확인 중이에요.'
        : '서버에 연결하지 못했어요.';

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[colors.canvas, colors.canvasDeep, colors.surfaceWarm]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.panel}>
          <View style={styles.heroFrame}>
            <Image source={welcomeArtwork} resizeMode="cover" style={styles.heroImage} />
            <Image source={guardianMascot} resizeMode="contain" style={styles.mascot} />
          </View>
          <View style={styles.brandMark}>
            <Image source={appIcon} resizeMode="cover" style={styles.appIcon} />
          </View>
          <Text style={styles.title}>우리들의 아지트</Text>
          <Text style={styles.detail}>아이와 부모가 함께 쓰는 따뜻한 가족 대화 공간</Text>

          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              {busy || serverState === 'checking' ? <ActivityIndicator size="small" color={colors.tealDark} /> : null}
            </View>
            <Text style={[styles.statusText, serverState === 'error' && styles.statusError]}>{serverLabel}</Text>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Google로 로그인"
            onPress={onSignIn}
            disabled={busy}
            style={[styles.signIn, busy && styles.signInDisabled]}
          >
            <View style={styles.signInIcon}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="logo-google" size={18} color="#FFFFFF" />}
            </View>
            <Text style={styles.signInText}>{busy ? '준비 중...' : 'Google로 시작하기'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    ...shadow,
  },
  heroFrame: {
    width: '100%',
    height: 210,
    maxWidth: 330,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceSoft,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  mascot: {
    position: 'absolute',
    right: -8,
    bottom: -18,
    width: 124,
    height: 124,
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    padding: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow,
  },
  appIcon: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
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
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  statusRow: {
    minHeight: 28,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statusIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: colors.inkSoft,
    fontSize: type.small,
    fontWeight: '800',
  },
  statusError: {
    color: colors.coral,
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.coral,
    fontSize: type.small,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '800',
  },
  signIn: {
    height: 50,
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.tealDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  signInIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInDisabled: {
    backgroundColor: colors.inkMuted,
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '900',
  },
});
