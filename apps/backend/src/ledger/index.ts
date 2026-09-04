import { eq, sql } from 'drizzle-orm'
import type { PresentmentCurrency } from '../account/currency'
import { db } from '../db/index'
import { ledgerEntries } from '../db/schema/ledgerEntries'
import { users } from '../db/schema/users'
import { AppError } from '../errors'
import type { LocalUser } from '../users/sync'

export type CreditFundingInput = {
  userId: string
  /** USD cents credited to available. */
  amountCents: number
  presentmentAmountCents?: number
  presentmentCurrency?: PresentmentCurrency
  stripePaymentIntentId?: string
}

export type CreditFundingResult = {
  user: LocalUser
  /** False when this PaymentIntent was already credited (idempotent replay). */
  created: boolean
}

/**
 * Credit available balance via a `funding` ledger row.
 * When `stripePaymentIntentId` is set, the insert is idempotent.
 */
export async function creditFunding(
  input: CreditFundingInput,
): Promise<CreditFundingResult> {
  const {
    userId,
    amountCents,
    presentmentAmountCents,
    presentmentCurrency,
    stripePaymentIntentId,
  } = input

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'invalid_amount')
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(ledgerEntries)
      .values({
        userId,
        amountCents,
        type: 'funding',
        presentmentAmountCents,
        presentmentCurrency,
        stripePaymentIntentId,
      })
      .onConflictDoNothing({
        target: ledgerEntries.stripePaymentIntentId,
      })
      .returning({ amountCents: ledgerEntries.amountCents })

    if (inserted.length === 0) {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
      if (!user) {
        throw new AppError(404, 'user_not_found')
      }
      return { created: false, user }
    }

    const [user] = await tx
      .update(users)
      .set({
        availableCents: sql`${users.availableCents} + ${inserted[0].amountCents}`,
      })
      .where(eq(users.id, userId))
      .returning()

    if (!user) {
      throw new AppError(404, 'user_not_found')
    }

    return { created: true, user }
  })
}

/**
 * Admin/manual credit without a Stripe PaymentIntent.
 * Uses a dedicated insert path (no ON CONFLICT on null stripe id).
 */
export async function creditFundingManual(input: {
  userId: string
  amountCents: number
}): Promise<LocalUser> {
  const { userId, amountCents } = input

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'invalid_amount')
  }

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        userId,
        amountCents,
        type: 'funding',
      })
      .returning({ amountCents: ledgerEntries.amountCents })

    const [user] = await tx
      .update(users)
      .set({
        availableCents: sql`${users.availableCents} + ${entry.amountCents}`,
      })
      .where(eq(users.id, userId))
      .returning()

    if (!user) {
      throw new AppError(404, 'user_not_found')
    }

    return user
  })
}

/**
 * Refuse retirement (and similar spends) when available balance cannot cover
 * the marked-up total. Throws `insufficient_funds` (402).
 */
export function assertSufficientFunds(
  user: Pick<LocalUser, 'availableCents'>,
  markedUpTotalCents: number,
): void {
  if (!Number.isInteger(markedUpTotalCents) || markedUpTotalCents < 0) {
    throw new AppError(400, 'invalid_amount')
  }
  if (user.availableCents < markedUpTotalCents) {
    throw new AppError(402, 'insufficient_funds', {
      available: user.availableCents,
      required: markedUpTotalCents,
    })
  }
}
