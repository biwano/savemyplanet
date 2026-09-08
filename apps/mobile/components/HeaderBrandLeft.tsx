import { useRouter } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { Pressable, StyleSheet, View } from 'react-native'

import { BrandMark } from '@/components/BrandMark'
import { colors, spacing } from '@/lib/theme'

type HeaderBrandLeftProps = {
  /** When true, show a back chevron beside the brand (stacked flows). */
  showBack?: boolean
}

/** Tab/stack header left: optional back + brand mark. */
export function HeaderBrandLeft({ showBack = false }: HeaderBrandLeftProps) {
  const router = useRouter()

  return (
    <View style={styles.row}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => {
            if (router.canGoBack()) router.back()
            else router.replace('/(app)/(tabs)')
          }}
          style={styles.back}
        >
          <SymbolView
            name={{
              ios: 'chevron.left',
              android: 'arrow_back',
              web: 'arrow_back',
            }}
            size={22}
            tintColor={colors.ink}
          />
        </Pressable>
      ) : null}
      <BrandMark />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  back: {
    paddingVertical: 4,
    paddingRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
