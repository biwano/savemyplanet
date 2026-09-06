import { useAuth } from '@clerk/expo'
import type { APIRetirementDetail } from 'api-types'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Text, View } from 'react-native'

import { Button, ErrorBanner, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

export default function HistoryScreen() {
  const { getToken } = useAuth()
  const [items, setItems] = useState<APIRetirementDetail[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const res = await api.listRetirements(token)
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
  }, [getToken])

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
        <Text style={typography.muted}>No retirements yet.</Text>
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
