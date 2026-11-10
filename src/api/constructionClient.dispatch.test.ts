import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetConstructionRateLimitGate, sendConstructionRfqInvite } from './constructionClient'

afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('sendConstructionRfqInvite', () => {
  it('marks a retry after a Meta delivery refusal as an explicitly paid Cloud send', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ok: true, data: { id: 'rfq-1' } }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await sendConstructionRfqInvite('rfq-1', 'invite-1', {
      retry: true,
      sendConsent: false,
      whatsappPaid: true,
      preferWhatsApp: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]!
    expect(String(input)).toContain('/api/construction/rfqs/rfq-1/invites/invite-1/send')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      send_consent: false,
      whatsapp_paid: true,
      prefer_whatsapp: true,
      retry: true,
    })
  })
})
