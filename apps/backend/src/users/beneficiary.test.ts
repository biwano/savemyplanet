import { isAddress, getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { beneficiaryAddressFromUserId } from './beneficiary'

describe('beneficiaryAddressFromUserId', () => {
  const sampleId = '550e8400-e29b-41d4-a716-446655440000'

  it('returns a checksummed EVM address', () => {
    const address = beneficiaryAddressFromUserId(sampleId)
    expect(isAddress(address)).toBe(true)
    expect(address).toBe(getAddress(address))
  })

  it('is stable for the same user id', () => {
    expect(beneficiaryAddressFromUserId(sampleId)).toBe(
      beneficiaryAddressFromUserId(sampleId),
    )
  })

  it('differs for different user ids', () => {
    const other = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    expect(beneficiaryAddressFromUserId(sampleId)).not.toBe(
      beneficiaryAddressFromUserId(other),
    )
  })
})
