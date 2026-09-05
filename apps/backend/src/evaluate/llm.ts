import { z } from 'zod'
import {
  openRouterApiKey,
  openRouterBaseUrl,
  openRouterModel,
} from './config'
import { EVALUATE_SYSTEM_PROMPT } from './prompt'

export type LlmEvaluation = {
  suggestedTonnes: number
  rationale: string
  ambiguous: boolean
}

const LLM_TIMEOUT_MS = 20_000

const chatCompletionSchema = z.object({
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
  const raw = await callOpenRouter(activity)
  return parseLlmJson(raw)
}

async function callOpenRouter(activity: string): Promise<string> {
  const key = openRouterApiKey()

  const res = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Optional OpenRouter attribution headers (ignored by routing).
      'HTTP-Referer': 'https://savemyplanet.app',
      'X-Title': 'SaveMyPlanet',
    },
    body: JSON.stringify({
      model: openRouterModel(),
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
  return content
}

/** Parse model JSON; tolerate minor wrapping. Returns null if unusable. */
export function parseLlmJson(raw: string): LlmEvaluation | null {
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
