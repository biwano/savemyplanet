import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../../test/app'
import { authHeader, mockClerkAuth } from '../../test/auth'
import { createTestUser, deleteTestUserByClerkId } from '../../test/db'
import type { LocalUser } from '../../users/sync'

describe('GET /account', () => {
  let user: LocalUser

  beforeEach(async () => {
    user = await createTestUser()
    mockClerkAuth(user.clerkId)
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(user.clerkId)
  })

  it('returns 401 without Authorization', async () => {
    const app = createTestApp()
    const res = await app.request('/account')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns balance shape', async () => {
    const app = createTestApp()
    const res = await app.request('/account', { headers: authHeader() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      available: 0,
      reserved: 0,
      currency: 'USD',
    })
  })
})
