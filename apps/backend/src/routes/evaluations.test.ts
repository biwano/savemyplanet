import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluations } from '../db/schema/evaluations'
import { users } from '../db/schema/users'
import { normalizeSuggestedTonnes } from '../evaluate/index'
import {
  formatOpenRouterCostUsd,
  parseLlmJson,
  usageFromCompletion,
} from '../evaluate/llm'
import { AppError } from '../errors'
import { MIN_TONNES } from '../pricing/tonnes'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import {
  createTestUser,
  deleteTestUserByClerkId,
  testDb,
} from '../test/db'
import { mockEvaluateLlm } from '../test/mocks'
import { INITIAL_EVALUATIONS_REMAINING } from '../users/quota'
import type { LocalUser } from '../users/sync'

describe('POST /evaluations', () => {
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
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects empty activity', async () => {
    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: '   ' }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('rejects missing activity', async () => {
    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('returns LLM estimate for "I drove 100km"', async () => {
    mockEvaluateLlm({
      suggestedTonnes: 0.017,
      rationale: 'About 17 kg CO₂e for a 100 km car trip.',
      ambiguous: false,
      usage: {
        costUsd: 0.00012,
        model: 'openai/gpt-4o-mini',
        promptTokens: 120,
        completionTokens: 45,
        totalTokens: 165,
      },
    })

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      suggestedTonnes: 0.017,
      rationale: 'About 17 kg CO₂e for a 100 km car trip.',
      evaluationsRemaining: INITIAL_EVALUATIONS_REMAINING - 1,
    })
    expect(body).not.toHaveProperty('openrouterCostUsd')
    expect(body).not.toHaveProperty('usage')

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeDefined()
    expect(Number(row?.suggestedTonnes)).toBe(0.017)
    expect(row?.rationale).toBe(body.rationale)
    expect(Number(row?.openrouterCostUsd)).toBe(0.00012)
    expect(row?.openrouterModel).toBe('openai/gpt-4o-mini')
    expect(row?.promptTokens).toBe(120)
    expect(row?.completionTokens).toBe(45)
    expect(row?.totalTokens).toBe(165)

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING - 1)
  })

  it('persists null cost columns when LLM usage is omitted', async () => {
    mockEvaluateLlm({
      suggestedTonnes: 0.5,
      rationale: 'No usage attached.',
      ambiguous: false,
    })

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I took a short bus ride' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      suggestedTonnes: 0.5,
      rationale: 'No usage attached.',
      evaluationsRemaining: INITIAL_EVALUATIONS_REMAINING - 1,
    })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I took a short bus ride'),
      ),
    })
    expect(row).toBeDefined()
    expect(row?.openrouterCostUsd).toBeNull()
    expect(row?.openrouterModel).toBeNull()
    expect(row?.promptTokens).toBeNull()
    expect(row?.completionTokens).toBeNull()
    expect(row?.totalTokens).toBeNull()
  })

  it('clamps suggested tonnes below MIN_TONNES so the result is quotable', async () => {
    mockEvaluateLlm({
      suggestedTonnes: 0.0001,
      rationale: 'Tiny footprint.',
      ambiguous: false,
    })

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I blinked once' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      suggestedTonnes: MIN_TONNES,
      rationale: 'Tiny footprint.',
      evaluationsRemaining: INITIAL_EVALUATIONS_REMAINING - 1,
    })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I blinked once'),
      ),
    })
    expect(row).toBeDefined()
    expect(Number(row?.suggestedTonnes)).toBe(MIN_TONNES)
  })

  it('returns 403 when evaluation quota is exhausted (no LLM call)', async () => {
    await testDb
      .update(users)
      .set({ evaluationsRemaining: 0 })
      .where(eq(users.id, user.id))

    const llm = mockEvaluateLlm({
      suggestedTonnes: 1,
      rationale: 'should not run',
      ambiguous: false,
    })

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'evaluation_quota_exhausted' })
    expect(llm).not.toHaveBeenCalled()

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeUndefined()

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.evaluationsRemaining).toBe(0)
  })

  it('returns 502 when the LLM fails', async () => {
    mockEvaluateLlm(new Error('provider down'))

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'evaluation_unavailable' })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeUndefined()

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING)
  })

  it('returns 502 when the LLM response cannot be parsed', async () => {
    mockEvaluateLlm(null)

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'evaluation_unavailable' })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeUndefined()

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING)
  })

  it('returns 422 when the LLM marks the result ambiguous', async () => {
    mockEvaluateLlm({
      suggestedTonnes: 99,
      rationale: 'Unclear activity',
      ambiguous: true,
    })

    const app = createTestApp()
    const res = await app.request('/evaluations', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'I drove 100km' }),
    })

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'evaluation_ambiguous',
      details: { rationale: 'Unclear activity' },
    })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeUndefined()

    const balance = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
    })
    expect(balance?.evaluationsRemaining).toBe(INITIAL_EVALUATIONS_REMAINING)
  })
})

