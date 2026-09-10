import type { APIEvaluation } from 'api-types'
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { useCallback, useLayoutEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, ErrorBanner, Field, Form, HelpModal } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatTonnesExact } from '@/lib/format'
import { tabBarStyle } from '@/lib/tabBar'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

const MIN_TONNES = 0.001

const ACTIVITY_PLACEHOLDERS = [
  'I heated my apartment with gas for the whole winter.',
  'I ate beef three times a week for a year.',
  'I flew from Paris to New York round trip.',
  'I ran my home office and air conditioning every workday this summer.',
  'I drove 400 km alone in a petrol car.',
  'I bought a new laptop and a smartphone this year.',
] as const

function formatEvaluationsLeft(n: number): string {
  return n === 1 ? '1 evaluation left' : `${n} evaluations left`
}

function evaluationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === 'evaluation_ambiguous') {
      const details = err.body.details
      const rationale =
        details &&
        typeof details === 'object' &&
        'rationale' in details &&
        typeof (details as { rationale: unknown }).rationale === 'string'
          ? (details as { rationale: string }).rationale.trim()
          : ''
      if (rationale) {
        // Avoid duplicating a trailing “try again” if the model already said it.
        if (/try again\.?$/i.test(rationale)) return rationale
        return `${rationale.replace(/\.*$/, '')}. Add those details and try again.`
      }
      return 'That description is too unclear to estimate. Please say what is missing—distance or duration, fuel or energy type, how many people—and try again.'
    }
    if (err.message === 'evaluation_unavailable') {
      return 'Could not estimate right now. Try again in a moment.'
    }
    if (err.message === 'evaluation_quota_exhausted') {
      return 'Quota empty.'
    }
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Evaluation failed'
}

function nextPlaceholderIndex(current: number): number {
  return (current + 1) % ACTIVITY_PLACEHOLDERS.length
}

