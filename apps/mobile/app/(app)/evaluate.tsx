import { useAuth } from '@clerk/expo'
import type { APIEvaluation } from 'api-types'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { typography } from '@/lib/theme'

export default function EvaluateScreen() {
  const { getToken } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ activity?: string }>()
  const [activity, setActivity] = useState(
    typeof params.activity === 'string' ? params.activity : '',
  )
  const [result, setResult] = useState<APIEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onEvaluate() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const evaluation = await api.evaluate(token, activity.trim())
      setResult(evaluation)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Evaluation failed',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Text style={typography.title}>Estimate carbon emissions</Text>
      <Text style={typography.muted}>
        Describe what you did. The backend suggests tCO₂e — no funding required.
      </Text>
      <ErrorBanner message={error} />
      <Form
        onSubmit={() => void onEvaluate()}
        disabled={busy || activity.trim().length === 0}
      >
        <Field
          label="Activity"
          value={activity}
          onChangeText={setActivity}
          multiline
          placeholder="I flew from Paris to New York round trip"
        />
        <Button submit label={busy ? 'Evaluating…' : 'Evaluate'} />
      </Form>
      {result && (
        <>
          <Text style={typography.label}>Suggestion</Text>
          <Text style={typography.body}>{result.suggestedTonnes} tCO₂e</Text>
          <Text style={typography.muted}>{result.rationale}</Text>
          <Text style={typography.muted}>
            Evaluations remaining: {result.evaluationsRemaining}
          </Text>
          <Button
            label="Use this amount to clear"
            onPress={() =>
              router.push({
                pathname: '/(app)/retire',
                params: { tonnes: String(result.suggestedTonnes) },
              })
            }
          />
        </>
      )}
    </Screen>
  )
}
