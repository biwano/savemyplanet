import { eq } from 'drizzle-orm'
import type { User as ClerkUser, UserJSON } from '@clerk/backend'
import { getClerkClient } from '../auth/clerk'
import { db } from '../db/index'
import { users } from '../db/schema/users'
import { AppError } from '../errors'

export type LocalUser = typeof users.$inferSelect

function emailFromUserJSON(data: UserJSON): string {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id,
  )
  const email =
    primary?.email_address ?? data.email_addresses[0]?.email_address
  if (!email) {
    throw new AppError(400, 'clerk_user_missing_email')
  }
  return email
}

function emailFromClerkUser(user: ClerkUser): string {
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress
  if (!email) {
    throw new AppError(400, 'clerk_user_missing_email')
  }
  return email
}

/** Upsert local user (balances default to 0 on insert). */
export async function upsertLocalUser(
  clerkId: string,
  email: string,
): Promise<LocalUser> {
  const [user] = await db
    .insert(users)
    .values({ clerkId, email })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email },
    })
    .returning()

  return user
}

export async function upsertUserFromClerkJSON(
  data: UserJSON,
): Promise<LocalUser> {
  return upsertLocalUser(data.id, emailFromUserJSON(data))
}

/**
 * Load the local user for a Clerk id, creating them if the webhook
 * has not landed yet (fetch profile from Clerk Backend API).
 */
export async function ensureUserFromClerkId(
  clerkUserId: string,
): Promise<LocalUser> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUserId),
  })

  if (existing) {
    return existing
  }

  const clerkUser = await getClerkClient().users.getUser(clerkUserId)
  return upsertLocalUser(clerkUser.id, emailFromClerkUser(clerkUser))
}

export async function getUserByIdOr404(userId: string): Promise<LocalUser> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user) {
    throw new AppError(404, 'user_not_found')
  }
  return user
}
