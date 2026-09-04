import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError } from '../errors'
import { KlimaRetireError } from './vendor/klima-retire'

/** Hono contentful 4xx/5xx codes (excludes gaps like 419 that aren't in the union). */
const CONTENTFUL_ERROR_STATUSES = [
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
  415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500,
  501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
] as const satisfies readonly ContentfulStatusCode[]

/** Forward known Klima HTTP statuses; unknown / network (0) → 502. */
function mapStatus(status: number): ContentfulStatusCode {
  for (const code of CONTENTFUL_ERROR_STATUSES) {
    if (code === status) return code
  }
  return 502
}

/**
 * Map Klima client errors to `AppError`. Does not forward wholesale quote
 * payloads in `details` (those stay server-side via logging).
 */
export function mapKlimaError(err: unknown): never {
  if (err instanceof KlimaRetireError) {
    const code = err.code ?? 'klima_error'
    console.error('klima error:', {
      code,
      status: err.status,
      message: err.message,
    })
    throw new AppError(mapStatus(err.status), code)
  }
  throw err
}
