import { Redirect } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { ActivityIndicator, View } from 'react-native'

import { colors } from '@/lib/theme'

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  return <Redirect href={isSignedIn ? '/(app)' : '/(auth)/sign-in'} />
}
