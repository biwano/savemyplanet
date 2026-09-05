import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { users } from '../db/schema/users'
import { AppError } from '../errors'
import { retire as klimaRetire } from '../klima/index'
import { capture, release, reserve } from '../ledger/index'
import { beneficiaryAddressFromUserId } from '../users/beneficiary'
import { INITIAL_EVALUATIONS_REMAINING } from '../users/quota'
import { apiRetirementFromRow, type APIRetirement } from './api'

export type ExecuteRetirementInput = {
  userId: string
  quoteId: string
  beneficiaryString: string
  retirementMessage?: string
}

/**
 * Orchestrate: load quote → reserve → Klima retire → capture (or release on failure).
 * Klima success (`settled` or `pending_index`) resets `evaluations_remaining` to
 * {@link INITIAL_EVALUATIONS_REMAINING}. Klima failure restores balance and leaves
 * the evaluation quota unchanged.
 */
export async function executeRetirement(
  input: ExecuteRetirementInput,
): Promise<APIRetirement> {
  const beneficiaryString = input.beneficiaryString.trim()
  if (!beneficiaryString) {
    throw new AppError(400, 'invalid_beneficiary_string')
  }

  const retirementMessage = input.retirementMessage?.trim() || undefined

  const { retirementId, amountCents, carbonClass, tonnes } =
    await reserveForQuote({
      userId: input.userId,
      quoteId: input.quoteId,
      beneficiaryString,
      retirementMessage,
    })

  const [submitted] = await db
    .update(retirements)
    .set({ status: 'submitted', updatedAt: new Date() })
    .where(
      and(eq(retirements.id, retirementId), eq(retirements.status, 'reserved')),
    )
    .returning({ id: retirements.id })

  if (!submitted) {
    throw new AppError(409, 'retirement_state_conflict')
  }

  let klimaResult
  try {
    klimaResult = await klimaRetire({
      amount: tonnes,
      carbonClass,
      beneficiaryAddress: beneficiaryAddressFromUserId(input.userId),
      beneficiaryString,
      ...(retirementMessage ? { retirementMessage } : {}),
    })
  } catch (err) {
    await releaseReserved({
      userId: input.userId,
      retirementId,
      amountCents,
    })
    throw err
  }

  // Klima may return pending_index when the tx is mined but the certificate
  // is not indexed yet. Capture + reset quota either way; certificate waits
  // for settled (see docs/plan.md B8 follow-up).
  switch (klimaResult.status) {
    case 'pending_index':
      return settleRetirement({
        userId: input.userId,
        retirementId,
        amountCents,
        transactionHash: klimaResult.transactionHash,
        certificateUrl: null,
        status: 'pending_index',
      })
    case 'settled':
      return settleRetirement({
        userId: input.userId,
        retirementId,
        amountCents,
        transactionHash: klimaResult.transactionHash,
        certificateUrl: klimaResult.certificateUrl,
        status: 'settled',
      })
    default:
      // Do not release: tx may already be on-chain (docs/plan.md B8 reconcile follow-up).
      throw new AppError(502, 'klima_invalid_retire_status')
  }
}

async function reserveForQuote(input: {
  userId: string
  quoteId: string
  beneficiaryString: string
  retirementMessage?: string
}): Promise<{
  retirementId: string
  amountCents: number
  carbonClass: string
  tonnes: string
}> {
  return db.transaction(async (tx) => {
    const [quote] = await tx
      .select()
      .from(quotes)
      .where(
        and(eq(quotes.id, input.quoteId), eq(quotes.userId, input.userId)),
      )

    if (!quote) {
      throw new AppError(404, 'quote_not_found')
    }

    if (quote.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'quote_expired')
    }

    // Unique on quote_id: concurrent inserts lose on conflict → quote already used.
    const [row] = await tx
      .insert(retirements)
      .values({
        userId: input.userId,
        quoteId: quote.id,
        status: 'reserved',
        tonnes: quote.tonnes,
        beneficiaryString: input.beneficiaryString,
        retirementMessage: input.retirementMessage,
      })
      .onConflictDoNothing({ target: retirements.quoteId })
      .returning()

    if (!row) {
      throw new AppError(409, 'quote_already_used')
    }

    await reserve(
      {
        userId: input.userId,
        amountCents: quote.userTotalCents,
        retirementId: row.id,
      },
      tx,
    )

    return {
      retirementId: row.id,
      amountCents: quote.userTotalCents,
      carbonClass: quote.carbonClass,
      tonnes: String(quote.tonnes),
    }
  })
}

async function releaseReserved(input: {
  userId: string
  retirementId: string
  amountCents: number
}): Promise<void> {
  await db.transaction(async (tx) => {
    await release(
      {
        userId: input.userId,
        amountCents: input.amountCents,
        retirementId: input.retirementId,
      },
      tx,
    )

    const [updated] = await tx
      .update(retirements)
      .set({ status: 'released', updatedAt: new Date() })
      .where(
        and(
          eq(retirements.id, input.retirementId),
          inArray(retirements.status, ['reserved', 'submitted']),
        ),
      )
      .returning({ id: retirements.id })

    if (!updated) {
      throw new AppError(409, 'retirement_state_conflict')
    }
  })
}

async function settleRetirement(input: {
  userId: string
  retirementId: string
  amountCents: number
  transactionHash: string
  certificateUrl: string | null
  status: 'settled' | 'pending_index'
}): Promise<APIRetirement> {
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

    return apiRetirementFromRow(row)
  })
}
