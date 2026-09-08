import { useAuth, useUser } from '@clerk/expo'
import type { APIAccountBalance } from 'api-types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'

import { Button, ErrorBanner, Field, Form } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { formatUsdCents } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'
import { useAuthRefresh } from '@/lib/useAuthRefresh'

export default function AccountScreen() {
  const router = useRouter()
  const { signOut } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { runExclusive, requireToken, pauseAutoRefreshRef } = useAuthRefresh()

  const [account, setAccount] = useState<APIAccountBalance | null>(null)
  const [draft, setDraft] = useState<{
    firstName: string
    lastName: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const firstName = draft?.firstName ?? user?.firstName ?? ''
  const lastName = draft?.lastName ?? user?.lastName ?? ''

  const refresh = useCallback(async () => {
    await runExclusive(async () => {
      setLoading(true)
      setError(null)
      try {
        setAccount(await api.account(await requireToken()))
        pauseAutoRefreshRef.current = false
      } catch (err) {
        pauseAutoRefreshRef.current = true
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load account',
        )
      } finally {
        setLoading(false)
      }
    })
  }, [runExclusive, requireToken, pauseAutoRefreshRef])

  useFocusEffect(
    useCallback(() => {
      if (pauseAutoRefreshRef.current) return
      void refresh()
    }, [refresh, pauseAutoRefreshRef]),
  )

  async function onSaveName() {
    if (!user) return
    setSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      })
      setDraft(null)
      setSaveMessage('Name saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save name')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Text style={typography.title}>Account</Text>

      <ErrorBanner message={error} />
      {error ? (
        <Button
          label="Retry"
          onPress={() => {
            pauseAutoRefreshRef.current = false
            void refresh()
          }}
          variant="secondary"
        />
      ) : null}

      {loading && !account ? (
        <ActivityIndicator color={colors.accent} />
      ) : account ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={typography.label}>Available</Text>
          <Text style={typography.title}>
            {formatUsdCents(account.available)}
          </Text>
        </View>
      ) : null}

      {!userLoaded ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Form
            onSubmit={() => void onSaveName()}
            disabled={saving || !user || draft == null}
          >
            <Field
              label="First name"
              value={firstName}
              onChangeText={(value) =>
                setDraft({ firstName: value, lastName })
              }
              placeholder="First name"
            />
            <Field
              label="Last name"
              value={lastName}
              onChangeText={(value) =>
                setDraft({ firstName, lastName: value })
              }
              placeholder="Last name"
            />
            <Button
              submit
              label={saving ? 'Saving…' : 'Save name'}
              variant="secondary"
            />
          </Form>
          {saveMessage ? (
            <Text style={typography.muted}>{saveMessage}</Text>
          ) : null}
        </>
      )}

      <Button
        label="Add funds"
        onPress={() => router.push('/(app)/deposit')}
      />
      <Button
        label="Sign out"
        onPress={() => void signOut()}
        variant="danger"
      />
    </ScrollView>
  )
}
