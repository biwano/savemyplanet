import { Link, Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { colors, typography } from '@/lib/theme'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={typography.title}>This screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: colors.accent }}>Go home</Text>
        </Link>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.bg,
    gap: 12,
  },
  link: {
    marginTop: 8,
  },
})
