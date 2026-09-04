import { createHash, timingSafeEqual } from 'node:crypto'
import { verifyToken } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'
import { adminApiKey, clerkSecretKey } from '../config'
import { AppError } from '../errors'

/** Compare secrets without leaking length via early return. */
function secretsEqual(a: string, b: string): boolean {
  const aDigest = createHash('sha256').update(a).digest()
  const bDigest = createHash('sha256').update(b).digest()
  return timingSafeEqual(aDigest, bDigest)
}

export type AuthVariables = {
  clerkUserId: string
}

/**
 * Require `Authorization: Bearer <Clerk session JWT>` on account routes.
 * Sets `clerkUserId` (Clerk `user_…` id) on the context.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'unauthorized')
    }

    const token = header.slice('Bearer '.length).trim()
    if (!token) {
      throw new AppError(401, 'unauthorized')
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: clerkSecretKey(),
      })
      if (!payload.sub) {
        throw new AppError(401, 'unauthorized')
      }
      c.set('clerkUserId', payload.sub)
    } catch (err) {
      if (err instanceof AppError) {
        throw err
      }
      throw new AppError(401, 'unauthorized')
    }

    await next()
  },
)

/**
 * Require admin key via `X-Admin-Key` (not Bearer — avoids clashing with Clerk JWTs).
 * Throws `admin_not_configured` (503) when `ADMIN_API_KEY` is unset.
 */
export const requireAdmin = createMiddleware(async (c, next) => {
  const expected = adminApiKey()
  if (!expected) {
    throw new AppError(503, 'admin_not_configured')
  }

  const provided = c.req.header('X-Admin-Key')?.trim()
  if (!provided || !secretsEqual(provided, expected)) {
    throw new AppError(401, 'unauthorized')
  }

  await next()
})
