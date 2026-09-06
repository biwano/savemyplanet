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

  const klimaTotalCents = usdcMicrosToCeilCents(klimaTotalMicros)
  const userTotalCents = usdcMicrosToCeilCents(userMicros)

  return { klimaTotalCents, userTotalCents }
}

/** Ceil USDC base units to USD cents (1 cent = 10_000 micros). */
export function usdcMicrosToCeilCents(micros: bigint): number {
  if (micros < 0n) {
    throw new Error('USDC micros must be non-negative')
  }
  const cents = Number(ceilDiv(micros, USDC_MICROS_PER_CENT))
  if (!Number.isSafeInteger(cents)) {
    throw new Error('USDC amount exceeds safe integer cents range')
  }
  return cents
}

/**
 * Floor USDC base units to USD cents. Used for wallet headroom budget so we
 * never admit more spend than on-chain balance can cover.
 */
export function usdcMicrosToFloorCents(micros: bigint): number {
  if (micros < 0n) {
    throw new Error('USDC micros must be non-negative')
  }
  const cents = Number(micros / USDC_MICROS_PER_CENT)
  if (!Number.isSafeInteger(cents)) {
    throw new Error('USDC amount exceeds safe integer cents range')
  }
  return cents
}

/**
 * Synthetic auth ceiling for fake retire: reverse the stored ceiled cents
 * into micros (`cents * 10_000`). Documented staging convention — not a
 * real prepare-auth value.
 */
export function fakeAuthMicrosFromKlimaTotalCents(
  klimaTotalCents: number,
): bigint {
  if (!Number.isInteger(klimaTotalCents) || klimaTotalCents < 0) {
    throw new Error('klimaTotalCents must be a non-negative integer')
  }
  return BigInt(klimaTotalCents) * USDC_MICROS_PER_CENT
}
