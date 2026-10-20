/**
 * How many NEW suppliers (ones Farq has never invited, proposed only because
 * public evidence says they sell the exact product) a line may gain. Empty
 * means no cap: every one with evidence is shown (owner, 2026-10-11). The
 * server reads it as `external_candidate_limit` on POST /boq/match.
 */
const KEY = 'farq.newSupplierLimit'

export function getNewSupplierLimit(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw == null || raw.trim() === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function setNewSupplierLimit(value: number | null): void {
  try {
    if (value == null) globalThis.localStorage?.removeItem(KEY)
    else globalThis.localStorage?.setItem(KEY, String(value))
  } catch {
    /* private mode: the request goes without a cap */
  }
}
