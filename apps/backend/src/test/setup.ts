import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { networkServer } from './network'

/** Defaults so modules that call `requireEnv` can load without a full `.env`. */
function ensureTestEnv(name: string, fallback: string): void {
  if (!process.env[name]?.trim()) {
    process.env[name] = fallback
  }
}

/**
 * Integration tests use a real Neon DB via `@neondatabase/serverless` (WebSocket).
 * A missing CI secret must not silently fall back to localhost — that yields
 * `wss://127.0.0.1/v2` blocked by MSW and opaque query failures.
 */
function ensureDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL?.trim()
  if (process.env.CI === 'true') {
    if (!raw) {
      throw new Error(
        'DATABASE_URL is required in CI (set GitHub secret STAGING_DATABASE_URL to a Neon URL).',
      )
    }
    if (!raw.includes('neon.tech')) {
      throw new Error(
        'DATABASE_URL in CI must be a Neon connection string (host contains neon.tech).',
      )
    }
    return
  }

  ensureTestEnv(
    'DATABASE_URL',
    'postgresql://test:test@127.0.0.1:5432/savemyplanet_test',
  )
}

ensureDatabaseUrl()
ensureTestEnv('CLERK_SECRET_KEY', 'sk_test_harness')
ensureTestEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_harness')
ensureTestEnv('CLERK_WEBHOOK_SIGNING_SECRET', 'whsec_test_harness')
ensureTestEnv('STRIPE_SECRET_KEY', 'sk_test_harness')
ensureTestEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_harness')
ensureTestEnv('ADMIN_API_KEY', 'test-admin-key')
ensureTestEnv('OPENROUTER_API_KEY', 'sk-or-test-harness')
ensureTestEnv('CORS_ORIGINS', '*')
process.env.NODE_ENV = 'test'

vi.mock('@clerk/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clerk/backend')>()
  return {
    ...actual,
    verifyToken: vi.fn(async () => {
      throw new Error('verifyToken not configured; call mockClerkAuth()')
    }),
  }
})

vi.mock('@clerk/backend/webhooks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@clerk/backend/webhooks')>()
  return {
    ...actual,
    verifyWebhook: vi.fn(async () => {
      throw new Error('verifyWebhook not configured; call mockClerkWebhook()')
    }),
  }
})

beforeAll(() => {
  networkServer.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  // Restore the catch-all DB allowlist handler (drops any per-test handlers).
  networkServer.resetHandlers()
})

afterAll(() => {
  networkServer.close()
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
