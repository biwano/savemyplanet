import { useAuth, useUser } from '@clerk/expo'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, ErrorBanner, Field, Form } from '@/components/ui'
import { clearAvailableCents } from '@/lib/accountBalanceCache'
import { tabBarBottomPadding } from '@/lib/tabBar'
import { colors, spacing, typography } from '@/lib/theme'

export default function ProfileScreen() {
  const { signOut } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const insets = useSafeAreaInsets()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{
    firstName: string
    lastName: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const firstName = draft?.firstName ?? user?.firstName ?? ''
  const lastName = draft?.lastName ?? user?.lastName ?? ''

  async function onSaveName() {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      })
      setDraft(null)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save name')
    } finally {
      setSaving(false)
    }
  }

  function startEditing() {
    setError(null)
    setDraft({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    })
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(null)
    setEditing(false)
    setError(null)
  }

  const showSignOut = userLoaded && !editing

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.title}>Profile</Text>

        <ErrorBanner message={error} />

        {!userLoaded ? (
          <ActivityIndicator color={colors.accent} />
        ) : editing ? (
          <Form
            onSubmit={() => void onSaveName()}
            disabled={saving || !user}
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
            <Button submit label="Save" busy={saving} />
            <Button
              label="Cancel"
              onPress={cancelEditing}
              variant="secondary"
              disabled={saving}
            />
          </Form>
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={typography.label}>First name</Text>
              <Text style={typography.body}>{user?.firstName || '—'}</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text style={typography.label}>Last name</Text>
              <Text style={typography.body}>{user?.lastName || '—'}</Text>
            </View>
            <Button label="Edit" onPress={startEditing} variant="secondary" />
          </View>
        )}
      </ScrollView>

      {showSignOut ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            // Match tab-bar bottom pad so Sign out isn’t flush above a tall bar.
            paddingBottom: tabBarBottomPadding(insets.bottom),
          }}
        >
          <Button
            label="Sign out"
            onPress={() => {
              clearAvailableCents()
              void signOut()
            }}
            variant="danger"
          />
        </View>
      ) : null}
    </View>
  )
}
