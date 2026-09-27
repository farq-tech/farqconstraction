import { beforeEach, describe, expect, it } from 'vitest'
import {
  SUPPLIER_TOKEN_STORAGE_KEY,
  captureSupplierLink,
  readSupplierLink,
  resetSupplierLinkForTests,
  stripSupplierLink,
} from './supplierLink'

const TOKEN = 'Q2hhbmdlZC1ub3RoaW5nLWJ1dC10aGUtaG9zdC0xMjM0NTY'

function fakeBrowser(url: string) {
  const u = new URL(url)
  const location = { pathname: u.pathname, search: u.search, hash: u.hash }
  const store = new Map<string, string>()
  const replaced: string[] = []
  return {
    env: {
      location,
      history: {
        state: null,
        replaceState: (_s: unknown, _t: string, next?: string | URL | null) => {
          replaced.push(String(next))
          const n = new URL(String(next), 'https://construction.farq.sa')
          location.pathname = n.pathname
          location.search = n.search
          location.hash = n.hash
        },
      },
      storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    },
    store,
    replaced,
  }
}

beforeEach(() => resetSupplierLinkForTests())

describe('readSupplierLink', () => {
  it('reads the link every invitation already carries: /Construction?supplier_token=', () => {
    expect(readSupplierLink(`?supplier_token=${TOKEN}`)).toEqual({ token: TOKEN, intent: null })
  })
  it('reads the portal shape ?view=supplier&token=', () => {
    expect(readSupplierLink(`?view=supplier&token=${TOKEN}`)).toEqual({ token: TOKEN, intent: null })
  })
  it('keeps the decline intent of «لست أنت؟ اضغط هنا»', () => {
    expect(readSupplierLink(`?supplier_token=${TOKEN}&intent=decline`)).toEqual({ token: TOKEN, intent: 'decline' })
    expect(readSupplierLink(`?supplier_token=${TOKEN}&intent=other`)?.intent).toBeNull()
  })
  it('leaves the colleague invitation (?view=invite&token=) and other pages alone', () => {
    expect(readSupplierLink(`?view=invite&token=${TOKEN}`)).toBeNull()
    expect(readSupplierLink(`?token=${TOKEN}`)).toBeNull()
    expect(readSupplierLink('?view=inbox')).toBeNull()
    expect(readSupplierLink('')).toBeNull()
  })
  it('rejects anything that is not a token', () => {
    expect(readSupplierLink('?supplier_token=short')).toBeNull()
    expect(readSupplierLink('?supplier_token=%3Cscript%3E' + 'a'.repeat(20))).toBeNull()
  })
})

describe('stripSupplierLink', () => {
  it('removes the token and intent, keeps view=supplier and anything else', () => {
    expect(stripSupplierLink({ pathname: '/Construction', search: `?supplier_token=${TOKEN}&intent=decline&lang=ar`, hash: '#top' }))
      .toBe('/Construction?lang=ar&view=supplier#top')
    expect(stripSupplierLink({ pathname: '/', search: `?view=supplier&token=${TOKEN}`, hash: '' })).toBe('/?view=supplier')
  })
})

describe('captureSupplierLink', () => {
  it('takes the token out of the address bar and remembers it for this tab', () => {
    const b = fakeBrowser(`https://construction.farq.sa/Construction?supplier_token=${TOKEN}`)
    expect(captureSupplierLink(b.env)).toEqual({ token: TOKEN, intent: null })
    expect(b.replaced).toEqual(['/Construction?view=supplier'])
    expect(b.env.location.search).not.toContain(TOKEN)
    expect(b.store.get(SUPPLIER_TOKEN_STORAGE_KEY)).toBe(TOKEN)
    // The portal view asks again after the router: same link, from memory.
    expect(captureSupplierLink(b.env)?.token).toBe(TOKEN)
  })
  it('a reload of ?view=supplier opens the same invitation from the tab session', () => {
    const first = fakeBrowser(`https://construction.farq.sa/?view=supplier&token=${TOKEN}&intent=decline`)
    captureSupplierLink(first.env)
    resetSupplierLinkForTests() // a reload clears memory, not sessionStorage
    const reload = fakeBrowser('https://construction.farq.sa/?view=supplier')
    for (const [k, v] of first.store) reload.store.set(k, v)
    expect(captureSupplierLink(reload.env)).toEqual({ token: TOKEN, intent: 'decline' })
  })
  it('no link, no portal: a buyer page is never routed to the supplier view', () => {
    const b = fakeBrowser('https://construction.farq.sa/?view=inbox')
    b.store.set(SUPPLIER_TOKEN_STORAGE_KEY, TOKEN)
    expect(captureSupplierLink(b.env)).toBeNull()
    expect(b.replaced).toEqual([])
  })
})
