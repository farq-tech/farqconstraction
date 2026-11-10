import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  __resetConstructionRateLimitGate,
  sendConstructionWhatsAppTest,
} from './constructionClient'

function installFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
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
  it('posts one direct test and returns the Meta message id', async () => {
    const fetchMock = installFetch(200, { ok: true, messageId: 'wamid.test-1', to: '***3463' })

    await expect(sendConstructionWhatsAppTest('966501234567', 'اختبار فقط')).resolves.toMatchObject({
      messageId: 'wamid.test-1',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toContain('/admin/whatsapp/send')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ to: '966501234567', body: 'اختبار فقط' })
  })

  it('marks an indeterminate provider result so the caller cannot retry it', async () => {
    const fetchMock = installFetch(502, { ok: false, error: 'network_error', indeterminate: true })

    const err = await sendConstructionWhatsAppTest('966501234567', 'اختبار فقط').catch((value: unknown) => value)
    expect(err).toBeInstanceOf(ConstructionApiError)
    expect((err as ConstructionApiError).indeterminate).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