describe('parseLlmJson', () => {
  it('parses plain JSON', () => {
    expect(
      parseLlmJson(
        '{"suggestedTonnes":0.017,"rationale":"A short trip.","ambiguous":false}',
      ),
    ).toEqual({
      suggestedTonnes: 0.017,
      rationale: 'A short trip.',
      ambiguous: false,
    })
  })

  it('parses fenced JSON and fills a default rationale', () => {
    expect(
      parseLlmJson('```json\n{"suggestedTonnes":1.5,"ambiguous":true}\n```'),
    ).toEqual({
      suggestedTonnes: 1.5,
      rationale: 'Estimated from your activity description.',
      ambiguous: true,
    })
  })

  it('returns null for unusable payloads', () => {
    expect(parseLlmJson('not json')).toBeNull()
    expect(parseLlmJson('{"suggestedTonnes":-1}')).toBeNull()
    expect(parseLlmJson('{"rationale":"missing tonnes"}')).toBeNull()
  })
})

describe('usageFromCompletion', () => {
  it('maps OpenRouter usage and model', () => {
    expect(
      usageFromCompletion(
        {
          model: 'openai/gpt-4o-mini',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            cost: 0.0012,
          },
        },
        'fallback/model',
      ),
    ).toEqual({
      costUsd: 0.0012,
      model: 'openai/gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    })
  })

  it('falls back to requested model and nulls when usage is missing', () => {
    expect(usageFromCompletion({}, 'openai/gpt-4o-mini')).toEqual({
      costUsd: null,
      model: 'openai/gpt-4o-mini',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    })
  })

  it('nulls malformed usage fields without failing', () => {
    expect(
      usageFromCompletion(
        {
          model: 'openai/gpt-4o-mini',
          usage: {
            prompt_tokens: 10.9,
            completion_tokens: '20',
            total_tokens: -1,
            cost: '0.0012',
          },
        },
        'fallback/model',
      ),
    ).toEqual({
      costUsd: null,
      model: 'openai/gpt-4o-mini',
      promptTokens: 10,
      completionTokens: null,
      totalTokens: null,
    })
  })
})

describe('formatOpenRouterCostUsd', () => {
  it('formats a stable decimal string', () => {
    expect(formatOpenRouterCostUsd(0.00012)).toBe('0.00012')
    expect(formatOpenRouterCostUsd(0)).toBe('0')
  })
})

describe('normalizeSuggestedTonnes', () => {
  it('formats and clamps tiny positive values to MIN_TONNES', () => {
    expect(normalizeSuggestedTonnes(0.017)).toBe('0.017')
    expect(normalizeSuggestedTonnes(0.0001)).toBe('0.001')
    expect(normalizeSuggestedTonnes(MIN_TONNES)).toBe('0.001')
  })

  it('rejects non-positive or non-finite input', () => {
    for (const raw of [0, -1, Number.NaN]) {
      let thrown: unknown
      try {
        normalizeSuggestedTonnes(raw)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(AppError)
      expect(thrown).toMatchObject({
        status: 502,
        message: 'evaluation_unavailable',
      })
    }
  })
})
