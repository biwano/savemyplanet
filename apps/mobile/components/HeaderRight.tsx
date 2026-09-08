import { StyleSheet, View } from 'react-native'

import { HeaderProfileButton } from '@/components/HeaderProfileButton'
import { spacing } from '@/lib/theme'

/** Signed-in header trailing chrome: profile icon. */
export function HeaderRight() {
  return (
    <View style={styles.row}>
      <HeaderProfileButton />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: 4,
  },
})
