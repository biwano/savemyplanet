import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { AppError } from '../errors'
import { retire as klimaRetire } from '../klima/index'
import { release, reserve } from '../ledger/index'
import { beneficiaryAddressFromUserId } from '../users/beneficiary'
import { apiRetirementFromRow, type APIRetirement } from './api'
import { settleRetirement } from './settle'

export type ExecuteRetirementInput = {
  userId: string
  quoteId: string
  beneficiaryString: string
  retirementMessage?: string
}

/**
 * Orchestrate: load quote → reserve → Klima retire → capture (or release on failure).
 * Klima success (`settled` or `pending_index`) resets evaluation quota.
 * Klima failure restores balance and leaves the evaluation quota unchanged.
 *
 * After Klima returns a tx hash, we persist it on the `submitted` row in its own
 * commit before capture/settle. If local settle then fails, on-read reconcile
 * (see `reconcileSubmittedRetirement`) can finish capture without losing the hash.
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

  // Persist tx hash before capture so a settle failure leaves a recoverable row
  // (docs/plan.md B8 reconcile follow-up).
  await persistSubmittedTxHash({
    retirementId,
    transactionHash: klimaResult.transactionHash,
  })

  // Klima may return pending_index when the tx is mined but the certificate
  // is not indexed yet. Capture + reset quota either way; certificate waits
  // for settled (see docs/plan.md B8 follow-up).
  const settleStatus = klimaResult.status
  if (settleStatus !== 'pending_index' && settleStatus !== 'settled') {
    // Do not release: tx may already be on-chain; hash is persisted for reconcile.
    throw new AppError(502, 'klima_invalid_retire_status')
  }

  try {
    return apiRetirementFromRow(
      await settleRetirement({
        userId: input.userId,
        retirementId,
        amountCents,
        transactionHash: klimaResult.transactionHash,
        certificateUrl:
          settleStatus === 'settled' ? klimaResult.certificateUrl : null,
        status: settleStatus,
      }),
    )
  } catch (err) {
    console.error(
      'settle after klima success failed; retirement left submitted for reconcile',
      {
        retirementId,
        transactionHash: klimaResult.transactionHash,
        err,
      },
    )
    throw err
  }
}

async function persistSubmittedTxHash(input: {
  retirementId: string
  transactionHash: string
}): Promise<void> {
  const [updated] = await db
    .update(retirements)
    .set({
      txHash: input.transactionHash,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retirements.id, input.retirementId),
        eq(retirements.status, 'submitted'),
      ),
    )
    .returning({ id: retirements.id })

  if (!updated) {
    throw new AppError(409, 'retirement_state_conflict')
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
