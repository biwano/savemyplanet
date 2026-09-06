/** Public env for the Expo client. Never put secrets here. */

function requirePublicEnv(name: 'EXPO_PUBLIC_API_URL' | 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

export function getApiUrl(): string {
  return requirePublicEnv('EXPO_PUBLIC_API_URL').replace(/\/$/, '')
}

export function getClerkPublishableKey(): string {
  return requirePublicEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')
}
