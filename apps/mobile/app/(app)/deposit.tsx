import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { ScrollView, Text } from 'react-native'

import { Button, ErrorBanner, Field, Form, useToast } from '@/components/ui'
import { publishAvailableCents } from '@/lib/accountBalanceCache'
import { ApiError, api } from '@/lib/api'
import { hasStripePublishableKey } from '@/lib/config'
import {
  centsToMajorInput,
  formatUsdCents,
  parseMajorToCents,
} from '@/lib/format'
import { DepositCheckout } from '@/lib/stripe/DepositCheckout'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

const MIN_CENTS = 500

function parseParamCents(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) return null
  return n
}

async function waitForBalanceIncrease(
  requireToken: () => Promise<string>,
  beforeAvailable: number,
): Promise<number> {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const account = await api.account(await requireToken())
    if (account.available > beforeAvailable) return account.available
  }
  const account = await api.account(await requireToken())
  return account.available
}

export default function DepositScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    amountCents?: string
    shortfallCents?: string
  }>()
  const { requireToken } = useAuthRefresh()
  const { showToast } = useToast()

  const shortfallCents = parseParamCents(params.shortfallCents)
  const suggestedCents = useMemo(() => {
    const fromParam = parseParamCents(params.amountCents)
    if (fromParam != null) return Math.max(fromParam, MIN_CENTS)
    if (shortfallCents != null) return Math.max(shortfallCents, MIN_CENTS)
    return MIN_CENTS
  }, [params.amountCents, shortfallCents])

  const [amountMajor, setAmountMajor] = useState(centsToMajorInput(suggestedCents))
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [availableBefore, setAvailableBefore] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onStartPay() {
    setError(null)
    setAmountError(null)
    if (!hasStripePublishableKey()) {
      setError('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
      return
    }
    const cents = parseMajorToCents(amountMajor)
    if (cents == null || cents < MIN_CENTS) {
      setAmountError('Minimum deposit is $5.00')
      return
    }
    setBusy(true)
    try {
      const token = await requireToken()
      const account = await api.account(token)
      setAvailableBefore(account.available)
      const res = await api.deposit(token, { amount: cents, currency: 'usd' })
      setClientSecret(res.clientSecret)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not start deposit',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onPaymentSuccess() {
    setBusy(true)
    setError(null)
    try {
      const afterAvailable = await waitForBalanceIncrease(
        requireToken,
        availableBefore,
      )
      publishAvailableCents(afterAvailable)
      const added = afterAvailable - availableBefore
      showToast(
        added > 0
          ? `${formatUsdCents(added)} added to your account`
          : 'Payment received — balance will update shortly',
      )
      setClientSecret(null)
      if (router.canGoBack()) router.back()
      else router.replace('/(app)/(tabs)/funds')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Payment succeeded but balance refresh failed',
      )
      setClientSecret(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={typography.title}>Add funds</Text>

      {shortfallCents != null && shortfallCents > 0 ? (
        <Text style={typography.body}>
          Needed for this clearing: {formatUsdCents(shortfallCents)}
        </Text>
      ) : null}

      <ErrorBanner message={error} />

      {clientSecret ? (
        <DepositCheckout
          clientSecret={clientSecret}
          onSuccess={() => void onPaymentSuccess()}
          onCancel={() => setClientSecret(null)}
        />
      ) : (
        <Form onSubmit={() => void onStartPay()} disabled={busy}>
          <Field
            label="Amount (USD)"
            value={amountMajor}
            onChangeText={(value) => {
              setAmountMajor(value)
              setAmountError(null)
            }}
            keyboardType="decimal-pad"
            placeholder="5.00"
            error={amountError}
          />
          {!amountError ? (
            <Text style={typography.muted}>At least $5.00</Text>
          ) : null}

          <Button submit label={busy ? 'Starting…' : 'Add funds'} />
        </Form>
      )}
    </ScrollView>
  )
}
