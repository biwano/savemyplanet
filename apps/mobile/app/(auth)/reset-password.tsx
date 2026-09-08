import { useSignIn } from '@clerk/expo/legacy'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { BrandMark } from '@/components/BrandMark'
import { Button, ErrorBanner, Field, Form, Screen, useToast } from '@/components/ui'
import { clerkAuthErrorMessage } from '@/lib/clerkAuthError'
import { maskEmail } from '@/lib/format'
import { typography } from '@/lib/theme'

export default function ResetPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSendCode() {
    if (!isLoaded || !signIn) return
    setBusy(true)
    setError(null)
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      })
      setCodeSent(true)
    } catch (err) {
      setError(clerkAuthErrorMessage(err, 'Could not send reset code'))
    } finally {
      setBusy(false)
    }
  }

  async function onReset() {
    if (!isLoaded || !signIn) return
    setBusy(true)
    setError(null)
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        showToast('Password updated')
      } else {
        setError(`Reset incomplete (${result.status})`)
      }
    } catch (err) {
      setError(clerkAuthErrorMessage(err, 'Could not reset password'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BrandMark />
      <Text style={typography.title}>Reset password</Text>
      <ErrorBanner message={error} />
      {!codeSent ? (
        <Form
          onSubmit={() => void onSendCode()}
          disabled={busy || !email.trim()}
        >
          <Text style={typography.muted}>
            Enter your email and we’ll send a one-time code.
          </Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Button submit label={busy ? 'Sending…' : 'Send code'} />
        </Form>
      ) : (
        <Form
          onSubmit={() => void onReset()}
          disabled={busy || !code.trim() || !password}
        >
          <Text style={typography.muted}>
            We sent a verification code to your email address {maskEmail(email)}.
          </Text>
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />
          <Button submit label={busy ? 'Resetting…' : 'Reset password'} />
        </Form>
      )}
      <Link href="/(auth)/sign-in">
        <Text style={typography.muted}>Back to sign in</Text>
      </Link>
    </Screen>
  )
}
