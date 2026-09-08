import { StyleSheet, Text, View } from 'react-native'

import { colors, spacing } from '@/lib/theme'

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
})
