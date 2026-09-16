/**
 * A 429 from the construction API must read as «تجاوزنا حد المحاولات», never as
 * a disconnection or a missing server flag, and must not cost a second request
 * to rediscover. The inbox screen once turned one refusal into a request storm:
 * each «ربط Gmail» click sent a connect POST plus a status GET, and every one of
 * them was refused before it left the building.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSTRUCTION_RATE_LIMITED,
  ConstructionApiError,
  __resetConstructionRateLimitGate,
  constructionRateLimitSec,
  getConstructionGmailStatus,
} from './constructionClient'
import { listConstructionSuppliers } from './constructionSuppliers'

type Reply = { status: number; body: unknown; headers?: Record<string, string> }

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(replies: Reply[]) {
  let i = 0
  fetchMock = vi.fn(async () => {
    const reply = replies[Math.min(i, replies.length - 1)]
    i += 1
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      headers: {
        get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null,
      },
      json: async () => reply.body,
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
}

const rateLimited = (headers?: Record<string, string>, retryAfterSec?: number): Reply => ({
  status: 429,
  headers,
  body: { ok: false, error: 'rate_limited', ...(retryAfterSec ? { retryAfterSec } : {}) },
})

const ok = (data: unknown): Reply => ({ status: 200, body: { ok: true, data } })

beforeEach(() => {
  __resetConstructionRateLimitGate()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  __resetConstructionRateLimitGate()
})

describe('construction API 429 handling', () => {
  it('reports a 429 as a rate limit in Arabic, honouring Retry-After', async () => {
    installFetch([rateLimited({ 'retry-after': '37' }, 37)])

    const err = await getConstructionGmailStatus().catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ConstructionApiError)
    const api = err as ConstructionApiError
    expect(api.status).toBe(429)
    expect(api.code).toBe(CONSTRUCTION_RATE_LIMITED)
    expect(api.retryAfterSec).toBe(37)
    expect(api.message).toContain('تجاوزنا حد المحاولات')
    expect(api.message).toContain('37')
  })

  it('never dresses a 429 as a disconnection or a server-flag problem', async () => {
    installFetch([rateLimited({ 'retry-after': '12' }, 12)])

    const err = (await getConstructionGmailStatus().catch((e: unknown) => e)) as Error

    // The exact lie that sent the owner chasing configuration that was correct.
    expect(err.message).not.toContain('غير متصل')
    expect(err.message).not.toContain('غير مهيّأ')
    expect(err.message).not.toContain('CONSTRUCTION_DB_URL')
    expect(err.message).not.toContain('CONSTRUCTION_GMAIL')
    expect(err.message).not.toContain('rate_limited')
  })

  it('constructionRateLimitSec identifies a 429 and nothing else', async () => {
    installFetch([rateLimited({ 'retry-after': '9' }, 9)])
    const limited = await getConstructionGmailStatus().catch((e: unknown) => e)
    expect(constructionRateLimitSec(limited)).toBe(9)

    __resetConstructionRateLimitGate()
    installFetch([{ status: 503, body: { ok: false, error: 'CONSTRUCTION_READ_DISABLED' } }])
    const disabled = await getConstructionGmailStatus().catch((e: unknown) => e)
    expect(constructionRateLimitSec(disabled)).toBeNull()
  })

  it('refuses locally while the limiter counts down, spending no request', async () => {
    installFetch([rateLimited({ 'retry-after': '30' }, 30)])

    await getConstructionGmailStatus().catch(() => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Ten more callers inside the window — the storm shape. None may reach the
    // network, and each must still get the honest Arabic reason.
    for (let i = 0; i < 10; i++) {
      const err = (await getConstructionGmailStatus().catch((e: unknown) => e)) as ConstructionApiError
      expect(err.code).toBe(CONSTRUCTION_RATE_LIMITED)
      expect(err.status).toBe(429)
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reopens the gate once Retry-After has elapsed, then clears it on success', async () => {
    vi.useFakeTimers()
    installFetch([rateLimited({ 'retry-after': '5' }, 5), ok({ connected: true })])

    await getConstructionGmailStatus().catch(() => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4_000)
    await getConstructionGmailStatus().catch(() => {})
    expect(fetchMock).toHaveBeenCalledTimes(1) // still shut

    vi.advanceTimersByTime(2_000)
    await expect(getConstructionGmailStatus()).resolves.toEqual({ connected: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // A success reopens the gate for everyone.
    await expect(getConstructionGmailStatus()).resolves.toEqual({ connected: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  /**
   * The suppliers catalogue has its own fetch, so it used to keep spending 6 MB
   * requests inside the very window the inbox was counting down — breaking the
   * «أعد المحاولة بعد ٣٢ ثانية» promise it had just made.
   */
  it('shares the gate with the suppliers catalogue, which has its own transport', async () => {
    installFetch([rateLimited({ 'retry-after': '30' }, 30)])

    // The inbox trips the limiter first.
    await getConstructionGmailStatus().catch(() => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The suppliers screen must now refuse locally rather than reset the window.
    const err = (await listConstructionSuppliers().catch((e: unknown) => e)) as ConstructionApiError
    expect(err).toBeInstanceOf(ConstructionApiError)
    expect(err.code).toBe(CONSTRUCTION_RATE_LIMITED)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a rate-limited catalogue as a rate limit, not an empty directory', async () => {
    // `constructionSuppliers` uses window timers for its abort deadline.
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
    installFetch([rateLimited({ 'retry-after': '18' }, 18)])

    const err = (await listConstructionSuppliers().catch((e: unknown) => e)) as ConstructionApiError

    expect(err.status).toBe(429)
    expect(err.code).toBe(CONSTRUCTION_RATE_LIMITED)
    expect(err.message).toContain('تجاوزنا حد المحاولات')
    // The directory is not empty and the database URL is not missing.
    expect(err.message).not.toContain('CONSTRUCTION_DB_URL')
    expect(err.message).not.toContain('لا موردين')
  })

  it('backs off exponentially when the server sends no Retry-After', async () => {
    vi.useFakeTimers()
    installFetch([rateLimited()])

    const first = (await getConstructionGmailStatus().catch((e: unknown) => e)) as ConstructionApiError
    expect(first.retryAfterSec).toBe(2)

    vi.advanceTimersByTime(2_100)
    const second = (await getConstructionGmailStatus().catch((e: unknown) => e)) as ConstructionApiError
    expect(second.retryAfterSec).toBe(4)

    vi.advanceTimersByTime(4_100)
    const third = (await getConstructionGmailStatus().catch((e: unknown) => e)) as ConstructionApiError
    expect(third.retryAfterSec).toBe(8)
  })
})
