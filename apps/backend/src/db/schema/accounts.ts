import { pgTable, integer, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  availableCents: integer('available_cents').default(0).notNull(),
  reservedCents: integer('reserved_cents').default(0).notNull(),
})
