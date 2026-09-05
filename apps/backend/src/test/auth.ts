import { verifyToken } from '@clerk/backend'
import { vi } from 'vitest'

/** Stable Clerk `user_…` id for auth stubs. */
export const TEST_CLERK_USER_ID = 'user_test_harness'

type VerifyTokenResult = NonNullable<Awaited<ReturnType<typeof verifyToken>>>

/**
 * Make `requireAuth` accept any Bearer token and set `clerkUserId`.
 * Uses the `@clerk/backend` mock from `setup.ts`.
 */
export function mockClerkAuth(
  clerkUserId: string = TEST_CLERK_USER_ID,
): void {
  const payload = { sub: clerkUserId } as VerifyTokenResult
  vi.mocked(verifyToken).mockResolvedValue(payload)
}

/** `Authorization: Bearer …` header for authenticated requests. */
export function authHeader(token = 'test-session-token'): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

/** `X-Admin-Key` matching the harness default (or `ADMIN_API_KEY` from env). */
export function adminHeader(
  key = process.env.ADMIN_API_KEY ?? 'test-admin-key',
): HeadersInit {
  return { 'X-Admin-Key': key }
}
