import { isHex, type Hex } from 'viem'
import { requireEnv } from '../config'

/** Default: Base mainnet. Sepolia (`84532`) only when explicitly configured. */
export const KLIMA_CHAIN_ID_MAINNET = 8453
export const KLIMA_CHAIN_ID_SEPOLIA = 84532

const ALLOWED_CHAIN_IDS = [KLIMA_CHAIN_ID_MAINNET, KLIMA_CHAIN_ID_SEPOLIA] as const

export const DEFAULT_KLIMA_BASE_URL = 'https://x402.klimalabs.com'

/** How long to reuse a discover catalog (reference prices + liquidity). */
export const DEFAULT_DISCOVER_CACHE_TTL_MS = 60_000

/** Per-request HTTP timeout for Klima client (Cloud Run ≥ Klima wait). */
export const DEFAULT_KLIMA_TIMEOUT_MS = 60_000

/**
 * Production Cloud Run service name (`K_SERVICE`). Fake retire must never run here.
 * Staging service is `savemyplanet-api-staging`.
 */
export const PRODUCTION_CLOUD_RUN_SERVICE = 'savemyplanet-api'

export const KLIMA_RETIRE_MODE_REAL = 'real' as const
export const KLIMA_RETIRE_MODE_FAKE = 'fake' as const

export type KlimaRetireMode =
  | typeof KLIMA_RETIRE_MODE_REAL
  | typeof KLIMA_RETIRE_MODE_FAKE

/** Synthetic status for `KLIMA_RETIRE_MODE=fake` (default pending_index). */
export type KlimaFakeRetireStatus = 'settled' | 'pending_index' | 'fail'

/** Endpoint origin (no trailing `/api`). Defaults to production x402. */
export function klimaBaseUrl(): string {
  const value = process.env.KLIMA_BASE_URL?.trim()
  return (value || DEFAULT_KLIMA_BASE_URL).replace(/\/+$/, '')
}

/**
 * Retire path mode. Unset / `real` → live x402. `fake` → synthetic result (no USDC).
 * Discover/quote always hit live Klima regardless of this flag.
 */
export function klimaRetireMode(): KlimaRetireMode {
  const raw = process.env.KLIMA_RETIRE_MODE?.trim().toLowerCase()
  if (!raw || raw === KLIMA_RETIRE_MODE_REAL) {
    return KLIMA_RETIRE_MODE_REAL
  }
  if (raw === KLIMA_RETIRE_MODE_FAKE) {
    return KLIMA_RETIRE_MODE_FAKE
  }
  throw new Error(
    `KLIMA_RETIRE_MODE must be "${KLIMA_RETIRE_MODE_REAL}" or "${KLIMA_RETIRE_MODE_FAKE}"`,
  )
}

/**
 * Hard guard: refuse to start (or retire) with fake mode on the production
 * Cloud Run service. Do not rely on “just don’t set the flag” on prod.
 */
export function assertKlimaRetireModeSafe(): void {
  if (klimaRetireMode() !== KLIMA_RETIRE_MODE_FAKE) {
    return
  }
  const service = process.env.K_SERVICE?.trim()
  if (service === PRODUCTION_CLOUD_RUN_SERVICE) {
    throw new Error(
      `KLIMA_RETIRE_MODE=fake is forbidden on Cloud Run service ${PRODUCTION_CLOUD_RUN_SERVICE}`,
    )
  }
}

/**
 * Optional override for fake retire outcomes (staging demos / failure drills).
 * Default: pending_index (tx hash, no certificate yet).
 */
export function klimaFakeRetireStatus(): KlimaFakeRetireStatus {
  const raw = process.env.KLIMA_FAKE_RETIRE_STATUS?.trim().toLowerCase()
  if (!raw || raw === 'pending_index') {
    return 'pending_index'
  }
  if (raw === 'settled') {
    return 'settled'
  }
  if (raw === 'fail') {
    return 'fail'
  }
  throw new Error(
    'KLIMA_FAKE_RETIRE_STATUS must be "settled", "pending_index", or "fail"',
  )
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

/**
 * Service-wallet private key for x402 relay retirements (USDC on Base).
 * Never expose to clients or logs.
 */
export function klimaPayerPrivateKey(): Hex {
  const key = requireEnv('KLIMA_PAYER_PRIVATE_KEY')
  // 0x + 32 bytes hex
  if (!isHex(key) || key.length !== 66) {
    throw new Error(
      'KLIMA_PAYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key',
    )
  }
  return key
}

/** Default public Base mainnet RPC for live USDC balanceOf (C1 headroom). */
export const DEFAULT_KLIMA_RPC_URL = 'https://mainnet.base.org'

/** JSON-RPC HTTP endpoint for Base mainnet reads (balanceOf). Always live — no cache. */
export function klimaRpcUrl(): string {
  const value = process.env.KLIMA_RPC_URL?.trim()
  if (value) {
    return value.replace(/\/+$/, '')
  }
  return DEFAULT_KLIMA_RPC_URL
}

/**
 * Pad on quote `klima_total_cents` when claiming headroom before prepare-auth
 * (auth ceiling is usually higher). Default 1000 bps = 10%.
 */
export const DEFAULT_KLIMA_HEADROOM_PAD_BPS = 1000

export function klimaHeadroomPadBps(): number {
  const raw = process.env.KLIMA_HEADROOM_PAD_BPS?.trim()
  if (!raw) {
    return DEFAULT_KLIMA_HEADROOM_PAD_BPS
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new Error(
      'KLIMA_HEADROOM_PAD_BPS must be an integer between 0 and 100000',
    )
  }
  return n
}
