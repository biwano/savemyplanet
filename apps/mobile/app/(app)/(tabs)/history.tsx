import type { APIRetirementDetail } from 'api-types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Text, View } from 'react-native'

import { Button, ErrorBanner, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

export default function HistoryScreen() {
  const router = useRouter()
  const { runExclusive, requireToken } = useAuthRefresh()
  const [items, setItems] = useState<APIRetirementDetail[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    await runExclusive(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.listRetirements(await requireToken())
        setItems(res.items)
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load history',
        )
      } finally {
        setLoading(false)
      }
    })
  }, [runExclusive, requireToken])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return (
    <Screen>
      <Text style={typography.title}>History</Text>
      <ErrorBanner message={error} />
      <Button label="Refresh" onPress={() => void refresh()} variant="secondary" />
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : items.length === 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={typography.muted}>Nothing cleared yet.</Text>
          <Button
            label="Estimate an activity"
            onPress={() => router.push('/(app)/evaluate')}
          />
          <Button
            label="Clear carbon"
            onPress={() => router.push('/(app)/retire')}
            variant="secondary"
          />
        </View>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: spacing.md,
              borderWidth: 1,
              borderColor: colors.line,
              gap: spacing.xs,
            }}
          >
            <Text style={typography.body}>
              {item.tonnes} t · {formatUsdCents(item.userTotal)} · {item.status}
            </Text>
            <Text style={typography.muted}>{item.id}</Text>
            {item.certificateUrl ? (
              <Button
                label="Certificate"
                variant="secondary"
                onPress={() => void Linking.openURL(item.certificateUrl!)}
              />
            ) : null}
          </View>
        ))
      )}
    </Screen>
  )
}