export default function EvaluateScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ activity?: string }>()
  const { runExclusive, requireToken, pauseAutoRefreshRef } = useAuthRefresh()

  const [activity, setActivity] = useState(
    typeof params.activity === 'string' ? params.activity : '',
  )
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [evaluationsRemaining, setEvaluationsRemaining] = useState<
    number | null
  >(null)
  const [result, setResult] = useState<APIEvaluation | null>(null)
  const [tonnes, setTonnes] = useState('')
  const [tonnesError, setTonnesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  const [loadingQuota, setLoadingQuota] = useState(true)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [estimateHelpOpen, setEstimateHelpOpen] = useState(false)

  const showResult = result !== null
  const quotaEmpty =
    !showResult && evaluationsRemaining !== null && evaluationsRemaining <= 0

  // Early Evaluate (input / quota empty) keeps the tab bar; result hides it.
  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: showResult
        ? { display: 'none' }
        : tabBarStyle(insets.bottom),
    })
  }, [navigation, showResult, insets.bottom])

  const refreshQuota = useCallback(async () => {
    await runExclusive(async () => {
      setLoadingQuota(true)
      setQuotaError(null)
      try {
        const me = await api.me(await requireToken())
        setEvaluationsRemaining(me.user.evaluationsRemaining)
        pauseAutoRefreshRef.current = false
      } catch (err) {
        pauseAutoRefreshRef.current = true
        setQuotaError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load evaluations',
        )
      } finally {
        setLoadingQuota(false)
      }
    })
  }, [runExclusive, requireToken, pauseAutoRefreshRef])

  useFocusEffect(
    useCallback(() => {
      setPlaceholderIndex((i) => nextPlaceholderIndex(i))
      if (showResult) return
      if (pauseAutoRefreshRef.current) return
      void refreshQuota()
    }, [refreshQuota, pauseAutoRefreshRef, showResult]),
  )

  async function onEstimate() {
    const trimmed = activity.trim()
    if (!trimmed) return
    if (evaluationsRemaining !== null && evaluationsRemaining <= 0) {
      setResult(null)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const evaluation = await api.evaluate(await requireToken(), trimmed)
      setResult(evaluation)
      setEvaluationsRemaining(evaluation.evaluationsRemaining)
      setTonnes(formatTonnesExact(evaluation.suggestedTonnes))
      setTonnesError(null)
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.message === 'evaluation_quota_exhausted'
      ) {
        setEvaluationsRemaining(0)
        setResult(null)
        setError(null)
        return
      }
      setError(evaluationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function onEstimateSomethingElse() {
    setResult(null)
    setTonnes('')
    setTonnesError(null)
    setError(null)
    setActivity('')
    setEstimateHelpOpen(false)
    setPlaceholderIndex((i) => nextPlaceholderIndex(i))
  }

  function onContinueToClear() {
    if (!result) return
    const tonnesNumber = Number(tonnes.replace(',', '.'))
    if (!Number.isFinite(tonnesNumber) || tonnesNumber < MIN_TONNES) {
      setTonnesError(`Enter at least ${MIN_TONNES} tCO₂e`)
      return
    }
    router.push({
      pathname: '/(app)/retire',
      params: {
        tonnes: String(tonnesNumber),
        message: result.suggestedRetirementMessage,
      },
    })
  }

  if (loadingQuota && evaluationsRemaining === null && !showResult) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: spacing.lg,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  if (quotaEmpty) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.title}>Quota empty.</Text>
        <Text style={typography.body}>
          Please clear carbon to reset the quota.
        </Text>
        <Button
          label="Clear carbon"
          onPress={() => router.push('/(app)/retire')}
        />
        <Button
          label="Back to Home"
          variant="secondary"
          onPress={() => router.replace('/(app)/(tabs)')}
        />
      </ScrollView>
    )
  }

  if (showResult && result) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: spacing.xs,
            rowGap: spacing.xs,
          }}
        >
          <Text style={[typography.label, { flexShrink: 1 }]}>
            Emissions estimation
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About this estimate"
            hitSlop={8}
            onPress={() => setEstimateHelpOpen(true)}
          >
            <SymbolView
              name={{
                ios: 'questionmark.circle',
                android: 'help',
                web: 'help',
              }}
              size={22}
              tintColor={colors.accent}
            />
          </Pressable>
        </View>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '700',
            letterSpacing: -0.5,
            color: colors.ink,
          }}
        >
          {`${formatTonnesExact(result.suggestedTonnes)} tCO₂e`}
        </Text>
        <Text style={typography.body}>{result.rationale}</Text>

        <Form
          onSubmit={onContinueToClear}
          disabled={tonnes.trim().length === 0}
        >
          <Field
            label="Tonnes to clear (tCO₂e)"
            value={tonnes}
            onChangeText={(value) => {
              setTonnes(value)
              setTonnesError(null)
            }}
            keyboardType="decimal-pad"
            error={tonnesError}
          />
          <Button submit label="Clear those emissions" />
        </Form>

        <Button
          label="Estimate another activity"
          variant="secondary"
          onPress={onEstimateSomethingElse}
        />

        <Text style={typography.muted}>
          {formatEvaluationsLeft(result.evaluationsRemaining)}
        </Text>

        <HelpModal
          visible={estimateHelpOpen}
          title="About this estimate"
          onClose={() => setEstimateHelpOpen(false)}
        >
          <Text style={typography.body}>
            This figure is produced by an AI model from the activity you
            described. It is only an estimate — a starting point to help you
            choose an amount — not a measurement of your real emissions.
          </Text>
          <Text style={typography.body}>
            You can edit the tonnes before you clear. Clearing uses the amount
            you confirm, not the AI suggestion alone.
          </Text>
        </HelpModal>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <ErrorBanner message={quotaError ?? error} tone="neutral" />
      {quotaError ? (
        <Button
          label="Retry"
          onPress={() => {
            pauseAutoRefreshRef.current = false
            void refreshQuota()
          }}
          variant="secondary"
        />
      ) : null}

      <Form
        onSubmit={() => void onEstimate()}
        disabled={busy || activity.trim().length === 0}
      >
        <Field
          label="Describe the activity that emitted carbon emissions"
          labelSentenceCase
          labelAccessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tips for a better estimate"
              hitSlop={8}
              onPress={() => setHelpOpen(true)}
            >
              <SymbolView
                name={{
                  ios: 'questionmark.circle',
                  android: 'help',
                  web: 'help',
                }}
                size={22}
                tintColor={colors.accent}
              />
            </Pressable>
          }
          value={activity}
          onChangeText={setActivity}
          multiline
          placeholder={ACTIVITY_PLACEHOLDERS[placeholderIndex]}
        />
        <Button submit label="Estimate" busy={busy} />
      </Form>

      {evaluationsRemaining !== null ? (
        <Text style={typography.muted}>
          {formatEvaluationsLeft(evaluationsRemaining)}
        </Text>
      ) : null}

      <HelpModal
        visible={helpOpen}
        title="Writing a good description"
        onClose={() => setHelpOpen(false)}
      >
        <Text style={typography.body}>
          Include concrete details when you can. Mention the distance or route,
          how long it took, how many people were involved, what kind of vehicle
          or cabin class you used, and how often you do it.
        </Text>
        <Text style={typography.body}>
          For example: “I heated my apartment with gas for the whole winter,”
          “I ate beef three times a week for a year,” or “I flew from Paris to
          New York round trip.”
        </Text>
        <Text style={typography.body}>
          The more detail you give, the better the estimate.
        </Text>
      </HelpModal>
    </ScrollView>
  )
}
