import { Hono } from 'hono'
import { AppError, errorBody } from '../../errors'
import { getStripe, stripeWebhookSecret } from '../../stripe/client'
import { creditFromPaymentIntent } from '../../stripe/funding'

export const webhooksStripeRoutes = new Hono()

webhooksStripeRoutes.post('/', async (c) => {
  const secret = stripeWebhookSecret()
  if (!secret) {
    throw new AppError(503, 'webhook_not_configured')
  }

  const signature = c.req.header('stripe-signature')
  if (!signature) {
    return c.json(errorBody('invalid_webhook'), 400)
  }

  const rawBody = await c.req.text()
  let event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('stripe webhook verification failed:', err)
    return c.json(errorBody('invalid_webhook'), 400)
  }

  if (event.type === 'payment_intent.succeeded') {
    try {
      const result = await creditFromPaymentIntent(event.data.object)
      console.info('stripe funding credited:', {
        paymentIntentId: event.data.object.id,
        userId: result.userId,
        created: result.created,
      })
    } catch (err) {
      console.error('stripe funding credit failed:', err)
      if (err instanceof AppError) {
        // 4xx from our side (bad metadata): acknowledge so Stripe stops retrying.
        if (err.status >= 400 && err.status < 500) {
          return c.json({ received: true, error: err.message })
        }
      }
      // Let Stripe retry on unexpected / 5xx-class failures.
      throw err
    }
  }

  return c.json({ received: true })
})
