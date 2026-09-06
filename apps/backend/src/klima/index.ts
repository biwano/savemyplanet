import { randomBytes } from 'node:crypto'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { createTtlCache } from '../cache/ttl'
import { AppError } from '../errors'
import {
  assertKlimaRetireModeSafe,
  DEFAULT_KLIMA_TIMEOUT_MS,
  discoverCacheTtlMs,
  klimaBaseUrl,
  klimaChainId,
  klimaFakeRetireStatus,
  klimaPayerPrivateKey,
  klimaRetireMode,
  KLIMA_RETIRE_MODE_FAKE,
} from './config'
import { mapKlimaError } from './errors'
import {
  createClient,
  KlimaRetireError,
  type DiscoverFilters,
  type Eip712TypedData,
  type KlimaClient,
  type QuoteParams,
  type RetireResult,
} from './vendor/klima-retire'

/** Fixed for ClearMyCarbon: pay Klima in USDC on Base. */
export const KLIMA_INPUT_TOKEN = 'usdc' as const

export type { DiscoverFilters }

export type KlimaDiscoverResult = {
  carbonClasses: KlimaCarbonClass[]
}

export type KlimaCarbonClass = {
  carbonClassId: string
  name?: string
  priceUsdcPerTonneFormatted?: string | null
  creditsDetailed?: KlimaCreditDetail[]
}

export type KlimaCreditDetail = {
  tokenAddress: string
  liquidityFormatted?: string
  projectId?: string
  vintage?: number
}

/** Wholesale quote from x402. Never send `total` / `humanSummary` on user routes. */
export type KlimaQuoteResult = {
  tonnesFormatted?: string
  total: string
  totalFormatted: string
  humanSummary?: string
  resolvedCredit?: {
    creditToken?: string
    tokenId?: number
    vintage?: number
  }
}

export type KlimaQuoteInput = {
  amount: string | number
  carbonClass: string
  creditToken?: string
  vintage?: number
  tokenId?: string | number
}

/** User-facing retire attribution; payer is always the service wallet. */
export type KlimaRetireInput = {
  amount: string | number
  carbonClass: string
  beneficiaryAddress: string
  beneficiaryString: string
  retirementMessage?: string
  creditToken?: string
  vintage?: number
  tokenId?: string | number
}

/** Settled (or pending_index) result for orchestration. Never expose wholesale. */
export type KlimaRetireResult = {
  status: RetireResult['status']
  transactionHash: string
  certificateUrl: string | null
  /**
   * EIP-3009 / prepare-auth `authValue` (USDC micros). Null when omitted
   * (should not happen on a real prepare-auth) or when fake mode leaves
   * synthesis to orchestration.
   */
  authValueMicros: string | null
  /**
   * Optional firm total from `RetireResult.quote.total` when present and
   * distinct from the auth ceiling.
   */
  retireTotalMicros: string | null
}

/** Carbonmark certificate lookup by tx hash (Klima `/certificate`). */
export type KlimaCertificateResult = {
  transactionHash: string
  certificateUrl: string
}

type SignTypedDataParams = Parameters<PrivateKeyAccount['signTypedData']>[0]

let cachedClient: KlimaClient | undefined

const discoverCache = createTtlCache<KlimaDiscoverResult>({
  ttlMs: discoverCacheTtlMs,
})

function getClient(): KlimaClient {
  if (!cachedClient) {
    cachedClient = createClient({
      baseUrl: klimaBaseUrl(),
      chainId: klimaChainId(),
      timeoutMs: DEFAULT_KLIMA_TIMEOUT_MS,
    })
  }
  return cachedClient
}

function discoverCacheKey(filters: DiscoverFilters): string {
  return JSON.stringify({
    chainId: klimaChainId(),
    baseUrl: klimaBaseUrl(),
    carbonClass: filters.carbonClass ?? null,
    creditToken: filters.creditToken ?? null,
    maxUsdcPricePerTonne:
      filters.maxUsdcPricePerTonne != null
        ? String(filters.maxUsdcPricePerTonne)
        : null,
  })
}

