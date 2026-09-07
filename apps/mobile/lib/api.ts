import type {
  APIAccountBalance,
  APIClassesResponse,
  APIDepositRequest,
  APIDepositResponse,
  APIErrorBody,
  APIEvaluation,
  APIHealthResponse,
  APIMeResponse,
  APIQuote,
  APIRetirement,
  APIRetirementDetail,
  APIRetirementsListResponse,
} from 'api-types'

import { getApiUrl } from './config'

export class ApiError extends Error {
  readonly status: number
  readonly body: APIErrorBody

  constructor(status: number, body: APIErrorBody) {
    super(body.error)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  token?: string | null
  body?: unknown
  /** Extra attempts after the first (cold-start tolerance). Default 2 → 3 tries. */
  retries?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(status: number, err: unknown): boolean {
  if (err instanceof TypeError) return true // network / failed fetch
  // Never retry 429 — retries amplify rate_limit_exceeded.
  return status === 408 || status >= 500
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 2
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${getApiUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      })

      if (!res.ok) {
        let body: APIErrorBody = { error: 'request_failed' }
        try {
          body = (await res.json()) as APIErrorBody
        } catch {
          // keep default
        }
        if (attempt < retries && isRetryable(res.status, null)) {
          await sleep(500 * 2 ** attempt)
          continue
        }
        throw new ApiError(res.status, body)
      }

      if (res.status === 204) {
        return undefined as T
      }
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      if (err instanceof ApiError) throw err
      if (attempt < retries && isRetryable(0, err)) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw err
    }
  }
  throw lastError
}

export const api = {
  health: () => request<APIHealthResponse>('/health', { retries: 3 }),

  me: (token: string) => request<APIMeResponse>('/me', { token }),

  account: (token: string) =>
    request<APIAccountBalance>('/account', { token }),

  deposit: (token: string, body: APIDepositRequest) =>
    request<APIDepositResponse>('/account/deposit', {
      method: 'POST',
      token,
      body,
      retries: 1,
    }),

  evaluate: (token: string, activity: string) =>
    request<APIEvaluation>('/evaluations', {
      method: 'POST',
      token,
      body: { activity },
      retries: 1,
    }),

  classes: (token: string) =>
    request<APIClassesResponse>('/classes', { token }),

  createQuote: (token: string, tonnes: number, carbonClass?: string) =>
    request<APIQuote>('/quotes', {
      method: 'POST',
      token,
      body: carbonClass ? { tonnes, carbonClass } : { tonnes },
      retries: 1,
    }),

  retire: (
    token: string,
    input: {
      quoteId: string
      beneficiaryString: string
      retirementMessage?: string
    },
  ) =>
    request<APIRetirement>('/retirements', {
      method: 'POST',
      token,
      body: input,
      retries: 0,
    }),

  listRetirements: (token: string) =>
    request<APIRetirementsListResponse>('/retirements', { token }),

  getRetirement: (token: string, id: string) =>
    request<APIRetirementDetail>(`/retirements/${id}`, { token }),
}
