import { useSignUp } from '@clerk/expo/legacy'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { BrandMark } from '@/components/BrandMark'
import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { maskEmail } from '@/lib/format'
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
      <BrandMark />
      <Text style={typography.title}>Create account</Text>
      <ErrorBanner message={error} />
      {!pendingVerification ? (
        <Form
          onSubmit={() => void onSubmit()}
          disabled={busy || !email || !password}
        >
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
          <Button submit label={busy ? 'Creating…' : 'Sign up'} />
        </Form>
      ) : (
        <Form onSubmit={() => void onVerify()} disabled={busy || !code}>
          <Text style={typography.muted}>
            We sent a verification code to your email address {maskEmail(email)}.
          </Text>
          <Field label="Verification code" value={code} onChangeText={setCode} />
          <Button submit label={busy ? 'Verifying…' : 'Verify email'} />
        </Form>
      )}
      <Link href="/(auth)/sign-in">
        <Text style={typography.muted}>Already have an account? Sign in</Text>
      </Link>
    </Screen>
  )
}
