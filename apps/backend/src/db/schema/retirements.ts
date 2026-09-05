import { pgTable, text, timestamp, numeric, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { quotes } from './quotes'

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
