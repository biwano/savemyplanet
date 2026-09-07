import type { APIRetirementDetail } from 'api-types'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { api } from '@/lib/api'
import { formatTonnes } from '@/lib/format'
import { colors, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

type Listener = () => void

let cachedTonnes = 0
/** False until a successful fetch or publish; invalidate resets this. */
let hydrated = false
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export function sumClearedTonnes(items: APIRetirementDetail[]): number {
  return items.reduce((sum, item) => {
    if (item.status === 'settled' || item.status === 'pending_index') {
      return sum + item.tonnes
    }
    return sum
  }, 0)
}

/** Apply list payload (e.g. History) so the header stays in sync without a second fetch. */
export function publishClearedTonnesFromItems(items: APIRetirementDetail[]) {
  cachedTonnes = sumClearedTonnes(items)
  hydrated = true
  notify()
}

/** After a successful clear so the header refetches on next read. */
export function invalidateClearedTonnes() {
  hydrated = false
  notify()
}

/** Compact header-right: lifetime cleared tonnes (ux brand chrome). */
export function HeaderTotalCleared() {
  const { requireToken } = useAuthRefresh()
  const [tonnes, setTonnes] = useState(cachedTonnes)

  const refreshIfNeeded = useCallback(async () => {
    if (hydrated) {
      setTonnes(cachedTonnes)
      return
    }
    try {
      const res = await api.listRetirements(await requireToken())
      publishClearedTonnesFromItems(res.items)
    } catch {
      // Keep last known value; failures surface on screens that own the load.
    }
  }, [requireToken])

  useEffect(() => {
    const onChange: Listener = () => {
      setTonnes(cachedTonnes)
      if (!hydrated) void refreshIfNeeded()
    }
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [refreshIfNeeded])

  useEffect(() => {
    void refreshIfNeeded()
  }, [refreshIfNeeded])

  if (tonnes <= 0) return null

  return (
    <View
      accessibilityLabel={`My total carbon cleared, ${formatTonnes(tonnes)}`}
      style={styles.wrap}
    >
      <Text style={styles.label} numberOfLines={2}>
        My total carbon cleared
      </Text>
      <Text style={styles.value}>{formatTonnes(tonnes)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    maxWidth: 140,
    paddingRight: 4,
  },
  label: {
    ...typography.muted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'right',
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.accent,
    textAlign: 'right',
  },
})
