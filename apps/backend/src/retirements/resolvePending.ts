import { and, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { retirements } from '../db/schema/retirements'
import { certificate } from '../klima/index'

type RetirementRow = typeof retirements.$inferSelect

/**
 * On-read / job helper: if the row is still `pending_index`, ask Klima
 * `/certificate` by `txHash`. When indexed, store `certificateUrl` and flip
 * to `settled`. Capture and quota reset already happened at pending_index time.
 *
 * Soft-fails on Klima errors or not-yet-indexed (returns the row unchanged)
 * so GET history stays available while the subgraph catches up.
 */
export async function resolvePendingIndexRetirement(
  row: RetirementRow,
): Promise<RetirementRow> {
  if (row.status !== 'pending_index') {
    return row
  }

  if (!row.txHash) {
    console.error('pending_index retirement missing txHash', { id: row.id })
    return row
  }

  let cert
  try {
    cert = await certificate(row.txHash)
  } catch (err) {
    console.error('klima certificate lookup failed:', {
      retirementId: row.id,
      txHash: row.txHash,
      err,
    })
    return row
  }

  if (!cert) {
    return row
  }

  const [updated] = await db
    .update(retirements)
    .set({
      status: 'settled',
      certificateUrl: cert.certificateUrl,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retirements.id, row.id),
        eq(retirements.status, 'pending_index'),
      ),
    )
    .returning()

  if (updated) {
    return updated
  }

  // Concurrent resolve won the race — re-read so the caller sees settled.
  const [fresh] = await db
    .select()
    .from(retirements)
    .where(eq(retirements.id, row.id))
    .limit(1)
  return fresh ?? row
}
