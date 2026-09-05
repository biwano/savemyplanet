import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVariables } from '../../auth/middleware'
import { requireAuth } from '../../auth/middleware'
import { parseJsonBody } from '../../http/parse'
import { rateLimitReads, rateLimitRetirements } from '../../http/rateLimit'
import { apiRetirementDetailFromRow } from '../../retirements/api'
import { executeRetirement } from '../../retirements/execute'
import { listRetirementsForUser } from '../../retirements/load'
import { ensureUserFromClerkId } from '../../users/sync'

export const retirementsRoutes = new Hono<{ Variables: AuthVariables }>()

const createRetirementBodySchema = z.object({
  quoteId: z.string().uuid(),
  beneficiaryString: z.string().trim().min(1).max(200),
  retirementMessage: z.string().trim().max(500).optional(),
})

retirementsRoutes.get('/', requireAuth, rateLimitReads, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const hits = await listRetirementsForUser(user.id)
  return c.json({
    items: hits.map((hit) =>
      apiRetirementDetailFromRow(hit.row, hit.userTotalCents),
    ),
  })
})

retirementsRoutes.post('/', requireAuth, rateLimitRetirements, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const body = await parseJsonBody(c, createRetirementBodySchema)

  const retirement = await executeRetirement({
    userId: user.id,
    quoteId: body.quoteId,
    beneficiaryString: body.beneficiaryString,
    ...(body.retirementMessage
      ? { retirementMessage: body.retirementMessage }
      : {}),
  })

  return c.json(retirement)
})
