import { spacing } from '@/lib/theme'

/** Icon + label row inside the tab bar (excludes vertical padding). */
export const TAB_BAR_INNER_HEIGHT = 56

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
