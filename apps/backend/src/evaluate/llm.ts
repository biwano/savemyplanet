import { z } from 'zod'
import {
  openRouterApiKey,
  openRouterBaseUrl,
  openRouterModel,
} from './config'
import { EVALUATE_SYSTEM_PROMPT } from './prompt'

/** Token/cost accounting from an OpenRouter chat completion (all optional). */
export type LlmUsage = {
  costUsd: number | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export type LlmEvaluation = {
  suggestedTonnes: number
  rationale: string
  ambiguous: boolean
  /** Present after a real OpenRouter call; mocks may omit it. */
  usage?: LlmUsage
}

const LLM_TIMEOUT_MS = 20_000

/** Content + model only — bad `usage` must not fail the whole completion. */
const chatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  usage: z.unknown().optional(),
})

const llmJsonSchema = z.object({
  suggestedTonnes: z.number().finite().positive(),
  rationale: z.string().optional(),
  ambiguous: z.boolean().optional(),
})

/**
 * Call OpenRouter. Returns null when the response cannot be parsed into a
 * usable estimate. Missing key / HTTP failures throw to the caller.
 */
export async function callLlm(
  activity: string,
): Promise<LlmEvaluation | null> {
  const { content, usage } = await callOpenRouter(activity)
  const parsed = parseLlmJson(content)
  if (!parsed) {
    return null
  }
  return { ...parsed, usage }
}

async function callOpenRouter(activity: string): Promise<{
  content: string
  usage: LlmUsage
}> {
  const key = openRouterApiKey()
  const requestedModel = openRouterModel()

  const res = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Optional OpenRouter attribution headers (ignored by routing).
      'HTTP-Referer': 'https://app.clearmycarbon.com',
      'X-Title': 'ClearMyCarbon',
    },
    body: JSON.stringify({
      model: requestedModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EVALUATE_SYSTEM_PROMPT },
        { role: 'user', content: activity },
      ],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`openrouter_http_${res.status}: ${body.slice(0, 200)}`)
  }

  const parsed = chatCompletionSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new Error('openrouter_invalid_response')
  }
  const content = parsed.data.choices?.[0]?.message?.content
  if (!content?.trim()) {
    throw new Error('openrouter_empty_content')
  }
  return {
    content,
    usage: usageFromCompletion(parsed.data, requestedModel),
  }
}

const usageFieldsSchema = z
  .object({
    prompt_tokens: z.unknown().optional(),
    completion_tokens: z.unknown().optional(),
    total_tokens: z.unknown().optional(),
    cost: z.unknown().optional(),
  })
  .passthrough()

function optionalNonNegInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.trunc(value)
}

function optionalNonNegNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

/**
 * Stable decimal string for Postgres `numeric` (avoids `String(0.1+0.2)` quirks).
 * Enough precision for OpenRouter micro-costs; trims trailing zeros.
 */
export function formatOpenRouterCostUsd(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new Error('invalid_openrouter_cost')
  }
  const fixed = costUsd.toFixed(12)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed.length > 0 ? trimmed : '0'
}

/** Map OpenRouter completion fields into our usage shape (lenient). */
export function usageFromCompletion(
  completion: { model?: string; usage?: unknown },
  fallbackModel: string,
): LlmUsage {
  const model = completion.model?.trim() || fallbackModel.trim() || null
  const parsedUsage = usageFieldsSchema.safeParse(completion.usage)
  if (!parsedUsage.success) {
    return {
      costUsd: null,
      model,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    }
  }
  const usage = parsedUsage.data
  return {
    costUsd: optionalNonNegNumber(usage.cost),
    model,
    promptTokens: optionalNonNegInt(usage.prompt_tokens),
    completionTokens: optionalNonNegInt(usage.completion_tokens),
    totalTokens: optionalNonNegInt(usage.total_tokens),
  }
}

/** Parse model JSON; tolerate minor wrapping. Returns null if unusable. */
export function parseLlmJson(raw: string): Omit<LlmEvaluation, 'usage'> | null {
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    text = fenced[1].trim()
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }

  const parsed = llmJsonSchema.safeParse(json)
  if (!parsed.success) {
    return null
  }

  const rationale = parsed.data.rationale?.trim()
  return {
    suggestedTonnes: parsed.data.suggestedTonnes,
    rationale:
      rationale && rationale.length > 0
        ? rationale
        : 'Estimated from your activity description.',
    ambiguous: parsed.data.ambiguous === true,
  }
}
