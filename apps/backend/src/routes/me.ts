import { Hono } from 'hono'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { ensureUserFromClerkId } from '../users/sync'

const ACCOUNT_CURRENCY = 'USD'

export const meRoutes = new Hono<{ Variables: AuthVariables }>()

meRoutes.get('/me', requireAuth, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    },
    account: {
      available: user.availableCents,
      reserved: user.reservedCents,
      currency: ACCOUNT_CURRENCY,
    },
  })
})
