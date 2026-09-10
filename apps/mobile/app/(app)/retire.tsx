import { useAuth, useUser } from '@clerk/expo'
import type { APIQuote, APIRetirement } from 'api-types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Linking, Text, View } from 'react-native'

import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

const MIN_DEPOSIT_CENTS = 500

type ClerkNameSource = {
  firstName: string | null
  lastName: string | null
  primaryEmailAddress?: { emailAddress: string } | null
  emailAddresses: { emailAddress: string }[]
}

/** Prefill Name on certificate: Clerk first+last, else email local-part. */
function defaultBeneficiaryString(user: ClerkNameSource | null | undefined): string {
  const name = [user?.firstName, user?.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ')
  if (name) return name
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress
  if (!email) return ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

function insufficientFundsShortfall(err: ApiError, requiredFallback: number): number {
  const details = err.body.details
  let available = 0
  let required = requiredFallback
  if (details && typeof details === 'object') {
    if (
      'available' in details &&
      typeof (details as { available: unknown }).available === 'number'
    ) {
      available = (details as { available: number }).available
    }
    if (
      'required' in details &&
      typeof (details as { required: unknown }).required === 'number'
    ) {
      required = (details as { required: number }).required
    }
  }
  return Math.max(0, required - available)
}

export default function RetireScreen() {
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
  const [retirement, setRetirement] = useState<APIRetirement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tonnesError, setTonnesError] = useState<string | null>(null)
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null)
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
    const name = beneficiaryValue.trim()
    if (!name) {
      setBeneficiaryError('Enter a name for the certificate')
      return
    }
    setBusy(true)
    setError(null)
    setBeneficiaryError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const result = await api.retire(token, {
        quoteId: quote.quoteId,
        beneficiaryString: name,
        ...(message.trim() ? { retirementMessage: message.trim() } : {}),
      })
      setRetirement(result)
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient_funds') {
        const shortfallCents = insufficientFundsShortfall(err, quote.userTotal)
        router.push({
          pathname: '/(app)/deposit',
          params: {
            returnTo: 'confirm',
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
            : 'Retirement failed',
      )
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
          <Button
            submit
            label="Get quote"
            busy={busy}
          />
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
              Expires {new Date(quote.expiresAt).toLocaleString()}
            </Text>
            <Text style={typography.muted}>
              Retirement is permanent. Confirm only if the amount and attribution look right.
            </Text>
            <Button
              submit
              label="Confirm retire"
              busy={busy}
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
