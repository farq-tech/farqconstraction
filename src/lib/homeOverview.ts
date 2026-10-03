import type {
  ConstructionBookletDetail,
  ConstructionBookletOffer,
  ConstructionBookletSummary,
} from '../api/constructionClient'
import { bookletClosed, bookletDeadline, buildBookletMatrix, type BookletCell } from './booklet'
import { isHeldOffer, vatStatusLabel } from './priceReview'
import { cleanSupplierName } from './supplierName'

/**
 * The home page («الرئيسية»): the booklets and their lines in one picture,
 * never a list of requests. Pure — the view passes what the API returned and
 * the current time, and renders what comes back.
 */

export const FARQ_FROM_CHAT = 'FARQ_FROM_CHAT'
const HOUR = 3_600_000
/** A deadline this close is «needs attention». */
export const DEADLINE_SOON_MS = 48 * HOUR
/** Lines shown on a booklet card before «عرض كل البنود». */
export const CARD_LINES = 8

export type VatBasis = 'incl' | 'excl' | 'unknown'

export type HomeLine = {
  key: string
  position: number | null
  /** The market name when a wave carried one, else the booklet's text. */
  name: string
  /** The booklet's own text, only when `name` is the market name. */
  bookletName?: string
  quantity: number | null
  uom: string | null
  offers: number
  best: {
    unitPrice: number
    currency: string
    supplierName: string
    vat: VatBasis
    fromChat: boolean
    /** «خفّض X%»: this offer's newer version lowered the price. */
    cutPercent: number | null
  } | null
}

export type CoverageBuckets = { none: number; few: number; many: number }

export type HomeBooklet = {
  id: string
  reference: string
  title: string
  deadlineAt: number | null
  deadlineLabel: string | null
  deadlinePassed: boolean
  waves: number
  lines: HomeLine[]
  linesTotal: number
  linesWithQuotes: number
  buckets: CoverageBuckets
  quotesLast24h: number
}

export type AttentionItem =
  | { kind: 'no_quotes'; bookletId: string; reference: string; lines: string[]; count: number }
  | { kind: 'deadline'; bookletId: string; reference: string; at: number; label: string }
  | { kind: 'from_chat'; bookletId: string; reference: string; supplierName: string; lines: number }

export type HomeTotals = {
  activeBooklets: number
  linesTotal: number
  linesWithQuotes: number
  linesWithoutQuotes: number
  coveragePercent: number
  quotesLast24h: number
  nearestDeadline: { bookletId: string; reference: string; at: number; label: string } | null
}

/** «موردون خفّضوا أسعارهم»: one line whose supplier sent a lower price. */
export type PriceCut = {
  bookletId: string
  reference: string
  supplierId: string
  supplierName: string
  lineKey: string
  lineName: string
  quantity: number | null
  uom: string | null
  oldPrice: number
  oldVat: VatBasis
  newPrice: number
  newVat: VatBasis
  currency: string
  /** Percent, net of VAT. */
  percent: number
  /** Per unit, in the new price's basis. */
  perUnit: number
  /** perUnit × the line's quantity; null without a quantity. */
  lineAmount: number | null
  /** The supplier is the line's best offer now. */
  cheapestNow: boolean
  fromChat: boolean
  at: number | null
}

export type HomeOverview = {
  booklets: HomeBooklet[]
  totals: HomeTotals
  attention: AttentionItem[]
  priceCuts: PriceCut[]
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const time = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? null : t
}

const upper = (v: unknown) => String(v || '').trim().toUpperCase()

/** Terminal wave states: nothing more can arrive on them. */
const CLOSED_WAVE = new Set(['CANCELLED', 'CANCELED', 'CLOSED', 'AWARDED'])
const CANCELLED_WAVE = new Set(['CANCELLED', 'CANCELED'])

export function vatBasis(includesTax: boolean | null | undefined): VatBasis {
  return includesTax === true ? 'incl' : includesTax === false ? 'excl' : 'unknown'
}

export function vatLabel(basis: VatBasis): string {
  return vatStatusLabel(basis === 'incl' ? true : basis === 'excl' ? false : null)
}

/**
 * On the home page: a booklet with a wave still open (or none sent yet).
 * A booklet whose every wave is cancelled, closed or awarded is not.
 */
export function isActiveBooklet(detail: Pick<ConstructionBookletDetail, 'waves'>): boolean {
  const waves = Array.isArray(detail?.waves) ? detail.waves : []
  if (!waves.length) return true
  return waves.some((w) => !CLOSED_WAVE.has(upper(w.status)))
}

