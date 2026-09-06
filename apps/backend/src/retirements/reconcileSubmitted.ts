import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { retirements } from '../db/schema/retirements'
import { certificate } from '../klima/index'
import { settleRetirement } from './settle'

type RetirementRow = typeof retirements.$inferSelect

/**
 * On-read / job helper for rows stuck at `submitted`.
 *
 * With `txHash` (Klima succeeded on-chain but local capture/settle failed):
 * look up Klima `/certificate`, then capture and move to `settled` or
 * `pending_index`. Prefer certificate proof; do not invent a hash.
 *
 * Without `txHash` (C2 ambiguous Klima failure / C3 crash mid-call before
 * hash persist): cannot auto-recover — leave reserved/`submitted` and log
 * for ops. Presence of `klima_attempt_at` / `klima_attempt_id` means Klima
 * was (or was about to be) invoked — do **not** invent a hash or auto-release.
 * Stale attempts (e.g. older than Cloud Run timeout + margin) stay reserved
 * until ops or a later policy; manual release only with proof of no relay.
 * Ops path: prove no on-chain retire (manual investigation; optional later:
 * chain/`AuthorizationUsed` indexer), then release only with proof; or if a
 * hash is discovered, set `txHash` and re-run reconcile. Soft-fails on settle
 * races so GET history stays available.
 */
export async function reconcileSubmittedRetirement(
  row: RetirementRow,
  amountCents: number,
): Promise<RetirementRow> {
  if (row.status !== 'submitted') {
    return row
  }

  if (!row.txHash) {
    // C2/C3: ambiguous outcome or crash left submitted without a hash — ops only.
    // Attempt marker (when set) confirms Klima was admitted/invoked.
    console.error(
      'submitted retirement missing txHash; cannot reconcile automatically (ops: prove spend or no-relay before release)',
      {
        id: row.id,
        klimaAttemptAt: row.klimaAttemptAt,
        klimaAttemptId: row.klimaAttemptId,
      },
    )
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
