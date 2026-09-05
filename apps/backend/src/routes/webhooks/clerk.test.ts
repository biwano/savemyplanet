import type { WebhookEvent } from '@clerk/backend/webhooks'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '../../db/schema/users'
import { createTestApp } from '../../test/app'
import { deleteTestUserByClerkId, testDb } from '../../test/db'
import {
  mockClerkWebhook,
  mockClerkWebhookInvalid,
} from '../../test/mocks'

function clerkUserCreatedEvent(clerkId: string): WebhookEvent {
  return {
    type: 'user.created',
    data: {
      id: clerkId,
      object: 'user',
      primary_email_address_id: 'email_1',
      email_addresses: [
        {
          id: 'email_1',
          email_address: 'webhook@example.com',
        },
      ],
    },
  } as WebhookEvent
}

describe('POST /webhooks/clerk', () => {
  let clerkId: string

  beforeEach(() => {
    // Unique per test so parallel CI/local runs against a shared DB cannot collide.
    clerkId = `user_test_${randomUUID().replace(/-/g, '')}`
  })

  afterEach(async () => {
    await deleteTestUserByClerkId(clerkId)
  })

  it('rejects an invalid signature', async () => {
    mockClerkWebhookInvalid()

    const app = createTestApp()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/webhooks/clerk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    errorSpy.mockRestore()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_webhook' })
  })

  it('syncs the user on a valid user.created event', async () => {
    mockClerkWebhook(clerkUserCreatedEvent(clerkId))

    const app = createTestApp()
    const res = await app.request('/webhooks/clerk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    const row = await testDb.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    })
    expect(row?.email).toBe('webhook@example.com')
  })
})
