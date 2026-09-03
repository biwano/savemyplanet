import { pgTable, text, timestamp, numeric, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  activityText: text('activity_text').notNull(),
  suggestedTonnes: numeric('suggested_tonnes').notNull(),
  rationale: text('rationale'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