/** Test helper: drop the cached client and discover catalog (e.g. after env changes). */
export function resetKlimaClient(): void {
  cachedClient = undefined
  discoverCache.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Klima returns a loose EIP-712 JSON blob; narrow it for viem without `as`.
 */
function isSignTypedDataParams(
  typedData: Eip712TypedData,
): typedData is Eip712TypedData & SignTypedDataParams {
  return (
    typeof typedData.primaryType === 'string' &&
    isRecord(typedData.domain) &&
    isRecord(typedData.types) &&
    isRecord(typedData.message)
  )
}

function parseCreditDetail(raw: unknown): KlimaCreditDetail | undefined {
  if (!isRecord(raw) || typeof raw.tokenAddress !== 'string') {
    return undefined
  }
  const credit: KlimaCreditDetail = { tokenAddress: raw.tokenAddress }
  const liquidityFormatted = optionalString(raw.liquidityFormatted)
  if (liquidityFormatted !== undefined) credit.liquidityFormatted = liquidityFormatted
  const projectId = optionalString(raw.projectId)
  if (projectId !== undefined) credit.projectId = projectId
  const vintage = optionalNumber(raw.vintage)
  if (vintage !== undefined) credit.vintage = vintage
  return credit
}

function parseCarbonClass(raw: unknown): KlimaCarbonClass | undefined {
  if (!isRecord(raw) || typeof raw.carbonClassId !== 'string') {
    return undefined
  }
  const cc: KlimaCarbonClass = { carbonClassId: raw.carbonClassId }
  const name = optionalString(raw.name)
  if (name !== undefined) cc.name = name
  if (raw.priceUsdcPerTonneFormatted === null) {
    cc.priceUsdcPerTonneFormatted = null
  } else {
    const price = optionalString(raw.priceUsdcPerTonneFormatted)
    if (price !== undefined) cc.priceUsdcPerTonneFormatted = price
  }
  if (Array.isArray(raw.creditsDetailed)) {
    cc.creditsDetailed = raw.creditsDetailed.flatMap((item) => {
      const credit = parseCreditDetail(item)
      return credit ? [credit] : []
    })
  }
  return cc
}

/** Require catalog shape used by quotes/markup; drop malformed class rows. */
function parseDiscoverResult(raw: unknown): KlimaDiscoverResult {
  if (!isRecord(raw) || !Array.isArray(raw.carbonClasses)) {
    throw new AppError(502, 'klima_invalid_discover')
  }
  return {
    carbonClasses: raw.carbonClasses.flatMap((item) => {
      const cc = parseCarbonClass(item)
      return cc ? [cc] : []
    }),
  }
}

/** Require wholesale totals before any markup math. */
function parseQuoteResult(raw: unknown): KlimaQuoteResult {
  if (
    !isRecord(raw) ||
    typeof raw.total !== 'string' ||
    typeof raw.totalFormatted !== 'string'
  ) {
    throw new AppError(502, 'klima_invalid_quote')
  }
  const result: KlimaQuoteResult = {
    total: raw.total,
    totalFormatted: raw.totalFormatted,
  }
  const tonnesFormatted = optionalString(raw.tonnesFormatted)
  if (tonnesFormatted !== undefined) result.tonnesFormatted = tonnesFormatted
  const humanSummary = optionalString(raw.humanSummary)
  if (humanSummary !== undefined) result.humanSummary = humanSummary
  if (isRecord(raw.resolvedCredit)) {
    const rc = raw.resolvedCredit
    const resolved: NonNullable<KlimaQuoteResult['resolvedCredit']> = {}
    const creditToken = optionalString(rc.creditToken)
    if (creditToken !== undefined) resolved.creditToken = creditToken
    const tokenId = optionalNumber(rc.tokenId)
    if (tokenId !== undefined) resolved.tokenId = tokenId
    const vintage = optionalNumber(rc.vintage)
    if (vintage !== undefined) resolved.vintage = vintage
    result.resolvedCredit = resolved
  }
  return result
}

function parseRetireResult(
  raw: RetireResult,
  authValueMicros: string | null,
): KlimaRetireResult {
  if (typeof raw.transactionHash !== 'string' || !raw.transactionHash) {
    throw new AppError(502, 'klima_invalid_retire')
  }
  const certificateUrl =
    raw.retirements.find((r) => typeof r.certificateUrl === 'string')
      ?.certificateUrl ?? null
  const retireTotalMicros =
    isRecord(raw.quote) && typeof raw.quote.total === 'string'
      ? parseOptionalUsdcMicros(raw.quote.total)
      : null
  return {
    status: raw.status,
    transactionHash: raw.transactionHash,
    certificateUrl,
    authValueMicros,
    retireTotalMicros,
  }
}

/** USDC base-unit integer string (or non-negative integer). */
function parseOptionalUsdcMicros(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return /^\d+$/.test(trimmed) ? trimmed : null
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value)
  }
  return null
}

/**
 * Browse retirable carbon classes (read-only).
 * Catalog is TTL-cached in-process; set `KLIMA_DISCOVER_CACHE_TTL_MS=0` to disable.
 */
export async function discover(
  filters: DiscoverFilters = {},
): Promise<KlimaDiscoverResult> {
  return discoverCache.getOrSet(discoverCacheKey(filters), async () => {
    try {
      return parseDiscoverResult(await getClient().discover(filters))
    } catch (err) {
      mapKlimaError(err)
    }
  })
}

/**
 * Live wholesale price for a tonne amount (read-only).
 * Always quotes in USDC. Logs `total` server-side; callers must not expose it on user APIs.
 */
export async function quote(input: KlimaQuoteInput): Promise<KlimaQuoteResult> {
  const params: QuoteParams = {
    amount: input.amount,
    carbonClass: input.carbonClass,
    inputToken: KLIMA_INPUT_TOKEN,
    ...(input.creditToken ? { creditToken: input.creditToken } : {}),
    ...(input.vintage != null ? { vintage: input.vintage } : {}),
    ...(input.tokenId != null ? { tokenId: input.tokenId } : {}),
  }

  try {
    const result = parseQuoteResult(await getClient().quote(params))
    console.info('klima quote wholesale:', {
      carbonClass: input.carbonClass,
      amount: String(input.amount),
      total: result.total,
      totalFormatted: result.totalFormatted,
      chainId: klimaChainId(),
    })
    return result
  } catch (err) {
    mapKlimaError(err)
  }
}

