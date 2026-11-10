import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  __resetConstructionRateLimitGate,
  sendConstructionWhatsAppTest,
} from './constructionClient'

function installFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('sendConstructionWhatsAppTest', () => {
  it('posts one owner-scoped test and returns only masked delivery evidence', async () => {
    const fetchMock = installFetch(200, { ok: true, data: { accepted: true, recipient_masked: '966*******63', message_reference: '…test-1', accepted_at: '2026-11-10T00:00:00Z', delivery_state: 'UNCONFIRMED' } })

    await expect(sendConstructionWhatsAppTest('966501234567', 'اختبار فقط')).resolves.toMatchObject({
      message_reference: '…test-1',
      recipient_masked: '966*******63',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]!
    expect(String(input)).toContain('/api/construction/whatsapp/test-send')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ to: '966501234567', body: 'اختبار فقط' })
  })

  it('marks an indeterminate provider result so the caller cannot retry it', async () => {
    const fetchMock = installFetch(502, { ok: false, error: 'network_error', indeterminate: true })

    const err = await sendConstructionWhatsAppTest('966501234567', 'اختبار فقط').catch((value: unknown) => value)
    expect(err).toBeInstanceOf(ConstructionApiError)
    expect((err as ConstructionApiError).indeterminate).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
