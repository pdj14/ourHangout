import { Platform } from 'react-native';

/**
 * Warm pastel surfaces with readable ink for a shared family space.
 */
export const colors = {
  canvas: '#FFF9F5',
  canvasDeep: '#F3ECE7',
  surface: '#FFFEFC',
  surfaceSoft: '#EAF4EE',
  surfaceWarm: '#FFF0DE',
  surfaceLavender: '#F1ECF9',
  surfaceRose: '#FBEAEC',
  surfaceBlue: '#EAF1FB',
  ink: '#37434B',
  inkSoft: '#59636B',
  inkMuted: '#60656E',
  line: '#E7DFD9',
  teal: '#4A7E70',
  tealDark: '#356859',
  blue: '#526F98',
  indigo: '#6A5F91',
  coral: '#A34E5E',
  amber: '#866136',
  leaf: '#64846F',
  bark: '#766157',
  cream: '#FFF9ED',
  success: '#3F7657',
  action: '#D7EBDF',
  actionInk: '#315C4D',
  actionBorder: '#B8D6C6',
  mine: '#DCEFE6',
  mineBorder: '#C5DED1',
  other: '#F0EAF8',
  otherBorder: '#DDD2EB',
  shadow: '#596572',
};

export const sectionTones = {
  people: { background: '#FFEADB', foreground: '#79533F' },
  chats: { background: '#EDE5F8', foreground: '#655080' },
  ai: { background: '#E0F0E7', foreground: '#356859' },
  family: { background: '#F9E2E6', foreground: '#8B4E61' },
  me: { background: '#E2EDFA', foreground: '#49658B' },
};

export const avatarPalette = [sectionTones.people, sectionTones.chats, sectionTones.ai, sectionTones.family, sectionTones.me];

/** 부드러운 하늘 그라디언트 (expo-linear-gradient 용 색 배열) */
export const gradients = {
  /** 런치/로그인 하늘: 크림 → 라벤더 → 옅은 하늘 */
  sky: ['#FFF0DE', '#FFF9F5', '#EDE5F8'] as [string, string, string],
  /** 하단 내비게이션 안개 */
  nav: ['#FFFEFC', '#FFF9F5'] as [string, string],
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
  sm: 10,
  md: 16,
  lg: 24,
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
