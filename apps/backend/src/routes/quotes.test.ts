import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quotes } from '../db/schema/quotes'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../test/db'
import { mockKlimaPricing } from '../test/mocks'
import type { LocalUser } from '../users/sync'

describe('POST /quotes', () => {
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
    const res = await app.request('/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tonnes: 1 }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects tonnes below the minimum', async () => {
    const app = createTestApp()
    const res = await app.request('/quotes', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tonnes: 0.0001 }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: 'tonnes_below_minimum',
    })
  })

  it('rejects non-positive tonnes at the body schema', async () => {
    const app = createTestApp()
    const res = await app.request('/quotes', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tonnes: 0 }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('returns a user-facing quote only (no wholesale Klima fields)', async () => {
    mockKlimaPricing()

    const app = createTestApp()
    const res = await app.request('/quotes', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tonnes: 1 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toEqual({
      quoteId: expect.any(String),
      carbonClass: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      tonnes: 1,
      // $10 wholesale + 40% default markup, ceil to cents → 1400
      userTotal: 1400,
      currency: 'USD',
      expiresAt: expect.any(String),
    })
    expect(body).not.toHaveProperty('klimaTotal')
    expect(body).not.toHaveProperty('klima_total')
    expect(body).not.toHaveProperty('klimaTotalCents')
    expect(body).not.toHaveProperty('humanSummary')
    expect(JSON.stringify(body)).not.toMatch(/klima_total/i)

    const row = await testDb.query.quotes.findFirst({
      where: eq(quotes.id, body.quoteId),
    })
    expect(row).toMatchObject({
      userId: user.id,
      carbonClass: body.carbonClass,
      userTotalCents: 1400,
      // Wholesale stored server-side only; never returned on the wire.
      klimaTotalCents: 1000,
      currency: 'USD',
    })
    expect(Number(row?.tonnes)).toBe(1)
    expect(row?.expiresAt.toISOString()).toBe(body.expiresAt)
  })
})
