import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  configureRateLimitsForTests,
  rateLimitKey,
  resetRateLimitsForTests,
} from './rateLimit'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import { createTestUser, deleteTestUserByClerkId } from '../test/db'
import { mockEvaluateLlm } from '../test/mocks'
import type { LocalUser } from '../users/sync'

describe('rate limiting', () => {
  afterEach(() => {
    resetRateLimitsForTests()
  })

  describe('GET /health (read, IP key)', () => {
    beforeEach(() => {
      configureRateLimitsForTests({ health: 2 })
    })

    it('allows under the limit and returns 429 when exceeded', async () => {
      const app = createTestApp()
      const headers = { 'x-forwarded-for': '203.0.113.10' }

      const first = await app.request('/health', { headers })
      const second = await app.request('/health', { headers })
      const third = await app.request('/health', { headers })

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(third.status).toBe(429)
      expect(await third.json()).toEqual({ error: 'rate_limit_exceeded' })
      expect(third.headers.get('Retry-After')).toBeTruthy()
    })

    it('does not share quota across different IPs', async () => {
      const app = createTestApp()

      expect(
        (
          await app.request('/health', {
            headers: { 'x-forwarded-for': '203.0.113.20' },
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await app.request('/health', {
            headers: { 'x-forwarded-for': '203.0.113.20' },
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await app.request('/health', {
            headers: { 'x-forwarded-for': '203.0.113.20' },
          })
        ).status,
      ).toBe(429)

      expect(
        (
          await app.request('/health', {
            headers: { 'x-forwarded-for': '203.0.113.21' },
          })
        ).status,
      ).toBe(200)
    })
  })

  describe('POST /evaluations (write, user key)', () => {
    let userA: LocalUser
    let userB: LocalUser

    beforeEach(async () => {
      configureRateLimitsForTests({ evaluations: 2 })
      userA = await createTestUser()
      userB = await createTestUser()
      mockEvaluateLlm({
        suggestedTonnes: 0.01,
        rationale: 'test',
        suggestedRetirementMessage: 'Clearing test emissions.',
        ambiguous: false,
      })
    })

    afterEach(async () => {
      await deleteTestUserByClerkId(userA.clerkId)
      await deleteTestUserByClerkId(userB.clerkId)
    })

    it('allows under the limit and returns 429 when exceeded', async () => {
      mockClerkAuth(userA.clerkId)
      const app = createTestApp()
      const headers = {
        ...authHeader(),
        'Content-Type': 'application/json',
      }

      const first = await app.request('/evaluations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ activity: 'I drove 10km' }),
      })
      const second = await app.request('/evaluations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ activity: 'I drove 20km' }),
      })
      const third = await app.request('/evaluations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ activity: 'I drove 30km' }),
      })

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(third.status).toBe(429)
      expect(await third.json()).toEqual({ error: 'rate_limit_exceeded' })
      expect(third.headers.get('Retry-After')).toBeTruthy()
    })

    it('does not share quota across different users', async () => {
      const app = createTestApp()
      const headers = {
        ...authHeader(),
        'Content-Type': 'application/json',
      }

      mockClerkAuth(userA.clerkId)
      expect(
        (
          await app.request('/evaluations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ activity: 'user A 1' }),
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await app.request('/evaluations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ activity: 'user A 2' }),
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await app.request('/evaluations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ activity: 'user A 3' }),
          })
        ).status,
      ).toBe(429)

      mockClerkAuth(userB.clerkId)
      expect(
        (
          await app.request('/evaluations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ activity: 'user B 1' }),
          })
        ).status,
      ).toBe(200)
    })
  })

  describe('rateLimitKey', () => {
    it('uses user key when clerkUserId is set', () => {
      const c = {
        var: { clerkUserId: 'user_abc' },
        req: { header: () => undefined },
      }
      expect(rateLimitKey(c as never)).toBe('user:user_abc')
    })

    it('falls back to IP from x-forwarded-for', () => {
      const c = {
        var: {},
        req: {
          header: (name: string) =>
            name === 'x-forwarded-for' ? '198.51.100.1, 10.0.0.1' : undefined,
        },
      }
      expect(rateLimitKey(c as never)).toBe('ip:198.51.100.1')
    })
  })
})
