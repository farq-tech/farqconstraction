import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FarqAuthError, createFarqSession, type SessionStorageLike } from './farqSession'

/** An in-memory stand-in for one browser's localStorage. */
function fakeStorage(): SessionStorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  }
}

function loginBody(over: Record<string, unknown> = {}) {
  return {
    data: {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-owner',
        email: 'owner@farq.sa',
        email_verified: true,
        display_name: 'مالك فرق',
      },
      ...over,
    },
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

/** Records every call so a test can assert how many times a token was spent. */
function recordingFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body })
    return handler(url, init ?? {})
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('farqSession — real login issues a per-account session', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
  })

  it('exchanges a password for a session bound to that account', async () => {
    const { impl, calls } = recordingFetch(() => jsonResponse(200, loginBody()))
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })

    expect(session.isAuthenticated()).toBe(false)
    const issued = await session.signIn('owner@farq.sa', 'correct-horse')

    expect(calls[0].url).toContain('/api/auth/login')
    expect(issued.user.id).toBe('user-owner')
    expect(issued.user.email).toBe('owner@farq.sa')
    expect(session.getAccessToken()).toBe('access-1')
    expect(session.getUser()?.displayName).toBe('مالك فرق')
    session.dispose()
  })

  it('reports a wrong password as a credential failure, not a server problem', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse(401, { errors: [{ message: 'Invalid email or password' }] }),
    )
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })

    await expect(session.signIn('owner@farq.sa', 'wrong')).rejects.toThrow(FarqAuthError)
    expect(session.isAuthenticated()).toBe(false)
    expect(session.getAccessToken()).toBeNull()
    session.dispose()
  })

  it('distinguishes an unconfigured signing secret from a wrong password', async () => {
    // 503 from /api/auth/login means the deployment has no FARQ_AUTH_JWT_SECRET.
    // Telling the owner "wrong password" there sends him hunting for the wrong bug.
    const { impl } = recordingFetch(() => jsonResponse(503, { message: 'local auth disabled' }))
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })

    await expect(session.signIn('owner@farq.sa', 'anything')).rejects.toMatchObject({
      code: 'LOCAL_AUTH_NOT_CONFIGURED',
    })
    session.dispose()
  })

  it('keeps one account per browser and announces the identity change', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/login')) {
        return jsonResponse(
          200,
          loginBody({
            access_token: 'access-2',
            refresh_token: 'refresh-2',
            user: { id: 'user-engineer', email: 'eng@farq.sa', email_verified: true },
          }),
        )
      }
      return jsonResponse(200, {})
    })
    const first = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })

    const events: Array<[string, string | null]> = []
    first.subscribe((event, next) => events.push([event, next?.user.id ?? null]))
    await first.signIn('eng@farq.sa', 'pw')

    expect(events).toContainEqual(['IDENTITY_CHANGED', 'user-engineer'])
    // One key, one account: signing in as somebody else must not leave two
    // live sessions side by side in the same browser.
    expect(Object.keys(storage.dump())).toHaveLength(1)
    first.dispose()
  })

  it('restores the signed-in account when the app reloads', async () => {
    const { impl } = recordingFetch(() => jsonResponse(200, loginBody()))
    const before = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await before.signIn('owner@farq.sa', 'pw')
    before.dispose()

    // A new client over the same storage is what a page reload looks like.
    const after = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    expect(after.isAuthenticated()).toBe(true)
    expect(after.getUser()?.id).toBe('user-owner')
    after.dispose()
  })
})

