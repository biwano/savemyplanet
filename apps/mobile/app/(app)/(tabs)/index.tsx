import type { APIMeResponse } from 'api-types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { Button, ErrorBanner, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

export default function HomeScreen() {
  const router = useRouter()
  const { runExclusive, requireToken, pauseAutoRefresh } = useAuthRefresh()
  const [me, setMe] = useState<APIMeResponse | null>(null)
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const healthChecked = useRef(false)

  const refresh = useCallback(
    async (opts?: { includeHealth?: boolean }) => {
      await runExclusive(async () => {
        setLoading(true)
        setError(null)
        const checkHealth = opts?.includeHealth || !healthChecked.current
        try {
          if (checkHealth) {
            const health = await api.health()
            healthChecked.current = true
            setHealthOk(health.ok)
          }
          setMe(await api.me(await requireToken()))
          pauseAutoRefresh.current = false
        } catch (err) {
          pauseAutoRefresh.current = true
          if (checkHealth) {
            healthChecked.current = true
            setHealthOk(false)
          }
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
      })
    },
    [runExclusive, requireToken, pauseAutoRefresh],
  )

  useFocusEffect(
    useCallback(() => {
      if (pauseAutoRefresh.current) return
      void refresh()
    }, [refresh, pauseAutoRefresh]),
  )

  const neverDeposited = me != null && me.account.available === 0

  return (
    <Screen>
      <Text style={typography.brand}>ClearMyCarbon</Text>
      <Text style={typography.muted}>Make peace with your footprint.</Text>

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
        <Text style={typography.label}>API</Text>
        {loading && healthOk === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={typography.body}>
            {healthOk
              ? 'API reachable'
              : 'Unreachable — wait a minute if cold-starting, then Retry'}
          </Text>
        )}
        <Button
          label="Retry"
          onPress={() => {
            pauseAutoRefresh.current = false
            void refresh({ includeHealth: true })
          }}
          variant="secondary"
        />
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
          <Text style={typography.label}>Available</Text>
          <Text style={typography.title}>
            {formatUsdCents(me.account.available)}
          </Text>
          {neverDeposited ? (
            <Text style={typography.muted}>
              Add funds when you’re ready to clear
            </Text>
          ) : null}
        </View>
      )}

      <Button
        label="Estimate an activity"
        onPress={() => router.push('/(app)/evaluate')}
      />
      <Button
        label="Clear carbon"
        onPress={() => router.push('/(app)/retire')}
        variant="secondary"
      />
    </Screen>
  )
}
