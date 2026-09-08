import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import {
  getCachedAvailableCents,
  publishAvailableCents,
  subscribeAvailableCents,
} from '@/lib/accountBalanceCache'
import { api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

function TabLabel({
  label,
  focused,
}: {
  label: string
  focused: boolean
}) {
  return (
    <Text
      style={{
        fontSize: 12,
        lineHeight: 16,
        fontWeight: focused ? '700' : '500',
        color: focused ? colors.accent : colors.muted,
      }}
    >
      {label}
    </Text>
  )
}

/** Funds tab: title + live available USD from the shared cache. */
export function FundsTabLabel({ focused }: { focused: boolean }) {
  const { requireToken } = useAuthRefresh()
  const [available, setAvailable] = useState(getCachedAvailableCents())

  useEffect(() => {
    return subscribeAvailableCents(() => {
      setAvailable(getCachedAvailableCents())
    })
  }, [])

  useEffect(() => {
    if (available != null) return
    let cancelled = false
    void (async () => {
      try {
        const account = await api.account(await requireToken())
        if (!cancelled) publishAvailableCents(account.available)
      } catch {
        // Tab chrome stays empty; Funds screen owns the error UI.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [available, requireToken])

  return (
    <View style={{ alignItems: 'center' }}>
      <TabLabel label="Funds" focused={focused} />
      {available != null ? (
        <Text
          style={{
            fontSize: 11,
            lineHeight: 14,
            fontWeight: focused ? '700' : '600',
            color: focused ? colors.accent : colors.muted,
          }}
        >
          {formatUsdCents(available)}
        </Text>
      ) : null}
    </View>
  )
}
