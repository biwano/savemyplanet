import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { retirements } from './retirements'

/** Ledger entry kinds. Amounts are always positive magnitudes; type decides balance effect. */
export const LEDGER_TYPES = ['funding', 'reserve', 'capture', 'release'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  /** Credited/debited USD cents (ledger currency). */
  amountCents: integer('amount_cents').notNull(),
  type: text('type').$type<LedgerType>().notNull(),
  retirementId: uuid('retirement_id').references(() => retirements.id),
  /** Presentment minor units charged by Stripe (funding rows only). */
  presentmentAmountCents: integer('presentment_amount_cents'),
  /** Presentment currency: `usd` | `eur` (funding rows only). */
  presentmentCurrency: text('presentment_currency'),
  /** Stripe PaymentIntent id for idempotent funding credits. */
  stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
