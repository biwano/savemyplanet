import { useRouter, useSegments } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { Pressable, StyleSheet } from 'react-native'

import { colors } from '@/lib/theme'

/** Header-right profile icon → Profile. Soft green pill when already on Profile. */
export function HeaderProfileButton() {
  const router = useRouter()
  const segments = useSegments()
  const onProfile = segments.some((segment) => segment === 'profile')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      accessibilityState={{ selected: onProfile }}
      hitSlop={8}
      onPress={() => {
        if (onProfile) return
        router.push('/(app)/(tabs)/profile')
      }}
      style={[styles.hit, onProfile && styles.hitSelected]}
    >
      <SymbolView
        name={{
          ios: onProfile ? 'person.crop.circle.fill' : 'person.crop.circle',
          android: 'person',
          web: 'person',
        }}
        size={26}
        tintColor={onProfile ? colors.accent : colors.ink}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hit: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  hitSelected: {
    backgroundColor: colors.accentSoft,
  },
})
