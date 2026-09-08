import { useAuth } from '@clerk/expo'
import type { APIQuote, APIRetirement } from 'api-types'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Linking, Text, View } from 'react-native'

import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

export default function RetireScreen() {
  const { getToken } = useAuth()
  const params = useLocalSearchParams<{ tonnes?: string }>()
  const [tonnes, setTonnes] = useState(
    typeof params.tonnes === 'string' ? params.tonnes : '0.1',
  )
  const [beneficiaryString, setBeneficiaryString] = useState('ClearMyCarbon')
  const [message, setMessage] = useState('')
  const [quote, setQuote] = useState<APIQuote | null>(null)
  const [retirement, setRetirement] = useState<APIRetirement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tonnesError, setTonnesError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onQuote() {
    setError(null)
    setTonnesError(null)
    setQuote(null)
    setRetirement(null)
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

  async function onConfirmRetire() {
    if (!quote) return
    setBusy(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const result = await api.retire(token, {
        quoteId: quote.quoteId,
        beneficiaryString: beneficiaryString.trim(),
        ...(message.trim() ? { retirementMessage: message.trim() } : {}),
      })
      setRetirement(result)
    } catch (err) {
      const code = err instanceof ApiError ? err.message : null
      if (code === 'insufficient_funds') {
        setError('Insufficient funds — add money to your account, then try again.')
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Retirement failed',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Text style={typography.title}>Quote & retire</Text>
      <Text style={typography.muted}>
        Shows the price you pay. Confirm before clearing — this cannot be undone.
      </Text>
      <ErrorBanner message={error} />

      <Form
        onSubmit={() => {
          if (quote) void onConfirmRetire()
          else void onQuote()
        }}
        disabled={busy || !!retirement}
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
          value={beneficiaryString}
          onChangeText={setBeneficiaryString}
          placeholder="Name on the certificate"
        />
        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          multiline
        />

        {!quote ? (
          <Button
            submit
            label={busy ? 'Getting quote…' : 'Get quote'}
          />
        ) : (
          <Button
            label="Get quote"
            onPress={() => void onQuote()}
            disabled={busy}
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
              Expires {new Date(quote.expiresAt).toLocaleString()}
            </Text>
            <Text style={typography.muted}>
              Retirement is permanent. Confirm only if the amount and attribution look right.
            </Text>
            <Button
              submit
              label={busy ? 'Retiring…' : 'Confirm retire'}
            />
          </View>
        )}
      </Form>

      {retirement && (
        <View
          style={{
            backgroundColor: colors.accentSoft,
            borderRadius: 12,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text style={typography.label}>Retirement</Text>
          <Text style={typography.body}>
            {retirement.id} · {retirement.status}
          </Text>
          {retirement.certificateUrl ? (
            <Button
              label="Open certificate"
              variant="secondary"
              onPress={() => void Linking.openURL(retirement.certificateUrl!)}
            />
          ) : (
            <Text style={typography.muted}>
              Certificate URL appears when status is settled.
            </Text>
          )}
        </View>
      )}
    </Screen>
  )
}
