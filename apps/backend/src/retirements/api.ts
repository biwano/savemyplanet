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

function isRetirementStatus(value: string): value is RetirementStatus {
  return RETIREMENT_STATUSES.some((status) => status === value)
}

export function apiRetirementFromRow(
  row: typeof retirements.$inferSelect,
): APIRetirement {
  if (!isRetirementStatus(row.status)) {
    throw new AppError(500, 'invalid_retirement_status')
  }

  const body: APIRetirement = {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }
  if (row.certificateUrl != null) {
    body.certificateUrl = row.certificateUrl
  }
  return body
}
