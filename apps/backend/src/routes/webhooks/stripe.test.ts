import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ledgerEntries } from '../../db/schema/ledgerEntries'
import { users } from '../../db/schema/users'
import * as stripeClient from '../../stripe/client'
import { usdCentsFromPaymentIntent } from '../../stripe/funding'
import { createTestApp } from '../../test/app'
import { createTestUser, deleteTestUserByClerkId, testDb } from '../../test/db'
import {
  mockStripeConstructEvent,
  mockStripeConstructEventInvalid,
} from '../../test/mocks'
import type { LocalUser } from '../../users/sync'

function uniquePaymentIntentId(userId: string, suffix: string): string {
  return `pi_${suffix}_${userId.replace(/-/g, '').slice(0, 16)}`
}

describe('POST /webhooks/stripe', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  it('rejects an invalid signature', async () => {
    mockStripeConstructEventInvalid()

    const app = createTestApp()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'bad',
      },
      body: '{}',
    })
    errorSpy.mockRestore()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_webhook' })
  })

  it('rejects a missing stripe-signature header', async () => {
    const app = createTestApp()
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_webhook' })
  })

  it('credits USD cents and persists fee/net on a valid PaymentIntent', async () => {
    const paymentIntentId = uniquePaymentIntentId(user.id, 'usd')
    const chargeId = `ch_usd_${user.id.replace(/-/g, '').slice(0, 12)}`
    const balanceTxnId = `txn_usd_${user.id.replace(/-/g, '').slice(0, 12)}`

    const paymentIntent = {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 1000,
      amount_received: 1000,
      currency: 'usd',
      latest_charge: chargeId,
      metadata: {
        savemyplanet_user_id: user.id,
        savemyplanet_presentment_currency: 'usd',
      },
    } as unknown as Stripe.PaymentIntent

    mockStripeConstructEvent(
      {
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      },
      {
        balanceTransaction: {
          id: balanceTxnId,
          fee: 59,
          net: 941,
          currency: 'usd',
          exchange_rate: null,
        },
      },
    )

    const app = createTestApp()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'valid',
      },
      body: '{}',
    })
    infoSpy.mockRestore()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance).toMatchObject({
      availableCents: 1000,
      reservedCents: 0,
    })

    const entries = await testDb.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.userId, user.id),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amountCents: 1000,
      type: 'funding',
      presentmentAmountCents: 1000,
      presentmentCurrency: 'usd',
      stripePaymentIntentId: paymentIntentId,
      stripeFeeCents: 59,
      stripeNetCents: 941,
      stripeExchangeRate: null,
      stripeBalanceTransactionId: balanceTxnId,
    })
  })

  it('credits EUR via FX and persists fee/net + exchange_rate', async () => {
    const paymentIntentId = uniquePaymentIntentId(user.id, 'eur')
    const chargeId = `ch_eur_${user.id.replace(/-/g, '').slice(0, 12)}`
    const balanceTxnId = `txn_eur_${user.id.replace(/-/g, '').slice(0, 12)}`
    const exchangeRate = 1.08

    const paymentIntent = {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 1000,
      amount_received: 1000,
      currency: 'eur',
      latest_charge: chargeId,
      metadata: {
        savemyplanet_user_id: user.id,
        savemyplanet_presentment_currency: 'eur',
      },
    } as unknown as Stripe.PaymentIntent

    mockStripeConstructEvent(
      {
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent },
      },
      {
        balanceTransaction: {
          id: balanceTxnId,
          fee: 62,
          // Net after fees — must not be used as the ledger credit.
          net: 1018,
          currency: 'usd',
          exchange_rate: exchangeRate,
        },
      },
    )

    const app = createTestApp()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'valid',
      },
      body: '{}',
    })
    infoSpy.mockRestore()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    const creditedCents = Math.round(1000 * exchangeRate)
    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance).toMatchObject({
      availableCents: creditedCents,
      reservedCents: 0,
    })

    const entries = await testDb.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.userId, user.id),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amountCents: creditedCents,
      type: 'funding',
      presentmentAmountCents: 1000,
      presentmentCurrency: 'eur',
      stripePaymentIntentId: paymentIntentId,
      stripeFeeCents: 62,
      stripeNetCents: 1018,
      stripeBalanceTransactionId: balanceTxnId,
    })
    expect(Number(entries[0].stripeExchangeRate)).toBe(exchangeRate)
  })

  it('is idempotent on PaymentIntent replay', async () => {
    const paymentIntentId = uniquePaymentIntentId(user.id, 'idem')
    const chargeId = `ch_idem_${user.id.replace(/-/g, '').slice(0, 12)}`
    const balanceTxnId = `txn_idem_${user.id.replace(/-/g, '').slice(0, 12)}`

    const paymentIntent = {
      id: paymentIntentId,
      object: 'payment_intent',
      amount: 1500,
      amount_received: 1500,
      currency: 'usd',
      latest_charge: chargeId,
      metadata: {
        savemyplanet_user_id: user.id,
        savemyplanet_presentment_currency: 'usd',
      },
    } as unknown as Stripe.PaymentIntent

    const event = {
      type: 'payment_intent.succeeded',
      data: { object: paymentIntent },
    }
    const bt = {
      balanceTransaction: {
        id: balanceTxnId,
        fee: 73,
        net: 1427,
        currency: 'usd',
        exchange_rate: null as number | null,
      },
    }

    mockStripeConstructEvent(event, bt)

    const app = createTestApp()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const first = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'valid',
      },
      body: '{}',
    })
    expect(first.status).toBe(200)

    mockStripeConstructEvent(event, bt)
    const second = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'valid',
      },
      body: '{}',
    })
    infoSpy.mockRestore()

    expect(second.status).toBe(200)

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.availableCents).toBe(1500)

    const entries = await testDb.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.userId, user.id),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      stripePaymentIntentId: paymentIntentId,
      stripeFeeCents: 73,
      stripeNetCents: 1427,
    })
  })
})

