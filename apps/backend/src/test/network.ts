import { http, HttpResponse, passthrough, ws } from 'msw'
import { setupServer } from 'msw/node'

/** Hostname from `DATABASE_URL`, or `null` if unset/malformed. */
export function databaseUrlHostname(): string | null {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) {
    return null
  }

  try {
    // URL() needs an http(s) scheme; postgres URLs are otherwise valid.
    const normalized = raw
      .replace(/^postgresql:/i, 'http:')
      .replace(/^postgres:/i, 'http:')
    return new URL(normalized).hostname
  } catch {
    return null
  }
}

/**
 * Hostnames allowed for real network (Postgres / Neon only).
 * Parsed from `DATABASE_URL`, plus `neon.tech` / `*.neon.tech` for pooler/direct variance.
 */
let cachedDbHosts: Set<string> | null = null

export function allowedDbHosts(): Set<string> {
  if (cachedDbHosts) {
    return cachedDbHosts
  }

  const hosts = new Set<string>()
  const hostname = databaseUrlHostname()
  if (hostname) {
    hosts.add(hostname)
  }
  cachedDbHosts = hosts
  return hosts
}

export function isAllowedTestNetworkUrl(urlString: string): boolean {
  let hostname: string
  try {
    hostname = new URL(urlString).hostname
  } catch {
    return false
  }

  if (allowedDbHosts().has(hostname)) {
    return true
  }

  // Neon HTTP/WS sometimes uses a sibling host vs the pooled connection string.
  if (hostname.endsWith('.neon.tech') || hostname === 'neon.tech') {
    return true
  }

  return false
}

/** Neon serverless talks to the DB over WebSocket; must passthrough in tests. */
const neonWs = ws.link(/wss:\/\/[^/]*neon\.tech(\/.*)?/)

/**
 * MSW server for Vitest:
 * - Neon DB HTTP → `passthrough`
 * - Neon DB WebSocket → `server.connect()` (real Neon)
 * - Anything else HTTP → network error (providers must be module-mocked)
 *
 * Prefer helpers in `mocks.ts` for deliberate stubs; this guard catches leaks.
 */
export const networkServer = setupServer(
  neonWs.addEventListener('connection', ({ server }) => {
    server.connect()
  }),
  http.all(/.*/, ({ request }) => {
    if (isAllowedTestNetworkUrl(request.url)) {
      return passthrough()
    }
    console.error(
      `Unexpected network request in tests: ${request.method} ${request.url}`,
    )
    // Causes `fetch` to reject (TypeError) instead of returning a fake 500.
    return HttpResponse.error()
  }),
)
