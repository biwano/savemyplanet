import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries } from '../db/schema/ledgerEntries'
import { retirements } from '../db/schema/retirements'
import { createUserQuote } from '../quotes/create'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../test/db'
import { mockKlimaPricing } from '../test/mocks'
import type { LocalUser } from '../users/sync'
import { capture, creditFundingManual, reserve } from './index'

function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== 'object') {
    return false
  }
  const code = 'code' in err ? err.code : undefined
  const cause =
    'cause' in err && err.cause != null && typeof err.cause === 'object'
      ? err.cause
      : undefined
  const causeCode =
    cause != null && 'code' in cause ? (cause as { code: unknown }).code : undefined
  return code === '23505' || causeCode === '23505'
}

describe('C4 structural uniqueness (ledger + tx_hash)', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  async function reservedRetirement() {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const quote = await createUserQuote({ userId: user.id, tonnes: 1 })

    const [row] = await testDb
      .insert(retirements)
      .values({
        userId: user.id,
        quoteId: quote.quoteId,
        status: 'reserved',
        tonnes: String(quote.tonnes),
        beneficiaryString: 'Ada',
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

    return { retirementId: row.id, amountCents: quote.userTotal, quote }
  }

  it('rejects a second capture ledger row for the same retirement', async () => {
    const { retirementId, amountCents } = await reservedRetirement()

    await testDb.transaction(async (tx) => {
      await capture({ userId: user.id, amountCents, retirementId }, tx)
    })

    const captures = await testDb
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.retirementId, retirementId))
    expect(captures.filter((e) => e.type === 'capture')).toHaveLength(1)

    await expect(
      testDb.transaction(async (tx) => {
        await capture(
          { userId: user.id, amountCents, retirementId },
          tx,
        )
      }),
    ).rejects.toSatisfy(isUniqueViolation)

    const after = await testDb
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.retirementId, retirementId))
    expect(after.filter((e) => e.type === 'capture')).toHaveLength(1)
  })

  it('rejects a second reserve ledger row for the same retirement', async () => {
    const { retirementId, amountCents } = await reservedRetirement()

    await expect(
      testDb.insert(ledgerEntries).values({
        userId: user.id,
        amountCents,
        type: 'reserve',
        retirementId,
      }),
    ).rejects.toSatisfy(isUniqueViolation)
  })

  it('still allows multiple funding rows with null retirement_id', async () => {
    await creditFundingManual({ userId: user.id, amountCents: 100 })
    await creditFundingManual({ userId: user.id, amountCents: 200 })

    const funding = await testDb
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
    expect(funding.filter((e) => e.type === 'funding')).toHaveLength(2)
  })

  it('rejects a second retirement row with the same non-null tx_hash', async () => {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const q1 = await createUserQuote({ userId: user.id, tonnes: 1 })
    const q2 = await createUserQuote({ userId: user.id, tonnes: 1 })
    const txHash =
      `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 32)}`

    await testDb.insert(retirements).values({
      userId: user.id,
      quoteId: q1.quoteId,
      status: 'settled',
      tonnes: String(q1.tonnes),
      beneficiaryString: 'Ada',
      txHash,
    })

    await expect(
      testDb.insert(retirements).values({
        userId: user.id,
        quoteId: q2.quoteId,
        status: 'settled',
        tonnes: String(q2.tonnes),
        beneficiaryString: 'Ada',
        txHash,
      }),
    ).rejects.toSatisfy(isUniqueViolation)
  })

  it('rejects updating a retirement to a tx_hash already used by another row', async () => {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const q1 = await createUserQuote({ userId: user.id, tonnes: 1 })
    const q2 = await createUserQuote({ userId: user.id, tonnes: 1 })
    const sharedHash =
      `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 32)}`
    const otherHash =
      `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 32)}`

    await testDb.insert(retirements).values({
      userId: user.id,
      quoteId: q1.quoteId,
      status: 'settled',
      tonnes: String(q1.tonnes),
      beneficiaryString: 'Ada',
      txHash: sharedHash,
    })

    const [second] = await testDb
      .insert(retirements)
      .values({
        userId: user.id,
        quoteId: q2.quoteId,
        status: 'submitted',
        tonnes: String(q2.tonnes),
        beneficiaryString: 'Ada',
        txHash: otherHash,
      })
      .returning()

    await expect(
      testDb
        .update(retirements)
        .set({ txHash: sharedHash })
        .where(eq(retirements.id, second.id)),
    ).rejects.toSatisfy(isUniqueViolation)
  })

  it('allows multiple retirements with null tx_hash', async () => {
    mockKlimaPricing()
    await creditFundingManual({ userId: user.id, amountCents: 50_000 })
    const q1 = await createUserQuote({ userId: user.id, tonnes: 1 })
    const q2 = await createUserQuote({ userId: user.id, tonnes: 1 })

    await testDb.insert(retirements).values([
      {
        userId: user.id,
        quoteId: q1.quoteId,
        status: 'submitted',
        tonnes: String(q1.tonnes),
        beneficiaryString: 'Ada',
        txHash: null,
      },
      {
        userId: user.id,
        quoteId: q2.quoteId,
        status: 'submitted',
        tonnes: String(q2.tonnes),
        beneficiaryString: 'Ada',
        txHash: null,
      },
    ])

    const rows = await testDb
      .select()
      .from(retirements)
      .where(eq(retirements.userId, user.id))
    expect(rows).toHaveLength(2)
  })
})
