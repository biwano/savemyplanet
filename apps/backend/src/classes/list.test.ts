import { describe, expect, it } from 'vitest'
import type { KlimaCarbonClass } from '../klima/index'
import { toApiCarbonClasses } from './list'

describe('toApiCarbonClasses', () => {
  const named: KlimaCarbonClass = {
    carbonClassId: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
    name: 'Biochar',
    priceUsdcPerTonneFormatted: '80',
  }

  it('maps catalog classes with description + imageUrl', () => {
    const classes = toApiCarbonClasses(
      [named],
      (file) => `https://api.test/static/carbonclasses/${file}`,
      'en',
    )

    expect(classes).toEqual([
      {
        carbonClass: named.carbonClassId,
        name: 'Biochar',
        description: expect.stringContaining('biochar'),
        imageUrl: 'https://api.test/static/carbonclasses/biochar.avif',
        // $80 wholesale × 40% default markup → $112 = 11200 cents
        pricePerTonne: 11_200,
      },
    ])
  })

  it('returns French description when lang is fr', () => {
    const [row] = toApiCarbonClasses([named], (file) => `/${file}`, 'fr')
    expect(row?.description).toMatch(/biochar/i)
    expect(row?.description).toMatch(/Retrait durable/i)
  })

  it('uses default.avif when no curated image', () => {
    const unknownNamed: KlimaCarbonClass = {
      carbonClassId: '0xdddddddddddddddddddddddddddddddddddddddd',
      name: 'Future Named Class',
    }
    const [row] = toApiCarbonClasses([unknownNamed], (file) => `/${file}`, 'en')
    expect(row).toEqual({
      carbonClass: unknownNamed.carbonClassId,
      name: 'Future Named Class',
      imageUrl: '/default.avif',
    })
    expect(row).not.toHaveProperty('description')
    expect(row).not.toHaveProperty('pricePerTonne')
  })

  it('omits pricePerTonne when discover reference is null', () => {
    const noPrice: KlimaCarbonClass = {
      carbonClassId: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      name: 'No Price Class',
      priceUsdcPerTonneFormatted: null,
    }
    const [row] = toApiCarbonClasses([noPrice], (file) => `/${file}`, 'en')
    expect(row).not.toHaveProperty('pricePerTonne')
  })
})
