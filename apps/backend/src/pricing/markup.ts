/**
 * Klima USDC `total` is 6-decimal base units. One USD cent = 10_000 base units.
 * Markup is applied on exact wholesale micros, then both amounts ceil to cents
 * so we never under-charge the user (docs/plan.md B6).
 */

export const USDC_DECIMALS = 6
/** 1e6 micros per USDC / 100 cents = 10_000 micros per cent. */
export const USDC_MICROS_PER_CENT = 10_000n

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

/** Parse Klima wholesale `total` (integer string of USDC base units). */
export function parseKlimaTotalMicros(total: string): bigint {
  const trimmed = total.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`invalid Klima total: ${total}`)
  }
  return BigInt(trimmed)
}

export type MarkedUpTotals = {
  klimaTotalCents: number
  userTotalCents: number
}

/**
 * `user_total = ceil_cents(klima_total * (1 + MARKUP_BPS / 10000))`.
 * `klimaTotalCents` is also ceiled for integer storage.
 */
export function applyMarkup(
  klimaTotalMicros: bigint,
  markupBps: number,
): MarkedUpTotals {
  if (klimaTotalMicros < 0n) {
    throw new Error('klima total must be non-negative')
  }
  if (!Number.isInteger(markupBps) || markupBps < 0) {
    throw new Error('markupBps must be a non-negative integer')
  }

  const scale = 10_000n
  const userMicros = ceilDiv(
    klimaTotalMicros * (scale + BigInt(markupBps)),
    scale,
  )

  const klimaTotalCents = Number(ceilDiv(klimaTotalMicros, USDC_MICROS_PER_CENT))
  const userTotalCents = Number(ceilDiv(userMicros, USDC_MICROS_PER_CENT))

  if (
    !Number.isSafeInteger(klimaTotalCents) ||
    !Number.isSafeInteger(userTotalCents)
  ) {
    throw new Error('marked-up total exceeds safe integer range')
  }

  return { klimaTotalCents, userTotalCents }
}
