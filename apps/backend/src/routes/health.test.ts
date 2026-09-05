import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../test/app'

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock('../db/index', () => ({
  db: {
    execute,
  },
}))

describe('GET /health', () => {
  beforeEach(() => {
    execute.mockReset()
    execute.mockResolvedValue({ rows: [{ '?column?': 1 }] })
  })

  it('returns { ok: true } when the database responds', async () => {
    const app = createTestApp()
    const res = await app.request('/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('returns 503 when the database is unavailable', async () => {
    execute.mockRejectedValue(new Error('connection refused'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const app = createTestApp()
    const res = await app.request('/health')

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      ok: false,
      error: 'database_unavailable',
    })
    errorSpy.mockRestore()
  })
})
