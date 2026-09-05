import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVariables } from '../../auth/middleware'
import { requireAuth } from '../../auth/middleware'
import { AppError } from '../../errors'
import { rateLimitReads } from '../../http/rateLimit'
import { apiRetirementDetailFromRow } from '../../retirements/api'
import { getRetirementForUser } from '../../retirements/load'
import { ensureUserFromClerkId } from '../../users/sync'

export const retirementByIdRoutes = new Hono<{ Variables: AuthVariables }>()

const idParamSchema = z.string().uuid()

retirementByIdRoutes.get('/', requireAuth, rateLimitReads, async (c) => {
  const parsed = idParamSchema.safeParse(c.req.param('id'))
  if (!parsed.success) {
    throw new AppError(400, 'invalid_retirement_id')
  }

  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const hit = await getRetirementForUser(user.id, parsed.data)

  return c.json(apiRetirementDetailFromRow(hit.row, hit.userTotalCents))
})
