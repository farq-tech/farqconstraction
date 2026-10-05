import type {
  ConstructionBookletDetail,
  ConstructionBookletState,
  ConstructionBookletOffer,
  ConstructionBookletSupplier,
  ConstructionBookletWave,
  ConstructionRfqBookletLink,
} from "../api/constructionClient"
import { formatMoney, quoteDeadline, type Deadline } from "./requestFile"
import { isHeldOffer } from "./priceReview"
import { cleanSupplierName } from "./supplierName"

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
  /** Lines this supplier priced, across all waves (held prices not counted). */
  priced_lines: number
  /** Lines whose price is held for review. */
  held_lines?: number
  price_review_held?: boolean
  score?: ConstructionBookletSupplier["score"] | null
  tax_unknown?: boolean
}

/** `held`: the price is held for review — shown, never best, never summed. */
export type BookletCell = ConstructionBookletOffer & {
  best: boolean
  held: boolean
}

export type BookletRow = {
  line_key: string
  position: number | null
  name: string
  /** «الاسم الدارج بالسوق», when a wave carried one. Absent otherwise. */
  market_name?: string
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
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const priced = (o: ConstructionBookletOffer | undefined | null): boolean =>
  Boolean(o) && (num(o!.unit_price) != null || num(o!.total) != null)

/**
 * Cheapest by unit price; only when every priced offer shares one currency.
 * A price held for review never competes.
 */
export function cheapestSupplier(
  offers: ConstructionBookletOffer[],
): string | null {
  const candidates = offers.filter(
    (o) => num(o.unit_price) != null && !isHeldOffer(o) && (!o.status || o.status === "PRICED"),
  )
  if (
    candidates.length < 2 ||
    candidates.some(
      (o) =>
        num(o.unit_price)! < 0 ||
        !o.currency ||
        typeof o.prices_include_tax !== "boolean",
    )
  )
    return null
  if (new Set(candidates.map((o) => o.prices_include_tax)).size !== 1)
    return null
  const currencies = new Set(
    candidates.map((o) => (o.currency || "").trim().toUpperCase()),
  )
  if (currencies.size > 1 || currencies.has("")) return null
  if (new Set(candidates.map((o) => o.uom?.trim()).filter(Boolean)).size > 1) return null
  let best = candidates[0]!
  for (const o of candidates)
    if (num(o.unit_price)! < num(best.unit_price)!) best = o
  // A tie is not a winner.
  const ties = candidates.filter(
    (o) => num(o.unit_price) === num(best.unit_price),
  )
  return ties.length === 1 ? String(best.supplier_id) : null
}

/**
 * Rows follow booklet order, with one supplier per column. A server winner is
 * rechecked locally against competing prices on a stated, common VAT/currency
 * basis. Incompatible prices and ties never produce a unique winner.
 */
export function buildBookletMatrix(
  detail: Partial<ConstructionBookletDetail> | null | undefined,
): BookletMatrix {
  const lines = Array.isArray(detail?.lines) ? detail!.lines : []
  const matrix = Array.isArray(detail?.matrix) ? detail!.matrix : []
  const suppliers = Array.isArray(detail?.suppliers) ? detail!.suppliers : []

  const byLine = new Map<string, typeof matrix[number]>()
  for (const m of matrix)
    if (m && m.line_key != null) byLine.set(String(m.line_key), m)

  const supplierById = new Map<string, ConstructionBookletSupplier>()
  for (const s of suppliers)
    if (s && s.supplier_id != null) supplierById.set(String(s.supplier_id), s)

  const pricedCount = new Map<string, number>()
  const heldCount = new Map<string, number>()
  const rows: BookletRow[] = [...lines]
    .filter((l) => l && l.line_key != null)
    .sort(
      (a, b) => (num(a.position) ?? Infinity) - (num(b.position) ?? Infinity),
    )
    .map((line) => {
      const entry = byLine.get(String(line.line_key))
      const cells = new Map<string, BookletCell>()
      for (const offer of entry?.offers || []) {
        if (!offer || offer.supplier_id == null || !priced(offer)) continue
        const id = String(offer.supplier_id)
        const previous = cells.get(id)
        if (previous) {
          const oldAt = previous.submitted_at ? Date.parse(previous.submitted_at) : NaN
          const newAt = offer.submitted_at ? Date.parse(offer.submitted_at) : NaN
          if (Number.isFinite(oldAt) && Number.isFinite(newAt) && oldAt !== newAt) {
            if (newAt < oldAt) continue
          } else if (previous.unit_price !== offer.unit_price || previous.total !== offer.total || previous.prices_include_tax !== offer.prices_include_tax || previous.currency !== offer.currency) {
            cells.set(id, { ...previous, held: true, status: 'AMBIGUOUS' })
            continue
          } else continue
        }
        const held = isHeldOffer(offer)
        cells.set(id, { ...offer, supplier_id: id, best: false, held })
      }
      for (const [id, cell] of cells) {
        if (cell.held) heldCount.set(id, (heldCount.get(id) || 0) + 1)
        else pricedCount.set(id, (pricedCount.get(id) || 0) + 1)
      }
      const offered = [...cells.values()]
      const best = cheapestSupplier(offered)
      if (best) cells.get(best)!.best = true
      const name = String(line.name_ar || "").trim() || "—"
      const market = String(line.market_name_ar || "").trim()
      return {
        line_key: String(line.line_key),
        position: num(line.position),
        name,
        ...(market && market !== name ? { market_name: market } : {}),
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
  for (const id of heldCount.keys()) ids.add(id)

  const columns: BookletColumn[] = [...ids].map((id) => {
    const s = supplierById.get(id)
    return {
      supplier_id: id,
      name: cleanSupplierName(s?.name) || "مورد",
      waves: [
        ...new Set((s?.waves || []).map(Number).filter(Number.isFinite)),
      ].sort((a, b) => a - b),
      quote_total: num(s?.quote_total),
      currency: s?.currency || null,
      rfq_id: s?.rfq_id || null,
      priced_lines: pricedCount.get(id) || 0,
      held_lines: heldCount.get(id) || 0,
      price_review_held:
        Boolean(s?.price_review_held) || (heldCount.get(id) || 0) > 0,
      score: s?.score ?? null,
      tax_unknown: s?.tax_unknown === true,
    }
  })
  columns.sort((a, b) => {
    if (b.priced_lines !== a.priced_lines)
      return b.priced_lines - a.priced_lines
    const ta = a.quote_total ?? Infinity
    const tb = b.quote_total ?? Infinity
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name, "ar")
  })

  return {
    columns,
    rows,
    lines_total: rows.length,
    lines_with_offers: rows.filter((r) => !r.no_offers).length,
  }
}

/** «12 من 40» and a whole percent; zero lines is 0%, not NaN. */
export function coverage(
  withQuotes: number | null | undefined,
  total: number | null | undefined,
) {
  const t = Math.max(0, num(total) ?? 0)
  const w = Math.min(t, Math.max(0, num(withQuotes) ?? 0))
  return {
    withQuotes: w,
    total: t,
    percent: t ? Math.round((w / t) * 100) : 0,
    label: `${w} من ${t}`,
  }
}

/** A booklet's `waves` is a count; an array of waves is accepted too. */
export function waveCount(
  waves: number | unknown[] | null | undefined,
): number {
  if (Array.isArray(waves)) return waves.length
  const n = num(waves)
  return n != null && n > 0 ? Math.floor(n) : 0
}

export function waveLabel(
  waveNumber: number | null | undefined,
  total?: number | null,
): string {
  const n = num(waveNumber)
  if (n == null) return "دفعة"
  return `دفعة رقم ${n}`
}

/** The chip on an RFQ: «يتبع الكراسة PR-H288 — دفعة 3 من 5». Null = show nothing. */
export function bookletChipText(
  link: ConstructionRfqBookletLink | null | undefined,
): string | null {
  if (!link || !link.booklet_id) return null
  const ref = String(link.reference || "").trim()
  const head = ref ? `يتبع الكراسة ${ref}` : "يتبع كراسة"
  const n = num(link.wave_number)
  if (n == null) return head
  return `${head} — ${waveLabel(n, waveCount(link.waves) || null)}`
}

export function sortWaves(
  waves: ConstructionBookletWave[] | null | undefined,
): ConstructionBookletWave[] {
  return [...(Array.isArray(waves) ? waves : [])].sort(
    (a, b) => (num(a.wave_number) ?? 0) - (num(b.wave_number) ?? 0),
  )
}

/**
 * One deadline for all waves. Accepts a plain date («2026-10-05», read as the
 * end of that day in Riyadh, like a request's deadline) or a full timestamp.
 */
export function bookletDeadline(
  value: string | null | undefined,
  now = Date.now(),
): Deadline {
  if (!value) return null
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (plain) return quoteDeadline(value, null, now)
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  const d = new Date(at)
  const day = d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  })
  const time = d.toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Riyadh",
  })
  const [h, m] = time.split(":").map(Number) as [number, number]
  const period = h < 12 ? "صباحًا" : "مساءً"
  const clock = ` — ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${period}`
  return { at, passed: at <= now, label: `⁦${day}⁩${clock}` }
}

