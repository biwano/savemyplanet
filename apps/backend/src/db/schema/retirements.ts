import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'
import { quotes } from './quotes'

/**
 * Retirement attempt + certificate. Klima wholesale / auth fields are
 * server-only (never on user HTTP).
 *
 * P&L convention:
 * - quoted COGS = `quotes.klima_total_cents`
 * - authorized COGS = `klima_auth_value_cents` (EIP-3009 / prepare-auth
 *   ceiling; unused budget may refund on-chain — true post-refund spend
 *   may still need chain/indexer later)
 * - contribution margin ≈ user_total − authorized (or quoted) − Stripe
 *   fees − OpenRouter
 *
 * Fake retire (`KLIMA_RETIRE_MODE=fake`): auth columns are a synthetic
 * ceiling from `quotes.klima_total_cents * 10_000` micros (no prepare-auth).
 */
export const retirements = pgTable('retirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  /** One retirement attempt per quote (enforced unique). */
  quoteId: uuid('quote_id')
    .references(() => quotes.id)
    .notNull()
    .unique(),
  status: text('status').notNull(), // reserved, submitted, pending_index, settled, released
  tonnes: numeric('tonnes').notNull(),
  beneficiaryString: text('beneficiary_string').notNull(),
  retirementMessage: text('retirement_message'),
  txHash: text('tx_hash'),
  certificateUrl: text('certificate_url'),
  /**
   * EIP-3009 / prepare-auth `authValue` (USDC 6-decimal base units), the
   * signed authorization ceiling. Null on release/failure; synthetic on fake.
   */
  klimaAuthValueMicros: text('klima_auth_value_micros'),
  /** Ceil of auth micros to USD cents for easy SUM (same spirit as quotes). */
  klimaAuthValueCents: integer('klima_auth_value_cents'),
  /**
   * Optional firm total from `RetireResult.quote.total` when distinct from
   * the auth ceiling. Null when Klima omits it or on fake/failure.
   */
  klimaRetireTotalMicros: text('klima_retire_total_micros'),
  /**
   * C3 attempt marker (server-only): set atomically with `reserved` →
   * `submitted`, before the outbound Klima call. Distinguishes “admitted /
   * in flight / unknown” (`submitted` + attempt + null `tx_hash`) from
   * never-called (still `reserved`) and from `released`. Do not auto-release
   * when attempt is present without a hash — stale attempts stay reserved
   * until ops proves no relay (Cloud Run timeout + margin is a hint only).
   */
  klimaAttemptAt: timestamp('klima_attempt_at'),
  klimaAttemptId: uuid('klima_attempt_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
