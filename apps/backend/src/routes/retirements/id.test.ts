import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries } from '../../db/schema/ledgerEntries'
import { retirements } from '../../db/schema/retirements'
import { users } from '../../db/schema/users'
import { AppError } from '../../errors'
import { creditFundingManual, reserve } from '../../ledger/index'
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
import { INITIAL_EVALUATIONS_REMAINING } from '../../users/quota'
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

  /** Simulate Klima success + failed local capture (stuck submitted + reserved). */
  async function stuckSubmittedRetirement(txHash: string) {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 5000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })

    const [row] = await testDb
      .insert(retirements)
      .values({
        userId: user.id,
        quoteId: quote.quoteId,
        status: 'submitted',
        tonnes: String(quote.tonnes),
        beneficiaryString: 'Ada',
        txHash,
      })
      .returning()

    await testDb.transaction(async (tx) => {
      await reserve(
        {
          userId: user.id,
          amountCents: quote.userTotal,
          retirementId: row.id,
        },
        tx,
      )
    })

    await testDb
      .update(users)
      .set({ evaluationsRemaining: 2 })
      .where(eq(users.id, user.id))

    return { id: row.id, quote, txHash }
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

  it('on-read reconciles submitted: captures, stores certificate, flips to settled', async () => {
    const txHash =
      '0x2222222222222222222222222222222222222222222222222222222222222222'
    const { id, quote } = await stuckSubmittedRetirement(txHash)
    const certificateUrl =
      'https://carbonmark.com/retirements/submitted-reconciled'

    mockKlimaCertificate({ transactionHash: txHash, certificateUrl })

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

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, id),
    })
    expect(row).toMatchObject({
      status: 'settled',
      certificateUrl,
      txHash,
    })

    const [balance] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id))
    expect(balance.availableCents).toBe(5000 - quote.userTotal)
    expect(balance.reservedCents).toBe(0)
    expect(balance.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING)

    const entries = await testDb
      .select({ type: ledgerEntries.type, amountCents: ledgerEntries.amountCents })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.retirementId, id),
        ),
      )
    expect(entries).toEqual(
      expect.arrayContaining([
        { type: 'reserve', amountCents: quote.userTotal },
        { type: 'capture', amountCents: quote.userTotal },
      ]),
    )
  })

  it('on-read reconciles submitted to pending_index when certificate not indexed', async () => {
    const txHash =
      '0x3333333333333333333333333333333333333333333333333333333333333333'
    const { id, quote } = await stuckSubmittedRetirement(txHash)
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

    const [balance] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id))
    expect(balance.reservedCents).toBe(0)
    expect(balance.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING)
  })
})
