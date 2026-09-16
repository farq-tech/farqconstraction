import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEMO_ACTOR_LABEL,
  constructionHeaders,
  currentAuthMode,
  supplierPortalHeaders,
} from './constructionAuth'
import { farqSession } from './farqSession'
import {
  getPublicSupplierInvite,
  submitPublicSupplierQuote,
  supplierPortalPath,
  supplierQuoteSubmitPath,
} from './constructionClient'

type Seen = { url: string; headers: Record<string, string>; method: string }

let seen: Seen[] = []

/** Capture what the client actually put on the wire. */
function installFetch(respond: (url: string) => { status: number; body: unknown }) {
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push({
      url,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      method: init?.method ?? 'GET',
    })
    const { status, body } = respond(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response
  })
  vi.stubGlobal('fetch', impl)
  return impl
}

async function signInOwner() {
  installFetch(() => ({
    status: 200,
    body: {
      data: {
        access_token: 'owner-access-token',
        refresh_token: 'owner-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-owner', email: 'owner@farq.sa', email_verified: true },
      },
    },
  }))
  await farqSession.signIn('owner@farq.sa', 'pw')
  seen = []
}

beforeEach(() => {
  seen = []
})

afterEach(async () => {
  // The singleton is shared across this file; leave it signed out.
  installFetch(() => ({ status: 200, body: {} }))
  await farqSession.signOut()
  vi.unstubAllGlobals()
  seen = []
})

describe('buyer identity — real session and demo mode coexist', () => {
  it('falls back to the demo actor header when nobody is signed in', () => {
    // Demo mode must keep working: the Farq API only honours this header
    // outside production with CONSTRUCTION_DEMO_MODE=1, and it is still how
    // the app is driven locally.
    expect(currentAuthMode()).toBe('demo')
    const headers = constructionHeaders() as Record<string, string>
    expect(headers['x-construction-demo-user']).toBe(DEMO_ACTOR_LABEL)
    expect(headers.Authorization).toBeUndefined()
  })

  it('sends the account bearer token — and no demo header — once signed in', async () => {
    await signInOwner()

    expect(currentAuthMode()).toBe('session')
    const headers = constructionHeaders() as Record<string, string>
    expect(headers.Authorization).toBe('Bearer owner-access-token')
    // Two identities on one request is how an action gets attributed to the
    // wrong actor the moment the API's precedence changes.
    expect(headers['x-construction-demo-user']).toBeUndefined()
  })

  it('lets a caller add headers without losing the credential', async () => {
    await signInOwner()
    const headers = constructionHeaders({ 'Content-Type': 'application/json' }) as Record<
      string,
      string
    >
    expect(headers.Authorization).toBe('Bearer owner-access-token')
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('supplier portal — a separate identity class', () => {
  it('carries no buyer credential at all', () => {
    const headers = supplierPortalHeaders() as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(headers['x-construction-demo-user']).toBeUndefined()
  })

  it('submits a quote to the plural path the API actually mounts', () => {
    // api/routes/construction.js mounts POST /supplier/portal/:token/quotes.
    // The client posted to /quote (singular), so every supplier submission
    // from this UI 404'd. The path is a contract; assert it.
    expect(supplierQuoteSubmitPath('tok')).toBe(
      '/api/construction/supplier/portal/tok/quotes',
    )
    expect(supplierPortalPath('tok')).toBe('/api/construction/supplier/portal/tok')
  })

  it('percent-encodes the link token', () => {
    expect(supplierPortalPath('a/b c')).toBe('/api/construction/supplier/portal/a%2Fb%20c')
  })

  it('opens an invite with no session, exactly as a supplier does', async () => {
    installFetch(() => ({ status: 200, body: { ok: true, data: { invite_id: 'inv-1' } } }))

    const invite = await getPublicSupplierInvite('supplier-token-1')

    expect(invite).toMatchObject({ invite_id: 'inv-1' })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toContain('/api/construction/supplier/portal/supplier-token-1')
    expect(seen[0].headers.Authorization).toBeUndefined()
    expect(seen[0].headers['x-construction-demo-user']).toBeUndefined()
  })

  it('stays credential-free even while a buyer is signed in on the same browser', async () => {
    // The dangerous version of this change attaches the buyer session to every
    // call "for consistency". That invites putting an auth guard on these two
    // routes later, which is what would kill the live invitation links.
    await signInOwner()
    installFetch(() => ({ status: 200, body: { ok: true, data: { accepted: true } } }))

    await submitPublicSupplierQuote('supplier-token-2', { lines: [] })

    const call = seen.find((s) => s.url.includes('/supplier/portal/'))
    expect(call?.method).toBe('POST')
    expect(call?.url).toContain('/quotes')
    expect(call?.headers.Authorization).toBeUndefined()
    expect(call?.headers['x-construction-demo-user']).toBeUndefined()
  })
})

describe('buyer requests recover from an expired access token', () => {
  it('refreshes once and retries, instead of showing the user an auth error', async () => {
    await signInOwner()

    let rfqAttempts = 0
    installFetch((url) => {
      if (url.includes('/api/auth/refresh')) {
        return {
          status: 200,
          body: {
            data: {
              access_token: 'owner-access-token-2',
              refresh_token: 'owner-refresh-token-2',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: { id: 'user-owner', email: 'owner@farq.sa', email_verified: true },
            },
          },
        }
      }
      rfqAttempts += 1
      if (rfqAttempts === 1) return { status: 401, body: { errors: [{ code: 'UNAUTHORIZED' }] } }
      return { status: 200, body: { ok: true, data: { summary: {}, rfqs: [] } } }
    })

    const { listBuyerRfqs } = await import('./constructionClient')
    const overview = await listBuyerRfqs()

    expect(overview).toMatchObject({ rfqs: [] })
    expect(rfqAttempts).toBe(2)
    // The retry must ride the NEW token, not the corpse.
    const retry = seen.filter((s) => s.url.includes('/api/construction/rfqs')).at(-1)
    expect(retry?.headers.Authorization).toBe('Bearer owner-access-token-2')
  })

  it('does not retry in demo mode, where a 401 means the API is not configured', async () => {
    let attempts = 0
    installFetch(() => {
      attempts += 1
      return { status: 401, body: { errors: [{ code: 'CONSTRUCTION_AUTH_REQUIRED' }] } }
    })

    const { listBuyerRfqs } = await import('./constructionClient')
    await expect(listBuyerRfqs()).rejects.toMatchObject({
      code: 'CONSTRUCTION_AUTH_REQUIRED',
    })
    expect(attempts).toBe(1)
  })
})
