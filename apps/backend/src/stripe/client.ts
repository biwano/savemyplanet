import Stripe from 'stripe'
import { requireEnv } from '../config'

let stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'))
  }
  return stripe
}

/** Optional until a Stripe webhook endpoint is configured. */
export function stripeWebhookSecret(): string | undefined {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  return value || undefined
}
