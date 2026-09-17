import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/app'
import { authHeader, mockClerkAuth } from '../test/auth'
import { createTestUser, deleteTestUserByClerkId } from '../test/db'
import { mockKlimaPricing } from '../test/mocks'
import type { LocalUser } from '../users/sync'

describe('GET /classes', () => {
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
    const res = await app.request('/classes')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns named classes only with imageUrl and no wholesale fields', async () => {
    mockKlimaPricing({
      discover: {
        carbonClasses: [
          {
            carbonClassId: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
            name: 'Biochar',
            priceUsdcPerTonneFormatted: '83.20',
            creditsDetailed: [
              {
                tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                liquidityFormatted: '100',
              },
            ],
          },
          {
            carbonClassId: '0x67cbbf776bff742178693f5156c5f814c274ae14',
            name: '0x67cbbf776bff742178693f5156c5f814c274ae14',
            priceUsdcPerTonneFormatted: '1.00',
          },
        ],
      },
    })

    const app = createTestApp()
    const res = await app.request('/classes', {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.classes).toHaveLength(1)
    expect(body.classes[0]).toMatchObject({
      carbonClass: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
      name: 'Biochar',
      imageUrl: expect.stringMatching(
        /\/static\/carbonclasses\/biochar\.avif$/,
      ),
      // $83.20 wholesale × 40% → $116.48 = 11648 cents
      pricePerTonne: 11_648,
    })
    expect(body.classes[0].description).toEqual(expect.any(String))
    expect(JSON.stringify(body)).not.toMatch(/priceUsdc|liquidity|klima/i)
  })

  it('omits pricePerTonne when discover has no reference', async () => {
    mockKlimaPricing({
      discover: {
        carbonClasses: [
          {
            carbonClassId: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
            name: 'Biochar',
            priceUsdcPerTonneFormatted: null,
          },
        ],
      },
    })

    const app = createTestApp()
    const res = await app.request('/classes', {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.classes[0]).not.toHaveProperty('pricePerTonne')
  })

  it('localizes description with ?lang=fr', async () => {
    mockKlimaPricing({
      discover: {
        carbonClasses: [
          {
            carbonClassId: '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8',
            name: 'Biochar',
            priceUsdcPerTonneFormatted: '83.20',
          },
        ],
      },
    })

    const app = createTestApp()
    const res = await app.request('/classes?lang=fr', {
      headers: authHeader(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.classes[0].description).toMatch(/Retrait durable/i)
  })
})

describe('GET /static/*', () => {
  it('serves files with one-day cache headers', async () => {
    const app = createTestApp()
    const res = await app.request('/static/carbonclasses/biochar.avif')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/avif')
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.byteLength).toBeGreaterThan(100)
  })

  it('returns 404 for missing files', async () => {
    const app = createTestApp()
    const res = await app.request('/static/carbonclasses/does-not-exist.avif')

    expect(res.status).toBe(404)
  })

  it('rejects path traversal', async () => {
    const app = createTestApp()
    const res = await app.request('/static/../package.json')

    expect(res.status).toBe(404)
  })
})
