import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ledgerEntries } from '../../db/schema/ledgerEntries'
import { users } from '../../db/schema/users'
import { createTestApp } from '../../test/app'
import { createTestUser, deleteTestUserByClerkId, testDb } from '../../test/db'
import {
  mockStripeConstructEvent,
  mockStripeConstructEventInvalid,
} from '../../test/mocks'
import type { LocalUser } from '../../users/sync'

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

  it('credits USD cents on a valid PaymentIntent', async () => {
    const paymentIntent = {
      id: `pi_test_${user.id.replace(/-/g, '').slice(0, 16)}`,
      object: 'payment_intent',
      amount: 1000,
      amount_received: 1000,
      currency: 'usd',
      metadata: {
        savemyplanet_user_id: user.id,
        savemyplanet_presentment_currency: 'usd',
      },
    } as unknown as Stripe.PaymentIntent

    mockStripeConstructEvent({
      type: 'payment_intent.succeeded',
      data: { object: paymentIntent },
    })

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
      stripePaymentIntentId: paymentIntent.id,
    })
  })
})
