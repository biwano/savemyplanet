import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import * as klima from '../klima/index'
import { creditFundingManual } from '../ledger/index'
import { retirements } from '../db/schema/retirements'
import { users } from '../db/schema/users'
import { createUserQuote } from '../quotes/create'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../test/db'
import {
  mockKlimaPricing,
  mockKlimaRetire,
  mockServiceWalletUsdcBalance,
  randomTxHash,
} from '../test/mocks'
import type { LocalUser } from '../users/sync'
import { headroomCeilingCents } from './headroom'

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

describe('headroomCeilingCents', () => {
  it('pads quote COGS by bps (ceil)', () => {
    expect(headroomCeilingCents(1000, 1000)).toBe(1100)
    expect(headroomCeilingCents(1000, 0)).toBe(1000)
    expect(headroomCeilingCents(1, 1000)).toBe(2)
  })
})

describe('C1 Klima wallet headroom', () => {
  let user: LocalUser
  let previousRetireMode: string | undefined
  let previousPad: string | undefined
  let previousFakeStatus: string | undefined

  beforeEach(async () => {
    previousRetireMode = process.env.KLIMA_RETIRE_MODE
    previousPad = process.env.KLIMA_HEADROOM_PAD_BPS
    previousFakeStatus = process.env.KLIMA_FAKE_RETIRE_STATUS
    // Force real path so headroom runs (fake skips the wallet check).
    delete process.env.KLIMA_RETIRE_MODE
    process.env.KLIMA_HEADROOM_PAD_BPS = '1000'

    user = await createTestUser()
    mockClerkAuth(user.clerkId)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    restoreEnv('KLIMA_RETIRE_MODE', previousRetireMode)
    restoreEnv('KLIMA_HEADROOM_PAD_BPS', previousPad)
    restoreEnv('KLIMA_FAKE_RETIRE_STATUS', previousFakeStatus)
    await deleteTestUserByClerkId(user.clerkId)
  })

  async function fundedQuote(amountCents = 50_000) {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents })
    return createUserQuote({ userId: user.id, tonnes: 1 })
  }

  it('allows two concurrent retires when live balance covers both ceilings', async () => {
    // Each quote klima_total = 1000¢; pad 10% → 1100¢; two need 2200¢.
    const retireSpy = mockKlimaRetire()
    const balanceSpy = mockServiceWalletUsdcBalance(5_000)

    const q1 = await fundedQuote()
    const q2 = await fundedQuote()

    const app = createTestApp()
    const [r1, r2] = await Promise.all([
      app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: q1.quoteId,
          beneficiaryString: 'Ada',
        }),
      }),
      app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: q2.quoteId,
          beneficiaryString: 'Ada',
        }),
      }),
    ])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(retireSpy).toHaveBeenCalledTimes(2)
    // Live balance read once per admit (no cache).
    expect(balanceSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('blocks a second retire that would overspend while the first is in-flight', async () => {
    // Budget 1500¢; one padded ceiling 1100¢ fits; second does not.
    mockServiceWalletUsdcBalance(1_500)

    let releaseRetire!: () => void
    const holdRetire = new Promise<void>((resolve) => {
      releaseRetire = resolve
    })

    const retireSpy = vi.spyOn(klima, 'retire').mockImplementation(async () => {
      await holdRetire
      return {
        status: 'settled' as const,
        transactionHash: randomTxHash(),
        certificateUrl: 'https://carbonmark.com/retirements/hold',
        authValueMicros: null,
        retireTotalMicros: null,
      }
    })

    const q1 = await fundedQuote()
    const q2 = await fundedQuote()
    const app = createTestApp()

    const firstPromise = app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q1.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    // Wait until first has admitted and entered Klima (row is submitted).
    await vi.waitFor(() => {
      expect(retireSpy).toHaveBeenCalledTimes(1)
    })

    const second = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q2.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(second.status).toBe(503)
    expect(await second.json()).toEqual({ error: 'klima_wallet_busy' })
    expect(retireSpy).toHaveBeenCalledTimes(1)

    const [secondRow] = await testDb
      .select()
      .from(retirements)
      .where(eq(retirements.quoteId, q2.quoteId))
    expect(secondRow.status).toBe('released')
    // Refused gate never admitted — no attempt marker (C1↔C3).
    expect(secondRow.klimaAttemptAt).toBeNull()
    expect(secondRow.klimaAttemptId).toBeNull()

    releaseRetire()
    const first = await firstPromise
    expect(first.status).toBe(200)
  })

  it('C3: submitted + attempt marker exist before Klima is invoked', async () => {
    mockServiceWalletUsdcBalance(5_000)

    let releaseRetire!: () => void
    const holdRetire = new Promise<void>((resolve) => {
      releaseRetire = resolve
    })

    const retireSpy = vi.spyOn(klima, 'retire').mockImplementation(async () => {
      // Marker must already be durable when Klima runs (same admit CAS).
      const [row] = await testDb
        .select()
        .from(retirements)
        .where(eq(retirements.quoteId, quoteId))
      expect(row?.status).toBe('submitted')
      expect(row?.klimaAttemptAt).toBeInstanceOf(Date)
      expect(row?.klimaAttemptId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(row?.txHash).toBeNull()

      await holdRetire
      return {
        status: 'settled' as const,
        transactionHash: txHash,
        certificateUrl: 'https://carbonmark.com/retirements/c3-attempt',
        authValueMicros: '11000000',
        retireTotalMicros: '10000000',
      }
    })

    const quote = await fundedQuote()
    const quoteId = quote.quoteId
    const txHash = randomTxHash()
    const app = createTestApp()

    const promise = app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    await vi.waitFor(() => {
      expect(retireSpy).toHaveBeenCalledTimes(1)
    })

    releaseRetire()
    const res = await promise
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('settled')
    expect(body).not.toHaveProperty('klimaAttemptAt')
    expect(body).not.toHaveProperty('klimaAttemptId')

    const [finalRow] = await testDb
      .select()
      .from(retirements)
      .where(eq(retirements.quoteId, quoteId))
    expect(finalRow).toMatchObject({
      status: 'settled',
      txHash,
      klimaAuthValueMicros: '11000000',
      klimaAuthValueCents: 1100,
    })
    expect(finalRow.klimaAttemptAt).toBeInstanceOf(Date)
    expect(finalRow.klimaAttemptId).toBeTruthy()
  })

  it('C3 fake mode: attempt marker before fake retire; success keeps marker', async () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'settled'

    let sawMarker = false
    const retireSpy = vi.spyOn(klima, 'retire').mockImplementation(async () => {
      const [row] = await testDb
        .select()
        .from(retirements)
        .where(eq(retirements.quoteId, quoteId))
      expect(row?.status).toBe('submitted')
      expect(row?.klimaAttemptAt).toBeInstanceOf(Date)
      expect(row?.klimaAttemptId).toBeTruthy()
      sawMarker = true
      // Delegate to real fake implementation via unmock — call through default
      // path by returning a settled fake-shaped result.
      return {
        status: 'settled' as const,
        transactionHash: randomTxHash(),
        certificateUrl: 'https://carbonmark.com/retirements/fake-c3',
        authValueMicros: null,
        retireTotalMicros: null,
      }
    })

    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })
    const quoteId = quote.quoteId

    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(200)
    expect(retireSpy).toHaveBeenCalledTimes(1)
    expect(sawMarker).toBe(true)

    const [row] = await testDb
      .select()
      .from(retirements)
      .where(eq(retirements.quoteId, quoteId))
    expect(row.status).toBe('settled')
    expect(row.klimaAttemptAt).toBeInstanceOf(Date)
    expect(row.klimaAttemptId).toBeTruthy()
  })

  it('allows a previously blocked size after the first settles', async () => {
    mockKlimaRetire()
    mockServiceWalletUsdcBalance(1_500)

    const q1 = await fundedQuote()
    const app = createTestApp()
    const first = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q1.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(first.status).toBe(200)

    const q2 = await fundedQuote()
    mockKlimaRetire()
    mockServiceWalletUsdcBalance(1_500)
    const second = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q2.quoteId,
        beneficiaryString: 'Ada',
      }),
    })
    expect(second.status).toBe(200)
  })

  it('fake mode skips the live balance read', async () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'settled'
    const balanceSpy = mockServiceWalletUsdcBalance(0)

    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })

    // Do not mockKlimaRetire — exercise fake path; headroom must skip RPC.
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
    expect(balanceSpy).not.toHaveBeenCalled()
  })

  it('on wallet busy: restores available balance (no Klima call)', async () => {
    const retireSpy = mockKlimaRetire()
    mockServiceWalletUsdcBalance(100)

    const quote = await fundedQuote(5_000)
    const app = createTestApp()
    const res = await app.request('/retirements', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        beneficiaryString: 'Ada',
      }),
    })

    expect(res.status).toBe(503)
    expect(retireSpy).not.toHaveBeenCalled()

    const [balance] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id))
    expect(balance.availableCents).toBe(5_000)
    expect(balance.reservedCents).toBe(0)
  })
})

describe('headroomCeilingCents rejects bad input', () => {
  it('throws on negative cents', () => {
    expect(() => headroomCeilingCents(-1, 0)).toThrow(AppError)
  })
})
