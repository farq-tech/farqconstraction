import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetConstructionRateLimitGate, scanPurchaseRequest } from './constructionClient'

afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('construction API cancellation', () => {
  it('preserves a caller cancellation instead of reporting a request timeout', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) throw new Error('expected an abort signal')
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const result = scanPurchaseRequest([], controller.signal)
    controller.abort()
    const error = await result.catch((reason: unknown) => reason)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(DOMException)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})