/** The detail without anything that came from a cancelled wave. */
export function withoutCancelledWaves(detail: ConstructionBookletDetail): ConstructionBookletDetail {
  const cancelled = new Set(
    (detail.waves || []).filter((w) => CANCELLED_WAVE.has(upper(w.status))).map((w) => String(w.rfq_id)),
  )
  if (!cancelled.size) return detail
  const live = (o: { rfq_id?: string | null }) => !o.rfq_id || !cancelled.has(String(o.rfq_id))
  return {
    ...detail,
    waves: (detail.waves || []).filter((w) => !cancelled.has(String(w.rfq_id))),
    suppliers: (detail.suppliers || []).filter(live),
    matrix: (detail.matrix || []).map((m) => {
      const offers = (m.offers || []).filter(live)
      const best = m.best_supplier_id != null && offers.some((o) => String(o.supplier_id) === String(m.best_supplier_id))
      return { ...m, offers, best_supplier_id: best ? m.best_supplier_id : null }
    }),
  }
}

export function coverageBuckets(offersPerLine: number[]): CoverageBuckets {
  const b = { none: 0, few: 0, many: 0 }
  for (const n of offersPerLine) {
    if (n <= 0) b.none += 1
    else if (n <= 2) b.few += 1
    else b.many += 1
  }
  return b
}

/** Quotes (one per supplier: their latest) recorded in the 24 hours before `now`. */
export function quotesSince(detail: ConstructionBookletDetail, now: number, windowMs = 24 * HOUR): number {
  const seen = new Set<string>()
  for (const s of detail.suppliers || []) {
    const at = time(s.quote_submitted_at)
    if (s.quoted && at != null && at <= now && now - at <= windowMs) seen.add(String(s.supplier_id))
  }
  // Newer APIs stamp each offer too; a supplier missing from `suppliers` still counts.
  for (const m of detail.matrix || []) {
    for (const o of m.offers || []) {
      const at = time(o.submitted_at)
      if (at != null && at <= now && now - at <= windowMs) seen.add(String(o.supplier_id))
    }
  }
  return seen.size
}

