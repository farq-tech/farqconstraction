import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { __resetConstructionRateLimitGate, getQuoteDiscountRequests, createQuoteDiscountRequest, cancelQuoteDiscountRequest } from './constructionClient'
const fetchMock = vi.fn()
beforeEach(() => { __resetConstructionRateLimitGate(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, data: { id: 'job', state: 'SCHEDULED' } }) }) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockReset(); __resetConstructionRateLimitGate() })
it('schedules only the chosen quote with an explicit delay and idempotency key', async () => {
  const body = { idempotency_key: 'key', quote_version_id: 'version', delay_minutes: 60 as const, text: 'طلب تخفيض الإجمالي' }
  await createQuoteDiscountRequest('invite', body)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toContain('/inbox/threads/invite/discount-requests')
  expect(init.method).toBe('POST'); expect(JSON.parse(init.body)).toEqual(body)
})
it('reads persisted state and cancels the specific job', async () => {
  await getQuoteDiscountRequests('invite'); await cancelQuoteDiscountRequest('invite','job')
  expect(fetchMock.mock.calls[0][1].method ?? 'GET').toBe('GET')
  expect(fetchMock.mock.calls[1][0]).toContain('/inbox/threads/invite/discount-requests/job/cancel')
})
it('read-only builds refuse immediate send, schedule, and cancellation before network', async () => {
  vi.stubEnv('VITE_READ_ONLY','1')
  for (const delay_minutes of [0,60] as const) await expect(createQuoteDiscountRequest('invite',{ idempotency_key:'key',quote_version_id:'version',delay_minutes,text:'طلب' })).rejects.toMatchObject({ code: 'CONSTRUCTION_READ_ONLY' })
  await expect(cancelQuoteDiscountRequest('invite','job')).rejects.toMatchObject({ code: 'CONSTRUCTION_READ_ONLY' })
  expect(fetchMock).not.toHaveBeenCalled()
})
