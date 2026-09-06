import { useAuth } from '@clerk/expo'
import type { APIMeResponse } from 'api-types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { Button, ErrorBanner, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

export default function HomeScreen() {
  const { getToken, signOut } = useAuth()
  const router = useRouter()
  const [me, setMe] = useState<APIMeResponse | null>(null)
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const health = await api.health()
      setHealthOk(health.ok)
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      setMe(await api.me(token))
    } catch (err) {
      setHealthOk(false)
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load',
      )
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return (
    <Screen>
      <Text style={typography.brand}>ClearMyCarbon</Text>
      <Text style={typography.muted}>Staging · fake retire · Cloud Run API</Text>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.line,
          gap: spacing.sm,
        }}
      >
        <Text style={typography.label}>API health</Text>
        {loading && healthOk === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={typography.body}>
            {healthOk ? 'OK — staging reachable' : 'Unreachable (retrying cold starts helps)'}
          </Text>
        )}
        <Button label="Retry health /me" onPress={() => void refresh()} variant="secondary" />
      </View>

      <ErrorBanner message={error} />

      {me && (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.line,
            gap: spacing.sm,
          }}
        >
          <Text style={typography.label}>Account</Text>
          <Text style={typography.body}>{me.user.email}</Text>
          <Text style={typography.body}>
            Available {formatUsdCents(me.account.available)}
            {me.account.reserved > 0
              ? ` · reserved ${formatUsdCents(me.account.reserved)}`
              : ''}
          </Text>
          <Text style={typography.muted}>
            Evaluations remaining: {me.user.evaluationsRemaining}
          </Text>
        </View>
      )}

      <Button label="Evaluate an activity" onPress={() => router.push('/(app)/evaluate')} />
      <Button
        label="Quote & retire"
        onPress={() => router.push('/(app)/retire')}
        variant="secondary"
      />
      <Button
        label="Retirement history"
        onPress={() => router.push('/(app)/history')}
        variant="secondary"
      />
      <Button label="Sign out" onPress={() => void signOut()} variant="danger" />
    </Screen>
  )
}
