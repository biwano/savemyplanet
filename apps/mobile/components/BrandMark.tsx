import { Image, StyleSheet, Text, View } from 'react-native'

import { colors, spacing } from '@/lib/theme'

const ICON_SIZE = 56

/** Logo mark + ClearMyCarbon wordmark for headers and auth screens. */
export function BrandMark() {
  return (
    <View accessibilityRole="header" style={styles.row}>
      <Image
        accessibilityLabel="ClearMyCarbon logo"
        source={require('@/assets/images/logo.png')}
        style={styles.icon}
      />
      <Text style={styles.title}>ClearMyCarbon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.ink,
  },
})
