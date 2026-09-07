/** Wire types matching docs/plan.md API contract (frozen field names). */

export type APIAccountBalance = {
  available: number
  reserved: number
  currency: 'USD'
}

export type APIUser = {
  id: string
  email: string
  createdAt: string
  evaluationsRemaining: number
  beneficiaryAddress: string
}

export type APIMeResponse = {
  user: APIUser
  account: APIAccountBalance
}

export type APIHealthResponse = {
  ok: true
}

export type APIEvaluation = {
  suggestedTonnes: number
  rationale: string
  evaluationsRemaining: number
}

export type APICarbonClass = {
  carbonClass: string
  name: string
  description?: string
}

export type APIClassesResponse = {
  classes: APICarbonClass[]
}

export type APIQuote = {
  quoteId: string
  carbonClass: string
  tonnes: number
  userTotal: number
  currency: 'USD'
  expiresAt: string
}

export type APIPresentmentCurrency = 'usd' | 'eur'

export type APIDepositRequest = {
  amount: number
  currency: APIPresentmentCurrency
}

export type APIDepositResponse = {
  clientSecret: string
  paymentIntentId: string
}

export type APIRetirementStatus =
  | 'reserved'
  | 'submitted'
  | 'pending_index'
  | 'settled'
  | 'released'

export type APIRetirement = {
  id: string
  status: APIRetirementStatus
  createdAt: string
  certificateUrl?: string | null
}

export type APIRetirementDetail = {
  id: string
  status: APIRetirementStatus
  tonnes: number
  userTotal: number
  certificateUrl?: string | null
  txHash?: string | null
}

export type APIRetirementsListResponse = {
  items: APIRetirementDetail[]
}

export type APIErrorBody = {
  error: string
  details?: unknown
}
