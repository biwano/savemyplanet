import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertKlimaRetireModeSafe,
  klimaFakeRetireStatus,
  klimaRetireMode,
  PRODUCTION_CLOUD_RUN_SERVICE,
} from './config'

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

describe('klimaRetireMode', () => {
  let previousRetireMode: string | undefined
  let previousFakeStatus: string | undefined
  let previousKService: string | undefined

  beforeEach(() => {
    previousRetireMode = process.env.KLIMA_RETIRE_MODE
    previousFakeStatus = process.env.KLIMA_FAKE_RETIRE_STATUS
    previousKService = process.env.K_SERVICE
  })

  afterEach(() => {
    restoreEnv('KLIMA_RETIRE_MODE', previousRetireMode)
    restoreEnv('KLIMA_FAKE_RETIRE_STATUS', previousFakeStatus)
    restoreEnv('K_SERVICE', previousKService)
  })

  it('defaults to real when unset', () => {
    delete process.env.KLIMA_RETIRE_MODE
    expect(klimaRetireMode()).toBe('real')
  })

  it('accepts fake', () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    expect(klimaRetireMode()).toBe('fake')
  })

  it('rejects unknown values', () => {
    process.env.KLIMA_RETIRE_MODE = 'dry-run'
    expect(() => klimaRetireMode()).toThrow(/KLIMA_RETIRE_MODE/)
  })
})

describe('assertKlimaRetireModeSafe', () => {
  let previousRetireMode: string | undefined
  let previousKService: string | undefined

  beforeEach(() => {
    previousRetireMode = process.env.KLIMA_RETIRE_MODE
    previousKService = process.env.K_SERVICE
  })

  afterEach(() => {
    restoreEnv('KLIMA_RETIRE_MODE', previousRetireMode)
    restoreEnv('K_SERVICE', previousKService)
  })

  it('allows fake mode outside the production Cloud Run service', () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    process.env.K_SERVICE = 'savemyplanet-api-staging'
    expect(() => assertKlimaRetireModeSafe()).not.toThrow()
  })

  it('allows fake mode when K_SERVICE is unset (local)', () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    delete process.env.K_SERVICE
    expect(() => assertKlimaRetireModeSafe()).not.toThrow()
  })

  it('refuses fake mode on the production Cloud Run service', () => {
    process.env.KLIMA_RETIRE_MODE = 'fake'
    process.env.K_SERVICE = PRODUCTION_CLOUD_RUN_SERVICE
    expect(() => assertKlimaRetireModeSafe()).toThrow(
      /KLIMA_RETIRE_MODE=fake is forbidden/,
    )
  })

  it('allows real mode on the production Cloud Run service', () => {
    process.env.KLIMA_RETIRE_MODE = 'real'
    process.env.K_SERVICE = PRODUCTION_CLOUD_RUN_SERVICE
    expect(() => assertKlimaRetireModeSafe()).not.toThrow()
  })
})

describe('klimaFakeRetireStatus', () => {
  let previousFakeStatus: string | undefined

  beforeEach(() => {
    previousFakeStatus = process.env.KLIMA_FAKE_RETIRE_STATUS
  })

  afterEach(() => {
    restoreEnv('KLIMA_FAKE_RETIRE_STATUS', previousFakeStatus)
  })

  it('defaults to pending_index', () => {
    delete process.env.KLIMA_FAKE_RETIRE_STATUS
    expect(klimaFakeRetireStatus()).toBe('pending_index')
  })

  it('accepts settled and fail', () => {
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'settled'
    expect(klimaFakeRetireStatus()).toBe('settled')
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'fail'
    expect(klimaFakeRetireStatus()).toBe('fail')
  })

  it('rejects unknown values', () => {
    process.env.KLIMA_FAKE_RETIRE_STATUS = 'queued'
    expect(() => klimaFakeRetireStatus()).toThrow(/KLIMA_FAKE_RETIRE_STATUS/)
  })
})
