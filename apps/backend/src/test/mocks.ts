import { verifyWebhook } from '@clerk/backend/webhooks'
import type { WebhookEvent } from '@clerk/backend/webhooks'
import type Stripe from 'stripe'
import { vi } from 'vitest'
import type { LlmEvaluation } from '../evaluate/llm'
import * as evaluateLlm from '../evaluate/llm'
import type {
  KlimaDiscoverResult,
  KlimaQuoteResult,
  KlimaRetireResult,
} from '../klima/index'
import * as klima from '../klima/index'
import * as stripeClient from '../stripe/client'
import * as funding from '../stripe/funding'

/**
 * Stub deposit PaymentIntent creation (Stripe never called).
 * Prefer this over mocking the Stripe SDK in route tests.
 */
export function mockCreateDepositPaymentIntent(result?: {
  clientSecret: string
  paymentIntentId: string
}): void {
  vi.spyOn(funding, 'createDepositPaymentIntent').mockResolvedValue(
    result ?? {
      clientSecret: 'pi_test_secret',
      paymentIntentId: 'pi_test_id',
    },
  )
}

/**
 * Stub `getStripe().webhooks.constructEvent` for Stripe webhook route tests.
 */
export function mockStripeConstructEvent(event: {
  type: string
  data: { object: unknown }
}): void {
  const constructEvent = vi.fn().mockReturnValue(event)
  const stripe = {
    webhooks: { constructEvent },
  } as unknown as Stripe
  vi.spyOn(stripeClient, 'getStripe').mockReturnValue(stripe)
}

/** Reject Stripe webhook signatures (invalid / tampered). */
export function mockStripeConstructEventInvalid(
  message = 'invalid signature',
): void {
  const constructEvent = vi.fn().mockImplementation(() => {
    throw new Error(message)
  })
  const stripe = {
    webhooks: { constructEvent },
  } as unknown as Stripe
  vi.spyOn(stripeClient, 'getStripe').mockReturnValue(stripe)
}

/** Stub Clerk webhook verification (`@clerk/backend/webhooks`). */
export function mockClerkWebhook(event: WebhookEvent): void {
  vi.mocked(verifyWebhook).mockResolvedValue(event)
}

/** Reject Clerk webhook signatures (invalid / tampered). */
export function mockClerkWebhookInvalid(
  message = 'invalid signature',
): void {
  vi.mocked(verifyWebhook).mockRejectedValue(new Error(message))
}

/** Stub LLM evaluation for `POST /evaluations` (no provider network). */
export function mockEvaluateLlm(result: LlmEvaluation | null | Error) {
  if (result instanceof Error) {
    return vi.spyOn(evaluateLlm, 'callLlm').mockRejectedValue(result)
  }
  return vi.spyOn(evaluateLlm, 'callLlm').mockResolvedValue(result)
}

/** Stub Klima discover + quote for `POST /quotes` (no x402 network). */
export function mockKlimaPricing(input?: {
  discover?: KlimaDiscoverResult
  quote?: KlimaQuoteResult
}): void {
  const carbonClassId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  vi.spyOn(klima, 'discover').mockResolvedValue(
    input?.discover ?? {
      carbonClasses: [
        {
          carbonClassId,
          name: 'Test Class',
          priceUsdcPerTonneFormatted: '10.00',
          creditsDetailed: [
            {
              tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              liquidityFormatted: '1000',
            },
          ],
        },
      ],
    },
  )
  vi.spyOn(klima, 'quote').mockResolvedValue(
    input?.quote ?? {
      // $10.00 USDC wholesale (6-decimal base units).
      total: '10000000',
      totalFormatted: '10.00',
      tonnesFormatted: '1',
    },
  )
}

/** Stub Klima retire for `POST /retirements` (no x402 network / payer key). */
export function mockKlimaRetire(
  result: KlimaRetireResult | Error = {
    status: 'settled',
    transactionHash:
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    certificateUrl: 'https://carbonmark.com/retirements/test-cert',
  },
) {
  if (result instanceof Error) {
    return vi.spyOn(klima, 'retire').mockRejectedValue(result)
  }
  return vi.spyOn(klima, 'retire').mockResolvedValue(result)
}

/** Stub Klima `/certificate` lookup for pending_index resolve (no x402 network). */
export function mockKlimaCertificate(
  result:
    | Awaited<ReturnType<typeof klima.certificate>>
    | Error = {
      transactionHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      certificateUrl: 'https://carbonmark.com/retirements/test-cert',
    },
) {
  if (result instanceof Error) {
    return vi.spyOn(klima, 'certificate').mockRejectedValue(result)
  }
  return vi.spyOn(klima, 'certificate').mockResolvedValue(result)
}
