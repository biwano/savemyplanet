import { Hono } from 'hono'
import type { AuthVariables } from '../auth/middleware'
import { requireAuth } from '../auth/middleware'
import { toApiCarbonClasses } from '../classes/list'
import { parseCarbonClassLang } from '../classes/metadata'
import { rateLimitReads } from '../http/rateLimit'
import { discover } from '../klima/index'
import { ensureUserFromClerkId } from '../users/sync'

export const classesRoutes = new Hono<{ Variables: AuthVariables }>()

classesRoutes.get('/', requireAuth, rateLimitReads, async (c) => {
  await ensureUserFromClerkId(c.get('clerkUserId'))

  const lang = parseCarbonClassLang(c.req.query('lang'))
  const catalog = await discover()
  const origin = new URL(c.req.url).origin
  const classes = toApiCarbonClasses(
    catalog.carbonClasses,
    (imageFile) => `${origin}/static/carbonclasses/${imageFile}`,
    lang,
  )

  return c.json({ classes })
})
