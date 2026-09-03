import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { createCorsMiddleware } from './cors'
import { errorBody, handleError } from './errors'
import { db } from './db/index'
import { meRoutes } from './routes/me'
import { webhookRoutes } from './routes/webhooks'

export function createApp() {
  const app = new Hono()

  app.use('*', createCorsMiddleware())

  app.onError(handleError)

  app.notFound((c) => c.json(errorBody('not_found'), 404))

  app.get('/health', async (c) => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ ok: true })
    } catch (err) {
      console.error('health check failed:', err)
      return c.json({ ok: false, ...errorBody('database_unavailable') }, 503)
    }
  })

  app.route('/', webhookRoutes)
  app.route('/', meRoutes)

  return app
}
