import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as funding from '../../stripe/funding'
import { createTestApp } from '../../test/app'
import { authHeader, mockClerkAuth } from '../../test/auth'
import { createTestUser, deleteTestUserByClerkId } from '../../test/db'
import { mockCreateDepositPaymentIntent } from '../../test/mocks'
import type { LocalUser } from '../../users/sync'

describe('POST /account/deposit', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
    mockClerkAuth(user.clerkId)
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  it('returns 401 without Authorization', async () => {
    const app = createTestApp()
    const res = await app.request('/account/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, currency: 'usd' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects amount below the $5 / €5 minimum', async () => {
    const app = createTestApp()
    const res = await app.request('/account/deposit', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 499, currency: 'usd' }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('rejects unsupported currency', async () => {
    const app = createTestApp()
    const res = await app.request('/account/deposit', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, currency: 'gbp' }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('returns { clientSecret, paymentIntentId } (Stripe mocked)', async () => {
    mockCreateDepositPaymentIntent({
      clientSecret: 'pi_test_secret',
      paymentIntentId: 'pi_test_id',
    })

    const app = createTestApp()
    const res = await app.request('/account/deposit', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, currency: 'usd' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      clientSecret: 'pi_test_secret',
      paymentIntentId: 'pi_test_id',
    })
    expect(vi.mocked(funding.createDepositPaymentIntent)).toHaveBeenCalledWith({
      userId: user.id,
      amount: 500,
      currency: 'usd',
    })
  })
})
