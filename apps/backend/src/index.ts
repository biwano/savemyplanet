import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from './db/index'

const app = new Hono()

app.get('/health', async (c) => {
  try {
    await db.execute(sql`select 1`)
    return c.json({ ok: true })
  } catch (err) {
    console.error('health check failed:', err)
    return c.json({ ok: false, error: 'database_unavailable' }, 503)
  }
})

const port = Number(process.env.PORT) || 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
