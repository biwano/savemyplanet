import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries } from '../../db/schema/ledgerEntries'
import { users } from '../../db/schema/users'
import { createTestApp } from '../../test/app'
import { adminHeader } from '../../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../../test/db'
import type { LocalUser } from '../../users/sync'

describe('POST /account/credit', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  it('returns 401 without admin key', async () => {
    const app = createTestApp()
    const res = await app.request('/account/credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amountCents: 1000 }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns 401 for a wrong admin key', async () => {
    const app = createTestApp()
    const res = await app.request('/account/credit', {
      method: 'POST',
      headers: {
        ...adminHeader('wrong-key'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: user.id, amountCents: 1000 }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('credits balance for an admin request', async () => {
    const app = createTestApp()
    const res = await app.request('/account/credit', {
      method: 'POST',
      headers: {
        ...adminHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: user.id, amountCents: 2500 }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      account: {
        available: 2500,
        reserved: 0,
        currency: 'USD',
      },
    })

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance).toMatchObject({
      availableCents: 2500,
      reservedCents: 0,
    })

    const entries = await testDb.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.userId, user.id),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amountCents: 2500,
      type: 'funding',
      stripePaymentIntentId: null,
    })
  })
})
