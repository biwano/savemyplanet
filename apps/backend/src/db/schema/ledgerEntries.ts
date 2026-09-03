import { pgTable, text, timestamp, integer, boolean, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { retirements } from './retirements'

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  type: text('type').notNull(), // funding, reserve, capture, release
  retirementId: uuid('retirement_id').references(() => retirements.id),
  isStaged: boolean('is_staged').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
