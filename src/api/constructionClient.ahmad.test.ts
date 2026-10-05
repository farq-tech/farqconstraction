import { afterEach, expect, it, vi } from 'vitest'
import { askAhmad, __resetConstructionRateLimitGate, getAhmadBooklets } from './constructionClient'
afterEach(() => { vi.unstubAllGlobals(); __resetConstructionRateLimitGate() })
it('sends chat as JSON with selected request and data context', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, data: { reply: 'عندك كراستان' } }) })
  vi.stubGlobal('fetch', fetchMock)
  await expect(askAhmad('كم كراسة', [], 'rfq-1', { booklets: ['a', 'b'] })).resolves.toBe('عندك كراستان')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toContain('/assistant/chat')
  expect(init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init.body)).toMatchObject({ rfq_id: 'rfq-1', context: { booklets: ['a', 'b'] } })
})
it('a missing booklet API is an error, never a fabricated empty list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ ok: false, errors: [{ message: 'غير متاح' }] }) }))
  await expect(getAhmadBooklets()).rejects.toMatchObject({ status: 404 })
})
