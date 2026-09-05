import type { evaluations } from '../db/schema/evaluations'

/** Wire shape for POST /evaluations (docs/plan.md API contract). */
export type APIEvaluation = {
  suggestedTonnes: number
  rationale: string
}

export function apiEvaluationFromRow(
  row: typeof evaluations.$inferSelect,
): APIEvaluation {
  return {
    suggestedTonnes: Number(row.suggestedTonnes),
    rationale: row.rationale ?? '',
  }
}
