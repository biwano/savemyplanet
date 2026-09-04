import type { Context } from 'hono'
import type { z } from 'zod'
import { AppError } from '../errors'

/** Parse JSON body with a Zod schema; throws `invalid_body` (400) on failure. */
export async function parseJsonBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new AppError(400, 'invalid_body')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError(400, 'invalid_body', parsed.error.flatten())
  }
  return parsed.data
}
