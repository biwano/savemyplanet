import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/index'
import { errorBody } from '../errors'

export const healthRoutes = new Hono()

healthRoutes.get('/', async (c) => {
  try {
    await db.execute(sql`select 1`)
    return c.json({ ok: true })
  } catch (err) {
    console.error('health check failed:', err)
    return c.json({ ok: false, ...errorBody('database_unavailable') }, 503)
  }
})
