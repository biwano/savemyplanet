import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { colors, spacing } from '@/lib/theme'

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    gap: spacing.md,
  },
})
