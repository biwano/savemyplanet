import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { AppError } from '../errors'
import { reconcileSubmittedRetirement } from './reconcileSubmitted'
import { resolvePendingIndexRetirement } from './resolvePending'

export type RetirementWithQuote = {
  row: typeof retirements.$inferSelect
  userTotalCents: number
}

async function selectForUser(
  userId: string,
  retirementId?: string,
): Promise<RetirementWithQuote[]> {
  const conditions = [eq(retirements.userId, userId)]
  if (retirementId) {
    conditions.push(eq(retirements.id, retirementId))
  }

  return db
    .select({
      row: retirements,
      userTotalCents: quotes.userTotalCents,
    })
    .from(retirements)
    .innerJoin(quotes, eq(retirements.quoteId, quotes.id))
    .where(and(...conditions))
    .orderBy(desc(retirements.createdAt))
}

/**
 * Finish in-flight recoveries on read: stuck `submitted` (capture after Klima
 * success) then `pending_index` (certificate indexing).
 */
async function resolveOnRead(
  row: typeof retirements.$inferSelect,
  userTotalCents: number,
): Promise<typeof retirements.$inferSelect> {
  const afterSubmitted = await reconcileSubmittedRetirement(row, userTotalCents)
  return resolvePendingIndexRetirement(afterSubmitted)
}

/** List retirements for a user; resolve stuck / pending rows on read. */
export async function listRetirementsForUser(
  userId: string,
): Promise<RetirementWithQuote[]> {
  const hits = await selectForUser(userId)
  return Promise.all(
    hits.map(async (hit) => ({
      row: await resolveOnRead(hit.row, hit.userTotalCents),
      userTotalCents: hit.userTotalCents,
    })),
  )
}

/** Load one retirement; resolve stuck / pending rows on read. */
export async function getRetirementForUser(
  userId: string,
  retirementId: string,
): Promise<RetirementWithQuote> {
  const [hit] = await selectForUser(userId, retirementId)
  if (!hit) {
    throw new AppError(404, 'retirement_not_found')
  }

  return {
    row: await resolveOnRead(hit.row, hit.userTotalCents),
    userTotalCents: hit.userTotalCents,
  }
}
