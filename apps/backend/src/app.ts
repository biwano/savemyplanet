import { Hono } from 'hono'
import { createCorsMiddleware } from './cors'
import { errorBody, handleError } from './errors'
import { accountRoutes } from './routes/account/index'
import { accountCreditRoutes } from './routes/account/credit'
import { accountDepositRoutes } from './routes/account/deposit'
import { evaluationsRoutes } from './routes/evaluations'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { quotesRoutes } from './routes/quotes'
import { retirementsRoutes } from './routes/retirements'
import { webhooksClerkRoutes } from './routes/webhooks/clerk'
import { webhooksStripeRoutes } from './routes/webhooks/stripe'

export function createApp() {
  const app = new Hono()

  app.use('*', createCorsMiddleware())

  app.onError(handleError)

  app.notFound((c) => c.json(errorBody('not_found'), 404))

  app.route('/health', healthRoutes)
  app.route('/me', meRoutes)
  app.route('/account', accountRoutes)
  app.route('/account/deposit', accountDepositRoutes)
  app.route('/account/credit', accountCreditRoutes)
  app.route('/evaluations', evaluationsRoutes)
  app.route('/quotes', quotesRoutes)
  app.route('/retirements', retirementsRoutes)
  app.route('/webhooks/clerk', webhooksClerkRoutes)
  app.route('/webhooks/stripe', webhooksStripeRoutes)

  return app
}
