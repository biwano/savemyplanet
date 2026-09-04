/** Default: Base mainnet. Sepolia (`84532`) only when explicitly configured. */
export const KLIMA_CHAIN_ID_MAINNET = 8453
export const KLIMA_CHAIN_ID_SEPOLIA = 84532

const ALLOWED_CHAIN_IDS = [KLIMA_CHAIN_ID_MAINNET, KLIMA_CHAIN_ID_SEPOLIA] as const

export const DEFAULT_KLIMA_BASE_URL = 'https://x402.klimalabs.com'

/** How long to reuse a discover catalog (reference prices + liquidity). */
export const DEFAULT_DISCOVER_CACHE_TTL_MS = 60_000

/** Endpoint origin (no trailing `/api`). Defaults to production x402. */
export function klimaBaseUrl(): string {
  const value = process.env.KLIMA_BASE_URL?.trim()
  return (value || DEFAULT_KLIMA_BASE_URL).replace(/\/+$/, '')
}

/**
 * Base chain for Klima quotes/retirements.
 * Optional `KLIMA_CHAIN_ID`: `8453` (mainnet, default) or `84532` (Sepolia).
 */
export function klimaChainId(): number {
  const raw = process.env.KLIMA_CHAIN_ID?.trim()
  if (!raw) {
    return KLIMA_CHAIN_ID_MAINNET
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || !ALLOWED_CHAIN_IDS.some((id) => id === n)) {
    throw new Error(
      `KLIMA_CHAIN_ID must be ${KLIMA_CHAIN_ID_MAINNET} or ${KLIMA_CHAIN_ID_SEPOLIA}`,
    )
  }
  return n
}

/** In-process discover cache TTL. Live `/quote` is never cached. */
export function discoverCacheTtlMs(): number {
  const raw = process.env.KLIMA_DISCOVER_CACHE_TTL_MS?.trim()
  if (!raw) {
    return DEFAULT_DISCOVER_CACHE_TTL_MS
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 60 * 60 * 1000) {
    throw new Error(
      'KLIMA_DISCOVER_CACHE_TTL_MS must be an integer between 0 and 3600000',
    )
  }
  return n
}
