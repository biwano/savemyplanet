import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../errors'
import { creditFundingManual } from '../../ledger/index'
import { retirements } from '../../db/schema/retirements'
import { createUserQuote } from '../../quotes/create'
import { createTestApp } from '../../test/app'
import { authHeader, mockClerkAuth } from '../../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../../test/db'
import {
  mockKlimaCertificate,
  mockKlimaPricing,
  mockKlimaRetire,
} from '../../test/mocks'
import type { LocalUser } from '../../users/sync'

describe('GET /retirements/:id', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
    mockClerkAuth(user.clerkId)
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  async function pendingIndexRetirement() {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 5000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })
    const txHash =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    mockKlimaRetire({
      status: 'pending_index',
      transactionHash: txHash,
      certificateUrl: null,
    })

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string }
    return { id: body.id, quote, txHash }
  }

  it('returns 401 without Authorization', async () => {
    const app = createTestApp()
    const res = await app.request(`/retirements/${randomUUID()}`)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns 400 for a non-uuid id', async () => {
    const app = createTestApp()
    const res = await app.request('/retirements/not-a-uuid', {
      headers: authHeader(),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_retirement_id' })
  })

  it('returns 404 when the retirement does not exist', async () => {
    const app = createTestApp()
    const res = await app.request(`/retirements/${randomUUID()}`, {
      headers: authHeader(),
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'retirement_not_found' })
  })

  it('returns 404 for another user\'s retirement', async () => {
    const other = await createTestUser()
    try {
      mockKlimaPricing()
      await creditFundingManual({ userId: other.id, amountCents: 5000 })
      const quote = await createUserQuote({ userId: other.id, tonnes: 1 })
      mockKlimaRetire()

      mockClerkAuth(other.clerkId)
      const app = createTestApp()
      const create = await app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          beneficiaryString: 'Other',
        }),
      })
      expect(create.status).toBe(200)
      const { id } = (await create.json()) as { id: string }

      mockClerkAuth(user.clerkId)
      const res = await app.request(`/retirements/${id}`, {
        headers: authHeader(),
      })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: 'retirement_not_found' })
    } finally {
      await deleteTestUserByClerkId(other.clerkId)
    }
  })

  it('on-read resolves pending_index: stores certificateUrl and flips to settled', async () => {
    const { id, quote, txHash } = await pendingIndexRetirement()
    const certificateUrl =
      'https://carbonmark.com/retirements/pending-resolved'

    const certSpy = mockKlimaCertificate({
      transactionHash: txHash,
      certificateUrl,
    })

    const app = createTestApp()
    const res = await app.request(`/retirements/${id}`, {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id,
      status: 'settled',
      tonnes: 1,
      userTotal: quote.userTotal,
      certificateUrl,
      txHash,
    })
    expect(certSpy).toHaveBeenCalledWith(txHash)

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, id),
    })
    expect(row).toMatchObject({
      status: 'settled',
      certificateUrl,
      txHash,
    })
  })

  it('leaves pending_index when Klima certificate is not indexed yet', async () => {
    const { id, quote, txHash } = await pendingIndexRetirement()
    mockKlimaCertificate(null)

    const app = createTestApp()
    const res = await app.request(`/retirements/${id}`, {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id,
      status: 'pending_index',
      tonnes: 1,
      userTotal: quote.userTotal,
      txHash,
    })

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, id),
    })
    expect(row).toMatchObject({
      status: 'pending_index',
      certificateUrl: null,
      txHash,
    })
  })

  it('leaves pending_index when Klima certificate lookup errors', async () => {
    const { id, quote, txHash } = await pendingIndexRetirement()
    mockKlimaCertificate(new AppError(502, 'klima_error'))

    const app = createTestApp()
    const res = await app.request(`/retirements/${id}`, {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id,
      status: 'pending_index',
      tonnes: 1,
      userTotal: quote.userTotal,
      txHash,
    })
  })
})
