import { requireEnv } from '../config'

/** Default OpenRouter chat model (OpenAI-compatible id). */
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini'

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export function openRouterApiKey(): string {
  return requireEnv('OPENROUTER_API_KEY')
}

export function openRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
}

/** OpenRouter OpenAI-compatible API origin (no trailing slash). */
export function openRouterBaseUrl(): string {
  const value = process.env.OPENROUTER_BASE_URL?.trim()
  return (value || DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, '')
}
