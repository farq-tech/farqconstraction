/**
 * How many NEW suppliers (ones Farq has never invited, proposed only because
 * public evidence says they sell the exact product) a line may gain. Empty
 * means the server's bounded default. The server reads it as
 * `external_candidate_limit` on POST /boq/match.
 */
const KEY = 'farq.newSupplierLimit'
export const MAX_NEW_SUPPLIER_LIMIT = 100

export function getNewSupplierLimit(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw == null || raw.trim() === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_NEW_SUPPLIER_LIMIT) : null
  } catch {
    return null
  }
}

export function setNewSupplierLimit(value: number | null): void {
  try {
    if (value == null) globalThis.localStorage?.removeItem(KEY)
    else if (Number.isInteger(value) && value >= 0) {
      globalThis.localStorage?.setItem(KEY, String(Math.min(value, MAX_NEW_SUPPLIER_LIMIT)))
    } else globalThis.localStorage?.removeItem(KEY)
  } catch {
    /* If storage is blocked, omit the request override and use the server default. */
  }
}
