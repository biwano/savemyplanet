import { createPublicClient, erc20Abi, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { AppError } from '../errors'
import { usdcMicrosToFloorCents } from '../pricing/markup'
import { klimaPayerPrivateKey, klimaRpcUrl } from './config'

/** USDC on Base mainnet (6 decimals). Matches Klima vendor INPUT_TOKENS. */
const USDC_BASE_MAINNET: Address =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function createBasePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })
}

type BasePublicClient = ReturnType<typeof createBasePublicClient>

let cachedRpcUrl: string | undefined
let cachedClient: BasePublicClient | undefined

/** Shared Base mainnet client; recreated only when `KLIMA_RPC_URL` changes. */
function getPublicClient(): BasePublicClient {
  const rpcUrl = klimaRpcUrl()
  if (cachedClient && cachedRpcUrl === rpcUrl) {
    return cachedClient
  }
  cachedRpcUrl = rpcUrl
  cachedClient = createBasePublicClient(rpcUrl)
  return cachedClient
}

/** Test helper: drop the cached RPC client (e.g. after env changes). */
export function resetUsdcBalanceClient(): void {
  cachedRpcUrl = undefined
  cachedClient = undefined
}

/**
 * Live USDC `balanceOf` for the service wallet on Base mainnet (floor to cents).
 * No balance cache — C1 headroom always re-reads on-chain. RPC client is reused.
 */
export async function readServiceWalletUsdcBalanceCents(): Promise<number> {
  const account = privateKeyToAccount(klimaPayerPrivateKey())
  const client = getPublicClient()

  let balance: bigint
  try {
    balance = await client.readContract({
      address: USDC_BASE_MAINNET,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account.address],
    })
  } catch (err) {
    console.error('klima wallet USDC balanceOf failed:', err)
    throw new AppError(503, 'klima_wallet_balance_unavailable')
  }

  try {
    return usdcMicrosToFloorCents(balance)
  } catch {
    throw new AppError(502, 'klima_invalid_wallet_balance')
  }
}
