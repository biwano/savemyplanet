import { StyleSheet } from 'react-native'

/** Staging demo palette — forest / carbon, not purple-default AI chrome. */
export const colors = {
  bg: '#f3f6f2',
  surface: '#ffffff',
  ink: '#14201a',
  muted: '#5a6b62',
  line: '#d5e0d8',
  accent: '#1f6b4a',
  accentSoft: '#e4f2ea',
  danger: '#9b2c2c',
  dangerSoft: '#fde8e8',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const typography = StyleSheet.create({
  brand: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.ink,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
})
