import type { evaluations } from '../db/schema/evaluations'

/** Wire shape for POST /evaluations (docs/plan.md API contract). */
export type APIEvaluation = {
  suggestedTonnes: number
  rationale: string
  evaluationsRemaining: number
}

export function apiEvaluationFromRow(
  row: typeof evaluations.$inferSelect,
  evaluationsRemaining: number,
): APIEvaluation {
  return {
    suggestedTonnes: Number(row.suggestedTonnes),
    rationale: row.rationale ?? '',
    evaluationsRemaining,
  }
}
