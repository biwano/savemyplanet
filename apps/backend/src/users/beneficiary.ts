import { getAddress, keccak256, stringToBytes, type Address } from 'viem'

/**
 * Deterministic checksummed EVM address derived from our user UUID.
 * Same id always yields the same address; not a controlled wallet key.
 */
export function beneficiaryAddressFromUserId(userId: string): Address {
  const hash = keccak256(stringToBytes(userId))
  return getAddress(`0x${hash.slice(2, 42)}`)
}
