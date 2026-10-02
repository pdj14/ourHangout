import { Platform } from 'react-native';

/**
 * Warm neutral surfaces, forest teal actions, and readable text for all ages.
 */
export const colors = {
  canvas: '#F6F7F4',
  canvasDeep: '#E9EDE7',
  surface: '#FFFFFF',
  surfaceSoft: '#EAF2ED',
  surfaceWarm: '#FBF0DF',
  ink: '#243A33',
  inkSoft: '#53655D',
  inkMuted: '#606E66',
  line: '#DCE4DC',
  teal: '#28796A',
  tealDark: '#1D6658',
  blue: '#426D8A',
  indigo: '#5A6687',
  coral: '#AE493E',
  amber: '#946321',
  leaf: '#6D8D6D',
  bark: '#7C654C',
  cream: '#FFFBF6',
  success: '#367753',
  mine: '#28796A',
  other: '#FFFFFF',
  shadow: '#243A33',
};

/** 부드러운 하늘 그라디언트 (expo-linear-gradient 용 색 배열) */
export const gradients = {
  /** 런치/로그인 하늘: 크림 → 라벤더 → 옅은 하늘 */
  sky: ['#FBF6EB', '#F6F7F4', '#EDF4ED'] as [string, string, string],
  /** 하단 내비게이션 안개 */
  nav: ['#FFFFFF', '#FFFFFF'] as [string, string],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const type = {
  hero: 28,
  title: 22,
  section: 17,
  body: 16,
  small: 13,
  tiny: 12,
};

export const shadow = {
  ...Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
};
