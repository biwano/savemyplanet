import { cors } from 'hono/cors'
import { isProd } from './config'

/**
 * Expo will call this API from device/web origins.
 * `*` is allowed only outside production (local dev).
 * In production, set CORS_ORIGINS to a comma-separated allowlist.
 */
export function createCorsMiddleware() {
  const raw = process.env.CORS_ORIGINS?.trim()

  if (!isProd && (!raw || raw === '*')) {
    return cors({ origin: '*' })
  }

  if (!raw || raw === '*') {
    throw new Error(
      'CORS_ORIGINS must be a comma-separated allowlist in production (* is local-dev only)',
    )
  }

  const allowed = raw.split(',').map((o) => o.trim()).filter(Boolean)
  if (allowed.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be a non-empty comma-separated allowlist in production',
    )
  }

  return cors({
    origin: (origin) => (origin && allowed.includes(origin) ? origin : null),
  })
}
