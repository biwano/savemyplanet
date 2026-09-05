import { Hono } from 'hono'
import { accountBalanceFromUser } from '../account/currency'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { rateLimitReads } from '../http/rateLimit'
import { apiUserFromRow } from '../users/api'
import { ensureUserFromClerkId } from '../users/sync'

export const meRoutes = new Hono<{ Variables: AuthVariables }>()

meRoutes.get('/', requireAuth, rateLimitReads, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))

  return c.json({
    user: apiUserFromRow(user),
    account: accountBalanceFromUser(user),
  })
})
