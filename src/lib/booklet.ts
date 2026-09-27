import type {
  ConstructionBookletDetail,
  ConstructionBookletOffer,
  ConstructionBookletSupplier,
  ConstructionBookletWave,
  ConstructionRfqBookletLink,
} from '../api/constructionClient'
import { formatMoney, quoteDeadline, type Deadline } from './requestFile'

/**
 * Pure logic behind the booklet screens (الكراسة): one comparison across every
 * wave (دفعة) of the same purchase request. Nothing here fetches; the views
 * pass what `GET /booklets/:id` returned and render what comes back.
 */

export type BookletColumn = {
  supplier_id: string
  name: string
  waves: number[]
  quote_total: number | null
  currency: string | null
  rfq_id: string | null
  /** Lines this supplier priced, across all waves. */
  priced_lines: number
}

export type BookletCell = ConstructionBookletOffer & { best: boolean }

export type BookletRow = {
  line_key: string
  position: number | null
  name: string
  quantity: number | null
  uom: string | null
  /** supplier_id → the offer; one per supplier per line. */
  cells: Map<string, BookletCell>
  best_supplier_id: string | null
  /** No supplier priced this line, in any wave: «بلا عروض». */
  no_offers: boolean
}

export type BookletMatrix = {
  columns: BookletColumn[]
  rows: BookletRow[]
  lines_total: number
  lines_with_offers: number
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const priced = (o: ConstructionBookletOffer | undefined | null): boolean =>
  Boolean(o) && (num(o!.unit_price) != null || num(o!.total) != null)

/** Cheapest by unit price; only when every priced offer shares one currency. */
function cheapestSupplier(offers: ConstructionBookletOffer[]): string | null {
  const candidates = offers.filter((o) => num(o.unit_price) != null)
  if (!candidates.length) return null
  const currencies = new Set(candidates.map((o) => (o.currency || 'SAR').toUpperCase()))
  if (currencies.size > 1) return null
  let best = candidates[0]!
  for (const o of candidates) if (num(o.unit_price)! < num(best.unit_price)!) best = o
  // A tie is not a winner.
  const ties = candidates.filter((o) => num(o.unit_price) === num(best.unit_price))
  return ties.length === 1 ? String(best.supplier_id) : null
}

/**
 * Rows = the booklet's lines (by position), columns = each supplier who quoted,
 * once, however many waves invited him. The server's `best_supplier_id` wins
 * when it names a supplier with an offer on that line; otherwise the cheapest
 * unit price is computed, and none is marked when currencies differ or tie.
 */
export function buildBookletMatrix(detail: Partial<ConstructionBookletDetail> | null | undefined): BookletMatrix {
  const lines = Array.isArray(detail?.lines) ? detail!.lines : []
  const matrix = Array.isArray(detail?.matrix) ? detail!.matrix : []
  const suppliers = Array.isArray(detail?.suppliers) ? detail!.suppliers : []

  const byLine = new Map<string, (typeof matrix)[number]>()
  for (const m of matrix) if (m && m.line_key != null) byLine.set(String(m.line_key), m)

  const supplierById = new Map<string, ConstructionBookletSupplier>()
  for (const s of suppliers) if (s && s.supplier_id != null) supplierById.set(String(s.supplier_id), s)

  const pricedCount = new Map<string, number>()
  const rows: BookletRow[] = [...lines]
    .filter((l) => l && l.line_key != null)
    .sort((a, b) => (num(a.position) ?? Infinity) - (num(b.position) ?? Infinity))
    .map((line) => {
      const entry = byLine.get(String(line.line_key))
      const cells = new Map<string, BookletCell>()
      for (const offer of entry?.offers || []) {
        if (!offer || offer.supplier_id == null || !priced(offer)) continue
        const id = String(offer.supplier_id)
        // One supplier per line: a repeat (a later wave) keeps the first seen.
        if (cells.has(id)) continue
        cells.set(id, { ...offer, supplier_id: id, best: false })
        pricedCount.set(id, (pricedCount.get(id) || 0) + 1)
      }
      const offered = [...cells.values()]
      const serverBest = entry?.best_supplier_id != null ? String(entry.best_supplier_id) : null
      const best = serverBest && cells.has(serverBest) ? serverBest : cheapestSupplier(offered)
      if (best) cells.get(best)!.best = true
      return {
        line_key: String(line.line_key),
        position: num(line.position),
        name: String(line.name_ar || '').trim() || '—',
        quantity: num(line.quantity),
        uom: line.uom || null,
        cells,
        best_supplier_id: best,
        no_offers: cells.size === 0,
      }
    })

  // Columns: suppliers who quoted, each once. A supplier whose offers appear in
  // the matrix counts as quoted even if his `quoted` flag lags behind.
  const ids = new Set<string>()
  for (const s of suppliers) if (s?.quoted) ids.add(String(s.supplier_id))
  for (const id of pricedCount.keys()) ids.add(id)

  const columns: BookletColumn[] = [...ids].map((id) => {
    const s = supplierById.get(id)
    return {
      supplier_id: id,
      name: String(s?.name || '').trim() || 'مورد',
      waves: [...new Set((s?.waves || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b),
      quote_total: num(s?.quote_total),
      currency: s?.currency || null,
      rfq_id: s?.rfq_id || null,
      priced_lines: pricedCount.get(id) || 0,
    }
  })
  columns.sort((a, b) => {
    if (b.priced_lines !== a.priced_lines) return b.priced_lines - a.priced_lines
    const ta = a.quote_total ?? Infinity
    const tb = b.quote_total ?? Infinity
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name, 'ar')
  })

  return {
    columns,
    rows,
    lines_total: rows.length,
    lines_with_offers: rows.filter((r) => !r.no_offers).length,
  }
}

/** «12 من 40» and a whole percent; zero lines is 0%, not NaN. */
export function coverage(withQuotes: number | null | undefined, total: number | null | undefined) {
  const t = Math.max(0, num(total) ?? 0)
  const w = Math.min(t, Math.max(0, num(withQuotes) ?? 0))
  return { withQuotes: w, total: t, percent: t ? Math.round((w / t) * 100) : 0, label: `${w} من ${t}` }
}

/** A booklet's `waves` is a count; an array of waves is accepted too. */
export function waveCount(waves: number | unknown[] | null | undefined): number {
  if (Array.isArray(waves)) return waves.length
  const n = num(waves)
  return n != null && n > 0 ? Math.floor(n) : 0
}

export function waveLabel(waveNumber: number | null | undefined, total?: number | null): string {
  const n = num(waveNumber)
  if (n == null) return 'دفعة'
  return total && total >= n ? `دفعة ${n} من ${total}` : `دفعة ${n}`
}

/** The chip on an RFQ: «يتبع الكراسة PR-H288 — دفعة 3 من 5». Null = show nothing. */
export function bookletChipText(link: ConstructionRfqBookletLink | null | undefined): string | null {
  if (!link || !link.booklet_id) return null
  const ref = String(link.reference || '').trim()
  const head = ref ? `يتبع الكراسة ${ref}` : 'يتبع كراسة'
  const n = num(link.wave_number)
  if (n == null) return head
  return `${head} — ${waveLabel(n, waveCount(link.waves) || null)}`
}

export function sortWaves(waves: ConstructionBookletWave[] | null | undefined): ConstructionBookletWave[] {
  return [...(Array.isArray(waves) ? waves : [])].sort((a, b) => (num(a.wave_number) ?? 0) - (num(b.wave_number) ?? 0))
}

/**
 * One deadline for all waves. Accepts a plain date («2026-10-05», read as the
 * end of that day in Riyadh, like a request's deadline) or a full timestamp.
 */
export function bookletDeadline(value: string | null | undefined, now = Date.now()): Deadline {
  if (!value) return null
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (plain) return quoteDeadline(value, null, now)
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  const d = new Date(at)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' })
  const [h, m] = time.split(':').map(Number) as [number, number]
  const period = h < 12 ? 'صباحًا' : 'مساءً'
  const clock = ` — ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${period}`
  return { at, passed: at <= now, label: `⁦${day}⁩${clock}` }
}

/** Money as the request's comparison shows it; «—» when there is none. */
export function bookletMoney(value: number | null | undefined, currency?: string | null): string {
  return formatMoney(num(value), currency || 'SAR') || '—'
}

export function formatQuantity(quantity: number | null | undefined, uom?: string | null): string {
  const q = num(quantity)
  const n = q == null ? '' : q.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return [n, uom || ''].filter(Boolean).join(' ') || '—'
}
