/**
 * Where a BOQ's suggested suppliers may come from, chosen at upload:
 * the company's own list, Farq's base, and other sources searched line by line.
 * Kept per browser; the default is the company's own and Farq's base.
 */
export type SupplierOrigin = 'COMPANY' | 'FARQ' | 'OTHER'

export const SUPPLIER_ORIGIN_LABEL: Record<SupplierOrigin, string> = {
  COMPANY: 'موردو شركتي',
  FARQ: 'قاعدة موردي فرق',
  OTHER: 'مصادر أخرى',
}

const KEY = 'farq.boqSupplierSources'
const DEFAULT: SupplierOrigin[] = ['COMPANY', 'FARQ']

export function getSupplierSources(): Set<SupplierOrigin> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (Array.isArray(raw)) {
      const valid = raw.filter((x): x is SupplierOrigin => x === 'COMPANY' || x === 'FARQ' || x === 'OTHER')
      if (valid.length) return new Set(valid)
    }
  } catch {
    /* storage unavailable: the default applies */
  }
  return new Set(DEFAULT)
}

export function setSupplierSources(sources: Iterable<SupplierOrigin>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...sources]))
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

/** A supplier without an origin from the server is Farq's base, unless it is a Haraj seller. */
export function supplierOrigin(s: { origin?: unknown; channel?: unknown }): SupplierOrigin {
  if (s.origin === 'COMPANY' || s.origin === 'FARQ' || s.origin === 'OTHER') return s.origin
  return s.channel === 'حراج' ? 'OTHER' : 'FARQ'
}