describe('usdCentsFromPaymentIntent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function basePi(
    overrides: Partial<Stripe.PaymentIntent> = {},
  ): Stripe.PaymentIntent {
    return {
      id: 'pi_test',
      object: 'payment_intent',
      amount: 1000,
      amount_received: 1000,
      currency: 'usd',
      latest_charge: 'ch_test',
      metadata: {},
      ...overrides,
    } as Stripe.PaymentIntent
  }

  function mockChargesRetrieve(result: unknown): void {
    vi.spyOn(stripeClient, 'getStripe').mockReturnValue({
      charges: { retrieve: vi.fn().mockResolvedValue(result) },
    } as unknown as Stripe)
  }

  it('fails closed when latest_charge is missing', async () => {
    await expect(
      usdCentsFromPaymentIntent(basePi({ latest_charge: null })),
    ).rejects.toMatchObject({
      name: 'AppError',
      status: 500,
      message: 'stripe_missing_charge',
    })
  })

  it('fails closed when balance_transaction is missing', async () => {
    mockChargesRetrieve({ id: 'ch_test', balance_transaction: null })

    await expect(usdCentsFromPaymentIntent(basePi())).rejects.toMatchObject({
      name: 'AppError',
      status: 500,
      message: 'stripe_missing_balance_transaction',
    })
  })

  it('fails closed when balance_transaction is an unexpanded id', async () => {
    mockChargesRetrieve({
      id: 'ch_test',
      balance_transaction: 'txn_unexpanded',
    })

    await expect(usdCentsFromPaymentIntent(basePi())).rejects.toMatchObject({
      name: 'AppError',
      status: 500,
      message: 'stripe_missing_balance_transaction',
    })
  })

  it('fails closed when fee/net are non-integer', async () => {
    mockChargesRetrieve({
      id: 'ch_test',
      balance_transaction: {
        id: 'txn_test',
        currency: 'usd',
        fee: 59.5,
        net: 940.5,
        exchange_rate: null,
      },
    })

    await expect(usdCentsFromPaymentIntent(basePi())).rejects.toMatchObject({
      name: 'AppError',
      status: 500,
      message: 'stripe_missing_settlement_amounts',
    })
  })
})
