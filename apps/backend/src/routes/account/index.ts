import { Hono } from 'hono'
import { accountBalanceFromUser } from '../../account/currency'
import type { AuthVariables } from '../../auth/middleware'
import { requireAuth } from '../../auth/middleware'
import { ensureUserFromClerkId } from '../../users/sync'

export const accountRoutes = new Hono<{ Variables: AuthVariables }>()

accountRoutes.get('/', requireAuth, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  return c.json(accountBalanceFromUser(user))
})
