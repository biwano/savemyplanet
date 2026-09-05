import { beneficiaryAddressFromUserId } from './beneficiary'
import type { LocalUser } from './sync'

/** Wire shape for `user` on GET /me (docs/plan.md API contract). */
export type APIUser = {
  id: string
  email: string
  createdAt: string
  evaluationsRemaining: number
  beneficiaryAddress: string
}

export function apiUserFromRow(user: LocalUser): APIUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    evaluationsRemaining: user.evaluationsRemaining,
    beneficiaryAddress: beneficiaryAddressFromUserId(user.id),
  }
}