function supplierNames(detail: ConstructionBookletDetail): Map<string, string> {
  const names = new Map<string, string>()
  for (const s of detail.suppliers || []) {
    const n = cleanSupplierName(s.name)
    if (n) names.set(String(s.supplier_id), n)
  }
  return names
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * The cut an offer carries, or null. The server compares like-for-like (net
 * of VAT) and sends `price_cut_percent` / `price_cut_per_unit`; an older
 * payload with only `previous_unit_price` is compared here, and only on the
 * same stated basis.
 */
export function offerCut(o: ConstructionBookletOffer | null | undefined): { percent: number; perUnit: number; previous: number } | null {
  const previous = num(o?.previous_unit_price)
  const now = num(o?.unit_price)
  if (!o || previous == null || now == null) return null
  let percent = num(o.price_cut_percent)
  let perUnit = num(o.price_cut_per_unit)
  if (percent == null || perUnit == null) {
    const sameBasis = (o.previous_prices_include_tax ?? null) === (o.prices_include_tax ?? null)
    if (!sameBasis || !(previous > now)) return null
    perUnit = previous - now
    percent = Math.round(((previous - now) / previous) * 1000) / 10
  }
  if (!(percent > 0) || !(perUnit > 0)) return null
  return { percent, perUnit, previous }
}

/** One booklet card. Cancelled waves are dropped first. */
export function summarizeBooklet(raw: ConstructionBookletDetail, now = Date.now()): HomeBooklet {
  const detail = withoutCancelledWaves(raw)
  const names = supplierNames(detail)
  const matrix = buildBookletMatrix(detail)
  const lines: HomeLine[] = matrix.rows.map((row) => {
    const best: BookletCell | undefined = row.best_supplier_id ? row.cells.get(row.best_supplier_id) : undefined
    const price = num(best?.unit_price)
    return {
      key: row.line_key,
      position: row.position,
      name: row.market_name || row.name,
      ...(row.market_name ? { bookletName: row.name } : {}),
      quantity: row.quantity,
      uom: row.uom,
      offers: row.cells.size,
      best:
        best && price != null
          ? {
              unitPrice: price,
              currency: best.currency || 'SAR',
              supplierName: names.get(String(best.supplier_id)) || 'مورد',
              vat: vatBasis(best.prices_include_tax),
              fromChat: upper(best.entered_by) === FARQ_FROM_CHAT,
              cutPercent: offerCut(best)?.percent ?? null,
            }
          : null,
    }
  })
  const deadline = bookletDeadline(detail.booklet?.quote_deadline, now)
  const b = detail.booklet || ({} as ConstructionBookletDetail['booklet'])
  return {
    id: String(b.id || ''),
    reference: String(b.reference || '').trim() || 'كراسة',
    title: String(b.title || '').trim(),
    deadlineAt: deadline?.at ?? null,
    deadlineLabel: deadline?.label ?? null,
    deadlinePassed: Boolean(deadline?.passed),
    waves: (detail.waves || []).length,
    lines,
    linesTotal: lines.length,
    linesWithQuotes: lines.filter((l) => l.offers > 0).length,
    buckets: coverageBuckets(lines.map((l) => l.offers)),
    quotesLast24h: quotesSince(detail, now),
  }
}

/**
 * What the booklet asks of the buyer: unquoted lines, a close deadline, and
 * chat-entered quotes. Never «expiring» quotes: supplier quotes do not expire
 * (only closing the booklet ends quoting), so a stated validity is no alert.
 * A closed booklet asks for no more quotes and has no deadline to watch.
 */
export function attentionFor(raw: ConstructionBookletDetail, card: HomeBooklet, now = Date.now()): AttentionItem[] {
  const detail = withoutCancelledWaves(raw)
  const items: AttentionItem[] = []
  const ref = card.reference
  const closed = bookletClosed(detail.booklet)
  const missing = card.lines.filter((l) => l.offers === 0)
  if (missing.length && !closed) {
    items.push({ kind: 'no_quotes', bookletId: card.id, reference: ref, lines: missing.map((l) => l.name), count: missing.length })
  }
  if (!closed && card.deadlineAt != null && !card.deadlinePassed && card.deadlineAt - now <= DEADLINE_SOON_MS) {
    items.push({ kind: 'deadline', bookletId: card.id, reference: ref, at: card.deadlineAt, label: card.deadlineLabel || '' })
  }
  const names = supplierNames(detail)
  const chat = new Map<string, number>()
  for (const m of detail.matrix || []) {
    for (const o of (m.offers || []) as ConstructionBookletOffer[]) {
      if (num(o.unit_price) == null && num(o.total) == null) continue
      const id = String(o.supplier_id)
      if (upper(o.entered_by) === FARQ_FROM_CHAT) chat.set(id, (chat.get(id) || 0) + 1)
    }
  }
  for (const [id, lines] of chat) {
    items.push({ kind: 'from_chat', bookletId: card.id, reference: ref, supplierName: names.get(id) || 'مورد', lines })
  }
  return items
}

/** Every lowered price across the booklets, newest first. */
export function priceCutsFor(raw: ConstructionBookletDetail, card: HomeBooklet): PriceCut[] {
  const detail = withoutCancelledWaves(raw)
  const names = supplierNames(detail)
  const lines = new Map(card.lines.map((l) => [l.key, l]))
  const best = new Map(buildBookletMatrix(detail).rows.map((r) => [r.line_key, r.best_supplier_id]))
  const out: PriceCut[] = []
  for (const m of detail.matrix || []) {
    const line = lines.get(String(m.line_key))
    for (const o of m.offers || []) {
      // A held price is not a price yet: no «خفّض» from it.
      if (isHeldOffer(o)) continue
      const cut = offerCut(o)
      if (!cut) continue
      const id = String(o.supplier_id)
      const quantity = line?.quantity ?? null
      out.push({
        bookletId: card.id,
        reference: card.reference,
        supplierId: id,
        supplierName: names.get(id) || 'مورد',
        lineKey: String(m.line_key),
        lineName: line?.name || '—',
        quantity,
        uom: line?.uom ?? null,
        oldPrice: cut.previous,
        oldVat: vatBasis(o.previous_prices_include_tax),
        newPrice: num(o.unit_price)!,
        newVat: vatBasis(o.prices_include_tax),
        currency: o.currency || 'SAR',
        percent: cut.percent,
        perUnit: cut.perUnit,
        lineAmount: quantity != null ? round2(cut.perUnit * quantity) : null,
        cheapestNow: best.get(String(m.line_key)) === id,
        fromChat: upper(o.entered_by) === FARQ_FROM_CHAT,
        at: time(o.submitted_at),
      })
    }
  }
  return out
}

const ATTENTION_ORDER: Record<AttentionItem['kind'], number> = { deadline: 0, no_quotes: 1, from_chat: 2 }

/**
 * The whole page from the booklets' comparisons: active booklets only, nearest
 * deadline first (none last), then the ones with the most unquoted lines.
 */
export function buildHomeOverview(details: ConstructionBookletDetail[], now = Date.now()): HomeOverview {
  const active = (Array.isArray(details) ? details : []).filter((d) => d && d.booklet && isActiveBooklet(d))
  const pairs = active.map((d) => ({ d, card: summarizeBooklet(d, now) }))
  pairs.sort((a, b) => {
    const da = a.card.deadlineAt != null && !a.card.deadlinePassed ? a.card.deadlineAt : Infinity
    const db = b.card.deadlineAt != null && !b.card.deadlinePassed ? b.card.deadlineAt : Infinity
    if (da !== db) return da - db
    return b.card.buckets.none - a.card.buckets.none
  })
  const booklets = pairs.map((p) => p.card)
  const linesTotal = booklets.reduce((s, b) => s + b.linesTotal, 0)
  const linesWithQuotes = booklets.reduce((s, b) => s + b.linesWithQuotes, 0)
  const upcoming = booklets
    .filter((b) => b.deadlineAt != null && !b.deadlinePassed)
    .sort((a, b) => a.deadlineAt! - b.deadlineAt!)[0]
  const attention = pairs
    .flatMap((p) => attentionFor(p.d, p.card, now))
    .sort((a, b) => ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind])
  const priceCuts = pairs
    .flatMap((p) => priceCutsFor(p.d, p.card))
    .sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || b.percent - a.percent)
  return {
    booklets,
    attention,
    priceCuts,
    totals: {
      activeBooklets: booklets.length,
      linesTotal,
      linesWithQuotes,
      linesWithoutQuotes: linesTotal - linesWithQuotes,
      coveragePercent: linesTotal ? Math.round((linesWithQuotes / linesTotal) * 100) : 0,
      quotesLast24h: booklets.reduce((s, b) => s + b.quotesLast24h, 0),
      nearestDeadline: upcoming
        ? { bookletId: upcoming.id, reference: upcoming.reference, at: upcoming.deadlineAt!, label: upcoming.deadlineLabel || '' }
        : null,
    },
  }
}

