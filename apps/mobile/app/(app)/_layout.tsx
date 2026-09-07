import { Stack } from 'expo-router'

import { BrandMark } from '@/components/BrandMark'
import { HeaderTotalCleared } from '@/components/HeaderTotalCleared'
import { colors } from '@/lib/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitle: () => <BrandMark />,
        headerRight: () => <HeaderTotalCleared />,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="evaluate" />
      <Stack.Screen name="retire" />
      <Stack.Screen name="deposit" />
    </Stack>
  )
}
