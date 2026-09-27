/**
 * The booklet endpoints are optional on the API: an RFQ with no booklet (or an
 * API without the route) must read as «no booklet», never as an error on the
 * request screen, and an empty list must read as an empty list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  __resetConstructionRateLimitGate,
  getConstructionBooklet,
  getConstructionRfqBooklet,
  listConstructionBooklets,
} from './constructionClient'

type Reply = { status: number; body: unknown }

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(reply: Reply) {
  fetchMock = vi.fn(async () => ({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: { get: () => null },
    json: async () => reply.body,
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
}

const notFound = (code: string): Reply => ({ status: 404, body: { ok: false, error: code } })

beforeEach(() => __resetConstructionRateLimitGate())
afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('booklet client', () => {
  it('returns the RFQ booklet link', async () => {
    installFetch({ status: 200, body: { ok: true, data: { booklet_id: 'b1', reference: 'PR-H288', wave_number: 3, waves: 5 } } })
    await expect(getConstructionRfqBooklet('rfq-1')).resolves.toEqual({
      booklet_id: 'b1',
      reference: 'PR-H288',
      wave_number: 3,
      waves: 5,
    })
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/construction/rfqs/rfq-1/booklet')
  })

  it('reads 404 BOOKLET_NOT_FOUND as no booklet', async () => {
    installFetch(notFound('BOOKLET_NOT_FOUND'))
    await expect(getConstructionRfqBooklet('rfq-1')).resolves.toBeNull()
  })

  it('reads a 404 with no code (route not deployed) as no booklet', async () => {
    installFetch({ status: 404, body: null })
    await expect(getConstructionRfqBooklet('rfq-1')).resolves.toBeNull()
  })

  it('reads an empty payload as no booklet', async () => {
    installFetch({ status: 200, body: { ok: true, data: null } })
    await expect(getConstructionRfqBooklet('rfq-1')).resolves.toBeNull()
  })

  it('still throws other failures for the RFQ booklet (caller stays silent)', async () => {
    installFetch({ status: 500, body: { ok: false, error: 'BOOM' } })
    await expect(getConstructionRfqBooklet('rfq-1')).rejects.toBeInstanceOf(ConstructionApiError)
  })

  it('lists booklets, and a 404 or missing array is an empty list', async () => {
    installFetch({ status: 200, body: { ok: true, data: { booklets: [{ id: 'b1' }] } } })
    await expect(listConstructionBooklets()).resolves.toEqual({ booklets: [{ id: 'b1' }] })
    installFetch(notFound('NOT_FOUND'))
    await expect(listConstructionBooklets()).resolves.toEqual({ booklets: [] })
    installFetch({ status: 200, body: { ok: true, data: {} } })
    await expect(listConstructionBooklets()).resolves.toEqual({ booklets: [] })
  })

  it('a missing booklet throws a 404 the view can tell apart', async () => {
    installFetch(notFound('BOOKLET_NOT_FOUND'))
    const err = await getConstructionBooklet('b-missing').catch((e) => e)
    expect(err).toBeInstanceOf(ConstructionApiError)
    expect(err.status).toBe(404)
  })
})
