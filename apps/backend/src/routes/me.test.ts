import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import { createTestUser, deleteTestUserByClerkId } from '../test/db'
import { beneficiaryAddressFromUserId } from '../users/beneficiary'
import { INITIAL_EVALUATIONS_REMAINING } from '../users/quota'
import type { LocalUser } from '../users/sync'

describe('GET /me', () => {
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
    const res = await app.request('/me')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns { user, account } with quota and beneficiaryAddress, without clerkId', async () => {
    const app = createTestApp()
    const res = await app.request('/me', { headers: authHeader() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        evaluationsRemaining: INITIAL_EVALUATIONS_REMAINING,
        beneficiaryAddress: beneficiaryAddressFromUserId(user.id),
      },
      account: {
        available: 0,
        reserved: 0,
        currency: 'USD',
      },
    })
    expect(body.user).not.toHaveProperty('clerkId')
    expect(JSON.stringify(body)).not.toContain(user.clerkId)
  })
})
