import { Stack } from 'expo-router'

import { BrandMark } from '@/components/BrandMark'
import { HeaderRight } from '@/components/HeaderRight'
import { colors } from '@/lib/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitle: () => <BrandMark />,
        headerRight: () => <HeaderRight />,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="retire" />
      <Stack.Screen name="deposit" />
    </Stack>
  )
}
