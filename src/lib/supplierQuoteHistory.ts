import type {
  SupplierQuoteHistoryRow,
  SupplierQuoteHistorySummary,
} from '../api/constructionClient'
import { formatRfqReference } from '../api/constructionClient'

/**
 * «سجل العروض»: how a supplier's past prices read on screen.
 *
 * The API (GET /suppliers/:id/quote-history) does the arithmetic — VAT
 * normalisation, versions, cheapest, awards. These helpers only word it, and
 * never invent a number the API left null: an unstated VAT basis stays
 * «غير محددة», a line nobody else priced is «العرض الوحيد», not «الأرخص».
 */

/** On a suggested supplier: he priced this material for the company before. */
export const PRIOR_QUOTER_TAG = 'مقدّم عروض سابقاً'
/** On the supplier list: he has priced at least one request for the company. */
export const QUOTED_BEFORE_BADGE = 'قدّم عروضاً سابقاً'

const nf = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })

export function formatSar(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${nf.format(value)} ر.س`
}

export function quotedBadgeLabel(requests: number | null | undefined): string | null {
  const n = Number(requests)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${QUOTED_BEFORE_BADGE} · ${nf.format(n)}`
}

export function vatBasisLabel(row: Pick<SupplierQuoteHistoryRow, 'vat_basis'>): string {
  if (row.vat_basis === 'INCLUDES_VAT') return 'شامل الضريبة'
  if (row.vat_basis === 'EXCLUDES_VAT') return 'غير شامل الضريبة'
  return 'الضريبة غير محددة'
}

/** Who put the price in: the supplier himself (link or portal), or Farq from his chat. */
export function sourceLabel(row: Pick<SupplierQuoteHistoryRow, 'source'>): string {
  return row.source === 'CHAT' ? 'من المحادثة' : 'من المورد'
}

function pct(value: number): string {
  return `${nf.format(Math.abs(value))}٪`
}

/** The line's price over the quote's versions: «120 ← 100 (−16.7٪)». */
export function priceTrailLabel(row: Pick<SupplierQuoteHistoryRow, 'price_trail' | 'total_change_percent'>): string | null {
  const priced = (row.price_trail || []).filter((t) => t.available && t.unit_price != null)
  if (priced.length < 2) return null
  const prices = priced.map((t) => nf.format(t.unit_price as number)).join(' ← ')
  const total = row.total_change_percent
  if (total == null || total === 0) return prices
  return `${prices} (${total < 0 ? 'خفّض' : 'رفع'} ${pct(total)})`
}

/** Where the price stands against the other offers on the same line, now. */
export function standingLabel(
  row: Pick<SupplierQuoteHistoryRow, 'available' | 'cheapest_now' | 'offers_now' | 'rank_now' | 'pct_above_cheapest_now' | 'cheapest_at_time' | 'vat_basis'>,
): { text: string; tone: 'best' | 'neutral' | 'behind' } {
  if (!row.available) return { text: 'اعتذر عن البند', tone: 'neutral' }
  if (row.cheapest_now == null) {
    return {
      text: row.vat_basis === 'UNKNOWN' ? 'لا يُقارن: الضريبة غير محددة' : 'لا يُقارن',
      tone: 'neutral',
    }
  }
  if ((row.offers_now ?? 0) <= 1) return { text: 'العرض الوحيد', tone: 'neutral' }
  if (row.cheapest_now) return { text: 'الأرخص حاليًا', tone: 'best' }
  const above = row.pct_above_cheapest_now
  const base = above != null ? `أعلى من الأرخص بـ ${pct(above)}` : 'ليس الأرخص'
  const rank = row.rank_now != null && row.offers_now ? ` · ${nf.format(row.rank_now)} من ${nf.format(row.offers_now)}` : ''
  const then = row.cheapest_at_time ? ' · كان الأرخص وقت تقديمه' : ''
  return { text: `${base}${rank}${then}`, tone: 'behind' }
}

export function responseLabel(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—'
  if (hours < 1) return 'أقل من ساعة'
  if (hours < 48) return `${nf.format(Math.round(hours))} ساعة`
  return `${nf.format(Math.round(hours / 24))} يوم`
}

/** «PR-H288 · الدفعة 2», else the request's short reference. */
export function requestLabel(row: Pick<SupplierQuoteHistoryRow, 'request'>): string {
  const booklet = row.request?.booklet
  if (booklet?.reference) return booklet.wave_number > 1 ? `${booklet.reference} · الدفعة ${booklet.wave_number}` : booklet.reference
  return formatRfqReference(row.request?.rfq_id, row.request?.department ?? null)
}

/** The market name leads when the buyer kept one; the booklet text follows it. */
export function lineLabels(row: Pick<SupplierQuoteHistoryRow, 'line'>): { primary: string; secondary: string | null } {
  const market = row.line?.market_name?.trim() || ''
  const booklet = row.line?.booklet_text?.trim() || ''
  const item = row.line?.item_name?.trim() || ''
  if (market) return { primary: market, secondary: booklet || item || null }
  return { primary: booklet || item || 'بند', secondary: null }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return '—'
  return new Date(t).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function sortNewestFirst<T extends Pick<SupplierQuoteHistoryRow, 'quoted_at'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(b.quoted_at || '').localeCompare(String(a.quoted_at || '')))
}

/** The summary as the tiles above the table read it. */
export function summaryTiles(s: SupplierQuoteHistorySummary): Array<{ label: string; value: string; hint?: string }> {
  const n = (v: number | null | undefined) => (v == null ? '—' : nf.format(v))
  return [
    { label: 'دعوات', value: n(s.invites_received) },
    {
      label: 'ردود',
      value: n(s.replies),
      hint: s.reply_rate != null ? `${nf.format(Math.round(s.reply_rate * 100))}٪ من الدعوات` : undefined,
    },
    { label: 'عروض', value: n(s.quotes), hint: `${n(s.lines_quoted)} بندًا مسعّرًا` },
    { label: 'ترسية', value: n(s.wins), hint: s.lines_won ? `${n(s.lines_won)} بندًا` : undefined },
    {
      label: 'مقارنة بالأرخص',
      value: s.avg_pct_above_cheapest == null ? '—' : s.avg_pct_above_cheapest === 0 ? 'الأرخص' : `+${pct(s.avg_pct_above_cheapest)}`,
      hint: s.compared_lines ? `الأرخص في ${n(s.cheapest_lines_now)} من ${n(s.compared_lines)} بندًا` : 'لا عروض منافسة بعد',
    },
    { label: 'آخر عرض', value: formatDate(s.last_quote_at), hint: s.median_response_hours != null ? `يرد خلال ${responseLabel(s.median_response_hours)}` : undefined },
  ]
}
