import { useAuth } from '@clerk/expo'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Stable Clerk getToken + single-flight guard for focus-driven screen refreshes.
 * `getToken`'s identity churns; keep a ref so refresh callbacks stay `[]`-stable.
 */
export function useAuthRefresh() {
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  const inFlight = useRef(false)
  /** After a failed load, skip focus auto-refresh until the user taps Retry. */
  const pauseAutoRefreshRef = useRef(false)

  const runExclusive = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await fn()
    } finally {
      inFlight.current = false
    }
  }, [])

  const requireToken = useCallback(async () => {
    const token = await getTokenRef.current()
    if (!token) throw new Error('Missing session token')
    return token
  }, [])

  return { runExclusive, requireToken, pauseAutoRefreshRef }
}
