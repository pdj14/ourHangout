import { Platform } from 'react-native';

export const colors = {
  canvas: '#F3F5F2',
  canvasDeep: '#E5ECE6',
  surface: '#FFFFFF',
  surfaceSoft: '#EAF1EC',
  surfaceWarm: '#FFF3E5',
  ink: '#1E2922',
  inkSoft: '#526158',
  inkMuted: '#7D8981',
  line: '#D5DDD7',
  teal: '#619A80',
  tealDark: '#356D55',
  blue: '#668CB0',
  indigo: '#596D91',
  coral: '#C96555',
  amber: '#B47B2E',
  leaf: '#789C55',
  bark: '#7D674F',
  cream: '#FFFFFF',
  success: '#4E8D5B',
  mine: '#3F755D',
  other: '#FFFFFF',
  shadow: '#18251D',
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
  sm: 4,
  md: 8,
  lg: 8,
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
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 7,
    },
    android: {
      elevation: 1,
    },
    default: {},
  }),
};
