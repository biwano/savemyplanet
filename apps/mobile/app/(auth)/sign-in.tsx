import { useSignIn } from '@clerk/expo/legacy'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { Button, ErrorBanner, Field, Screen } from '@/components/ui'
import { typography } from '@/lib/theme'

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    if (!isLoaded || !signIn) return
    setBusy(true)
    setError(null)
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
      } else {
        setError(
          'Additional verification required. Use the Clerk dashboard for this account.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Text style={typography.brand}>ClearMyCarbon</Text>
      <Text style={typography.muted}>Make peace with your footprint.</Text>
      <ErrorBanner message={error} />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        label={busy ? 'Signing in…' : 'Sign in'}
        onPress={() => void onSubmit()}
        disabled={busy || !email || !password}
      />
      <Link href="/(auth)/sign-up">
        <Text style={typography.muted}>Need an account? Sign up</Text>
      </Link>
    </Screen>
  )
}
