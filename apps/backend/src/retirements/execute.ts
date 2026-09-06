import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { AppError } from '../errors'
import {
  KLIMA_RETIRE_MODE_FAKE,
  klimaRetireMode,
} from '../klima/config'
import { retire as klimaRetire } from '../klima/index'
import { classifyKlimaFailure } from '../klima/errors'
import { release, reserve } from '../ledger/index'
import {
  fakeAuthMicrosFromKlimaTotalCents,
  parseKlimaTotalMicros,
  usdcMicrosToCeilCents,
} from '../pricing/markup'
import { beneficiaryAddressFromUserId } from '../users/beneficiary'
import { apiRetirementFromRow, type APIRetirement } from './api'
import { admitRetirementForKlima } from './headroom'
import { settleRetirement } from './settle'

export type ExecuteRetirementInput = {
  userId: string
  quoteId: string
  beneficiaryString: string
  retirementMessage?: string
}

/**
 * Orchestrate: load quote → reserve → C1 headroom admit → Klima retire →
 * capture (or release on definitive failure).
 * Klima success (`settled` or `pending_index`) resets evaluation quota.
 *
 * C1: real path admits into `submitted` only when live wallet USDC covers
 * in-flight submitted ceilings + this quote (padded). Fake mode skips the
 * wallet check. EIP-3009 nonces are independent — the gate protects balance.
 *
 * C2: definitive Klima failures (explicit 4xx / known no-relay) call
 * `releaseReserved`. Ambiguous outcomes (timeout, network, abort, 5xx,
 * unknown) leave the row `submitted` with funds reserved for reconcile —
 * releasing after an on-chain success would refund the user while credits
 * burn. User HTTP may still be 502/504 (`klima_outcome_unknown`).
 *
 * C3: admit CAS also persists `klima_attempt_at` / `klima_attempt_id` before
 * `klimaRetire()`. `submitted` + null `txHash` + attempt marker ⇒ in flight /
 * crash / ambiguous — do not auto-release (stale attempts stay reserved until
 * ops proves no relay). Never-admitted rows stay `reserved` (no marker).
 *
 * After Klima returns a tx hash, we persist it (and Klima auth spend) on the
 * `submitted` row in its own commit before capture/settle. If local settle then
 * fails, on-read reconcile (see `reconcileSubmittedRetirement`) can finish
 * capture without losing the hash or auth columns.
 */
export async function executeRetirement(
  input: ExecuteRetirementInput,
): Promise<APIRetirement> {
  const beneficiaryString = input.beneficiaryString.trim()
  if (!beneficiaryString) {
    throw new AppError(400, 'invalid_beneficiary_string')
  }

  const retirementMessage = input.retirementMessage?.trim() || undefined

  const { retirementId, amountCents, carbonClass, tonnes, klimaTotalCents } =
    await reserveForQuote({
      userId: input.userId,
      quoteId: input.quoteId,
      beneficiaryString,
      retirementMessage,
    })

  try {
    await admitRetirementForKlima({
      retirementId,
      klimaTotalCents,
    })
  } catch (err) {
    // Free user funds only if we never admitted (still reserved). If status
    // already left reserved, do not release — leave for reconcile / ops.
    const [row] = await db
      .select({ status: retirements.status })
      .from(retirements)
      .where(eq(retirements.id, retirementId))
      .limit(1)
    if (row?.status === 'reserved') {
      await releaseReserved({
        userId: input.userId,
        retirementId,
        amountCents,
      })
    } else {
      console.error(
        'admit failed but retirement not reserved; skipping release',
        { retirementId, status: row?.status, err },
      )
    }
    throw err
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
    if (classifyKlimaFailure(err) === 'ambiguous') {
      // Do not release: Klima may already have relayed. Ops/reconcile finish
      // capture when a txHash appears (or stays reserved until ops proves none).
      console.error(
        'ambiguous klima outcome; leaving submitted for reconcile (funds stay reserved)',
        { retirementId, err },
      )
      if (err instanceof AppError && err.message === 'klima_outcome_unknown') {
        throw err
      }
      throw new AppError(502, 'klima_outcome_unknown')
    }
    await releaseReserved({
      userId: input.userId,
      retirementId,
      amountCents,
    })
    throw err
  }

  const klimaSpend = resolveKlimaSpend({
    klimaResult,
    klimaTotalCents,
  })

  // Persist tx hash + auth spend before capture so a settle failure leaves a
  // recoverable row (docs/plan.md B8 reconcile + F2).
  await persistSubmittedTxHash({
    retirementId,
    transactionHash: klimaResult.transactionHash,
    ...klimaSpend,
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

/** Resolve auth/spend columns for a successful Klima (or fake) retire. */
function resolveKlimaSpend(input: {
  klimaResult: {
    authValueMicros: string | null
    retireTotalMicros: string | null
  }
  klimaTotalCents: number
}): {
  klimaAuthValueMicros: string | null
  klimaAuthValueCents: number | null
  klimaRetireTotalMicros: string | null
} {
  let authMicros = input.klimaResult.authValueMicros
  // Fake path: no prepare-auth — synthesize ceiling from quoted COGS cents.
  if (authMicros == null && klimaRetireMode() === KLIMA_RETIRE_MODE_FAKE) {
    authMicros = String(
      fakeAuthMicrosFromKlimaTotalCents(input.klimaTotalCents),
    )
  }

  if (authMicros == null) {
    return {
      klimaAuthValueMicros: null,
      klimaAuthValueCents: null,
      klimaRetireTotalMicros: input.klimaResult.retireTotalMicros,
    }
  }

  let klimaAuthValueCents: number
  try {
    klimaAuthValueCents = usdcMicrosToCeilCents(parseKlimaTotalMicros(authMicros))
  } catch {
    throw new AppError(502, 'klima_invalid_auth_value')
  }

  return {
    klimaAuthValueMicros: authMicros,
    klimaAuthValueCents,
    klimaRetireTotalMicros: input.klimaResult.retireTotalMicros,
  }
}

async function persistSubmittedTxHash(input: {
  retirementId: string
  transactionHash: string
  klimaAuthValueMicros: string | null
  klimaAuthValueCents: number | null
  klimaRetireTotalMicros: string | null
}): Promise<void> {
  const [updated] = await db
    .update(retirements)
    .set({
      txHash: input.transactionHash,
      klimaAuthValueMicros: input.klimaAuthValueMicros,
      klimaAuthValueCents: input.klimaAuthValueCents,
      klimaRetireTotalMicros: input.klimaRetireTotalMicros,
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
  klimaTotalCents: number
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
      klimaTotalCents: quote.klimaTotalCents,
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
