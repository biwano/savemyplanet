import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  activityText: text('activity_text').notNull(),
  suggestedTonnes: numeric('suggested_tonnes').notNull(),
  rationale: text('rationale'),
  /** OpenRouter `usage.cost` (USD credits); null when the provider omitted it. */
  openrouterCostUsd: numeric('openrouter_cost_usd'),
  /** Model id from the completion response, else the requested model. */
  openrouterModel: text('openrouter_model'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
