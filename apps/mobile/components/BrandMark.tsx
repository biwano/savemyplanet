import { Image, StyleSheet, Text, View } from 'react-native'

import { colors, spacing, typography } from '@/lib/theme'

type BrandMarkProps = {
  /** `nav` = compact header chrome; `hero` = Welcome / signed-out. */
  size?: 'nav' | 'hero'
}

export function BrandMark({ size = 'nav' }: BrandMarkProps) {
  const iconSize = size === 'hero' ? 56 : 28

  return (
    <View
      accessibilityRole="header"
      style={[styles.row, size === 'hero' && styles.hero]}
    >
      <Image
        accessibilityLabel="ClearMyCarbon logo"
        source={require('@/assets/images/logo.png')}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: size === 'hero' ? 14 : 7,
        }}
      />
      <Text style={size === 'hero' ? typography.brand : styles.navTitle}>
        ClearMyCarbon
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hero: {
    gap: spacing.md,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.ink,
  },
})
