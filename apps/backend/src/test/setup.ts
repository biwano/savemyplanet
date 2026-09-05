import { beforeEach, vi } from 'vitest'

/** Defaults so modules that call `requireEnv` can load without a full `.env`. */
function ensureTestEnv(name: string, fallback: string): void {
  if (!process.env[name]?.trim()) {
    process.env[name] = fallback
  }
}

ensureTestEnv(
  'DATABASE_URL',
  'postgresql://test:test@127.0.0.1:5432/savemyplanet_test',
)
ensureTestEnv('CLERK_SECRET_KEY', 'sk_test_harness')
ensureTestEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_harness')
ensureTestEnv('CLERK_WEBHOOK_SIGNING_SECRET', 'whsec_test_harness')
ensureTestEnv('STRIPE_SECRET_KEY', 'sk_test_harness')
ensureTestEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_harness')
ensureTestEnv('ADMIN_API_KEY', 'test-admin-key')
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

beforeEach(() => {
  vi.clearAllMocks()
})
