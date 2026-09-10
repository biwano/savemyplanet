import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { AppError } from '../errors'
import {
  KLIMA_RETIRE_MODE_FAKE,
  klimaHeadroomPadBps,
  klimaRetireMode,
} from '../klima/config'
import * as usdcBalance from '../klima/usdcBalance'

/** Columns set with `reserved` → `submitted` (C3 attempt marker before Klima). */
function submittedWithAttemptMarker(): {
  status: 'submitted'
  klimaAttemptAt: Date
  klimaAttemptId: string
  updatedAt: Date
} {
  return {
    status: 'submitted',
    klimaAttemptAt: new Date(),
    klimaAttemptId: randomUUID(),
    updatedAt: new Date(),
  }
}

/**
 * Stable Postgres advisory lock key for C1 Klima wallet headroom claims.
 * Transaction-scoped (`pg_advisory_xact_lock`) so it releases on commit/rollback.
 */
export const KLIMA_HEADROOM_ADVISORY_LOCK_KEY = 4_501_872_014

export type AdmitRetirementForKlimaInput = {
  retirementId: string
  /** Quoted wholesale COGS cents (before prepare-auth). */
  klimaTotalCents: number
}

/**
 * Pad quote COGS for headroom before auth is known (prefer over-admit refusal).
 * In-flight rows with `klima_auth_value_cents` use that value as-is.
 */
export function headroomCeilingCents(
  klimaTotalCents: number,
  padBps: number = klimaHeadroomPadBps(),
): number {
  if (!Number.isInteger(klimaTotalCents) || klimaTotalCents < 0) {
    throw new AppError(400, 'invalid_amount')
  }
  if (!Number.isInteger(padBps) || padBps < 0) {
    throw new AppError(500, 'invalid_headroom_pad')
  }
  // ceil(cents * (10000 + pad) / 10000)
  return Math.ceil((klimaTotalCents * (10_000 + padBps)) / 10_000)
}

function expectedInflightCents(row: {
  klimaAuthValueCents: number | null
  klimaTotalCents: number
}): number {
  if (
    row.klimaAuthValueCents != null &&
    Number.isInteger(row.klimaAuthValueCents)
  ) {
    return row.klimaAuthValueCents
  }
  return headroomCeilingCents(row.klimaTotalCents)
}

/**
 * C1: admit this retirement into the Klima in-flight set (`reserved` → `submitted`)
 * only if live wallet USDC headroom covers existing `submitted` spend + this ceiling.
 *
 * C3: the same CAS writes `klima_attempt_at` / `klima_attempt_id` so a crash
 * mid-Klima is distinguishable from never-admitted (`reserved`) and from
 * `released`. A refused gate never flips status — no zombie `submitted`
 * without an attempt marker.
 *
 * Fake mode skips the wallet check (no USDC) but still flips to `submitted`
 * with the attempt marker. EIP-3009 nonces stay independent — this gate only
 * protects USDC balance.
 *
 * Critical section is DB-only (ms). Live `balanceOf` runs outside the lock.
 */
export async function admitRetirementForKlima(
  input: AdmitRetirementForKlimaInput,
): Promise<void> {
  const thisCeiling = headroomCeilingCents(input.klimaTotalCents)

  if (klimaRetireMode() === KLIMA_RETIRE_MODE_FAKE) {
    await flipReservedToSubmitted(input.retirementId)
    return
  }

  // Namespace import so `vi.spyOn(usdcBalance, …)` in tests always intercepts.
  const liveUsdcCents = await usdcBalance.readServiceWalletUsdcBalanceCents()

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${KLIMA_HEADROOM_ADVISORY_LOCK_KEY})`,
    )

    const inflightRows = await tx
      .select({
        id: retirements.id,
        klimaAuthValueCents: retirements.klimaAuthValueCents,
        klimaTotalCents: quotes.klimaTotalCents,
      })
      .from(retirements)
      .innerJoin(quotes, eq(retirements.quoteId, quotes.id))
      .where(
        and(
          eq(retirements.status, 'submitted'),
          ne(retirements.id, input.retirementId),
        ),
      )

    let inFlightCents = 0
    for (const row of inflightRows) {
      inFlightCents += expectedInflightCents(row)
    }

    if (inFlightCents + thisCeiling > liveUsdcCents) {
      console.warn('klima wallet headroom busy', {
        retirementId: input.retirementId,
        inFlightCents,
        thisCeilingCents: thisCeiling,
        liveUsdcCents,
      })
      throw new AppError(503, 'klima_wallet_busy')
    }

    const [updated] = await tx
      .update(retirements)
      .set(submittedWithAttemptMarker())
      .where(
        and(
          eq(retirements.id, input.retirementId),
          eq(retirements.status, 'reserved'),
        ),
      )
      .returning({ id: retirements.id })

    if (!updated) {
      throw new AppError(409, 'retirement_state_conflict')
    }
  })
}

async function flipReservedToSubmitted(retirementId: string): Promise<void> {
  const [updated] = await db
    .update(retirements)
    .set(submittedWithAttemptMarker())
    .where(
      and(eq(retirements.id, retirementId), eq(retirements.status, 'reserved')),
    )
    .returning({ id: retirements.id })

  if (!updated) {
    throw new AppError(409, 'retirement_state_conflict')
  }
}
