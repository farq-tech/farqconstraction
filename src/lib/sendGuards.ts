/** Checks a line must pass before it is put in front of a real supplier. */

/**
 * The quantity as a positive number, or null.
 *
 * This used to answer 1 for anything it could not read, so «», «0» and
 * «حسب المخطط» all reached a supplier as «الكمية: 1» with nothing on screen to
 * say so. A line without a real quantity is now refused by name.
 */
export function readQty(raw: string): number | null {
  const western = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,،٬\s]/g, '')
    .replace(/٫/g, '.')
  if (!western) return null
  const n = Number(western)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Only ever called on lines `readQty` accepted; see `sendBlockers`. */
export function parseQty(raw: string): number {
  return readQty(raw) ?? 0
}

/** A name a supplier can read: letters survive once control characters are gone. */
export function cleanLineName(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\ufffd]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const DELIVERY_BEFORE_DEADLINE_CODE = 'CONSTRUCTION_DELIVERY_BEFORE_DEADLINE'
export const DELIVERY_BEFORE_DEADLINE_AR = 'تاريخ التوريد لا يمكن أن يكون قبل آخر موعد لاستلام العروض'

/** «YYYY-MM-DD» from a date input or an ISO timestamp; null when unreadable. */
function dayOf(value: string | null | undefined): string | null {
  const m = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * True when the delivery date falls before the last day for quotes — a
 * supplier cannot deliver what he has not been asked to price yet. The same
 * day is allowed. Missing or unreadable dates are left to the other checks.
 */
export function deliveryBeforeDeadline(deliveryDate: string | null | undefined, quoteDeadline: string | null | undefined): boolean {
  const delivery = dayOf(deliveryDate)
  const deadline = dayOf(quoteDeadline)
  if (!delivery || !deadline) return false
  return delivery < deadline
}
