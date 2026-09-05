import { and, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { retirements } from '../db/schema/retirements'
import { users } from '../db/schema/users'
import { AppError } from '../errors'
import { capture } from '../ledger/index'
import { INITIAL_EVALUATIONS_REMAINING } from '../users/quota'

export type SettleRetirementInput = {
  userId: string
  retirementId: string
  amountCents: number
  transactionHash: string
  certificateUrl: string | null
  status: 'settled' | 'pending_index'
}

/**
 * Capture reserved funds, store tx/certificate, set status, reset evaluation quota.
 * Requires the row to still be `submitted` (CAS). Callers that already persisted
 * `txHash` before this (execute / reconcile) still pass it so the settle write is complete.
 */
export async function settleRetirement(
  input: SettleRetirementInput,
): Promise<typeof retirements.$inferSelect> {
  return db.transaction(async (tx) => {
    await capture(
      {
        userId: input.userId,
        amountCents: input.amountCents,
        retirementId: input.retirementId,
      },
      tx,
    )

    const [row] = await tx
      .update(retirements)
      .set({
        status: input.status,
        txHash: input.transactionHash,
        certificateUrl: input.certificateUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retirements.id, input.retirementId),
          eq(retirements.status, 'submitted'),
        ),
      )
      .returning()

    if (!row) {
      throw new AppError(409, 'retirement_state_conflict')
    }

    const [quota] = await tx
      .update(users)
      .set({ evaluationsRemaining: INITIAL_EVALUATIONS_REMAINING })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id })

    if (!quota) {
      throw new AppError(404, 'user_not_found')
    }

    return row
  })
}
