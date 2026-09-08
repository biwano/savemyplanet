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

function isIncorrectCodeError(err: unknown): boolean {
  for (const item of clerkErrorItems(err)) {
    if (item.code === 'form_code_incorrect') return true
    const text = `${item.message ?? ''} ${item.longMessage ?? ''}`.toLowerCase()
    if (text.includes('incorrect code')) return true
  }
  if (err instanceof Error && /incorrect code/i.test(err.message)) return true
  return false
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
