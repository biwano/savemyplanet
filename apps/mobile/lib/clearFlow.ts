import type { ApiError } from './api'

/** Stripe deposit floor — match Deposit screen validation. */
export const MIN_DEPOSIT_CENTS = 500

export type ClerkNameSource = {
  firstName: string | null
  lastName: string | null
  primaryEmailAddress?: { emailAddress: string } | null
  emailAddresses: { emailAddress: string }[]
}

/** Prefill Name on certificate: Clerk first+last, else email local-part. */
export function defaultBeneficiaryString(
  user: ClerkNameSource | null | undefined,
): string {
  const name = [user?.firstName, user?.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ')
  if (name) return name
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress
  if (!email) return ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}

export function paramString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function isQuoteExpired(expiresAt: string): boolean {
  const ms = new Date(expiresAt).getTime()
  return !Number.isFinite(ms) || ms <= Date.now()
}

export function insufficientFundsShortfall(
  err: ApiError,
  requiredFallback: number,
): number {
  const details = err.body.details
  let available = 0
  let required = requiredFallback
  if (details && typeof details === 'object') {
    if (
      'available' in details &&
      typeof (details as { available: unknown }).available === 'number'
    ) {
      available = (details as { available: number }).available
    }
    if (
      'required' in details &&
      typeof (details as { required: unknown }).required === 'number'
    ) {
      required = (details as { required: number }).required
    }
  }
  return Math.max(0, required - available)
}
