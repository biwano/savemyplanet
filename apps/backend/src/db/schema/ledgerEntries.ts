import { sql } from 'drizzle-orm'
import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'
import { retirements } from './retirements'

/** Ledger entry kinds. Amounts are always positive magnitudes; type decides balance effect. */
export const LEDGER_TYPES = ['funding', 'reserve', 'capture', 'release'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
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
    /**
     * Stripe processing fee in settlement currency minor units (funding + PI only).
     * Audit/P&L only — not deducted from `amount_cents` / available balance.
     */
    stripeFeeCents: integer('stripe_fee_cents'),
    /** Net after fees in settlement currency minor units (funding + PI only). */
    stripeNetCents: integer('stripe_net_cents'),
    /**
     * Stripe `balance_transaction.exchange_rate` when presentment ≠ settlement.
     * Null for pure USD presentment (and for manual credits).
     */
    stripeExchangeRate: numeric('stripe_exchange_rate'),
    /** Stripe balance transaction id for Dashboard join (funding + PI only). */
    stripeBalanceTransactionId: text('stripe_balance_transaction_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    /**
     * C4: at most one reserve / capture / release per retirement.
     * Funding rows keep null retirement_id and are excluded.
     * Orchestration still uses CAS; this is belt-and-suspenders.
     */
    uniqueIndex('ledger_entries_retirement_id_type_unique')
      .on(table.retirementId, table.type)
      .where(sql`${table.retirementId} IS NOT NULL`),
  ],
)