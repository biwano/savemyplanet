import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#f3f6f2' },
        headerShadowVisible: false,
        headerTintColor: '#14201a',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ClearMyCarbon' }} />
      <Stack.Screen name="evaluate" options={{ title: 'Evaluate' }} />
      <Stack.Screen name="retire" options={{ title: 'Retire' }} />
      <Stack.Screen name="history" options={{ title: 'History' }} />
    </Stack>
  )
}
