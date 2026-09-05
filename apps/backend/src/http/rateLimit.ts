import type { Context } from 'hono'
import { MemoryStore, rateLimiter } from 'hono-rate-limiter'
import { errorBody } from '../errors'

/**
 * Per-route fixed-window limits (1 minute). In-memory store is Cloud Run
 * best-effort per instance; shared multi-instance limits need Redis later.
 * @see docs/plan.md — Side plan N1
 */
export const RATE_LIMIT_DEFAULTS = {
  health: 120,
  reads: 60,
  deposit: 10,
  credit: 20,
  evaluations: 10,
  quotes: 20,
  retirements: 5,
  webhooks: 120,
} as const

export type RateLimitName = keyof typeof RATE_LIMIT_DEFAULTS

const WINDOW_MS = 60_000

/** Mutable copy so tests can lower limits without remounting middleware. */
export const rateLimitConfig: Record<RateLimitName, number> = {
  ...RATE_LIMIT_DEFAULTS,
}

const stores: Record<RateLimitName, MemoryStore> = {
  health: new MemoryStore(),
  reads: new MemoryStore(),
  deposit: new MemoryStore(),
  credit: new MemoryStore(),
  evaluations: new MemoryStore(),
  quotes: new MemoryStore(),
  retirements: new MemoryStore(),
  webhooks: new MemoryStore(),
}

/** Client IP for unauthenticated / admin / webhook keys (proxy-aware). */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) {
      return first
    }
  }

  return (
    c.req.header('cf-connecting-ip')?.trim() ||
    c.req.header('x-real-ip')?.trim() ||
    'unknown'
  )
}

/**
 * Prefer Clerk user id after `requireAuth`; otherwise IP.
 * `clerkId` is an internal key only — never returned in HTTP bodies.
 */
export function rateLimitKey(c: Context): string {
  const clerkUserId = Reflect.get(c.var, 'clerkUserId')
  if (typeof clerkUserId === 'string' && clerkUserId.length > 0) {
    return `user:${clerkUserId}`
  }
  return `ip:${clientIp(c)}`
}

function createLimiter(name: RateLimitName) {
  return rateLimiter({
    windowMs: WINDOW_MS,
    limit: () => rateLimitConfig[name],
    standardHeaders: 'draft-6',
    keyGenerator: (c) => rateLimitKey(c),
    message: errorBody('rate_limit_exceeded'),
    store: stores[name],
  })
}

export const rateLimitHealth = createLimiter('health')
export const rateLimitReads = createLimiter('reads')
export const rateLimitDeposit = createLimiter('deposit')
export const rateLimitCredit = createLimiter('credit')
export const rateLimitEvaluations = createLimiter('evaluations')
export const rateLimitQuotes = createLimiter('quotes')
export const rateLimitRetirements = createLimiter('retirements')
export const rateLimitWebhooks = createLimiter('webhooks')

/** Test helper: override limits and clear hit counters. */
export function configureRateLimitsForTests(
  overrides: Partial<Record<RateLimitName, number>> = {},
): void {
  Object.assign(rateLimitConfig, RATE_LIMIT_DEFAULTS, overrides)
  for (const store of Object.values(stores)) {
    store.resetAll()
  }
}

/** Restore defaults and clear stores after rate-limit tests. */
export function resetRateLimitsForTests(): void {
  configureRateLimitsForTests()
}
