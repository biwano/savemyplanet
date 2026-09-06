import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import {
  isPresentmentCurrency,
  type PresentmentCurrency,
} from '../account/currency'
import { AppError } from '../errors'
import { creditFunding } from '../ledger/index'
import { db } from '../db/index'
import { users } from '../db/schema/users'
import { getStripe } from './client'

const META_USER_ID = 'savemyplanet_user_id'
const META_PRESENTMENT_CURRENCY = 'savemyplanet_presentment_currency'

export type CreateDepositPaymentIntentInput = {
  userId: string
  /** Presentment amount in minor units (cents / euro cents). */
  amount: number
  currency: PresentmentCurrency
}

/**
 * Create a PaymentIntent for account funding.
 * Mobile will confirm with Stripe Payment Sheet using `clientSecret`.
 */
export async function createDepositPaymentIntent(
  input: CreateDepositPaymentIntentInput,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { userId, amount, currency } = input

  if (!Number.isInteger(amount) || amount < 500) {
    // Product minimum $5 / €5 (see docs/product.md); above Stripe's ~$0.50 floor.
    throw new AppError(400, 'invalid_amount', {
      minimum: 500,
    })
  }

  const pi = await getStripe().paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      [META_USER_ID]: userId,
      [META_PRESENTMENT_CURRENCY]: currency,
    },
  })

  if (!pi.client_secret) {
    throw new AppError(500, 'stripe_missing_client_secret')
  }

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
  }
}

export type PaymentIntentUsdCredit = {
  creditedCents: number
  presentmentAmountCents: number
  presentmentCurrency: PresentmentCurrency
  /** Settlement fee in USD cents (platform settles in USD). */
  stripeFeeCents: number
  /** Net after fees in USD cents. */
  stripeNetCents: number
  /** Present when presentment ≠ settlement; null for pure USD. */
  stripeExchangeRate: string | null
  stripeBalanceTransactionId: string
}

/**
 * Convert presentment amount to USD cents using Stripe's balance transaction
 * exchange rate when the charge is not already in USD. Always expands
 * `balance_transaction` (USD and EUR) so fee/net are auditable.
 */
export async function usdCentsFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): Promise<PaymentIntentUsdCredit> {
  const presentmentAmountCents = pi.amount_received || pi.amount
  const rawCurrency = (pi.currency || '').toLowerCase()
  if (!isPresentmentCurrency(rawCurrency)) {
    throw new AppError(400, 'unsupported_currency', { currency: pi.currency })
  }
  const presentmentCurrency = rawCurrency

  const chargeId =
    typeof pi.latest_charge === 'string'
      ? pi.latest_charge
      : pi.latest_charge?.id

  if (!chargeId) {
    throw new AppError(500, 'stripe_missing_charge')
  }

  const charge = await getStripe().charges.retrieve(chargeId, {
    expand: ['balance_transaction'],
  })

  const bt = charge.balance_transaction
  if (!bt || typeof bt === 'string') {
    throw new AppError(500, 'stripe_missing_balance_transaction')
  }

  if (bt.currency !== 'usd') {
    throw new AppError(500, 'stripe_settlement_not_usd', {
      settlementCurrency: bt.currency,
    })
  }

  if (
    !Number.isInteger(bt.fee) ||
    !Number.isInteger(bt.net) ||
    bt.fee < 0 ||
    bt.net < 0
  ) {
    throw new AppError(500, 'stripe_missing_settlement_amounts')
  }

  let creditedCents: number
  let stripeExchangeRate: string | null

  if (presentmentCurrency === 'usd') {
    creditedCents = presentmentAmountCents
    stripeExchangeRate = null
  } else {
    // EUR (or other supported presentment): use Stripe FX when platform settles in USD.
    if (bt.exchange_rate == null) {
      // Do not fall back to bt.amount (net after fees) — that under-credits.
      throw new AppError(500, 'stripe_fx_invalid')
    }

    // Gross USD ≈ presentment minor units * rate, rounded to nearest cent.
    creditedCents = Math.round(presentmentAmountCents * bt.exchange_rate)
    if (creditedCents <= 0) {
      throw new AppError(500, 'stripe_fx_invalid')
    }
    stripeExchangeRate = String(bt.exchange_rate)
  }

  return {
    creditedCents,
    presentmentAmountCents,
    presentmentCurrency,
    stripeFeeCents: bt.fee,
    stripeNetCents: bt.net,
    stripeExchangeRate,
    stripeBalanceTransactionId: bt.id,
  }
}

/** Apply a succeeded PaymentIntent to the user ledger (idempotent). */
export async function creditFromPaymentIntent(
  pi: Stripe.PaymentIntent,
): Promise<{ created: boolean; userId: string }> {
  const userId = pi.metadata?.[META_USER_ID]
  if (!userId) {
    throw new AppError(400, 'stripe_missing_user_metadata')
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!existing) {
    throw new AppError(404, 'user_not_found')
  }

  const credit = await usdCentsFromPaymentIntent(pi)

  const { created } = await creditFunding({
    userId,
    amountCents: credit.creditedCents,
    presentmentAmountCents: credit.presentmentAmountCents,
    presentmentCurrency: credit.presentmentCurrency,
    stripePaymentIntentId: pi.id,
    stripeFeeCents: credit.stripeFeeCents,
    stripeNetCents: credit.stripeNetCents,
    stripeExchangeRate: credit.stripeExchangeRate,
    stripeBalanceTransactionId: credit.stripeBalanceTransactionId,
  })

  return { created, userId }
}