/** Money as the request's comparison shows it; «—» when there is none. */
/**
 * «إجمالي العرض» of one supplier column: the server's full total when every
 * charge is stated, otherwise the sum of the lines this supplier priced — so a
 * supplier who left delivery unstated still shows a figure, labelled as such.
 */
export function columnTotal(
  matrix: BookletMatrix,
  column: BookletColumn,
): { value: number | null; priced: number; of: number; complete: boolean } {
  let sum = 0
  let priced = 0
  for (const row of matrix.rows) {
    const cell = row.cells.get(column.supplier_id)
    if (!cell || cell.held) continue
    const t = num(cell.total)
    if (t == null) continue
    sum += t
    priced += 1
  }
  const full = num(column.quote_total)
  const of = matrix.rows.length
  if (full != null) return { value: full, priced, of, complete: true }
  return {
    value: priced ? Math.round(sum * 100) / 100 : null,
    priced,
    of,
    complete: false,
  }
}

export function bookletMoney(
  value: number | null | undefined,
  currency?: string | null,
): string {
  return formatMoney(num(value), currency || "SAR") || "—"
}

export function formatQuantity(
  quantity: number | null | undefined,
  uom?: string | null,
): string {
  const q = num(quantity)
  const n =
    q == null ? "" : q.toLocaleString("en-US", { maximumFractionDigits: 3 })
  return [n, uom || ""].filter(Boolean).join(" ") || "—"
}

