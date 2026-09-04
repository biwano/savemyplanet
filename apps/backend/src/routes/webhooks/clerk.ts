import { verifyWebhook } from '@clerk/backend/webhooks'
import { Hono } from 'hono'
import { clerkWebhookSigningSecret } from '../../config'
import { AppError, errorBody } from '../../errors'
import { upsertUserFromClerkJSON } from '../../users/sync'

export const webhooksClerkRoutes = new Hono()

webhooksClerkRoutes.post('/', async (c) => {
  const signingSecret = clerkWebhookSigningSecret()
  if (!signingSecret) {
    throw new AppError(503, 'webhook_not_configured')
  }

  let evt
  try {
    evt = await verifyWebhook(c.req.raw, { signingSecret })
  } catch (err) {
    console.error('clerk webhook verification failed:', err)
    return c.json(errorBody('invalid_webhook'), 400)
  }

  switch (evt.type) {
    case 'user.created':
    case 'user.updated':
      await upsertUserFromClerkJSON(evt.data)
      break
    case 'user.deleted':
      // Keep local rows for ledger / retirement history; identity remains tombstoned in Clerk.
      console.info('clerk user.deleted received:', evt.data.id)
      break
    default:
      break
  }

  return c.json({ received: true })
})
