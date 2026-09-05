import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { retirements } from '../db/schema/retirements'
import { certificate } from '../klima/index'
import { settleRetirement } from './settle'

type RetirementRow = typeof retirements.$inferSelect

/**
 * On-read / job helper: if the row is stuck at `submitted` with a known
 * `txHash` (Klima succeeded on-chain but local capture/settle failed), look up
 * Klima `/certificate`, then capture and move to `settled` or `pending_index`.
 *
 * Soft-fails on settle races / DB errors (returns the row unchanged) so GET
 * history stays available. Without a `txHash` we cannot recover automatically.
 */
export async function reconcileSubmittedRetirement(
  row: RetirementRow,
  amountCents: number,
): Promise<RetirementRow> {
  if (row.status !== 'submitted') {
    return row
  }

  if (!row.txHash) {
    console.error('submitted retirement missing txHash; cannot reconcile', {
      id: row.id,
    })
    return row
  }

  let cert
  try {
    cert = await certificate(row.txHash)
  } catch (err) {
    console.error('klima certificate lookup failed during submitted reconcile:', {
      retirementId: row.id,
      txHash: row.txHash,
      err,
    })
    cert = null
  }

  try {
    return await settleRetirement({
      userId: row.userId,
      retirementId: row.id,
      amountCents,
      transactionHash: row.txHash,
      certificateUrl: cert?.certificateUrl ?? null,
      status: cert ? 'settled' : 'pending_index',
    })
  } catch (err) {
    // Concurrent reconcile may have already captured (state conflict or
    // reserve_mismatch) — re-read so GET returns the settled/pending row.
    console.error('submitted retirement reconcile settle failed:', {
      retirementId: row.id,
      txHash: row.txHash,
      err,
    })
    const [fresh] = await db
      .select()
      .from(retirements)
      .where(eq(retirements.id, row.id))
      .limit(1)
    return fresh ?? row
  }
}
