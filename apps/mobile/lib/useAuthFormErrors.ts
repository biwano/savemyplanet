import { useCallback, useState } from 'react'

import {
  clerkAuthErrorMessage,
  clerkAuthFieldTarget,
} from '@/lib/clerkAuthError'

/** Form summary + password/code field errors for Clerk auth screens. */
export function useAuthFormErrors() {
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

  const clearErrors = useCallback(() => {
    setError(null)
    setPasswordError(null)
    setCodeError(null)
  }, [])

  const applyAuthError = useCallback((err: unknown, fallback: string) => {
    const message = clerkAuthErrorMessage(err, fallback)
    const target = clerkAuthFieldTarget(err)
    if (target === 'password') setPasswordError(message)
    else if (target === 'code') setCodeError(message)
    else setError(message)
  }, [])

  const clearPasswordError = useCallback(() => {
    setPasswordError(null)
  }, [])

  const clearCodeError = useCallback(() => {
    setCodeError(null)
  }, [])

  return {
    error,
    setError,
    passwordError,
    codeError,
    clearErrors,
    applyAuthError,
    clearPasswordError,
    clearCodeError,
  }
}
