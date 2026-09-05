import { AppError } from '../errors'

/** Klima minimum (1 kg), except Toucan Puro which requires whole tonnes. */
export const MIN_TONNES = 0.001

const TONNES_DECIMALS = 6

/**
 * Format a positive tonnes amount for DB / Klima decimal strings
 * (no scientific notation, trimmed trailing zeros).
 */
export function formatTonnesDecimal(raw: number): string {
  const fixed = raw.toFixed(TONNES_DECIMALS)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

/**
 * Normalize a JSON tonnes value to a decimal string suitable for Klima `amount`
 * and DB `numeric` (no scientific notation, trimmed trailing zeros).
 */
export function normalizeTonnes(raw: number): string {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new AppError(400, 'invalid_tonnes')
  }
  if (raw < MIN_TONNES) {
    throw new AppError(400, 'tonnes_below_minimum', { min: MIN_TONNES })
  }

  // Avoid float noise: fix to micro-tonne precision then strip trailing zeros.
  const normalized = formatTonnesDecimal(raw)
  const asNumber = Number(normalized)
  if (!Number.isFinite(asNumber) || asNumber < MIN_TONNES) {
    throw new AppError(400, 'invalid_tonnes')
  }
  return normalized
}

/** Toucan Puro credits only accept whole-tonne amounts (docs/x402.md). */
export function assertTonnesForClass(
  tonnesFormatted: string,
  className: string | undefined,
): void {
  if (!isPuroClassName(className)) {
    return
  }
  if (!/^\d+$/.test(tonnesFormatted)) {
    throw new AppError(400, 'puro_requires_whole_tonnes')
  }
}

export function isPuroClassName(name: string | undefined): boolean {
  if (!name) {
    return false
  }
  return name.toLowerCase().includes('puro')
}
