import { describe, expect, it } from 'vitest'
import {
  markedUpCentsFromUsdcDollarsFormatted,
  parseUsdcDollarsFormattedToMicros,
} from './markup'

describe('parseUsdcDollarsFormattedToMicros', () => {
  it('parses whole dollars', () => {
    expect(parseUsdcDollarsFormattedToMicros('80')).toBe(80_000_000n)
  })

  it('parses fractional dollars up to 6 dp', () => {
    expect(parseUsdcDollarsFormattedToMicros('83.20')).toBe(83_200_000n)
    expect(parseUsdcDollarsFormattedToMicros('1.234567')).toBe(1_234_567n)
  })

  it('truncates beyond 6 fractional digits', () => {
    expect(parseUsdcDollarsFormattedToMicros('1.2345678')).toBe(1_234_567n)
  })

  it('rejects unusable strings', () => {
    expect(parseUsdcDollarsFormattedToMicros('')).toBeUndefined()
    expect(parseUsdcDollarsFormattedToMicros('abc')).toBeUndefined()
    expect(parseUsdcDollarsFormattedToMicros('-1')).toBeUndefined()
    expect(parseUsdcDollarsFormattedToMicros('1.2.3')).toBeUndefined()
  })
})

describe('markedUpCentsFromUsdcDollarsFormatted', () => {
  it('applies 40% markup and ceils to cents', () => {
    // $80 wholesale → $112 user = 11200 cents
    expect(markedUpCentsFromUsdcDollarsFormatted('80', 4000)).toBe(11_200)
    // $83.20 → $116.48 = 11648 cents
    expect(markedUpCentsFromUsdcDollarsFormatted('83.20', 4000)).toBe(11_648)
  })

  it('returns undefined for zero / unusable', () => {
    expect(markedUpCentsFromUsdcDollarsFormatted('0', 4000)).toBeUndefined()
    expect(markedUpCentsFromUsdcDollarsFormatted('nope', 4000)).toBeUndefined()
  })
})
