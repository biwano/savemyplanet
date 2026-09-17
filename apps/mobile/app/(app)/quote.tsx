import { useAuth, useUser } from '@clerk/expo'
import type { APIQuote } from 'api-types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'

import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { defaultBeneficiaryString } from '@/lib/clearFlow'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

export default function QuoteScreen() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const params = useLocalSearchParams<{ tonnes?: string; message?: string }>()
  const [tonnes, setTonnes] = useState(
    typeof params.tonnes === 'string' ? params.tonnes : '0.1',
  )
  // null = still using Clerk-derived default (so profile name updates apply on load)
  const [beneficiaryString, setBeneficiaryString] = useState<string | null>(null)
  const beneficiaryValue = beneficiaryString ?? defaultBeneficiaryString(user)
  const [message, setMessage] = useState(
    typeof params.message === 'string' ? params.message : '',
  )
  const [quote, setQuote] = useState<APIQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tonnesError, setTonnesError] = useState<string | null>(null)
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onQuote() {
    setError(null)
    setTonnesError(null)
    setQuote(null)
    const tonnesNumber = Number(tonnes)
    if (!Number.isFinite(tonnesNumber) || tonnesNumber <= 0) {
      setTonnesError('Enter a positive tonnage')
      return
    }
    setBusy(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      // Backend auto-picks cheapest liquid class when carbonClass is omitted (S2).
      setQuote(await api.createQuote(token, tonnesNumber))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Quote failed',
      )
    } finally {
      setBusy(false)
    }
  }

  function onContinueToClear() {
    if (!quote) return
    const name = beneficiaryValue.trim()
    if (!name) {
      setBeneficiaryError('Enter a name for the certificate')
      return
    }
    setBeneficiaryError(null)
    router.push({
      pathname: '/(app)/clear',
      params: {
        quoteId: quote.quoteId,
        tonnes: String(quote.tonnes),
        carbonClass: quote.carbonClass,
        userTotal: String(quote.userTotal),
        expiresAt: quote.expiresAt,
        beneficiaryString: name,
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    })
  }

  return (
    <Screen>
      <Text style={typography.title}>Get a quote</Text>
      <ErrorBanner message={error} />

      <Form
        onSubmit={() => {
          if (quote) onContinueToClear()
          else void onQuote()
        }}
        disabled={busy}
      >
        <Field
          label="Tonnes (tCO₂e)"
          value={tonnes}
          onChangeText={(value) => {
            setTonnes(value)
            setTonnesError(null)
            setQuote(null)
          }}
          keyboardType="decimal-pad"
          error={tonnesError}
        />
        <Field
          label="Beneficiary name"
          value={beneficiaryValue}
          onChangeText={(value) => {
            setBeneficiaryString(value)
            setBeneficiaryError(null)
          }}
          placeholder="Name on the certificate"
          error={beneficiaryError}
        />
        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          multiline
        />

        {!quote ? (
          <Button submit label="Get quote" busy={busy} />
        ) : (
          <Button
            label="Get quote"
            onPress={() => void onQuote()}
            busy={busy}
            variant="secondary"
          />
        )}

        {quote && (
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
            <Text style={typography.label}>Your price</Text>
            <Text style={typography.body}>
              {quote.tonnes} t · {formatUsdCents(quote.userTotal)}
            </Text>
            <Text style={typography.muted}>
              Class: {quote.carbonClass}
            </Text>
            <Text style={typography.muted}>
              Expires {new Date(quote.expiresAt).toLocaleString()}
            </Text>
            <Button submit label="Continue" busy={busy} />
          </View>
        )}
      </Form>
    </Screen>
  )
}
