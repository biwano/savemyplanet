import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError } from '../errors'
import { KlimaRetireError } from './vendor/klima-retire'

/** Whether a Klima failure proves no relay (`definitive`) or may have on-chain effects. */
export type KlimaFailureClass = 'definitive_failure' | 'ambiguous'

/** Hono contentful 4xx/5xx codes (excludes gaps like 419 that aren't in the union). */
const CONTENTFUL_ERROR_STATUSES = [
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
  415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500,
  501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
] as const satisfies readonly ContentfulStatusCode[]

/**
 * Vendor / mapped codes where the relay may already have succeeded (or we
 * cannot tell). See docs/plan.md C2.
 */
const AMBIGUOUS_CODES = new Set([
  'timeout',
  'network_error',
  'klima_outcome_unknown',
  // Redirect / non-JSON: request may or may not have reached Klima.
  'non_json_response',
])

/**
 * AppError codes that never hit Klima relay (safe to release reserved funds).
 */
const DEFINITIVE_APP_CODES = new Set(['klima_fake_retire_failed'])

/** Forward known Klima HTTP statuses; unknown / network (0) → 502. */
function mapStatus(status: number): ContentfulStatusCode {
  for (const code of CONTENTFUL_ERROR_STATUSES) {
    if (code === status) return code
  }
  return 502
}

function ambiguousHttpStatus(err: KlimaRetireError): ContentfulStatusCode {
  if (err.status === 408 || err.code === 'timeout') {
    return 504
  }
  return 502
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      /aborted|abort/i.test(err.message))
  )
}

function classifyByStatusAndCode(
  status: number,
  code?: string,
): KlimaFailureClass {
  if (code != null && AMBIGUOUS_CODES.has(code)) {
    return 'ambiguous'
  }
  // Vendor network uses status 0; HTTP timeout is 408.
  if (status === 0 || status === 408) {
    return 'ambiguous'
  }
  // Rate limit / 5xx may arrive after prepare-auth or relay.
  if (status === 429 || status >= 500) {
    return 'ambiguous'
  }
  // Explicit 4xx (except 408) — business rejection without proven relay.
  if (status >= 400 && status < 500) {
    return 'definitive_failure'
  }
  return 'ambiguous'
}

/**
 * Classify a Klima (or already-mapped) failure for retirement orchestration.
 *
 * - `definitive_failure` — safe to `releaseReserved` (user not charged).
 * - `ambiguous` — leave `submitted` + reserved for reconcile; do not release
 *   (timeout / network / abort / 5xx / unknown may mean credits already burned).
 */
export function classifyKlimaFailure(err: unknown): KlimaFailureClass {
  if (err instanceof KlimaRetireError) {
    return classifyByStatusAndCode(err.status, err.code)
  }
  if (err instanceof AppError) {
    if (DEFINITIVE_APP_CODES.has(err.message)) {
      return 'definitive_failure'
    }
    return classifyByStatusAndCode(err.status, err.message)
  }
  if (isAbortError(err)) {
    return 'ambiguous'
  }
  return 'ambiguous'
}

/**
 * Map Klima client errors to `AppError`. Ambiguous vendor failures become
 * `klima_outcome_unknown` (502/504) so callers can avoid releasing reserved
 * funds. Does not forward wholesale quote payloads in `details`.
 */
export function mapKlimaError(err: unknown): never {
  if (err instanceof KlimaRetireError) {
    const vendorCode = err.code ?? 'klima_error'
    const failureClass = classifyKlimaFailure(err)
    console.error('klima error:', {
      code: vendorCode,
      status: err.status,
      message: err.message,
      failureClass,
    })
    if (failureClass === 'ambiguous') {
      throw new AppError(ambiguousHttpStatus(err), 'klima_outcome_unknown', {
        klimaCode: vendorCode,
      })
    }
    throw new AppError(mapStatus(err.status), vendorCode)
  }
  throw err
}
