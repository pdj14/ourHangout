import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, gradients, radius, spacing, type } from '../theme';

const launchArtwork = require('../../assets/hideout-splash.png');

type LaunchScreenProps = {
  message?: string;
};

export function LaunchScreen({ message = '앱을 준비하고 있습니다.' }: LaunchScreenProps) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={gradients.sky}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.cloud, styles.cloudA]} />
      <View style={[styles.cloud, styles.cloudB]} />
      <View style={styles.mark}>
        <Image source={launchArtwork} resizeMode="contain" style={styles.icon} />
      </View>
      <Text style={styles.title}>우리들의 아지트</Text>
      <View style={styles.status}>
        <View style={styles.statusBar}>
          <View style={styles.statusBarFill} />
        </View>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.xl,
  },
  cloud: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
  },
  cloudA: {
    width: 230,
    height: 86,
    top: 74,
    left: -64,
    opacity: 0.55,
  },
  cloudB: {
    width: 190,
    height: 72,
    bottom: 98,
    right: -56,
    opacity: 0.4,
  },
  mark: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  icon: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  title: {
    marginTop: spacing.lg,
    color: colors.ink,
    fontSize: type.hero,
    fontWeight: '900',
  },
  status: {
    height: 52,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    width: 112,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  statusBarFill: {
    width: '58%',
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.tealDark,
  },
  message: {
    color: colors.inkSoft,
    fontSize: type.small,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
});
