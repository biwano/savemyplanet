import { describe, expect, it } from 'vitest'
import { parseCarbonClassLang } from './metadata'

describe('parseCarbonClassLang', () => {
  it('defaults to en', () => {
    expect(parseCarbonClassLang(undefined)).toBe('en')
    expect(parseCarbonClassLang('')).toBe('en')
    expect(parseCarbonClassLang('  ')).toBe('en')
  })

  it('accepts en and fr (case / region tags)', () => {
    expect(parseCarbonClassLang('en')).toBe('en')
    expect(parseCarbonClassLang('FR')).toBe('fr')
    expect(parseCarbonClassLang('fr-FR')).toBe('fr')
    expect(parseCarbonClassLang('en_US')).toBe('en')
  })

  it('falls back to en for unknown langs', () => {
    expect(parseCarbonClassLang('de')).toBe('en')
    expect(parseCarbonClassLang('zz')).toBe('en')
  })
})
