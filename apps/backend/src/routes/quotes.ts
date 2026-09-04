import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { parseJsonBody } from '../http/parse'
import { createUserQuote } from '../quotes/create'
import { ensureUserFromClerkId } from '../users/sync'

export const quotesRoutes = new Hono<{ Variables: AuthVariables }>()

const createQuoteBodySchema = z.object({
  tonnes: z.number().finite().positive(),
  carbonClass: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
})

quotesRoutes.post('/', requireAuth, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const body = await parseJsonBody(c, createQuoteBodySchema)

  const quote = await createUserQuote({
    userId: user.id,
    tonnes: body.tonnes,
    ...(body.carbonClass ? { carbonClass: body.carbonClass } : {}),
  })

  return c.json(quote)
})
