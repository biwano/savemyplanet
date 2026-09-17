import { useAuth, useUser } from '@clerk/expo'
import type { APIQuote } from 'api-types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { defaultBeneficiaryString } from '@/lib/clearFlow'
import { typography } from '@/lib/theme'

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
  const [error, setError] = useState<string | null>(null)
  const [tonnesError, setTonnesError] = useState<string | null>(null)
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pushClear(next: APIQuote, name: string) {
    router.push({
      pathname: '/(app)/clear',
      params: {
        quoteId: next.quoteId,
        tonnes: String(next.tonnes),
        carbonClass: next.carbonClass,
        userTotal: String(next.userTotal),
        expiresAt: next.expiresAt,
        beneficiaryString: name,
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    })
  }

  async function onQuote() {
    setError(null)
    setTonnesError(null)
    setBeneficiaryError(null)
    const tonnesNumber = Number(tonnes)
    if (!Number.isFinite(tonnesNumber) || tonnesNumber <= 0) {
      setTonnesError('Enter a positive tonnage')
      return
    }
    const name = beneficiaryValue.trim()
    if (!name) {
      setBeneficiaryError('Enter a name for the certificate')
      return
    }
    setBusy(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      // Backend auto-picks cheapest liquid class when carbonClass is omitted (S2).
      pushClear(await api.createQuote(token, tonnesNumber), name)
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

  return (
    <Screen>
      <Text style={typography.title}>Get a quote</Text>
      <ErrorBanner message={error} />

      <Form onSubmit={() => void onQuote()} disabled={busy}>
        <Field
          label="Tonnes (tCO₂e)"
          value={tonnes}
          onChangeText={(value) => {
            setTonnes(value)
            setTonnesError(null)
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

        <Button submit label="Get quote" busy={busy} />
      </Form>
    </Screen>
  )
}
