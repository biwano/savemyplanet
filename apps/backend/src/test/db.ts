import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { users } from '../db/schema/users'

/**
 * Real Drizzle client for integration-style route tests.
 * Uses `DATABASE_URL` from the environment (repo `.env` loaded in `setup.ts`).
 * Prefer a Neon branch URL for isolation; do not point at production.
 */
export { db as testDb }

/** Remove a local user created during a test (ledger rows may block delete). */
export async function deleteTestUserByClerkId(clerkId: string): Promise<void> {
  await db.delete(users).where(eq(users.clerkId, clerkId))
}
