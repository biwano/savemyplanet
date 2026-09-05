import { AppError } from '../errors'
import type { retirements } from '../db/schema/retirements'
import {
  RETIREMENT_STATUSES,
  type RetirementStatus,
} from './status'

/** Wire shape for POST /retirements (docs/plan.md API contract). */
export type APIRetirement = {
  id: string
  status: RetirementStatus
  createdAt: string
  certificateUrl?: string | null
}

/** Wire shape for GET /retirements and GET /retirements/:id. */
export type APIRetirementDetail = {
  id: string
  status: RetirementStatus
  tonnes: number
  userTotal: number
  certificateUrl?: string | null
  txHash?: string | null
}

function isRetirementStatus(value: string): value is RetirementStatus {
  return RETIREMENT_STATUSES.some((status) => status === value)
}

function requireStatus(row: typeof retirements.$inferSelect): RetirementStatus {
  if (!isRetirementStatus(row.status)) {
    throw new AppError(500, 'invalid_retirement_status')
  }
  return row.status
}

export function apiRetirementFromRow(
  row: typeof retirements.$inferSelect,
): APIRetirement {
  const body: APIRetirement = {
    id: row.id,
    status: requireStatus(row),
    createdAt: row.createdAt.toISOString(),
  }
  if (row.certificateUrl != null) {
    body.certificateUrl = row.certificateUrl
  }
  return body
}

export function apiRetirementDetailFromRow(
  row: typeof retirements.$inferSelect,
  userTotalCents: number,
): APIRetirementDetail {
  const body: APIRetirementDetail = {
    id: row.id,
    status: requireStatus(row),
    tonnes: Number(row.tonnes),
    userTotal: userTotalCents,
  }
  if (row.certificateUrl != null) {
    body.certificateUrl = row.certificateUrl
  }
  if (row.txHash != null) {
    body.txHash = row.txHash
  }
  return body
}
