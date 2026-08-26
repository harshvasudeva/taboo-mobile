import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Studio palette — night club table, gold foil, rival teams. */
export const color = {
  ink: '#07040c',
  ink2: '#12081a',
  panel: '#1a1028',
  panelLift: '#241834',
  line: 'rgba(255, 214, 140, 0.16)',
  cream: '#f6ead7',
  mute: '#9a8b78',
  gold: '#e8b84a',
  goldDeep: '#c4922a',
  goldDim: 'rgba(232, 184, 74, 0.14)',
  tide: '#3ee0c5',
  tideDeep: '#0e6f63',
  blaze: '#ff6b6b',
  blazeDeep: '#8a2430',
  danger: '#e23d4a',
  ok: '#5ee0a0',
  warn: '#f0c14b',
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
} as const;

export const type = {
  wordmark: {
    fontFamily: Platform.select({ ios: 'Didot', android: 'serif', default: 'serif' }),
    fontSize: 64,
    fontWeight: '400' as const,
    letterSpacing: 10,
    color: color.gold,
  } satisfies TextStyle,
  display: {
    fontFamily: Platform.select({ ios: 'Didot', android: 'serif', default: 'serif' }),
    fontSize: 34,
    fontWeight: '400' as const,
    color: color.cream,
  } satisfies TextStyle,
  kicker: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 3.2,
    textTransform: 'uppercase' as const,
    color: color.gold,
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    color: color.cream,
    lineHeight: 22,
  } satisfies TextStyle,
  mute: {
    fontSize: 13,
    color: color.mute,
    lineHeight: 18,
  } satisfies TextStyle,
};

export const shadowGold: ViewStyle = Platform.select({
  ios: {
    shadowColor: color.gold,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 10 },
  default: {},
})!;

export const shadowSoft: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 8 },
  default: {},
})!;
