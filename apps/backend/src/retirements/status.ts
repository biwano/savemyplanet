/** Retirement state machine (docs/plan.md B8). */
export const RETIREMENT_STATUSES = [
  'reserved',
  'submitted',
  'pending_index',
  'settled',
  'released',
] as const

export type RetirementStatus = (typeof RETIREMENT_STATUSES)[number]
