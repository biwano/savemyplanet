import { useAuth } from '@clerk/expo'
import { Text } from 'react-native'

import { Button, Screen } from '@/components/ui'
import { typography } from '@/lib/theme'

/** Account tab shell. Balance, profile edit, and Deposit are M2. */
export default function AccountScreen() {
  const { signOut } = useAuth()

  return (
    <Screen>
      <Text style={typography.title}>Account</Text>
      <Text style={typography.muted}>Sign out ends your session on this device.</Text>
      <Button label="Sign out" onPress={() => void signOut()} variant="danger" />
    </Screen>
  )
}