/**
 * Resolve the public Carbonmark certificate for a mined retirement tx.
 * Returns `null` while the subgraph is still indexing (`404 retirement_not_found`)
 * or when Klima has not yet attached a `certificateUrl`.
 */
export async function certificate(
  txHash: string,
): Promise<KlimaCertificateResult | null> {
  try {
    const raw = await getClient().certificate({ txHash })
    if (typeof raw.transactionHash !== 'string' || !raw.transactionHash) {
      throw new AppError(502, 'klima_invalid_certificate')
    }
    if (!Array.isArray(raw.retirements)) {
      throw new AppError(502, 'klima_invalid_certificate')
    }
    const certificateUrl =
      raw.retirements.find((r) => typeof r.certificateUrl === 'string')
        ?.certificateUrl ?? null
    if (!certificateUrl) {
      return null
    }
    return {
      transactionHash: raw.transactionHash,
      certificateUrl,
    }
  } catch (err) {
    if (
      err instanceof KlimaRetireError &&
      (err.status === 404 || err.code === 'retirement_not_found')
    ) {
      return null
    }
    mapKlimaError(err)
  }
}

/**
 * Staging-only synthetic retire (no x402, no USDC). Ledger reserve/capture still
 * runs in orchestration. Production Cloud Run refuses this mode at boot.
 *
 * Auth spend is not inventable here — orchestration sets a documented
 * synthetic ceiling from the linked quote’s `klima_total_cents` on settle.
 */
function fakeRetire(input: KlimaRetireInput): KlimaRetireResult {
  assertKlimaRetireModeSafe()
  const status = klimaFakeRetireStatus()
  if (status === 'fail') {
    throw new AppError(502, 'klima_fake_retire_failed')
  }

  const transactionHash = `0x${randomBytes(32).toString('hex')}`
  const certificateUrl =
    status === 'settled'
      ? `https://carbonmark.com/retirements/fake/${transactionHash}`
      : null

  const result: KlimaRetireResult = {
    status,
    transactionHash,
    certificateUrl,
    // Null: executeRetirement synthesizes from quote.klima_total_cents.
    authValueMicros: null,
    retireTotalMicros: null,
  }
  console.info('klima retire (fake):', {
    carbonClass: input.carbonClass,
    amount: String(input.amount),
    status: result.status,
    transactionHash: result.transactionHash,
    chainId: klimaChainId(),
  })
  return result
}

/**
 * Sign + relay retirement from the service wallet (`KLIMA_PAYER_PRIVATE_KEY`).
 * Sets Klima `details.beneficiaryAddress` from the caller (UUID-derived for users).
 * When `KLIMA_RETIRE_MODE=fake`, returns a synthetic result (staging only).
 */
export async function retire(
  input: KlimaRetireInput,
): Promise<KlimaRetireResult> {
  if (klimaRetireMode() === KLIMA_RETIRE_MODE_FAKE) {
    return fakeRetire(input)
  }

  const account = privateKeyToAccount(klimaPayerPrivateKey())

  try {
    let authValueMicros: string | null = null
    const raw = await getClient().retire({
      amount: input.amount,
      carbonClass: input.carbonClass,
      inputToken: KLIMA_INPUT_TOKEN,
      from: account.address,
      signTypedData: (typedData: Eip712TypedData) => {
        if (!isSignTypedDataParams(typedData)) {
          throw new AppError(502, 'klima_invalid_typed_data')
        }
        // Fallback if prepare-auth omitted top-level authValue: EIP-3009
        // message.value is the signed USDC ceiling.
        if (authValueMicros == null) {
          authValueMicros = parseOptionalUsdcMicros(typedData.message.value)
        }
        return account.signTypedData(typedData)
      },
      onStep: (step, info) => {
        if (step === 'sign' && authValueMicros == null) {
          authValueMicros = parseOptionalUsdcMicros(info.authValue)
        }
      },
      details: {
        beneficiaryAddress: input.beneficiaryAddress,
        beneficiaryString: input.beneficiaryString,
        ...(input.retirementMessage
          ? { retirementMessage: input.retirementMessage }
          : {}),
      },
      ...(input.creditToken ? { creditToken: input.creditToken } : {}),
      ...(input.vintage != null ? { vintage: input.vintage } : {}),
      ...(input.tokenId != null ? { tokenId: input.tokenId } : {}),
    })

    const result = parseRetireResult(raw, authValueMicros)
    if (result.authValueMicros == null) {
      console.warn('klima retire missing authValue; spend columns will be null', {
        carbonClass: input.carbonClass,
        transactionHash: result.transactionHash,
      })
    }
    console.info('klima retire:', {
      carbonClass: input.carbonClass,
      amount: String(input.amount),
      status: result.status,
      transactionHash: result.transactionHash,
      chainId: klimaChainId(),
    })
    return result
  } catch (err) {
    mapKlimaError(err)
  }
}