/**
 * The lines a collapsed card shows: the first CARD_LINES, plus every line
 * without an offer wherever it sits — an unquoted line is never hidden.
 */
export function visibleLines(lines: HomeLine[], expanded: boolean, limit = CARD_LINES): HomeLine[] {
  if (expanded) return lines
  return lines.filter((l, i) => i < limit || l.offers === 0)
}

/** A unit price as buyers read it: always two decimals («1.70 ريال»). */
export function unitPriceLabel(value: number, currency = 'SAR'): string {
  const n = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n} ${currency.toUpperCase() === 'SAR' ? 'ريال' : currency}`
}

// ── Words ────────────────────────────────────────────────────────────────

/** «يوم / يومان / 3 أيام / 11 يومًا», and the same for hours. */
function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  if (n >= 3 && n <= 10) return `${n} ${few}`
  return `${n} ${many}`
}

/** «متبقٍ يومان», «متبقٍ 5 ساعات», «أقل من ساعة», «انتهى الموعد». */
export function countdownLabel(at: number | null | undefined, now = Date.now()): string {
  if (at == null) return 'بلا موعد'
  const left = at - now
  if (left <= 0) return 'انتهى الموعد'
  if (left < HOUR) return 'أقل من ساعة'
  if (left < DEADLINE_SOON_MS) return `متبقٍ ${arCount(Math.floor(left / HOUR), 'ساعة', 'ساعتان', 'ساعات', 'ساعة')}`
  return `متبقٍ ${arCount(Math.floor(left / (24 * HOUR)), 'يوم', 'يومان', 'أيام', 'يومًا')}`
}

export function linesWord(n: number): string {
  return arCount(n, 'بند واحد', 'بندان', 'بنود', 'بندًا')
}

export function offersWord(n: number): string {
  if (n === 0) return 'بدون عروض'
  return arCount(n, 'عرض واحد', 'عرضان', 'عروض', 'عرضًا')
}

// ── Loading ──────────────────────────────────────────────────────────────

export type OverviewSources = {
  overview: () => Promise<{ booklets: ConstructionBookletDetail[] } | null>
  list: () => Promise<{ booklets: ConstructionBookletSummary[] }>
  detail: (id: string) => Promise<ConstructionBookletDetail>
}

/** Booklets read one by one on an API without the overview route. */
export const FALLBACK_LIMIT = 12

/**
 * Every booklet's comparison: one call to `/booklets/overview`; on an API
 * without it, the list and then each booklet (newest first, at most
 * FALLBACK_LIMIT). A booklet that fails to load alone is skipped; if every one
 * fails the error is thrown. No booklets surface (404) reads as none.
 */
export async function loadBookletDetails(src: OverviewSources): Promise<ConstructionBookletDetail[]> {
  const overview = await src.overview()
  if (overview) return overview.booklets
  const { booklets } = await src.list()
  const ids = booklets.map((b) => String(b.id)).filter(Boolean).slice(0, FALLBACK_LIMIT)
  if (!ids.length) return []
  const settled = await Promise.allSettled(ids.map((id) => src.detail(id)))
  const ok = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
  if (!ok.length) {
    const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failure) throw failure.reason
  }
  return ok
}
