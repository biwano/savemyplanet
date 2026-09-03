export const isProd = process.env.NODE_ENV === 'production'

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

export function clerkSecretKey(): string {
  return requireEnv('CLERK_SECRET_KEY')
}

export function clerkPublishableKey(): string {
  return requireEnv('CLERK_PUBLISHABLE_KEY')
}

/** Optional until a Clerk webhook endpoint is configured in the dashboard. */
export function clerkWebhookSigningSecret(): string | undefined {
  const value = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim()
  return value || undefined
}
