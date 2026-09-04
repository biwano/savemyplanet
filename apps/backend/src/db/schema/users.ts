import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  availableCents: integer('available_cents').default(0).notNull(),
  reservedCents: integer('reserved_cents').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
