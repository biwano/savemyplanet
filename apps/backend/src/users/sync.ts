import { eq } from 'drizzle-orm'
import type { User as ClerkUser, UserJSON } from '@clerk/backend'
import { getClerkClient } from '../auth/clerk'
import { db } from '../db/index'
import { accounts } from '../db/schema/accounts'
import { users } from '../db/schema/users'
import { AppError } from '../errors'

export type LocalUser = typeof users.$inferSelect
export type LocalAccount = typeof accounts.$inferSelect

export type UserWithAccount = {
  user: LocalUser
  account: LocalAccount
}

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

/** Upsert `users` + ensure a zeroed `accounts` row. */
export async function upsertLocalUser(
  clerkId: string,
  email: string,
): Promise<UserWithAccount> {
  const [user] = await db
    .insert(users)
    .values({ clerkId, email })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email },
    })
    .returning()

  const existingAccount = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  })

  if (existingAccount) {
    return { user, account: existingAccount }
  }

  const [account] = await db
    .insert(accounts)
    .values({ userId: user.id })
    .returning()

  return { user, account }
}

export async function upsertUserFromClerkJSON(
  data: UserJSON,
): Promise<UserWithAccount> {
  return upsertLocalUser(data.id, emailFromUserJSON(data))
}

/**
 * Load the local user+account for a Clerk id, creating them if the webhook
 * has not landed yet (fetch profile from Clerk Backend API).
 */
export async function ensureUserFromClerkId(
  clerkUserId: string,
): Promise<UserWithAccount> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUserId),
  })

  if (existing) {
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, existing.id),
    })
    if (!account) {
      const [created] = await db
        .insert(accounts)
        .values({ userId: existing.id })
        .returning()
      return { user: existing, account: created }
    }
    return { user: existing, account }
  }

  const clerkUser = await getClerkClient().users.getUser(clerkUserId)
  return upsertLocalUser(clerkUser.id, emailFromClerkUser(clerkUser))
}
