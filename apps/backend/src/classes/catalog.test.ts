import { describe, expect, it } from 'vitest'
import type { KlimaCarbonClass } from '../klima/index'
import { isValidCarbonClass } from './catalog'

describe('isValidCarbonClass', () => {
  const id = '0x67cbbf776bff742178693f5156c5f814c274ae14'

  it('rejects missing / blank names', () => {
    expect(isValidCarbonClass({ carbonClassId: id })).toBe(false)
    expect(isValidCarbonClass({ carbonClassId: id, name: '' })).toBe(false)
    expect(isValidCarbonClass({ carbonClassId: id, name: '   ' })).toBe(false)
  })

  it('rejects names that are only the class id or a bare address', () => {
    expect(isValidCarbonClass({ carbonClassId: id, name: id })).toBe(false)
    expect(
      isValidCarbonClass({ carbonClassId: id, name: id.toUpperCase() }),
    ).toBe(false)
    expect(
      isValidCarbonClass({
        carbonClassId: id,
        name: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toBe(false)
  })

  it('rejects Puro / whole-tonne-only class names', () => {
    const puro: KlimaCarbonClass = {
      carbonClassId: '0xcccccccccccccccccccccccccccccccccccccccc',
      name: 'Toucan Puro Example',
    }
    expect(isValidCarbonClass(puro)).toBe(false)
  })

  it('accepts human labels', () => {
    expect(
      isValidCarbonClass({ carbonClassId: id, name: 'Biochar' }),
    ).toBe(true)
    expect(
      isValidCarbonClass({
        carbonClassId: id,
        name: ' Wind Energy - Small Scale ',
      }),
    ).toBe(true)
  })

  it('filters a mixed catalog via .filter', () => {
    const named: KlimaCarbonClass = {
      carbonClassId: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
      name: 'Biochar',
    }
    const nameless: KlimaCarbonClass = {
      carbonClassId: '0x67cbbf776bff742178693f5156c5f814c274ae14',
      name: '0x67cbbf776bff742178693f5156c5f814c274ae14',
    }
    const puro: KlimaCarbonClass = {
      carbonClassId: '0xcccccccccccccccccccccccccccccccccccccccc',
      name: 'Toucan Puro Example',
    }
    expect([nameless, named, puro].filter(isValidCarbonClass)).toEqual([
      named,
    ])
  })
})
