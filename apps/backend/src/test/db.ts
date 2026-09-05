import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index'
import { evaluations } from '../db/schema/evaluations'
import { ledgerEntries } from '../db/schema/ledgerEntries'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { users } from '../db/schema/users'
import { upsertLocalUser, type LocalUser } from '../users/sync'

/**
 * Real Drizzle client for integration-style route tests.
 * Uses `DATABASE_URL` from the environment (repo `.env` loaded in `setup.ts`).
 * Prefer a Neon branch URL for isolation; do not point at production.
 */
export { db as testDb }

export type CreateTestUserOptions = {
  clerkId?: string
  email?: string
}

/** Insert a local user for authenticated route tests (avoids Clerk Backend API). */
export async function createTestUser(
  options: CreateTestUserOptions = {},
): Promise<LocalUser> {
  const clerkId =
    options.clerkId ?? `user_test_${randomUUID().replace(/-/g, '')}`
  const email =
    options.email ?? `test_${randomUUID().replace(/-/g, '')}@example.com`
  return upsertLocalUser(clerkId, email)
}

/** Remove a local user and dependent rows created during a test. */
export async function deleteTestUserByClerkId(clerkId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  })
  if (!user) {
    return
  }

  await db.transaction(async (tx) => {
    await tx.delete(ledgerEntries).where(eq(ledgerEntries.userId, user.id))
    await tx.delete(retirements).where(eq(retirements.userId, user.id))
    await tx.delete(quotes).where(eq(quotes.userId, user.id))
    await tx.delete(evaluations).where(eq(evaluations.userId, user.id))
    await tx.delete(users).where(eq(users.id, user.id))
  })
}
