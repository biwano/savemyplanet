import { Hono } from 'hono'
import { accountBalanceFromUser } from '../account/currency'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { ensureUserFromClerkId } from '../users/sync'

export const meRoutes = new Hono<{ Variables: AuthVariables }>()

meRoutes.get('/', requireAuth, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    },
    account: accountBalanceFromUser(user),
  })
})
