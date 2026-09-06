import { useSignUp } from '@clerk/expo/legacy'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { Button, ErrorBanner, Field, Screen } from '@/components/ui'
import { typography } from '@/lib/theme'

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pendingVerification, setPendingVerification] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    if (!isLoaded || !signUp) return
    setBusy(true)
    setError(null)
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  async function onVerify() {
    if (!isLoaded || !signUp) return
    setBusy(true)
    setError(null)
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
      } else {
        setError('Verification incomplete')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Text style={typography.title}>Create account</Text>
      <Text style={typography.muted}>
        Clerk development instance — email verification required.
      </Text>
      <ErrorBanner message={error} />
      {!pendingVerification ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button
            label={busy ? 'Creating…' : 'Sign up'}
            onPress={() => void onSubmit()}
            disabled={busy || !email || !password}
          />
        </>
      ) : (
        <>
          <Field label="Verification code" value={code} onChangeText={setCode} />
          <Button
            label={busy ? 'Verifying…' : 'Verify email'}
            onPress={() => void onVerify()}
            disabled={busy || !code}
          />
        </>
      )}
      <Link href="/(auth)/sign-in">
        <Text style={typography.muted}>Already have an account? Sign in</Text>
      </Link>
    </Screen>
  )
}
