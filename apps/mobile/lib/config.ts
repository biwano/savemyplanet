/** Public env for the Expo client. Never put secrets here. */

/**
 * Use static `process.env.EXPO_PUBLIC_*` member access so Expo can inline at bundle time.
 * @see https://docs.expo.dev/guides/environment-variables/
 */
const apiUrlRaw = process.env.EXPO_PUBLIC_API_URL?.trim()
const clerkPublishableKeyRaw = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
const stripePublishableKeyRaw =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()

if (!apiUrlRaw) {
  throw new Error('EXPO_PUBLIC_API_URL is not set')
}
if (!clerkPublishableKeyRaw) {
  throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set')
}

const apiUrl: string = apiUrlRaw
const clerkPublishableKey: string = clerkPublishableKeyRaw

export function getApiUrl(): string {
  return apiUrl.replace(/\/$/, '')
}

export function getClerkPublishableKey(): string {
  return clerkPublishableKey
}

/** Stripe test/live publishable key. Required for Deposit. */
export function getStripePublishableKey(): string {
  if (!stripePublishableKeyRaw) {
    throw new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
  }
  return stripePublishableKeyRaw
}

export function hasStripePublishableKey(): boolean {
  return Boolean(stripePublishableKeyRaw)
}
