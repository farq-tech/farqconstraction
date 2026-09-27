/**
 * THE SUPPLIER'S LINK OPENS THE SUPPLIER PORTAL.
 *
 * Every invitation Farq has sent carries
 *   https://www.farq.sa/Construction?supplier_token=<token>
 * (email button, the approved WhatsApp template `farq_rfq_logo_ar`, Haraj).
 * The portal's own documented shape is `/?view=supplier&token=<token>`.
 * Both land on SupplierPortalView here; nothing about the links already
 * delivered has to change. `&intent=decline` (the «لست أنت؟» link) is kept
 * for the portal to read.
 *
 * The token is a 30-day bearer credential. It is lifted out of the address
 * bar as soon as it is read (no Referer, no history entry, no screenshot of
 * the URL carries it), kept in memory and in this tab's sessionStorage so a
 * reload still opens the portal, and never logged.
 *
 * `?view=invite&token=` belongs to the colleague invitation screen: a bare
 * `token` is only a supplier token together with `view=supplier`.
 */

export type SupplierIntent = 'decline'
export type SupplierLink = { token: string; intent: SupplierIntent | null }

/** Same key the farq.sa Construction page uses for the same token. */
export const SUPPLIER_TOKEN_STORAGE_KEY = 'farq_supplier_token'
export const SUPPLIER_INTENT_STORAGE_KEY = 'farq_supplier_intent'

/** base64url, as the API mints it (32 random bytes → 43 characters). */
const TOKEN = /^[A-Za-z0-9_-]{16,200}$/

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type HistoryLike = Pick<History, 'replaceState' | 'state'>
type LocationLike = Pick<Location, 'pathname' | 'search' | 'hash'>

let captured: SupplierLink | null = null

/** The supplier link in a query string, or null. Pure. */
export function readSupplierLink(search: string): SupplierLink | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }
  const raw = params.get('supplier_token') || (params.get('view') === 'supplier' ? params.get('token') : null) || ''
  const token = raw.trim()
  if (!TOKEN.test(token)) return null
  return { token, intent: params.get('intent') === 'decline' ? 'decline' : null }
}

/** The address without the token (and its intent); `view=supplier` stays so a reload routes back here. */
export function stripSupplierLink(location: LocationLike): string {
  const params = new URLSearchParams(location.search)
  const supplier = params.has('supplier_token') || params.get('view') === 'supplier'
  params.delete('supplier_token')
  if (params.get('view') === 'supplier') params.delete('token')
  params.delete('intent')
  if (supplier) params.set('view', 'supplier')
  const rest = params.toString()
  return `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`
}

function browser(): { location: LocationLike; history: HistoryLike; storage: StorageLike | null } | null {
  if (typeof window === 'undefined') return null
  let storage: StorageLike | null = null
  try {
    storage = window.sessionStorage
  } catch {
    storage = null
  }
  return { location: window.location, history: window.history, storage }
}

/**
 * Read the supplier link from the address bar once, remember it for this tab
 * and take it out of the URL. Returns the link, or the one already remembered
 * when the page is `?view=supplier` (a reload). Null when there is none.
 */
export function captureSupplierLink(env = browser()): SupplierLink | null {
  if (!env) return captured
  const fromUrl = readSupplierLink(env.location.search)
  if (fromUrl) {
    captured = fromUrl
    try {
      env.storage?.setItem(SUPPLIER_TOKEN_STORAGE_KEY, fromUrl.token)
      env.storage?.setItem(SUPPLIER_INTENT_STORAGE_KEY, fromUrl.intent || '')
    } catch {
      /* private mode: memory still holds it for this page */
    }
    try {
      env.history.replaceState(env.history.state, '', stripSupplierLink(env.location))
    } catch {
      /* ignore */
    }
    return fromUrl
  }
  if (captured) return captured
  if (new URLSearchParams(env.location.search).get('view') !== 'supplier') return null
  try {
    const token = (env.storage?.getItem(SUPPLIER_TOKEN_STORAGE_KEY) || '').trim()
    if (!TOKEN.test(token)) return null
    const intent = env.storage?.getItem(SUPPLIER_INTENT_STORAGE_KEY) === 'decline' ? 'decline' : null
    captured = { token, intent }
    return captured
  } catch {
    return null
  }
}

/** Tests only. */
export function resetSupplierLinkForTests(): void {
  captured = null
}
