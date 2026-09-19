import type {
  ConstructionComparison,
  ConstructionInvitation,
  ConstructionRfq,
  ConstructionSupplierOutcomeEvent,
} from '../api/constructionClient'

/**
 * The request as one deal file: every figure here is read from what the server
 * returned. Nothing is defaulted, estimated or dated from a neighbouring field.
 */

export type RequestState = { key: 'OPEN' | 'CLOSED' | 'AWARDED' | 'DRAFT' | 'CANCELLED'; label: string; cls: string }

/** The request's state from its own status, closure and award — never from the deadline copy. */
export function requestState(rfq: Pick<ConstructionRfq, 'status' | 'submission_closed_at' | 'award'>): RequestState {
  const status = String(rfq.status || '').toUpperCase()
  if (rfq.award && String(rfq.award.status || '').toUpperCase() !== 'CANCELLED') {
    return { key: 'AWARDED', label: 'تمت الترسية', cls: 'bg-[#CFF5DC] text-[#1a7a45]' }
  }
  if (status === 'CANCELLED') return { key: 'CANCELLED', label: 'ملغى', cls: 'bg-neutral-100 text-neutral-500' }
  if (status === 'CLOSED' || rfq.submission_closed_at) return { key: 'CLOSED', label: 'مغلق', cls: 'bg-neutral-200 text-neutral-700' }
  if (status === 'DRAFT' || status === 'DRAFT_NOT_SENT') return { key: 'DRAFT', label: 'لم يُرسل بعد', cls: 'bg-amber-50 text-amber-700' }
  return { key: 'OPEN', label: 'بانتظار العروض', cls: 'bg-amber-50 text-amber-700' }
}

export type Deadline = { at: number; passed: boolean; label: string } | null

/** The quote deadline the buyer set (Riyadh time), and whether it has passed now. */
export function quoteDeadline(date?: string | null, time?: string | null, now = Date.now()): Deadline {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const hhmm = /^\d{2}:\d{2}$/.test(String(time || '')) ? String(time) : null
  const at = Date.parse(`${date}T${hhmm || '23:59'}:00+03:00`)
  if (Number.isNaN(at)) return null
  const day = new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' })
  let clock = ''
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number) as [number, number]
    const period = h < 12 ? 'صباحًا' : 'مساءً'
    clock = ` — ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${period}`
  }
  return { at, passed: at <= now, label: `⁦${day}⁩${clock}` }
}

export type SupplierState = {
  key: 'AWARDED' | 'QUOTED' | 'FAILED' | 'SENT' | 'MANUAL' | 'NOT_SENT'
  label: string
  cls: string
  channel?: string
}

const CHANNEL_AR: Record<string, string> = { EMAIL: 'البريد', WHATSAPP: 'واتساب', HARAJ: 'حراج' }

/**
 * Where the request stands with one supplier. «Sent» means an attempt the
 * provider accepted (dispatch_attempts.status = SENT); a failed attempt is
 * never counted as reached.
 */
export function supplierState(invite: ConstructionInvitation, awardedInviteId?: string | null): SupplierState {
  const attempts = (invite.dispatch_attempts || []).filter((a) => (a.message_type || 'RFQ') === 'RFQ')
  const sent = attempts.find((a) => a.status === 'SENT')
  if (awardedInviteId && invite.id === awardedInviteId) return { key: 'AWARDED', label: 'تمت الترسية عليه', cls: 'bg-[#CFF5DC] text-[#1a7a45]' }
  if (String(invite.response_status || '').toUpperCase() === 'QUOTED') return { key: 'QUOTED', label: 'تم استلام العرض', cls: 'bg-[#e0efec] text-[#123F3A]' }
  if (sent) return { key: 'SENT', label: 'أُرسل — بانتظار الرد', cls: 'bg-neutral-100 text-neutral-600', channel: CHANNEL_AR[sent.channel] || sent.channel }
  if (attempts.some((a) => a.status === 'DELIVERY_FAILED')) return { key: 'FAILED', label: 'تعذر الإرسال', cls: 'bg-red-50 text-red-700' }
  if (attempts.some((a) => a.status === 'NOT_SENT' && a.channel === 'WHATSAPP')) {
    return { key: 'MANUAL', label: 'بانتظار إرسال واتساب يدويًا', cls: 'bg-amber-50 text-amber-700' }
  }
  return { key: 'NOT_SENT', label: 'لم يُرسل', cls: 'bg-amber-50 text-amber-700' }
}

export type Progress = { items: number; reached: number; quoted: number; percent: number }

/** Header figures: lines requested, suppliers the request reached, suppliers that quoted. */
export function requestProgress(rfq: ConstructionRfq): Progress {
  const invites = rfq.invitations || []
  const reached = invites.filter((i) => (i.dispatch_attempts || []).some((a) => a.status === 'SENT' && (a.message_type || 'RFQ') === 'RFQ')).length
  const quoted = invites.filter((i) => String(i.response_status || '').toUpperCase() === 'QUOTED').length
  const items = (rfq.current_version?.payload?.lines || []).length
  return { items, reached, quoted, percent: reached ? Math.round((Math.min(quoted, reached) / reached) * 100) : 0 }
}

export type Coverage = { requested: number; priced: number; complete: boolean; label: string }

/** «يغطي جميع البنود» or «عرض جزئي — 3 من 5 بنود», against the lines this supplier was asked for. */
export function quoteCoverage(summary?: { coverage?: { requested: number; priced: number; complete: boolean } } | null): Coverage | null {
  const c = summary?.coverage
  if (!c || !c.requested) return null
  if (c.complete) return { ...c, label: 'يغطي جميع البنود' }
  return { ...c, label: `عرض جزئي — ${c.priced} من ${c.requested} ${c.requested === 1 ? 'بند' : 'بنود'}` }
}

