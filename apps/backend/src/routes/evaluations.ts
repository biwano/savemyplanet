import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { evaluateActivity } from '../evaluate/index'
import { parseJsonBody } from '../http/parse'
import { rateLimitEvaluations } from '../http/rateLimit'
import { ensureUserFromClerkId } from '../users/sync'

export const evaluationsRoutes = new Hono<{ Variables: AuthVariables }>()

const evaluateBodySchema = z.object({
  activity: z.string().trim().min(1).max(4000),
})

evaluationsRoutes.post('/', requireAuth, rateLimitEvaluations, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const body = await parseJsonBody(c, evaluateBodySchema)

  const evaluation = await evaluateActivity({
    userId: user.id,
    evaluationsRemaining: user.evaluationsRemaining,
    activity: body.activity,
  })

  return c.json(evaluation)
})