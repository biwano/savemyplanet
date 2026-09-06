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

export type APIQuote = {
  quoteId: string
  carbonClass: string
  tonnes: number
  userTotal: number
  currency: 'USD'
  expiresAt: string
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

export type APIErrorBody = {
  error: string
  details?: unknown
}
