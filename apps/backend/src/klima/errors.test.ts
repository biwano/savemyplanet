import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { classifyKlimaFailure, mapKlimaError } from './errors'
import { KlimaRetireError } from './vendor/klima-retire'

describe('classifyKlimaFailure', () => {
  it('treats timeout / network / abort as ambiguous', () => {
    expect(
      classifyKlimaFailure(new KlimaRetireError('timed out', 408, 'timeout')),
    ).toBe('ambiguous')
    expect(
      classifyKlimaFailure(
        new KlimaRetireError('net down', 0, 'network_error'),
      ),
    ).toBe('ambiguous')
    expect(
      classifyKlimaFailure(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ),
    ).toBe('ambiguous')
  })

  it('treats 5xx and 429 as ambiguous', () => {
    expect(
      classifyKlimaFailure(new KlimaRetireError('upstream', 502, 'klima_error')),
    ).toBe('ambiguous')
    expect(
      classifyKlimaFailure(
        new KlimaRetireError('slow down', 429, 'rate_limited'),
      ),
    ).toBe('ambiguous')
  })

  it('treats explicit 4xx business errors as definitive', () => {
    expect(
      classifyKlimaFailure(
        new KlimaRetireError('bad amount', 400, 'invalid_amount'),
      ),
    ).toBe('definitive_failure')
    expect(
      classifyKlimaFailure(new AppError(422, 'unsupported_input_token')),
    ).toBe('definitive_failure')
  })

  it('treats fake-mode intentional fail as definitive', () => {
    expect(
      classifyKlimaFailure(new AppError(502, 'klima_fake_retire_failed')),
    ).toBe('definitive_failure')
  })

  it('treats unknown errors as ambiguous', () => {
    expect(classifyKlimaFailure(new Error('boom'))).toBe('ambiguous')
    expect(classifyKlimaFailure('string')).toBe('ambiguous')
  })
})

describe('mapKlimaError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rewrites ambiguous vendor errors to klima_outcome_unknown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      mapKlimaError(new KlimaRetireError('timed out', 408, 'timeout')),
    ).toThrow(AppError)
    try {
      mapKlimaError(new KlimaRetireError('timed out', 408, 'timeout'))
    } catch (err) {
      expect(err).toMatchObject({
        status: 504,
        message: 'klima_outcome_unknown',
        details: { klimaCode: 'timeout' },
      })
    }
  })

  it('preserves definitive vendor 4xx codes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mapKlimaError(new KlimaRetireError('bad', 400, 'invalid_amount'))
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({
        status: 400,
        message: 'invalid_amount',
      })
    }
  })
})
