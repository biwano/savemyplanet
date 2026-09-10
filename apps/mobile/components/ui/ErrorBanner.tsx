import { StyleSheet, Text, View } from 'react-native'

import { colors, spacing } from '@/lib/theme'

type ErrorBannerProps = {
  message: string | null
  /** `danger` (default) for hard failures; `neutral` for soft guidance (e.g. try again). */
  tone?: 'danger' | 'neutral'
}

export function ErrorBanner({
  message,
  tone = 'danger',
}: ErrorBannerProps) {
  if (!message) return null
  const neutral = tone === 'neutral'
  return (
    <View
      style={[styles.banner, neutral ? styles.bannerNeutral : styles.bannerDanger]}
    >
      <Text
        style={[styles.text, neutral ? styles.textNeutral : styles.textDanger]}
      >
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 8,
    padding: spacing.md,
  },
  bannerDanger: {
    backgroundColor: colors.dangerSoft,
  },
  bannerNeutral: {
    backgroundColor: colors.soft,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textDanger: {
    color: colors.danger,
  },
  textNeutral: {
    color: colors.ink,
  },
})
