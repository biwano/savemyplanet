import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../errors'
import * as ledger from '../../ledger/index'
import { creditFundingManual } from '../../ledger/index'
import { ledgerEntries } from '../../db/schema/ledgerEntries'
import { quotes } from '../../db/schema/quotes'
import { retirements } from '../../db/schema/retirements'
import { users } from '../../db/schema/users'
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
import { beneficiaryAddressFromUserId } from '../../users/beneficiary'
import { INITIAL_EVALUATIONS_REMAINING } from '../../users/quota'
import type { LocalUser } from '../../users/sync'

describe('POST /retirements', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
    mockClerkAuth(user.clerkId)
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  async function fundedQuote(amountCents = 5000) {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents })
    return createUserQuote({ userId: user.id, tonnes: 1 })
  }

  it('returns 401 without Authorization', async () => {
    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: '00000000-0000-4000-8000-000000000001',
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects invalid body at the schema', async () => {
    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: 'not-a-uuid',
        beneficiaryString: '',
      }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('returns 404 when the quote does not exist', async () => {
    await creditFundingManual({ userId: user.id, amountCents: 5000 })
    mockKlimaRetire()

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: randomUUID(),
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'quote_not_found' })
  })

  it('returns 402 when available balance is insufficient', async () => {
    mockKlimaPricing()
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ error: 'insufficient_funds' })
  })

  it('settles success: captures balance, stores certificate + Klima auth spend, resets evaluations to 10', async () => {
    const quote = await fundedQuote()
    await testDb
      .update(users)
      .set({ evaluationsRemaining: 3 })
      .where(eq(users.id, user.id))

    const authValueMicros = '10050000' // slightly above $10.00 wholesale
    const retireTotalMicros = '10000000'
    const retireSpy = mockKlimaRetire({
      status: 'settled',
      transactionHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      certificateUrl: 'https://carbonmark.com/retirements/b8-success',
      authValueMicros,
      retireTotalMicros,
    })

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada Lovelace',
        retirementMessage: 'For the planet',
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: expect.any(String),
      status: 'settled',
      createdAt: expect.any(String),
      certificateUrl: 'https://carbonmark.com/retirements/b8-success',
    })
    expect(body).not.toHaveProperty('klimaTotal')
    expect(body).not.toHaveProperty('klimaAuthValueMicros')
    expect(body).not.toHaveProperty('klimaAuthValueCents')
    expect(body).not.toHaveProperty('klimaAttemptAt')
    expect(body).not.toHaveProperty('klimaAttemptId')
    expect(JSON.stringify(body)).not.toMatch(
      /klima_total|klima_auth|klima_attempt|authValue|klimaAttempt/i,
    )

    expect(retireSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1',
        carbonClass: quote.carbonClass,
        beneficiaryAddress: beneficiaryAddressFromUserId(user.id),
        beneficiaryString: 'Ada Lovelace',
        retirementMessage: 'For the planet',
      }),
    )

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, body.id),
    })
    expect(row).toMatchObject({
      userId: user.id,
      quoteId: quote.quoteId,
      status: 'settled',
      beneficiaryString: 'Ada Lovelace',
      retirementMessage: 'For the planet',
      txHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      certificateUrl: 'https://carbonmark.com/retirements/b8-success',
      klimaAuthValueMicros: authValueMicros,
      klimaAuthValueCents: 1005,
      klimaRetireTotalMicros: retireTotalMicros,
    })
    expect(body.createdAt).toBe(row?.createdAt.toISOString())

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
          eq(ledgerEntries.retirementId, body.id),
        ),
      )
    expect(entries).toEqual(
      expect.arrayContaining([
        { type: 'reserve', amountCents: quote.userTotal },
        { type: 'capture', amountCents: quote.userTotal },
      ]),
    )
    expect(entries.some((e) => e.type === 'release')).toBe(false)
  })

  it('on Klima pending_index: captures balance, stores tx + Klima auth spend, resets evaluations to 10', async () => {
    const quote = await fundedQuote()
    await testDb
      .update(users)
      .set({ evaluationsRemaining: 3 })
      .where(eq(users.id, user.id))

    const authValueMicros = '10020000'
    mockKlimaRetire({
      status: 'pending_index',
      transactionHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      certificateUrl: null,
      authValueMicros,
      retireTotalMicros: '10000000',
    })

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada Lovelace',
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: expect.any(String),
      status: 'pending_index',
      createdAt: expect.any(String),
    })
    expect(body).not.toHaveProperty('certificateUrl')
    expect(body).not.toHaveProperty('klimaAuthValueMicros')

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, body.id),
    })
    expect(row).toMatchObject({
      userId: user.id,
      quoteId: quote.quoteId,
      status: 'pending_index',
      txHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      certificateUrl: null,
      klimaAuthValueMicros: authValueMicros,
      klimaAuthValueCents: 1002,
      klimaRetireTotalMicros: '10000000',
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
          eq(ledgerEntries.retirementId, body.id),
        ),
      )
    expect(entries).toEqual(
      expect.arrayContaining([
        { type: 'reserve', amountCents: quote.userTotal },
        { type: 'capture', amountCents: quote.userTotal },
      ]),
    )
    expect(entries.some((e) => e.type === 'release')).toBe(false)
  })

  it('on definitive Klima 4xx: releases reserve, leaves evaluations unchanged', async () => {
    const quote = await fundedQuote()
    await testDb
      .update(users)
      .set({ evaluationsRemaining: 4 })
      .where(eq(users.id, user.id))

    mockKlimaRetire(new AppError(400, 'invalid_amount'))

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_amount' })

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.quoteId, quote.quoteId),
    })
    expect(row).toMatchObject({
      userId: user.id,
      status: 'released',
      certificateUrl: null,
      txHash: null,
      klimaAuthValueMicros: null,
      klimaAuthValueCents: null,
      klimaRetireTotalMicros: null,
    })

    const [balance] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id))
    expect(balance.availableCents).toBe(5000)
    expect(balance.reservedCents).toBe(0)
    expect(balance.evaluationsRemaining).toBe(4)

    const entries = await testDb
      .select({ type: ledgerEntries.type, amountCents: ledgerEntries.amountCents })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.retirementId, row!.id),
        ),
      )
    expect(entries).toEqual(
      expect.arrayContaining([
        { type: 'reserve', amountCents: quote.userTotal },
        { type: 'release', amountCents: quote.userTotal },
      ]),
    )
    expect(entries.some((e) => e.type === 'capture')).toBe(false)
  })

  it('on ambiguous Klima timeout: leaves submitted reserved (no release)', async () => {
    const quote = await fundedQuote()
    await testDb
      .update(users)
      .set({ evaluationsRemaining: 4 })
      .where(eq(users.id, user.id))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockKlimaRetire(new AppError(504, 'klima_outcome_unknown'))

    try {
      const app = createTestApp()
      const res = await app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          beneficiaryString: 'Ada',
        }),
      })

      expect(res.status).toBe(504)
      expect(await res.json()).toMatchObject({ error: 'klima_outcome_unknown' })

      const row = await testDb.query.retirements.findFirst({
        where: eq(retirements.quoteId, quote.quoteId),
      })
      expect(row).toMatchObject({
        userId: user.id,
        status: 'submitted',
        certificateUrl: null,
        txHash: null,
        klimaAuthValueMicros: null,
        klimaAuthValueCents: null,
        klimaRetireTotalMicros: null,
      })
      expect(row!.klimaAttemptAt).toBeInstanceOf(Date)
      expect(row!.klimaAttemptId).toBeTruthy()

      const [balance] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id))
      expect(balance.availableCents).toBe(5000 - quote.userTotal)
      expect(balance.reservedCents).toBe(quote.userTotal)
      expect(balance.evaluationsRemaining).toBe(4)

      const entries = await testDb
        .select({
          type: ledgerEntries.type,
          amountCents: ledgerEntries.amountCents,
        })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, user.id),
            eq(ledgerEntries.retirementId, row!.id),
          ),
        )
      expect(entries).toEqual(
        expect.arrayContaining([
          { type: 'reserve', amountCents: quote.userTotal },
        ]),
      )
      expect(entries.some((e) => e.type === 'release')).toBe(false)
      expect(entries.some((e) => e.type === 'capture')).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('rejects an expired quote', async () => {
    const quote = await fundedQuote()
    await testDb
      .update(quotes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(quotes.id, quote.quoteId))

    mockKlimaRetire()
    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'quote_expired' })
  })

  it('rejects a quote already used by a settled retirement', async () => {
    const quote = await fundedQuote()
    mockKlimaRetire()

    const app = createTestApp()
    const first = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(first.status).toBe(200)

    // Re-fund so the second attempt fails on quote reuse, not balance.
    await creditFundingManual({ userId: user.id, amountCents: 5000 })

    const second = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'quote_already_used' })
  })

  it('rejects a quote already used after a released (failed) attempt', async () => {
    const quote = await fundedQuote()
    mockKlimaRetire(new AppError(400, 'invalid_amount'))

    const app = createTestApp()
    const first = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(first.status).toBe(400)

    mockKlimaRetire()
    const second = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'quote_already_used' })
  })

  it('when capture fails after Klima success: leaves submitted with txHash for reconcile', async () => {
    const quote = await fundedQuote()
    const txHash =
      '0x1111111111111111111111111111111111111111111111111111111111111111'
    mockKlimaRetire({
      status: 'settled',
      transactionHash: txHash,
      certificateUrl: 'https://carbonmark.com/retirements/capture-fail',
    })

    const captureSpy = vi
      .spyOn(ledger, 'capture')
      .mockRejectedValueOnce(new Error('simulated capture failure'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const app = createTestApp()
      const res = await app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          beneficiaryString: 'Ada',
        }),
      })

      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ error: 'internal_error' })

      const row = await testDb.query.retirements.findFirst({
        where: eq(retirements.quoteId, quote.quoteId),
      })
      expect(row).toMatchObject({
        status: 'submitted',
        txHash,
        certificateUrl: null,
      })

      const [balance] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id))
      expect(balance.availableCents).toBe(5000 - quote.userTotal)
      expect(balance.reservedCents).toBe(quote.userTotal)

      const entries = await testDb
        .select({ type: ledgerEntries.type })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.userId, user.id),
            eq(ledgerEntries.retirementId, row!.id),
          ),
        )
      expect(entries).toEqual([{ type: 'reserve' }])
    } finally {
      captureSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})

describe('GET /retirements', () => {
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
    const res = await app.request('/retirements')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('lists retirements and resolves pending_index on read', async () => {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 10_000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })
    const txHash =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    mockKlimaRetire({
      status: 'pending_index',
      transactionHash: txHash,
      certificateUrl: null,
    })

    const app = createTestApp()
    const create = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(create.status).toBe(200)
    const { id } = (await create.json()) as { id: string }

    const certificateUrl =
      'https://carbonmark.com/retirements/list-resolved'
    mockKlimaCertificate({ transactionHash: txHash, certificateUrl })

    const res = await app.request('/retirements', { headers: authHeader() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [
        {
          id,
          status: 'settled',
          tonnes: 1,
          userTotal: quote.userTotal,
          certificateUrl,
          txHash,
        },
      ],
    })

    const row = await testDb.query.retirements.findFirst({
      where: eq(retirements.id, id),
    })
    expect(row).toMatchObject({ status: 'settled', certificateUrl })
  })
})