export function taxLabel(pricesIncludeTax?: boolean | null): string {
  if (pricesIncludeTax === true) return 'شامل الضريبة'
  if (pricesIncludeTax === false) return 'غير شامل الضريبة'
  return 'الضريبة غير محددة'
}

/**
 * The supplier's stated lead time, if the quote carries one. The supplier form
 * does not collect it today, so this is «لم يحدد مدة التوريد» unless a field exists.
 */
export function leadTimeLabel(offer: Record<string, unknown>): string {
  const days = Number(offer.lead_time_days ?? offer.delivery_days)
  if (Number.isFinite(days) && days > 0) return days === 1 ? 'يوم واحد' : days === 2 ? 'يومان' : `${days} أيام`
  const text = typeof offer.lead_time === 'string' ? offer.lead_time.trim() : ''
  return text || 'لم يحدد مدة التوريد'
}

type Matrix = NonNullable<ConstructionComparison['quote_matrix']>
type Cell = Matrix['lines'][number]['offers'][number]

/**
 * The lowest comparable price on each line. Only PRICED cells compete, and only
 * when every priced cell on the line states tax the same way and in one
 * currency; otherwise no cell is marked, because «cheapest» would be false.
 */
export function lowestPerLine(matrix?: Matrix | null): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const line of matrix?.lines || []) {
    const priced = (line.offers || []).filter((c): c is Cell => Boolean(c) && c.status === 'PRICED' && c.unit_price != null)
    const taxBases = new Set(priced.map((c) => c.prices_include_tax))
    const currencies = new Set(priced.map((c) => c.currency))
    if (priced.length < 2 || taxBases.size > 1 || taxBases.has(null) || currencies.size > 1) {
      out.set(line.id, null)
      continue
    }
    const best = priced.reduce((a, b) => (Number(b.unit_price) < Number(a.unit_price) ? b : a))
    const tie = priced.filter((c) => Number(c.unit_price) === Number(best.unit_price)).length > 1
    out.set(line.id, tie ? null : best.supplier_id)
  }
  return out
}

export const CELL_LABEL: Record<string, string> = {
  NOT_QUOTED: 'لم يسعّر',
  UNAVAILABLE: 'غير متوفر',
  UNPRICED: 'بلا سعر',
  QUANTITY_MISMATCH: 'كمية أو وحدة مختلفة',
  AMBIGUOUS: 'سعر مكرر',
  NOT_REQUESTED: 'لم يُطلب منه',
}

export type TimelineEvent = { key: string; at: string | null; title: string; detail?: string }

const REQUEST_EVENTS: Record<string, string> = {
  RFQ_CREATED: 'تم إنشاء الطلب',
  RFQ_VERSION_CREATED: 'أُنشئت نسخة جديدة من الطلب',
  RFP_SUBMISSIONS_CLOSED: 'أُغلق استلام العروض',
  RFP_ENVELOPES_OPENED: 'فُتحت المظاريف',
  AWARD_DISPATCH_FAILED: 'تعذر إرسال إشعار الترسية',
  AWARD_DISPATCHED: 'أُرسل إشعار الترسية للمورد',
}

/**
 * The request's history. Request-level events come from audit_timeline (each
 * with its own recorded or derived time); supplier events from supplier-outcomes
 * (sent_at, opened_at, attempted_at, quote version created_at, award created_at).
 * Batch send events are replaced by the per-supplier ones. An event without a
 * timestamp is kept undated, never given another event's time.
 */
export function buildTimeline(
  rfq: ConstructionRfq,
  outcomes: ConstructionSupplierOutcomeEvent[],
  supplierName: (supplierId: string | null) => string,
  lineName: (lineId: string) => string | null = () => null,
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const [i, e] of (rfq.audit_timeline || []).entries()) {
    const title = REQUEST_EVENTS[e.event_type]
    if (!title) continue
    events.push({ key: `a${i}`, at: e.created_at || null, title, detail: e.event_type === 'RFQ_CREATED' && e.email_snapshot ? e.email_snapshot : undefined })
  }
  for (const e of outcomes) {
    const who = supplierName(e.supplier_id)
    const channel = CHANNEL_AR[String(e.details?.channel || '')]
    const title = {
      INVITED: `تم إرسال الطلب إلى ${who}${channel ? ` عبر ${channel}` : ''}`,
      OPENED: `${who} فتح الطلب`,
      SEND_FAILED: `تعذر الإرسال إلى ${who}${channel ? ` عبر ${channel}` : ''}`,
      QUOTE_RECEIVED: `تم استلام عرض من ${who}`,
      LINE_DECLINED: `${who} أفاد بعدم توفر ${lineName(String(e.details?.line_id || '')) ? `«${lineName(String(e.details?.line_id || ''))}»` : 'بند'}`,
      AWARDED: `تمت الترسية على ${who}`,
    }[e.event_type]
    if (!title) continue
    events.push({ key: `o${e.id}`, at: e.created_at || null, title })
  }
  return events.sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return 1
    if (!b.at) return -1
    return Date.parse(a.at) - Date.parse(b.at)
  })
}

export function formatEventTime(at: string | null): string | null {
  if (!at) return null
  const ts = Date.parse(at)
  if (Number.isNaN(ts)) return null
  const d = new Date(ts)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' })
  return `⁦${day} — ${time}⁩`
}

export function formatMoney(value?: number | null, currency = 'SAR'): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  const n = Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `${n} ${currency === 'SAR' ? 'ريال' : currency}`
}
