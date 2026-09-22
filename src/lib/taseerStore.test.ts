import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('taseerStore upsert history', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'taseer-store-'))
    vi.stubEnv('TASEER_DATA_DIR', dir)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(dir, { recursive: true, force: true })
  })

  it('attaches a second offer to the same seller', async () => {
    vi.resetModules()
    const store = await import('./taseerStore')
    store.saveInvite({
      token: 'tok-a',
      need: 'سباك',
      postId: '1',
      listingTitle: 'سباك',
      listingUrl: 'https://haraj.com.sa/1',
      authorId: '99',
      authorUsername: 'بائع',
      sellerName: 'بائع',
      message: 'x',
      link: 'http://127.0.0.1:5173/s/tok-a',
      createdAt: new Date().toISOString(),
      sendStatus: 'sent',
    })
    const first = store.submitOffer({ token: 'tok-a', amount: '100', personName: 'أحمد' })
    expect(first.priorOffers).toBe(0)
    expect(first.supplier.offers).toHaveLength(1)
    store.saveInvite({
      token: 'tok-b',
      need: 'سباك',
      postId: '2',
      listingTitle: 'سباك 2',
      listingUrl: 'https://haraj.com.sa/2',
      authorId: '99',
      authorUsername: 'بائع',
      sellerName: 'بائع',
      message: 'x',
      link: 'http://127.0.0.1:5173/s/tok-b',
      createdAt: new Date().toISOString(),
      sendStatus: 'sent',
    })
    const second = store.submitOffer({ token: 'tok-b', amount: '90', personName: 'أحمد' })
    expect(second.priorOffers).toBe(1)
    expect(second.supplier.key).toBe(first.supplier.key)
    expect(second.supplier.offers).toHaveLength(2)
    expect(second.supplier.offers.map((o) => o.amount)).toEqual(['100', '90'])
  })

  it('keeps the previous amount when the seller revises a conversation', async () => {
    vi.resetModules()
    const store = await import('./taseerStore')
    store.saveInvite({
      token: 'tok-rev',
      need: 'سباك',
      postId: '3',
      listingTitle: 'سباك',
      listingUrl: 'https://haraj.com.sa/3',
      authorId: '77',
      authorUsername: 'خالد',
      sellerName: 'خالد',
      message: 'x',
      link: 'http://127.0.0.1:5173/s/tok-rev',
      createdAt: new Date().toISOString(),
      sendStatus: 'sent',
    })
    store.submitOffer({ token: 'tok-rev', amount: '220', personName: 'خالد' })
    const revised =     store.submitOffer({
      token: 'tok-rev',
      amount: '190',
      includesMaterials: true,
      includesDelivery: true,
      deliveryAmount: '50',
      personName: 'خالد',
    })
    expect(revised.priorOffers).toBe(1)
    expect(revised.supplier.offers.map((o) => o.amount)).toEqual(['220', '190'])
    expect(revised.offer.includesMaterials).toBe(true)
    expect(revised.offer.includesDelivery).toBe(true)
    expect(revised.offer.deliveryAmount).toBe('50')
  })
})
