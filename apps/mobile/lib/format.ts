/** Format USD cents as a display string (e.g. 1234 → "$12.34"). */
export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

/** Format tCO₂e for chrome (e.g. 1.25 → "1.25 t"). */
export function formatTonnes(tonnes: number): string {
  if (!Number.isFinite(tonnes) || tonnes <= 0) return '0 t'
  const rounded = Math.round(tonnes * 1000) / 1000
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(3).replace(/\.?0+$/, '')
  return `${body} t`
}

/**
 * Format tonnes for editable amounts / evaluate suggestion (up to 6 dp,
 * matching the evaluate prompt). Does not round small values to zero.
 */
export function formatTonnesExact(tonnes: number): string {
  if (!Number.isFinite(tonnes) || tonnes <= 0) return '0'
  const rounded = Math.round(tonnes * 1e6) / 1e6
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(6).replace(/\.?0+$/, '')
}

export function parseMajorToCents(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!normalized) return null
  const major = Number(normalized)
  if (!Number.isFinite(major) || major < 0) return null
  return Math.round(major * 100)
}

export function centsToMajorInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** First 3 local-part chars + ellipsis + full domain (e.g. alice@x.com → ali...@x.com). */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return trimmed
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  return `${local.slice(0, 3)}...@${domain}`
}
