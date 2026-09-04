import { Hono } from 'hono'
import { z } from 'zod'
import { accountBalanceFromUser } from '../../account/currency'
import { requireAdmin } from '../../auth/middleware'
import { parseJsonBody } from '../../http/parse'
import { creditFundingManual } from '../../ledger/index'
import { getUserByIdOr404 } from '../../users/sync'

export const accountCreditRoutes = new Hono()

const creditBodySchema = z.object({
  amountCents: z.number().int().positive(),
  userId: z.string().uuid(),
})

/**
 * Dev/admin manual credit in USD cents.
 * Auth: `X-Admin-Key`.
 * Target: local `userId` (never Clerk id).
 */
accountCreditRoutes.post('/', requireAdmin, async (c) => {
  const { amountCents, userId } = await parseJsonBody(c, creditBodySchema)
  const target = await getUserByIdOr404(userId)

  const user = await creditFundingManual({
    userId: target.id,
    amountCents,
  })

  return c.json({ account: accountBalanceFromUser(user) })
})
