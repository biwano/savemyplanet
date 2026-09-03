import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** User-facing API error. Response body is always `{ error, details? }`. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly details?: unknown

  constructor(
    status: ContentfulStatusCode,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
  }
}

export type ErrorBody = {
  error: string
  details?: unknown
}

export function errorBody(error: string, details?: unknown): ErrorBody {
  const body: ErrorBody = { error }
  if (details !== undefined) {
    body.details = details
  }
  return body
}

/**
 * Map thrown errors to the structured shape. Never put Klima wholesale
 * amounts (e.g. klima_total) in `details` on user routes — log those server-side only.
 */
export function handleError(err: unknown, c: Context) {
  if (err instanceof AppError) {
    return c.json(errorBody(err.message, err.details), err.status)
  }

  if (err instanceof HTTPException) {
    return c.json(errorBody(err.message), err.status)
  }

  console.error('unhandled error:', err)
  return c.json(errorBody('internal_error'), 500)
}
