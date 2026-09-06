import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/index'
import { evaluations } from '../db/schema/evaluations'
import { users } from '../db/schema/users'
import { AppError } from '../errors'
import { formatTonnesDecimal, MIN_TONNES } from '../pricing/tonnes'
import { apiEvaluationFromRow, type APIEvaluation } from './api'
import {
  callLlm,
  formatOpenRouterCostUsd,
  type LlmEvaluation,
} from './llm'

export type EvaluateActivityInput = {
  userId: string
  /** Current remaining quota (checked before the LLM call). */
  evaluationsRemaining: number
  activity: string
}

/**
 * Estimate tCO₂e via LLM only. No heuristic fallback — if the model fails
 * or is ambiguous, the request errors and nothing is persisted / quota is
 * not consumed.
 */
export async function evaluateActivity(
  input: EvaluateActivityInput,
): Promise<APIEvaluation> {
  const activity = input.activity.trim()
  if (!activity) {
    throw new AppError(400, 'invalid_activity')
  }

  if (input.evaluationsRemaining <= 0) {
    throw new AppError(403, 'evaluation_quota_exhausted')
  }

  const estimate = await resolveEstimate(activity)
  const tonnesFormatted = normalizeSuggestedTonnes(estimate.suggestedTonnes)
  const usage = estimate.usage

  return db.transaction(async (tx) => {
    const [decremented] = await tx
      .update(users)
      .set({
        evaluationsRemaining: sql`${users.evaluationsRemaining} - 1`,
      })
      .where(
        and(eq(users.id, input.userId), gt(users.evaluationsRemaining, 0)),
      )
      .returning({ evaluationsRemaining: users.evaluationsRemaining })

    if (!decremented) {
      throw new AppError(403, 'evaluation_quota_exhausted')
    }

    const [row] = await tx
      .insert(evaluations)
      .values({
        userId: input.userId,
        activityText: activity,
        suggestedTonnes: tonnesFormatted,
        rationale: estimate.rationale,
        openrouterCostUsd:
          usage?.costUsd != null
            ? formatOpenRouterCostUsd(usage.costUsd)
            : null,
        openrouterModel: usage?.model ?? null,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
      })
      .returning()

    if (!row) {
      throw new AppError(500, 'evaluation_persist_failed')
    }

    return apiEvaluationFromRow(row, decremented.evaluationsRemaining)
  })
}

async function resolveEstimate(activity: string): Promise<{
  suggestedTonnes: number
  rationale: string
  usage?: LlmEvaluation['usage']
}> {
  let llm: LlmEvaluation | null
  try {
    llm = await callLlm(activity)
  } catch (err) {
    console.error('evaluate llm failed:', err)
    throw new AppError(502, 'evaluation_unavailable')
  }

  if (!llm || !Number.isFinite(llm.suggestedTonnes) || llm.suggestedTonnes <= 0) {
    throw new AppError(502, 'evaluation_unavailable')
  }

  if (llm.ambiguous) {
    throw new AppError(422, 'evaluation_ambiguous', {
      rationale: llm.rationale,
    })
  }

  return {
    suggestedTonnes: llm.suggestedTonnes,
    rationale: llm.rationale,
    usage: llm.usage,
  }
}

/**
 * Format suggested tonnes for DB `numeric` + wire number.
 * Floor at {@link MIN_TONNES} so the suggestion is quotable.
 * Rejects non-positive / non-finite input (no invented tonnage).
 */
export function normalizeSuggestedTonnes(raw: number): string {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new AppError(502, 'evaluation_unavailable')
  }

  return formatTonnesDecimal(Math.max(raw, MIN_TONNES))
}
