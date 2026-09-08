import type { ViewStyle } from 'react-native'

import { colors, spacing } from '@/lib/theme'

/** Icon + label row inside the tab bar (excludes vertical padding).
 * Balance tab uses a two-line label (title + amount), so keep a little extra room. */
export const TAB_BAR_INNER_HEIGHT = 64

export function tabBarTopPadding(): number {
  return spacing.sm
}

export function tabBarBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset, spacing.md)
}

/** Full tab bar height including safe-area padding — keep in sync with tabs layout. */
export function tabBarHeight(bottomInset: number): number {
  return (
    TAB_BAR_INNER_HEIGHT +
    tabBarTopPadding() +
    tabBarBottomPadding(bottomInset)
  )
}

/** Shared tab bar chrome — used by tabs layout and screens that toggle visibility. */
export function tabBarStyle(bottomInset: number): ViewStyle {
  const topPad = tabBarTopPadding()
  const bottomPad = tabBarBottomPadding(bottomInset)
  return {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    height: TAB_BAR_INNER_HEIGHT + topPad + bottomPad,
    paddingTop: topPad,
    paddingBottom: bottomPad,
  }
}
