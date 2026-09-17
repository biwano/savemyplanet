import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

/**
 * Public files under `apps/backend/static/` only (no auth — e.g. `<Image>` cannot
 * send Bearer). `serveStatic` rejects `..` / odd path segments; root is never the app tree.
 */
export const staticRoutes = new Hono()

/** One day. */
const CACHE_CONTROL = 'public, max-age=86400'

const STATIC_ROOT = path.resolve(process.cwd(), 'static')

staticRoutes.get(
  '/*',
  serveStatic({
    root: STATIC_ROOT,
    rewriteRequestPath(reqPath) {
      // Mount keeps `/static` in `c.req.path`; strip it so root stays `static/`.
      return reqPath.replace(/^\/static(?=\/|$)/, '') || '/'
    },
    onFound(_filePath, c) {
      c.header('Cache-Control', CACHE_CONTROL)
    },
  }),
)
