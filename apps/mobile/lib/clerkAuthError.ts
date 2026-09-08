const INCORRECT_CODE_MESSAGE =
  'Incorrect verification code. Please check your email and try again.'

type ClerkErrorItem = {
  code?: string
  message?: string
  longMessage?: string
}

function clerkErrorItems(err: unknown): ClerkErrorItem[] {
  if (!err || typeof err !== 'object') return []
  const errors = (err as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return []
  return errors.filter(
    (item): item is ClerkErrorItem =>
      !!item && typeof item === 'object',
  )
}

function itemText(item: ClerkErrorItem): string {
  return `${item.message ?? ''} ${item.longMessage ?? ''}`.toLowerCase()
}

function isIncorrectCodeError(err: unknown): boolean {
  for (const item of clerkErrorItems(err)) {
    if (item.code === 'form_code_incorrect') return true
    if (itemText(item).includes('incorrect code')) return true
  }
  if (err instanceof Error && /incorrect code/i.test(err.message)) return true
  return false
}

/** Incorrect, expired, or other verification-code failures → code field. */
function isCodeFieldError(err: unknown): boolean {
  if (isIncorrectCodeError(err)) return true
  for (const item of clerkErrorItems(err)) {
    if (item.code?.startsWith('form_code')) return true
    if (
      item.code === 'verification_expired' ||
      item.code === 'verification_failed'
    ) {
      return true
    }
    const text = itemText(item)
    if (text.includes('verification code')) return true
    if (text.includes('code') && text.includes('expired')) return true
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    if (message.includes('verification code')) return true
    if (message.includes('code') && message.includes('expired')) return true
  }
  return false
}

function isPasswordFieldError(err: unknown): boolean {
  for (const item of clerkErrorItems(err)) {
    if (item.code?.startsWith('form_password')) return true
  }
  return false
}

/** Which auth field should show the error, if any; otherwise use the form summary. */
export function clerkAuthFieldTarget(
  err: unknown,
): 'code' | 'password' | null {
  if (isCodeFieldError(err)) return 'code'
  if (isPasswordFieldError(err)) return 'password'
  return null
}

/** Map Clerk (and other) auth errors to short user-facing copy. */
export function clerkAuthErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (isIncorrectCodeError(err)) return INCORRECT_CODE_MESSAGE

  const first = clerkErrorItems(err)[0]
  const fromClerk =
    first?.longMessage?.trim() || first?.message?.trim() || null
  if (fromClerk) return fromClerk

  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return fallback
}