/**
 * «مفتوحة / مغلقة». Quotes never expire, whatever the supplier's stated
 * validity or the requested deadline: only an explicit close ends quoting.
 * Anything but CLOSED (including an older API that sends no state) is open.
 */
export function bookletClosed(
  booklet: ConstructionBookletState | null | undefined,
): boolean {
  return String(booklet?.state || "").toUpperCase() === "CLOSED"
}

export function bookletStateLabel(
  booklet: ConstructionBookletState | null | undefined,
): string {
  return bookletClosed(booklet) ? "مغلقة" : "مفتوحة"
}

/**
 * The supplier's stated validity, as neutral information, or null when he
 * stated none. Never a warning: the quote stands until the booklet is closed.
 */
/**
 * The supplier's delivery terms under a booklet price: his own words
 * («بدون شحن — المورد في جدة») first, else the charge he stated
 * («التوصيل مشمول» for 0). Null when he said nothing (or on an older API).
 */
export function bookletDeliveryText(
  offer: Pick<ConstructionBookletOffer, "delivery_note" | "delivery" | "currency"> | null | undefined,
): string | null {
  if (!offer) return null
  const note = String(offer.delivery_note ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (note) return note
  const fee = num(offer.delivery)
  if (fee == null || fee < 0) return null
  if (fee === 0) return "التوصيل مشمول"
  return `التوصيل ${bookletMoney(fee, offer.currency)}`
}

/** Legacy supplier validity is ignored: the booklet owns the common deadline. */
export function statedValidityLabel(_value: string | null | undefined): null {
  return null
}

/** Only compare full, unheld offers on one stated VAT and currency basis. */
export function comparableFullBooklet(
  matrix: BookletMatrix,
): { supplier_id: string; total: number; currency: string } | null {
  const full = matrix.columns.filter(
    (c) =>
      !c.price_review_held &&
      c.priced_lines === matrix.rows.length &&
      c.quote_total != null &&
      c.quote_total >= 0 &&
      c.currency,
  )
  if (!matrix.rows.length || full.length < 2) return null
  const currencies = new Set(full.map((c) => c.currency!.toUpperCase()))
  const tax = new Set(
    full.flatMap((c) =>
      matrix.rows.map((r) => r.cells.get(c.supplier_id)?.prices_include_tax),
    ),
  )
  if (
    currencies.size !== 1 ||
    tax.size !== 1 ||
    [...tax].some((v) => typeof v !== "boolean")
  )
    return null
  const sorted = [...full].sort((a, b) => a.quote_total! - b.quote_total!)
  if (sorted[0]!.quote_total === sorted[1]!.quote_total) return null
  return {
    supplier_id: sorted[0]!.supplier_id,
    total: sorted[0]!.quote_total!,
    currency: sorted[0]!.currency!,
  }
}
