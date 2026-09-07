import { Stack } from 'expo-router'

import { colors } from '@/lib/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="evaluate" options={{ title: 'Estimate' }} />
      <Stack.Screen name="retire" options={{ title: 'Clear carbon' }} />
    </Stack>
  )
}
