/** Product default: 40% markup (see docs/product.md). Override via MARKUP_BPS. */
export const DEFAULT_MARKUP_BPS = 4000

/** How long a persisted quote may be used for retirement. */
export const DEFAULT_QUOTE_TTL_MS = 10 * 60 * 1000

export function markupBps(): number {
  const raw = process.env.MARKUP_BPS?.trim()
  if (!raw) {
    return DEFAULT_MARKUP_BPS
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new Error('MARKUP_BPS must be an integer between 0 and 100000')
  }
  return n
}

export function quoteTtlMs(): number {
  const raw = process.env.QUOTE_TTL_MS?.trim()
  if (!raw) {
    return DEFAULT_QUOTE_TTL_MS
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 60_000 || n > 24 * 60 * 60 * 1000) {
    throw new Error('QUOTE_TTL_MS must be an integer between 60000 and 86400000')
  }
  return n
}

/**
 * Optional discover filter when the backend auto-picks a class.
 * Unset = no price cap.
 */
export function klimaMaxUsdcPricePerTonne(): number | undefined {
  const raw = process.env.KLIMA_MAX_USDC_PRICE_PER_TONNE?.trim()
  if (!raw) {
    return undefined
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('KLIMA_MAX_USDC_PRICE_PER_TONNE must be a positive number')
  }
  return n
}
