import { verifyToken } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'
import { clerkSecretKey } from '../config'
import { AppError } from '../errors'

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
