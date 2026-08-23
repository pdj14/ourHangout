import { Platform } from 'react-native';

/**
 * 구름 솜사탕 테마 — 포근한 아지트
 * 베이스: 라벤더 구름 / 강조: 페리윙클 / 온기: 복숭아 크림 / 자연: 민트 세이지
 * 흰 글자가 얹히는 색(teal, tealDark, mine, coral)은 흰색 대비 4:1 이상을 유지한다.
 */
export const colors = {
  canvas: '#F7F4FB',
  canvasDeep: '#ECE7F6',
  surface: '#FFFFFF',
  surfaceSoft: '#F2EEFA',
  surfaceWarm: '#FFF1E8',
  ink: '#453F5C',
  inkSoft: '#6E6889',
  inkMuted: '#9C95B3',
  line: '#E4DEF2',
  teal: '#5E6BBA',
  tealDark: '#49559B',
  blue: '#6D93BE',
  indigo: '#7173AE',
  coral: '#C25E72',
  amber: '#B8813C',
  leaf: '#87B283',
  bark: '#8D755E',
  cream: '#FFFBF6',
  success: '#4C9160',
  mine: '#5E6BBA',
  other: '#FFFFFF',
  shadow: '#37324E',
};

/** 부드러운 하늘 그라디언트 (expo-linear-gradient 용 색 배열) */
export const gradients = {
  /** 런치/로그인 하늘: 크림 → 라벤더 → 옅은 하늘 */
  sky: ['#FDF8F2', '#F2EDFA', '#E9F0F8'] as [string, string, string],
  /** 하단 내비게이션 안개 */
  nav: ['#FCFAFE', '#F3EFFA'] as [string, string],
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
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const type = {
  hero: 25,
  title: 20,
  section: 15,
  body: 14,
  small: 12,
  tiny: 11,
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
