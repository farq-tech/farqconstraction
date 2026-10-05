/**
 * «ملخص المورد» beside a conversation, and the quote cards inside it — built
 * from endpoints that already exist, nothing new:
 *
 * - GET /rfqs/:id/comparison     prices, per-line status, quote version (open requests only)
 * - GET /rfqs/:id                invitations and lines (used instead when the request is sealed)
 * - GET /rfqs/:id/supplier-outcomes   timestamps: invited, opened, each quote version, award
 *
 * Sealed («ظرف مختوم»): the thread says `locked`. Then no price or total is
 * ever put in the model — the comparison is not even read — and every price
 * reads «مختوم حتى فتح الأظرف».
 */
import type {
  ConstructionComparison,
  ConstructionRfq,
  ConstructionSupplierOutcomeEvent,
} from '../api/constructionClient'
import { CELL_LABEL } from './requestFile'

export const SEALED_PRICE_LABEL = 'مختوم حتى فتح الأظرف'

export type PanelLineStatus = 'PRICED' | 'DECLINED' | 'NOT_QUOTED' | 'SEALED' | 'OTHER'

export type PanelLine = {
  key: string
  name: string
  quantity: number | null
  uom: string | null
  status: PanelLineStatus
  statusLabel: string
  /** Always null when sealed. */
  unitPrice: number | null
  currency: string | null
}

export type TimelineState = 'done' | 'upcoming' | 'unknown' | 'awarded'

export type PanelTimelineStep = {
  key: string
  title: string
  at: string | null
  state: TimelineState
}

export type QuoteEvent = {
  id: string
  version: number
  at: string | null
  /** Null when sealed or when the comparison did not carry it. */
  total: number | null
  currency: string | null
  /** Number of lines the supplier priced in this version, when known. */
  pricedLines: number | null
  latest: boolean
}

export type SupplierPanelModel = {
  sealed: boolean
  quoteStatus: 'submitted' | 'not_submitted' | 'unknown'
  quoteVersion: number | null
  lines: PanelLine[]
  total: number | null
  currency: string | null
  timeline: PanelTimelineStep[]
  quoteEvents: QuoteEvent[]
  /** Supplier key the comparison and outcomes use (external key). */
  supplierKey: string | null
}

export type SupplierPanelInput = {
  inviteId: string
  locked: boolean
  comparison?: ConstructionComparison | null
  rfq?: ConstructionRfq | null
  outcomes?: ConstructionSupplierOutcomeEvent[] | null
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value)
}

function time(value: string | null | undefined): number {
  const ts = value ? Date.parse(value) : NaN
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts
}

function lineStatus(status: string | null | undefined): { status: PanelLineStatus; label: string } {
  const key = String(status || '').toUpperCase()
  if (key === 'PRICED') return { status: 'PRICED', label: 'سعّر' }
  if (key === 'UNAVAILABLE') return { status: 'DECLINED', label: 'اعتذر' }
  if (key === 'NOT_QUOTED' || !key) return { status: 'NOT_QUOTED', label: 'لم يسعّر' }
  return { status: 'OTHER', label: CELL_LABEL[key] || key }
}

const INVITED_VIA: Record<string, string> = { EMAIL: 'بالإيميل', WHATSAPP: 'على واتساب', HARAJ: 'بالمحادثة' }

