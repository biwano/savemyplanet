import { ClerkProvider, useAuth } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, type ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { ToastProvider } from '@/components/ui'
import { getClerkPublishableKey } from '@/lib/config'
import { StripeAppProvider } from '@/lib/stripe/StripeAppProvider'
import { colors } from '@/lib/theme'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded) {
      void SplashScreen.hideAsync()
    }
  }, [isLoaded])

  useEffect(() => {
    if (!isLoaded) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in')
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/(app)/(tabs)')
    }
  }, [isLoaded, isSignedIn, segments, router])

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  return children
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={getClerkPublishableKey()}
      tokenCache={tokenCache}
    >
      <StripeAppProvider>
        <ToastProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </AuthGate>
        </ToastProvider>
      </StripeAppProvider>
    </ClerkProvider>
  )
}
