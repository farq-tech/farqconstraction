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

/** Calendar dates and the fixed quote cutoff are interpreted in Riyadh. */
export function requestDateBlocker(quoteDate: string, deliveryDate: string, now = Date.now(), quoteTime = '17:00'): string | null {
  const valid = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }
  if (!valid(quoteDate) || !valid(deliveryDate)) return 'حدّد تاريخًا صحيحًا للعروض والتوريد.'
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(quoteTime)) return 'حدّد وقتًا صحيحًا لإغلاق العروض.'
  if (Date.parse(`${quoteDate}T${quoteTime}:00+03:00`) <= now) return 'آخر موعد للعروض يجب أن يكون في المستقبل بتوقيت الرياض.'
  if (quoteDate >= deliveryDate) return 'آخر موعد للعروض يجب أن يسبق موعد التوريد.'
  return null
}
