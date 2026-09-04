import { AppError } from '../errors'
import type { KlimaCarbonClass, KlimaCreditDetail } from '../klima/index'

export type PickedCarbonClass = {
  carbonClassId: string
  name?: string
  creditToken?: string
}

function classLiquidity(cc: KlimaCarbonClass): number {
  return (cc.creditsDetailed ?? []).reduce(
    (sum, cr) => sum + Number(cr.liquidityFormatted ?? 0),
    0,
  )
}

function creditLiquidity(cr: KlimaCreditDetail): number {
  return Number(cr.liquidityFormatted ?? 0)
}

/** Among credits that cover `tonnes`, prefer the most liquid token. */
function mostLiquidCredit(
  credits: KlimaCreditDetail[],
  tonnes: number,
): KlimaCreditDetail | undefined {
  let best: KlimaCreditDetail | undefined
  let bestLiquidity = -1
  for (const cr of credits) {
    const liquidity = creditLiquidity(cr)
    if (liquidity < tonnes) continue
    if (liquidity > bestLiquidity) {
      best = cr
      bestLiquidity = liquidity
    }
  }
  return best
}

/**
 * Cheapest class (by reference USDC/t) with at least `tonnes` of liquid credit.
 * One candidate per class (most-liquid credit when known); ties break on liquidity.
 */
export function pickCheapestLiquid(
  classes: KlimaCarbonClass[],
  tonnes: number,
): PickedCarbonClass | undefined {
  type Pick = {
    cc: KlimaCarbonClass
    credit?: KlimaCreditDetail
    price: number
    liquidity: number
  }
  const picks: Pick[] = []

  for (const cc of classes) {
    if (cc.priceUsdcPerTonneFormatted == null) continue
    const price = Number(cc.priceUsdcPerTonneFormatted)
    if (!Number.isFinite(price)) continue

    const credit = mostLiquidCredit(cc.creditsDetailed ?? [], tonnes)
    if (credit) {
      picks.push({
        cc,
        credit,
        price,
        liquidity: creditLiquidity(credit),
      })
      continue
    }

    // Class-level liquidity fallback when creditsDetailed is empty/partial.
    const liquidity = classLiquidity(cc)
    if (liquidity >= tonnes) {
      picks.push({ cc, price, liquidity })
    }
  }

  picks.sort((a, b) => a.price - b.price || b.liquidity - a.liquidity)

  const best = picks[0]
  if (!best) {
    return undefined
  }

  const picked: PickedCarbonClass = {
    carbonClassId: best.cc.carbonClassId,
  }
  if (best.cc.name !== undefined) picked.name = best.cc.name
  if (best.credit?.tokenAddress) picked.creditToken = best.credit.tokenAddress
  return picked
}

/** Resolve a user-selected class id against discover results. */
export function resolveCarbonClass(
  classes: KlimaCarbonClass[],
  carbonClassId: string,
  tonnes: number,
): PickedCarbonClass {
  const match = classes.find((c) => c.carbonClassId === carbonClassId)
  if (!match) {
    throw new AppError(400, 'unknown_carbon_class')
  }

  const credit = mostLiquidCredit(match.creditsDetailed ?? [], tonnes)
  if (!credit && classLiquidity(match) < tonnes) {
    throw new AppError(409, 'insufficient_liquidity')
  }

  const picked: PickedCarbonClass = {
    carbonClassId: match.carbonClassId,
  }
  if (match.name !== undefined) picked.name = match.name
  if (credit?.tokenAddress) picked.creditToken = credit.tokenAddress
  return picked
}
