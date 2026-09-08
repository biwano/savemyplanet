import { useSignIn } from '@clerk/expo/legacy'
import type { EmailCodeFactor, SignInResource } from '@clerk/expo/types'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { BrandMark } from '@/components/BrandMark'
import { Button, ErrorBanner, Field, Form, Screen } from '@/components/ui'
import { maskEmail } from '@/lib/format'
import { typography } from '@/lib/theme'
import { useAuthFormErrors } from '@/lib/useAuthFormErrors'

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const {
    error,
    setError,
    passwordError,
    codeError,
    clearErrors,
    applyAuthError,
    clearPasswordError,
    clearCodeError,
  } = useAuthFormErrors()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pendingSecondFactor, setPendingSecondFactor] = useState(false)
  const [busy, setBusy] = useState(false)

  async function prepareEmailCodeSecondFactor(attempt: SignInResource) {
    if (!signIn) return
    const emailCodeFactor = attempt.supportedSecondFactors?.find(
      (factor): factor is EmailCodeFactor => factor.strategy === 'email_code',
    )
    if (!emailCodeFactor) {
      setError('Email verification is not available for this account.')
      return
    }
    await signIn.prepareSecondFactor({
      strategy: 'email_code',
      emailAddressId: emailCodeFactor.emailAddressId,
    })
    setPendingSecondFactor(true)
  }

  async function onSubmit() {
    if (!isLoaded || !signIn) return
    setBusy(true)
    clearErrors()
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
      } else if (
        result.status === 'needs_client_trust' ||
        result.status === 'needs_second_factor'
      ) {
        await prepareEmailCodeSecondFactor(result)
      } else {
        setError(`Sign-in incomplete (${result.status})`)
      }
    } catch (err) {
      applyAuthError(err, 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function onVerify() {
    if (!isLoaded || !signIn) return
    setBusy(true)
    clearErrors()
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code: code.trim(),
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
      } else {
        setError('Verification incomplete')
      }
    } catch (err) {
      applyAuthError(err, 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BrandMark />
      <Text style={typography.title}>Sign in</Text>
      <ErrorBanner message={error} />
      {!pendingSecondFactor ? (
        <Form
          onSubmit={() => void onSubmit()}
          disabled={busy || !email.trim() || !password}
        >
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              clearPasswordError()
            }}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            error={passwordError}
          />
          <Button submit label="Sign in" busy={busy} />
          <Link href="/(auth)/reset-password">
            <Text style={typography.muted}>Forgot password?</Text>
          </Link>
        </Form>
      ) : (
        <Form
          onSubmit={() => void onVerify()}
          disabled={busy || !code.trim()}
        >
          <Text style={typography.muted}>
            We sent a verification code to your email address {maskEmail(email)}.
          </Text>
          <Field
            label="Verification code"
            value={code}
            onChangeText={(value) => {
              setCode(value)
              clearCodeError()
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            error={codeError}
          />
          <Button submit label="Verify" busy={busy} />
        </Form>
      )}
      <Link href="/(auth)/sign-up">
        <Text style={typography.muted}>Need an account? Sign up</Text>
      </Link>
    </Screen>
  )
}