export function buildSupplierPanel(input: SupplierPanelInput): SupplierPanelModel {
  const sealed = Boolean(input.locked)
  // Sealed: never read prices, even if a comparison object was passed in.
  const comparison = sealed ? null : input.comparison || null
  const rfq = comparison?.rfq || input.rfq || null
  const invitation = rfq?.invitations?.find((i) => String(i.id) === input.inviteId) || null
  const response = comparison?.supplier_responses?.find((r) => String(r.offer?.inviteId || '') === input.inviteId) || null
  const supplierKey = String(response?.supplier?.id || invitation?.supplier_id || '') || null

  const events = (input.outcomes || [])
    .filter((e) => supplierKey != null && String(e.supplier_id || '') === supplierKey)
    .sort((a, b) => time(a.created_at) - time(b.created_at))

  const quoteReceived = events.filter((e) => e.event_type === 'QUOTE_RECEIVED')
  const declinedLines = new Set(
    events
      .filter((e) => e.event_type === 'LINE_DECLINED')
      .map((e) => text((e.details as Record<string, unknown> | null | undefined)?.line_id))
      .filter(Boolean),
  )

  const responseStatus = String(invitation?.response_status || '').toUpperCase()
  const submitted = Boolean(response) || quoteReceived.length > 0 || responseStatus === 'QUOTED'
  const quoteStatus: SupplierPanelModel['quoteStatus'] = submitted
    ? 'submitted'
    : invitation || comparison
      ? 'not_submitted'
      : 'unknown'
  const quoteVersion = num(response?.offer?.quoteVersion) ?? (quoteReceived.length ? quoteReceived.length : null)

  // Lines
  let lines: PanelLine[] = []
  const matrix = comparison?.quote_matrix?.lines
  // The matrix lists a supplier only once he answered; before that his scope
  // is not in it, and listing every line as «لم يسعّر» would overstate it.
  const inMatrix = Boolean(matrix && supplierKey && matrix.some((line) => line.offers?.some((o) => String(o.supplier_id) === supplierKey)))
  if (matrix && supplierKey && inMatrix) {
    lines = matrix
      .map((line) => {
        const offer = line.offers?.find((o) => String(o.supplier_id) === supplierKey)
        const s = lineStatus(offer?.status)
        return {
          key: String(line.id),
          name: text(line.market_name_ar) || text(line.name_ar) || text(line.name_en) || 'بند',
          quantity: num(line.quantity),
          uom: text(line.uom) || null,
          status: s.status,
          statusLabel: s.label,
          unitPrice: s.status === 'PRICED' ? num(offer?.unit_price) : null,
          currency: offer?.currency || null,
          requested: String(offer?.status || '').toUpperCase() !== 'NOT_REQUESTED',
        }
      })
      .filter((l) => l.requested)
      .map(({ requested: _requested, ...line }) => line)
  } else if (!matrix) {
    const payloadLines = (rfq?.current_version?.payload?.lines || []) as Array<Record<string, unknown>>
    lines = payloadLines.map((line, index) => {
      const key = text(line.id) || text(line.line_id) || text(line.line_key) || String(index)
      const declined = declinedLines.has(key)
      return {
        key,
        name: text(line.market_name_ar) || text(line.name_ar) || text(line.name_en) || text(line.farq_spec_id) || 'بند',
        quantity: num(line.quantity),
        uom: text(line.uom) || null,
        status: declined ? 'DECLINED' : sealed && submitted ? 'SEALED' : submitted ? 'OTHER' : 'NOT_QUOTED',
        statusLabel: declined ? 'اعتذر' : sealed && submitted ? 'مختوم' : submitted ? '—' : 'لم يسعّر',
        unitPrice: null,
        currency: null,
      } satisfies PanelLine
    })
  }

  const total = sealed ? null : num(response?.offer?.totals?.total)
  const currency = sealed ? null : text(response?.offer?.currency) || (total != null ? 'SAR' : null)
  const pricedLines = inMatrix ? lines.filter((l) => l.status === 'PRICED').length : null

  // Quote cards: one per version, from the outcomes' own timestamps.
  const quoteEvents: QuoteEvent[] = quoteReceived.map((e, index) => {
    const latest = index === quoteReceived.length - 1
    return {
      id: String(e.id),
      version: latest && quoteVersion != null ? Math.max(quoteVersion, index + 1) : index + 1,
      at: e.created_at,
      total: latest ? total : null,
      currency: latest ? currency : null,
      pricedLines: latest ? pricedLines : null,
      latest,
    }
  })
  // The comparison knows a quote the outcomes did not list (older API): one card.
  if (!quoteEvents.length && response && !sealed) {
    quoteEvents.push({
      id: String(response.offer?.quoteVersionId || response.offer?.offerId || 'quote'),
      version: quoteVersion ?? 1,
      at: response.offer?.submittedAt || null,
      total,
      currency,
      pricedLines,
      latest: true,
    })
  }

  // Timeline
  const timeline: PanelTimelineStep[] = []
  for (const e of events) {
    if (e.event_type === 'INVITED') {
      const via = INVITED_VIA[String((e.details as Record<string, unknown> | null | undefined)?.channel || '').toUpperCase()]
      timeline.push({ key: e.id, title: via ? `أُرسلت الدعوة ${via}` : 'أُرسلت الدعوة', at: e.created_at, state: 'done' })
    } else if (e.event_type === 'OPENED') {
      timeline.push({ key: e.id, title: 'فتح رابط الطلب', at: e.created_at, state: 'done' })
    } else if (e.event_type === 'SEND_FAILED') {
      timeline.push({ key: e.id, title: 'تعذّر إيصال الدعوة', at: e.created_at, state: 'done' })
    } else if (e.event_type === 'QUOTE_RECEIVED') {
      const n = quoteReceived.indexOf(e) + 1
      const card = quoteEvents.find((q) => q.id === String(e.id))
      timeline.push({
        key: e.id,
        title: n > 1 || (card?.version ?? 1) > 1 ? `استلمنا عرضه — النسخة ${card?.version ?? n}` : 'استلمنا عرضه',
        at: e.created_at,
        state: 'done',
      })
    } else if (e.event_type === 'AWARDED') {
      timeline.push({ key: e.id, title: 'تمت الترسية عليه', at: e.created_at, state: 'awarded' })
    }
  }
  if (!events.length && response?.offer?.submittedAt) {
    timeline.push({ key: 'submitted', title: 'استلمنا عرضه', at: response.offer.submittedAt, state: 'done' })
  }
  if (rfq) {
    const closed = rfq.submission_closed_at || null
    const deadline = text((rfq as unknown as Record<string, unknown>).quote_deadline) || null
    timeline.push({
      key: 'close',
      title: 'إغلاق التقديم',
      at: closed || deadline,
      state: closed ? 'done' : deadline ? 'upcoming' : 'unknown',
    })
    if (sealed || rfq.envelopes_opened_at) {
      timeline.push({
        key: 'envelopes',
        title: 'فتح الأظرف',
        at: rfq.envelopes_opened_at || null,
        state: rfq.envelopes_opened_at ? 'done' : 'unknown',
      })
    }
  }

  return { sealed, quoteStatus, quoteVersion, lines, total, currency, timeline, quoteEvents, supplierKey }
}

export function formatAmount(value: number | null | undefined, currency?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const amount = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const cur = String(currency || 'SAR').toUpperCase()
  return `${amount} ${cur === 'SAR' ? 'ريال' : cur}`
}

export function formatEventTime(value: string | null | undefined): string {
  const ts = value ? Date.parse(value) : NaN
  if (Number.isNaN(ts)) return ''
  const d = new Date(ts)
  return `${d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })}، ${d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}`
}
