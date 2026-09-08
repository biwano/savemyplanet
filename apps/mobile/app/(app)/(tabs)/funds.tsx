import type { APIAccountBalance } from 'api-types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'

import { Button, ErrorBanner } from '@/components/ui'
import { publishAvailableCents } from '@/lib/accountBalanceCache'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

export default function FundsScreen() {
  const router = useRouter()
  const { runExclusive, requireToken, pauseAutoRefreshRef } = useAuthRefresh()

  const [account, setAccount] = useState<APIAccountBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    await runExclusive(async () => {
      setLoading(true)
      setError(null)
      try {
        const next = await api.account(await requireToken())
        setAccount(next)
        publishAvailableCents(next.available)
        pauseAutoRefreshRef.current = false
      } catch (err) {
        pauseAutoRefreshRef.current = true
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load funds',
        )
      } finally {
        setLoading(false)
      }
    })
  }, [runExclusive, requireToken, pauseAutoRefreshRef])

  useFocusEffect(
    useCallback(() => {
      if (pauseAutoRefreshRef.current) return
      void refresh()
    }, [refresh, pauseAutoRefreshRef]),
  )

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <Text style={typography.title}>Funds</Text>
        {loading && !account ? (
          <ActivityIndicator color={colors.accent} />
        ) : account ? (
          <Text style={typography.title}>
            {formatUsdCents(account.available)}
          </Text>
        ) : null}
      </View>

      <ErrorBanner message={error} />
      {error ? (
        <Button
          label="Retry"
          onPress={() => {
            pauseAutoRefreshRef.current = false
            void refresh()
          }}
          variant="secondary"
        />
      ) : null}

      <Button
        label="Add funds"
        onPress={() => router.push('/(app)/deposit')}
      />
    </ScrollView>
  )
}
