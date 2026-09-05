import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluations } from '../db/schema/evaluations'
import { normalizeSuggestedTonnes } from '../evaluate/index'
import { parseLlmJson } from '../evaluate/llm'
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
    })

    const row = await testDb.query.evaluations.findFirst({
      where: and(
        eq(evaluations.userId, user.id),
        eq(evaluations.activityText, 'I drove 100km'),
      ),
    })
    expect(row).toBeDefined()
    expect(Number(row?.suggestedTonnes)).toBe(0.017)
    expect(row?.rationale).toBe(body.rationale)
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
