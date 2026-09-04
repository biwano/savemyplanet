import { ACCOUNT_CURRENCY } from '../account/currency'
import { db } from '../db/index'
import { quotes } from '../db/schema/quotes'
import { AppError } from '../errors'
import { discover, quote as klimaQuote } from '../klima/index'
import {
  klimaMaxUsdcPricePerTonne,
  markupBps,
  quoteTtlMs,
} from '../pricing/config'
import { applyMarkup, parseKlimaTotalMicros } from '../pricing/markup'
import { pickCheapestLiquid, resolveCarbonClass } from '../pricing/pickClass'
import {
  assertTonnesForClass,
  normalizeTonnes,
} from '../pricing/tonnes'
import { apiQuoteFromRow, type APIQuote } from './api'

export type CreateQuoteInput = {
  userId: string
  tonnes: number
  /** When omitted, backend picks cheapest liquid class (discover + optional price cap). */
  carbonClass?: string
}

export async function createUserQuote(
  input: CreateQuoteInput,
): Promise<APIQuote> {
  const tonnesFormatted = normalizeTonnes(input.tonnes)
  const tonnesNumber = Number(tonnesFormatted)

  // Price cap only for auto-pick; an explicit class must still be quotable
  // even if it sits above KLIMA_MAX_USDC_PRICE_PER_TONNE.
  const maxPrice =
    input.carbonClass == null ? klimaMaxUsdcPricePerTonne() : undefined
  const catalog = await discover(
    maxPrice != null ? { maxUsdcPricePerTonne: maxPrice } : {},
  )

  const picked = input.carbonClass
    ? resolveCarbonClass(
        catalog.carbonClasses,
        input.carbonClass,
        tonnesNumber,
      )
    : pickCheapestLiquid(catalog.carbonClasses, tonnesNumber)

  if (!picked) {
    throw new AppError(409, 'no_liquid_carbon_class')
  }

  assertTonnesForClass(tonnesFormatted, picked.name)

  const wholesale = await klimaQuote({
    amount: tonnesFormatted,
    carbonClass: picked.carbonClassId,
    ...(picked.creditToken ? { creditToken: picked.creditToken } : {}),
  })

  let klimaMicros: bigint
  try {
    klimaMicros = parseKlimaTotalMicros(wholesale.total)
  } catch {
    throw new AppError(502, 'klima_invalid_quote')
  }

  const bps = markupBps()
  const { klimaTotalCents, userTotalCents } = applyMarkup(klimaMicros, bps)

  if (userTotalCents < 1) {
    // Extremely cheap wholesale after ceil can still be 0; refuse free retirements.
    throw new AppError(400, 'quote_total_too_small')
  }

  const expiresAt = new Date(Date.now() + quoteTtlMs())

  const [row] = await db
    .insert(quotes)
    .values({
      userId: input.userId,
      carbonClass: picked.carbonClassId,
      tonnes: tonnesFormatted,
      markupBps: bps,
      userTotalCents,
      klimaTotalCents,
      currency: ACCOUNT_CURRENCY,
      expiresAt,
    })
    .returning()

  if (!row) {
    throw new AppError(500, 'quote_persist_failed')
  }

  return apiQuoteFromRow(row)
}
