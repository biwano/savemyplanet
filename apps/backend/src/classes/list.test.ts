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
  })
})
