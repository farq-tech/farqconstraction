import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetConstructionRateLimitGate, matchConstructionBoqCatalog } from './constructionClient'

function installFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: { rows: [] } }),
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('matchConstructionBoqCatalog candidate limit', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetConstructionRateLimitGate()
  })

  it('sends the explicit per-line limit with the match request', async () => {
    values.set('farq.newSupplierLimit', '25')
    const fetchMock = installFetch()

    await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بلوك اسمنتي' }] })

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ external_candidate_limit: 25 })
  })

  it('omits an empty limit so the API applies its bounded default', async () => {
    const fetchMock = installFetch()

    await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بلوك اسمنتي' }] })

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty('external_candidate_limit')
  })
})
