import { useRouter } from 'expo-router'
import { ScrollView } from 'react-native'

import { Button } from '@/components/ui'
import { colors, spacing } from '@/lib/theme'

export default function HomeScreen() {
  const router = useRouter()

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Button
        label="Estimate your carbon footprint"
        onPress={() => router.push('/(app)/(tabs)/evaluate')}
      />
      <Button
        label="Clear carbon"
        onPress={() => router.push('/(app)/retire')}
        variant="secondary"
      />
    </ScrollView>
  )
}
