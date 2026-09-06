/** Public env for the Expo client. Never put secrets here. */

/**
 * Use static `process.env.EXPO_PUBLIC_*` member access so Expo can inline at bundle time.
 * @see https://docs.expo.dev/guides/environment-variables/
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()
if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is not set')
}

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
if (!clerkPublishableKey) {
  throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set')
}

export function getApiUrl(): string {
  return apiUrl.replace(/\/$/, '')
}

export function getClerkPublishableKey(): string {
  return clerkPublishableKey
}
