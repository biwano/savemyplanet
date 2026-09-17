import { useAuth } from '@clerk/expo'
import type { APIRetirement } from 'api-types'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Linking, Text, View } from 'react-native'

import { Button, ErrorBanner, Screen } from '@/components/ui'
import { publishAvailableCents } from '@/lib/accountBalanceCache'
import { ApiError, api } from '@/lib/api'
import {
  MIN_DEPOSIT_CENTS,
  insufficientFundsShortfall,
  isQuoteExpired,
  paramString,
} from '@/lib/clearFlow'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'
import { useCarbonClasses } from '@/lib/useCarbonClasses'

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={typography.label}>{label}</Text>
      <Text style={typography.body}>{value}</Text>
    </View>
  )
}

type LiveQuote = {
  quoteId: string
  tonnes: string
  carbonClass: string
  userTotal: number
  expiresAt: string
}

export default function ClearScreen() {
  const { getToken } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{
    quoteId?: string
    tonnes?: string
    carbonClass?: string
    userTotal?: string
    expiresAt?: string
    beneficiaryString?: string
    message?: string
  }>()

  const initialQuoteId = paramString(params.quoteId)
  const initialTonnes = paramString(params.tonnes)
  const initialCarbonClass = paramString(params.carbonClass)
  const userTotalRaw = paramString(params.userTotal)
  const initialExpiresAt = paramString(params.expiresAt)
  const beneficiaryString = paramString(params.beneficiaryString)
  const message = paramString(params.message)

  const initialUserTotal = userTotalRaw != null ? Number(userTotalRaw) : NaN
  const paramsValid =
    !!initialQuoteId &&
    !!initialTonnes &&
    !!initialCarbonClass &&
    Number.isFinite(initialUserTotal) &&
    initialUserTotal > 0 &&
    !!initialExpiresAt &&
    !!beneficiaryString

  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(() =>
    paramsValid
      ? {
          quoteId: initialQuoteId!,
          tonnes: initialTonnes!,
          carbonClass: initialCarbonClass!,
          userTotal: initialUserTotal,
          expiresAt: initialExpiresAt!,
        }
      : null,
  )
  const { classes } = useCarbonClasses({ preload: true })
  const [availableCents, setAvailableCents] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshingQuote, setRefreshingQuote] = useState(false)
  const [retirement, setRetirement] = useState<APIRetirement | null>(null)
  /** One automatic re-quote per focus cycle (deposit return / expiry). */
  const autoRefreshAttempted = useRef(false)
  const liveQuoteRef = useRef(liveQuote)
  const retirementRef = useRef(retirement)
  // Layout effect: keep refs current before paint / focus handlers (not during render).
  useLayoutEffect(() => {
    liveQuoteRef.current = liveQuote
    retirementRef.current = retirement
  }, [liveQuote, retirement])

  const refreshBalance = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const account = await api.account(token)
      setAvailableCents(account.available)
    } catch {
      // Funds line is helpful but not required to confirm.
    }
  }, [getToken])

  const refreshQuote = useCallback(async (): Promise<LiveQuote | null> => {
    const current = liveQuoteRef.current
    if (!current) return null
    const tonnesNumber = Number(current.tonnes)
    if (!Number.isFinite(tonnesNumber) || tonnesNumber <= 0) return null
    setRefreshingQuote(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const next = await api.createQuote(
        token,
        tonnesNumber,
        current.carbonClass,
      )
      const updated: LiveQuote = {
        quoteId: next.quoteId,
        tonnes: String(next.tonnes),
        carbonClass: next.carbonClass,
        userTotal: next.userTotal,
        expiresAt: next.expiresAt,
      }
      setLiveQuote(updated)
      setError(null)
      return updated
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not refresh quote. Go back and get a new one.',
      )
      return null
    } finally {
      setRefreshingQuote(false)
    }
  }, [getToken])

  useFocusEffect(
    useCallback(() => {
      autoRefreshAttempted.current = false
      void refreshBalance()
      const quote = liveQuoteRef.current
      if (
        quote &&
        !retirementRef.current &&
        isQuoteExpired(quote.expiresAt) &&
        !autoRefreshAttempted.current
      ) {
        autoRefreshAttempted.current = true
        void refreshQuote()
      }
    }, [refreshBalance, refreshQuote]),
  )

  async function ensureFreshQuote(): Promise<LiveQuote | null> {
    if (!liveQuote) return null
    if (!isQuoteExpired(liveQuote.expiresAt)) return liveQuote
    return refreshQuote()
  }

  async function onConfirmAndClear() {
    if (!liveQuote || !beneficiaryString) return
    setBusy(true)
    setError(null)
    try {
      const quote = await ensureFreshQuote()
      if (!quote) {
        setError('Price expired. Go back and get a new quote.')
        return
      }
      const token = await getToken()
      if (!token) throw new Error('Missing session token')

      const retireOnce = (quoteId: string) =>
        api.retire(token, {
          quoteId,
          beneficiaryString,
          ...(message ? { retirementMessage: message } : {}),
        })

      let result: APIRetirement
      try {
        result = await retireOnce(quote.quoteId)
      } catch (err) {
        if (err instanceof ApiError && err.message === 'quote_expired') {
          const refreshed = await refreshQuote()
          if (!refreshed) {
            setError('Price expired. Go back and get a new quote.')
            return
          }
          result = await retireOnce(refreshed.quoteId)
        } else {
          throw err
        }
      }

      setRetirement(result)
      // Quota resets on settle / pending_index; refresh so Evaluate shows 10 again.
      try {
        await api.me(token)
        const account = await api.account(token)
        setAvailableCents(account.available)
        publishAvailableCents(account.available)
      } catch {
        // Clearing already succeeded; quota/balance catch up on next focus.
      }
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient_funds') {
        const shortfallCents = insufficientFundsShortfall(
          err,
          liveQuote.userTotal,
        )
        router.push({
          pathname: '/(app)/deposit',
          params: {
            returnTo: 'clear',
            shortfallCents: String(shortfallCents),
            amountCents: String(Math.max(shortfallCents, MIN_DEPOSIT_CENTS)),
          },
        })
        return
      }
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Clearing failed',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!paramsValid || !liveQuote) {
    return (
      <Screen>
        <Text style={typography.title}>Confirm clearing</Text>
        <ErrorBanner message="Missing clearing details. Go back and get a quote again." />
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    )
  }

  const { tonnes, carbonClass, userTotal, expiresAt } = liveQuote
  const classDisplay =
    classes.find((c) => c.carbonClass === carbonClass)?.name ?? carbonClass
  const shortfall =
    availableCents != null ? Math.max(0, userTotal - availableCents) : null
  const needsFunds = shortfall != null && shortfall > 0
  const afterClearing =
    availableCents != null ? availableCents - userTotal : null
  const ctaBusy = busy || refreshingQuote

  return (
    <Screen>
      <Text style={typography.title}>Confirm clearing</Text>
      <ErrorBanner message={error} />

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.line,
          gap: spacing.md,
        }}
      >
        <RecapRow label="Tonnes" value={`${tonnes} tCO₂e`} />
        <RecapRow label="Carbon class" value={classDisplay} />
        <RecapRow label="Price you pay" value={formatUsdCents(userTotal)} />
        <RecapRow
          label="Price holds until"
          value={new Date(expiresAt).toLocaleString()}
        />
        <RecapRow label="Name on certificate" value={beneficiaryString} />
        {message ? <RecapRow label="Message" value={message} /> : null}
      </View>

      {availableCents != null && (
        <Text style={typography.muted}>
          {needsFunds
            ? `Available ${formatUsdCents(availableCents)} · Need ${formatUsdCents(shortfall!)} more`
            : `Available ${formatUsdCents(availableCents)} · After clearing ${formatUsdCents(afterClearing!)}`}
        </Text>
      )}

      <Text style={typography.muted}>
        Clearing cannot be undone. The certificate attribution is permanent.
      </Text>

      {!retirement ? (
        needsFunds ? (
          <Button
            label="Add funds to continue"
            busy={ctaBusy}
            onPress={() => {
              router.push({
                pathname: '/(app)/deposit',
                params: {
                  returnTo: 'clear',
                  shortfallCents: String(shortfall),
                  amountCents: String(Math.max(shortfall!, MIN_DEPOSIT_CENTS)),
                },
              })
            }}
          />
        ) : (
          <Button
            label="Confirm and clear"
            variant="danger"
            busy={ctaBusy}
            onPress={() => void onConfirmAndClear()}
          />
        )
      ) : null}

      {!retirement ? (
        <Button
          label="Back"
          variant="secondary"
          disabled={ctaBusy}
          onPress={() => router.back()}
        />
      ) : null}

      {retirement && (
        <View
          style={{
            backgroundColor: colors.accentSoft,
            borderRadius: 12,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text style={typography.label}>Cleared</Text>
          <Text style={typography.body}>Your carbon has been cleared.</Text>
          {retirement.certificateUrl ? (
            <Button
              label="Open certificate"
              variant="secondary"
              onPress={() => void Linking.openURL(retirement.certificateUrl!)}
            />
          ) : (
            <Text style={typography.muted}>
              Certificate link appears when clearing finishes settling.
            </Text>
          )}
        </View>
      )}
    </Screen>
  )
}
