/**
 * «انضم لفرق كمورد» — the one-time join link: `/?join_token=<token>`
 * (api: lib/construction/supplier-join.js joinUrl).
 *
 * The token is a credential: it is lifted out of the address bar as soon as
 * it is read (no Referer, no history entry carries it), kept in memory and in
 * this tab's sessionStorage so a reload still opens the page, and never logged.
 */

export const JOIN_TOKEN_STORAGE_KEY = 'farq_supplier_join_token'
const TOKEN = /^[A-Za-z0-9_-]{43}$/

let captured: string | null = null

export function readJoinToken(search: string): string | null {
  try {
    const token = (new URLSearchParams(search).get('join_token') || '').trim()
    return TOKEN.test(token) ? token : null
  } catch {
    return null
  }
}

/** The address without the token; `view=join` stays so a reload routes back here. */
export function stripJoinToken(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  const params = new URLSearchParams(location.search)
  params.delete('join_token')
  params.set('view', 'join')
  return `${location.pathname}?${params.toString()}${location.hash}`
}

export function captureJoinToken(): string | null {
  if (typeof window === 'undefined') return captured
  const fromUrl = readJoinToken(window.location.search)
  if (fromUrl) {
    captured = fromUrl
    try {
      window.sessionStorage.setItem(JOIN_TOKEN_STORAGE_KEY, fromUrl)
    } catch {
      /* private mode: memory still holds it */
    }
    try {
      window.history.replaceState(window.history.state, '', stripJoinToken(window.location))
    } catch {
      /* ignore */
    }
    return fromUrl
  }
  if (captured) return captured
  try {
    const held = (window.sessionStorage.getItem(JOIN_TOKEN_STORAGE_KEY) || '').trim()
    return TOKEN.test(held) ? (captured = held) : null
  } catch {
    return null
  }
}

/** After «انضمام» or «لا أرغب» the link is spent: forget it. */
export function forgetJoinToken(): void {
  captured = null
  try {
    window.sessionStorage.removeItem(JOIN_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
