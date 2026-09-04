import { Hono } from 'hono'
import { z } from 'zod'
import { PRESENTMENT_CURRENCIES } from '../../account/currency'
import type { AuthVariables } from '../../auth/middleware'
import { requireAuth } from '../../auth/middleware'
import { parseJsonBody } from '../../http/parse'
import { createDepositPaymentIntent } from '../../stripe/funding'
import { ensureUserFromClerkId } from '../../users/sync'

export const accountDepositRoutes = new Hono<{ Variables: AuthVariables }>()

const depositBodySchema = z.object({
  /** Presentment amount in minor units (USD cents or euro cents). Min $5 / €5. */
  amount: z.number().int().min(500),
  currency: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(PRESENTMENT_CURRENCIES)),
})

accountDepositRoutes.post('/', requireAuth, async (c) => {
  const user = await ensureUserFromClerkId(c.get('clerkUserId'))
  const { amount, currency } = await parseJsonBody(c, depositBodySchema)

  const { clientSecret, paymentIntentId } = await createDepositPaymentIntent({
    userId: user.id,
    amount,
    currency,
  })

  return c.json({ clientSecret, paymentIntentId })
})
