import { pgTable, text, timestamp, integer, numeric, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  /** Klima carbon class id (0x…) selected or auto-picked at quote time. */
  carbonClass: text('carbon_class').notNull(),
  tonnes: numeric('tonnes').notNull(),
  markupBps: integer('markup_bps').notNull(),
  userTotalCents: integer('user_total_cents').notNull(),
  klimaTotalCents: integer('klima_total_cents').notNull(), // server-only
  currency: text('currency').default('USD').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