describe('farqSession — refresh safety', () => {
  it('spends the single-use refresh token exactly once under concurrency', async () => {
    // The server revokes the whole token family when it sees a refresh token
    // reused (api/lib/auth/localAuthStore.js). Two parallel refreshes would
    // therefore sign the user out rather than renewing them.
    const storage = fakeStorage()
    const { impl, calls } = recordingFetch((url) => {
      if (url.includes('/login')) return jsonResponse(200, loginBody())
      if (url.includes('/refresh')) {
        return jsonResponse(
          200,
          loginBody({ access_token: 'access-rotated', refresh_token: 'refresh-rotated' }),
        )
      }
      return jsonResponse(200, {})
    })
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    const outcomes = await Promise.all([
      session.refreshForRequest('access-1'),
      session.refreshForRequest('access-1'),
      session.refreshForRequest('access-1'),
    ])

    const refreshCalls = calls.filter((c) => c.url.includes('/refresh'))
    expect(refreshCalls).toHaveLength(1)
    expect(refreshCalls[0].body.refresh_token).toBe('refresh-1')
    expect(outcomes.every((o) => o.status === 'refreshed')).toBe(true)
    expect(session.getAccessToken()).toBe('access-rotated')
    session.dispose()
  })

  it('does not spend the refresh token when the session already moved on', async () => {
    const storage = fakeStorage()
    const { impl, calls } = recordingFetch((url) =>
      url.includes('/login') ? jsonResponse(200, loginBody()) : jsonResponse(200, {}),
    )
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    // A request that rode an older token: the current one is already fresh.
    const outcome = await session.refreshForRequest('an-older-token')

    expect(outcome).toEqual({ status: 'refreshed', accessToken: 'access-1' })
    expect(calls.filter((c) => c.url.includes('/refresh'))).toHaveLength(0)
    session.dispose()
  })

  it('signs out cleanly when the refresh token is refused', async () => {
    // This is the FARQ_AUTH_JWT_SECRET rotation path: nothing here assumes a
    // session survives it. A refused refresh ends the session and asks for a
    // password again, rather than retrying forever.
    const storage = fakeStorage()
    const { impl } = recordingFetch((url) => {
      if (url.includes('/login')) return jsonResponse(200, loginBody())
      return jsonResponse(401, { message: 'invalid refresh token' })
    })
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    const events: string[] = []
    session.subscribe((event) => events.push(event))
    const outcome = await session.refreshForRequest('access-1')

    expect(outcome.status).toBe('rejected')
    expect(session.isAuthenticated()).toBe(false)
    expect(storage.dump()).toEqual({})
    expect(events).toContain('SIGNED_OUT')
    session.dispose()
  })

  it('keeps the session when the server is merely unreachable', async () => {
    // A dropped connection must not read as "logged out" — that is how an
    // in-progress tender gets lost to a flaky network.
    const storage = fakeStorage()
    const { impl } = recordingFetch((url) => {
      if (url.includes('/login')) return jsonResponse(200, loginBody())
      return jsonResponse(503, { message: 'upstream down' })
    })
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    const outcome = await session.refreshForRequest('access-1')

    expect(outcome.status).toBe('unreachable')
    expect(session.isAuthenticated()).toBe(true)
    expect(session.getAccessToken()).toBe('access-1')
    session.dispose()
  })

  it('adopts a session another tab already rotated instead of replaying a spent token', async () => {
    const storage = fakeStorage()
    const { impl, calls } = recordingFetch((url) =>
      url.includes('/login') ? jsonResponse(200, loginBody()) : jsonResponse(200, {}),
    )
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    // Simulate the tab next door having refreshed and written the successor.
    storage.setItem(
      'farq_construction_session_v1',
      JSON.stringify({
        accessToken: 'access-from-other-tab',
        refreshToken: 'refresh-from-other-tab',
        expiresAt: Math.floor(Date.now() / 1000) + 7200,
        user: { id: 'user-owner', email: 'owner@farq.sa', emailVerified: true, displayName: null },
      }),
    )

    const outcome = await session.refreshForRequest('access-1')

    expect(outcome).toEqual({ status: 'refreshed', accessToken: 'access-from-other-tab' })
    expect(calls.filter((c) => c.url.includes('/refresh'))).toHaveLength(0)
    session.dispose()
  })
})

describe('farqSession — sign out', () => {
  it('clears the session locally and revokes it on the server', async () => {
    const storage = fakeStorage()
    const { impl, calls } = recordingFetch((url) =>
      url.includes('/login') ? jsonResponse(200, loginBody()) : jsonResponse(200, {}),
    )
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    await session.signOut()

    expect(session.isAuthenticated()).toBe(false)
    expect(session.getAccessToken()).toBeNull()
    expect(storage.dump()).toEqual({})
    const logout = calls.find((c) => c.url.includes('/logout'))
    expect(logout?.body.refresh_token).toBe('refresh-1')
    session.dispose()
  })

  it('signs the user out locally even when the revoke call fails', async () => {
    const storage = fakeStorage()
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/login')) return jsonResponse(200, loginBody())
      throw new Error('network down')
    }) as unknown as typeof fetch
    const session = createFarqSession({ storage, fetchImpl: impl, autoRefresh: false })
    await session.signIn('owner@farq.sa', 'pw')

    await session.signOut()

    expect(session.isAuthenticated()).toBe(false)
    expect(storage.dump()).toEqual({})
    session.dispose()
  })
})
