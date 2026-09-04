import { ACCOUNT_CURRENCY } from '../account/currency'
import type { quotes } from '../db/schema/quotes'

/** Wire shape for POST /quotes (docs/plan.md API contract). */
export type APIQuote = {
  quoteId: string
  carbonClass: string
  tonnes: number
  userTotal: number
  currency: typeof ACCOUNT_CURRENCY
  expiresAt: string
}

export function apiQuoteFromRow(
  row: typeof quotes.$inferSelect,
): APIQuote {
  return {
    quoteId: row.id,
    carbonClass: row.carbonClass,
    tonnes: Number(row.tonnes),
    userTotal: row.userTotalCents,
    currency: ACCOUNT_CURRENCY,
    expiresAt: row.expiresAt.toISOString(),
  }
}
