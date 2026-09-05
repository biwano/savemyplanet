import { describe, expect, it } from 'vitest'
import { databaseUrlHostname, isAllowedTestNetworkUrl } from './network'

describe('test network guard (MSW)', () => {
  it('allows the DATABASE_URL host', () => {
    const hostname = databaseUrlHostname()
    expect(hostname).toBeTruthy()
    expect(isAllowedTestNetworkUrl(`https://${hostname}/sql`)).toBe(true)
  })

  it('allows neon.tech sibling hosts', () => {
    expect(
      isAllowedTestNetworkUrl(
        'https://ep-example-pooler.us-east-2.aws.neon.tech/sql',
      ),
    ).toBe(true)
    expect(isAllowedTestNetworkUrl('https://neon.tech/')).toBe(true)
  })

  it('rejects unexpected outbound fetch', async () => {
    await expect(
      fetch('https://example.com/vitest-network-guard'),
    ).rejects.toThrow()
  })

  it('does not allow unrelated hosts', () => {
    expect(isAllowedTestNetworkUrl('https://api.stripe.com/v1')).toBe(false)
    expect(isAllowedTestNetworkUrl('https://openrouter.ai/api/v1')).toBe(
      false,
    )
    expect(isAllowedTestNetworkUrl('https://x402.klimalabs.com/')).toBe(false)
  })
})
