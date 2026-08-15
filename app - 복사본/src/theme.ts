import { Platform } from 'react-native';

export const colors = {
  canvas: '#F7F3E8',
  canvasDeep: '#E8F0DC',
  surface: '#FFFDF7',
  surfaceSoft: '#EEF4E4',
  surfaceWarm: '#FFF2DC',
  ink: '#2B3828',
  inkSoft: '#5C6B53',
  inkMuted: '#8B947E',
  line: '#DCE6CF',
  teal: '#6DA58E',
  tealDark: '#3F745D',
  blue: '#6F95B8',
  indigo: '#596E9A',
  coral: '#D9795F',
  amber: '#C58B3D',
  leaf: '#86A95D',
  bark: '#8A6948',
  cream: '#FFF7E6',
  success: '#5B9A62',
  mine: '#4F846B',
  other: '#FFFFFF',
  shadow: '#24351F',
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
  md: 12,
  lg: 18,
  pill: 999,
};

export const type = {
  hero: 28,
  title: 21,
  section: 15,
  body: 14,
  small: 12,
  tiny: 11,
};

export const shadow = {
  ...Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
};
