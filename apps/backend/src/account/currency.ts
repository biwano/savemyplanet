/** Ledger and quote currency — always USD cents. */
export const ACCOUNT_CURRENCY = 'USD' as const

export const PRESENTMENT_CURRENCIES = ['usd', 'eur'] as const
export type PresentmentCurrency = (typeof PRESENTMENT_CURRENCIES)[number]

export function isPresentmentCurrency(
  value: string,
): value is PresentmentCurrency {
  return PRESENTMENT_CURRENCIES.some((c) => c === value)
}

/** Wire/API shape for account balances (not DB column names). */
export type APIAccountBalance = {
  available: number
  reserved: number
  currency: typeof ACCOUNT_CURRENCY
}

export function accountBalanceFromUser(user: {
  availableCents: number
  reservedCents: number
}): APIAccountBalance {
  return {
    available: user.availableCents,
    reserved: user.reservedCents,
    currency: ACCOUNT_CURRENCY,
  }
}
