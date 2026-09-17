import type { KlimaCarbonClass } from '../klima/index'
import { isPuroClassName } from '../pricing/tonnes'

/**
 * Catalog eligibility: human-readable name required; whole-tonne-only (Puro)
 * excluded. Applied once when parsing Klima discover.
 */
export function isValidCarbonClass(cc: KlimaCarbonClass): boolean {
  const trimmed = cc.name?.trim()
  if (!trimmed) {
    return false
  }
  if (trimmed.toLowerCase() === cc.carbonClassId.toLowerCase()) {
    return false
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return false
  }
  if (isPuroClassName(trimmed)) {
    return false
  }
  return true
}
