import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries } from '../db/schema/ledgerEntries'
import { quotes } from '../db/schema/quotes'
import { retirements } from '../db/schema/retirements'
import { creditFundingManual } from '../ledger/index'
import { createUserQuote } from '../quotes/create'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../test/db'
import { mockKlimaPricing } from '../test/mocks'
import * as klima from './index'

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

describe('KLIMA_RETIRE_MODE=fake', () => {
  let previousRetireMode: string | undefined
  let previousFakeStatus: string | undefined
  let previousKService: string | undefined
  let previousPayerKey: string | undefined

  beforeEach(() => {
    previousRetireMode = process.env.KLIMA_RETIRE_MODE
    previousFakeStatus = process.env.KLIMA_FAKE_RETIRE_STATUS
    previousKService = process.env.K_SERVICE
    previousPayerKey = process.env.KLIMA_PAYER_PRIVATE_KEY

    process.env.KLIMA_RETIRE_MODE = 'fake'
    delete process.env.KLIMA_FAKE_RETIRE_STATUS
    delete process.env.K_SERVICE
  })

  afterEach(() => {
    restoreEnv('KLIMA_RETIRE_MODE', previousRetireMode)
    restoreEnv('KLIMA_FAKE_RETIRE_STATUS', previousFakeStatus)
    restoreEnv('K_SERVICE', previousKService)
    restoreEnv('KLIMA_PAYER_PRIVATE_KEY', previousPayerKey)
  })

  it('retire() returns a synthetic pending_index result without needing the payer key', async () => {
    delete process.env.KLIMA_PAYER_PRIVATE_KEY
    klima.resetKlimaClient()

    const result = await klima.retire({
      amount: '1',
      carbonClass: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      beneficiaryAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      beneficiaryString: 'Fake Staging',
    })

    expect(result.status).toBe('pending_index')
    expect(result.transactionHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result.certificateUrl).toBeNull()
  })

  it('retire() returns settled with a synthetic certificate URL', async () => {
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'settled'

    const result = await klima.retire({
      amount: '1',
      carbonClass: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      beneficiaryAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      beneficiaryString: 'Fake Staging',
    })

    expect(result.status).toBe('settled')
    expect(result.transactionHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result.certificateUrl).toBe(
      `https://carbonmark.com/retirements/fake/${result.transactionHash}`,
    )
  })

  it('retire() throws when KLIMA_FAKE_RETIRE_STATUS=fail', async () => {
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'fail'
    await expect(
      klima.retire({
        amount: '1',
        carbonClass: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        beneficiaryAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        beneficiaryString: 'Fake Staging',
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: 'klima_fake_retire_failed',
    })
  })

  it('refuses fake retire when K_SERVICE is the production service', async () => {
    process.env.K_SERVICE = 'savemyplanet-api'
    await expect(
      klima.retire({
        amount: '1',
        carbonClass: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        beneficiaryAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        beneficiaryString: 'Should Fail',
      }),
    ).rejects.toThrow(/KLIMA_RETIRE_MODE=fake is forbidden/)
  })

  it('POST /retirements completes ledger capture with fake Klima (pending_index)', async () => {
    const user = await createTestUser()
    mockClerkAuth(user.clerkId)
    try {
      mockKlimaPricing()
      await creditFundingManual({ userId: user.id, amountCents: 10_000 })
      const quote = await createUserQuote({ userId: user.id, tonnes: 1 })

      // Do not mockKlimaRetire — exercise the env-gated fake path.
      const app = createTestApp()
      const res = await app.request('/retirements', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          beneficiaryString: 'S1 Fake Retire',
        }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        id: string
        status: string
        certificateUrl?: string | null
      }
      expect(body.status).toBe('pending_index')
      expect(body.certificateUrl == null).toBe(true)

      const row = await testDb.query.retirements.findFirst({
        where: eq(retirements.id, body.id),
      })
      expect(row?.status).toBe('pending_index')
      expect(row?.txHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(row?.certificateUrl).toBeNull()

      // Fake convention: auth ceiling = quote.klima_total_cents * 10_000 micros.
      const [quoteRow] = await testDb
        .select({ klimaTotalCents: quotes.klimaTotalCents })
        .from(quotes)
        .where(eq(quotes.id, quote.quoteId))
      expect(row).toMatchObject({
        klimaAuthValueMicros: String(quoteRow.klimaTotalCents * 10_000),
        klimaAuthValueCents: quoteRow.klimaTotalCents,
        klimaRetireTotalMicros: null,
      })

      const entries = await testDb
        .select({ type: ledgerEntries.type })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.retirementId, body.id))
      expect(entries.map((e) => e.type).sort()).toEqual(['capture', 'reserve'])
    } finally {
      await deleteTestUserByClerkId(user.clerkId)
    }
  })
})
