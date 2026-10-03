/**
 * «تعديل الطلب» — pure helpers for the four-step revision of a sent request:
 * edit the lines, choose who receives it, preview channels and cost, confirm.
 *
 * Nothing here talks to the network. Every figure on the preview and confirm
 * steps is the server's (`RevisionPreview.cost`); these helpers only word it.
 */
import type {
  RevisionBody,
  RevisionCandidate,
  RevisionChannel,
  RevisionCost,
  RevisionLine,
  RevisionPreview,
  RevisionRecipient,
  RevisionSource,
  ConstructionRfqVersion,
} from '../api/constructionClient'

// ─── Step 1: the lines ────────────────────────────────────────────────────

/** One editable line. `quantity` stays text while typed. */
export type DraftLine = {
  uid: string
  line_key?: string
  name_ar: string
  quantity: string
  uom: string
  material: string
  finish: string
  dimensions: string
  thickness: string
  description: string
  market_name_ar: string
  /** Spec-card keys this editor does not show (brand, sale units…), kept as they were. */
  spec_rest: Record<string, unknown>
}

const SPEC_FIELDS = ['material', 'finish', 'dimensions', 'thickness'] as const
type SpecField = (typeof SPEC_FIELDS)[number]

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function draftFromLine(line: RevisionLine, uid: string): DraftLine {
  const card = (line.spec_card || {}) as Record<string, unknown>
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(card)) if (!(SPEC_FIELDS as readonly string[]).includes(k)) rest[k] = v
  return {
    uid,
    line_key: line.line_key,
    name_ar: text(line.name_ar),
    quantity: line.quantity == null ? '' : String(line.quantity),
    uom: text(line.uom),
    material: text(card.material),
    finish: text(card.finish),
    dimensions: text(card.dimensions),
    thickness: text(card.thickness),
    description: text(line.original_description),
    market_name_ar: text(line.market_name_ar),
    spec_rest: rest,
  }
}

export function emptyDraftLine(uid: string): DraftLine {
  return {
    uid,
    name_ar: '',
    quantity: '',
    uom: '',
    material: '',
    finish: '',
    dimensions: '',
    thickness: '',
    description: '',
    market_name_ar: '',
    spec_rest: {},
  }
}

function parseQuantity(value: string): number {
  const n = Number(String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

/** The line as the API takes it; empty spec fields are left out, unknown ones kept. */
export function lineFromDraft(draft: DraftLine): RevisionLine {
  const card: Record<string, unknown> = { ...draft.spec_rest }
  for (const field of SPEC_FIELDS) {
    const value = draft[field].trim()
    if (value) card[field] = value
  }
  const line: RevisionLine = {
    name_ar: draft.name_ar.trim(),
    quantity: parseQuantity(draft.quantity),
    uom: draft.uom.trim(),
  }
  if (draft.line_key) line.line_key = draft.line_key
  if (Object.keys(card).length) line.spec_card = card
  if (draft.description.trim()) line.original_description = draft.description.trim()
  if (draft.market_name_ar.trim()) line.market_name_ar = draft.market_name_ar.trim()
  return line
}

/** What stops step 1, in Arabic; null when the lines and the note can go on. */
export function draftProblem(drafts: DraftLine[], changeNote: string): string | null {
  if (!drafts.length) return 'الطلب يحتاج بندًا واحدًا على الأقل.'
  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i]
    if (!d.name_ar.trim()) return `اكتب اسم البند ${i + 1}.`
    const q = parseQuantity(d.quantity)
    if (!(q > 0)) return `اكتب كمية صحيحة للبند ${i + 1}.`
    if (!d.uom.trim()) return `اكتب وحدة البند ${i + 1}.`
  }
  if (!changeNote.trim()) return 'اكتب ملاحظة التعديل — تصل للموردين مع الطلب.'
  return null
}

export type LineChangeField = 'name' | 'quantity' | 'uom' | 'spec' | 'description'

export type LineDiff = {
  changed: Array<{ line_key: string; fields: LineChangeField[] }>
  added: number
  removed: number
}

const FIELD_AR: Record<LineChangeField, string> = {
  name: 'الاسم',
  quantity: 'الكمية',
  uom: 'الوحدة',
  spec: 'المواصفة',
  description: 'الوصف',
}

/** What changed between the current version's lines and the edited ones. */
export function diffLines(original: RevisionLine[], drafts: DraftLine[]): LineDiff {
  const before = new Map(original.filter((l) => l.line_key).map((l) => [String(l.line_key), draftFromLine(l, '')]))
  const kept = new Set<string>()
  const changed: LineDiff['changed'] = []
  let added = 0
  for (const d of drafts) {
    const prev = d.line_key ? before.get(d.line_key) : undefined
    if (!prev) {
      added += 1
      continue
    }
    kept.add(String(d.line_key))
    const fields: LineChangeField[] = []
    if (prev.name_ar !== d.name_ar.trim()) fields.push('name')
    if (parseQuantity(prev.quantity) !== parseQuantity(d.quantity)) fields.push('quantity')
    if (prev.uom !== d.uom.trim()) fields.push('uom')
    if (SPEC_FIELDS.some((f: SpecField) => prev[f] !== d[f].trim())) fields.push('spec')
    if (prev.description !== d.description.trim()) fields.push('description')
    if (fields.length) changed.push({ line_key: String(d.line_key), fields })
  }
  const removed = [...before.keys()].filter((k) => !kept.has(k)).length
  return { changed, added, removed }
}

/** «بند واحد / بندين / 3 بنود / 11 بندًا». */
export function linesCountAr(n: number): string {
  if (n === 1) return 'بند واحد'
  if (n === 2) return 'بندين'
  if (n >= 3 && n <= 10) return `${n} بنود`
  return `${n} بندًا`
}

function joinAr(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join('، ')} و${parts[parts.length - 1]}`
}

/** «تعديل: بندين (الكمية والمواصفة)، إضافة بند واحد» — a suggestion the buyer edits. */
export function suggestChangeNote(diff: LineDiff): string {
  const parts: string[] = []
  if (diff.changed.length) {
    const fields = new Set<LineChangeField>()
    for (const c of diff.changed) for (const f of c.fields) fields.add(f)
    const named = (Object.keys(FIELD_AR) as LineChangeField[]).filter((f) => fields.has(f)).map((f) => FIELD_AR[f])
    parts.push(`${linesCountAr(diff.changed.length)}${named.length ? ` (${joinAr(named)})` : ''}`)
  }
  if (diff.added) parts.push(`إضافة ${linesCountAr(diff.added)}`)
  if (diff.removed) parts.push(`حذف ${linesCountAr(diff.removed)}`)
  return parts.length ? `تعديل: ${parts.join('، ')}` : ''
}

// ─── Step 2: who receives it ──────────────────────────────────────────────

export function channelLabel(channel: RevisionChannel | string, heldReason?: string | null): string {
  switch (channel) {
    case 'WHATSAPP_WINDOW':
      return 'رسالة مجانية (النافذة مفتوحة)'
    case 'WHATSAPP_TEMPLATE':
      return 'قالب مدفوع'
    case 'EMAIL':
      return 'بريد (مجاني)'
    case 'HARAJ':
      return 'حراج (مجاني)'
    case 'HELD':
      return heldReason?.trim() || 'موقوف'
    case 'NONE':
      return 'لا توجد قناة'
    default:
      return String(channel || 'لا توجد قناة')
  }
}

/** Chip colour per channel: paid amber, held/none grey-red, free green. */
export function channelTone(channel: RevisionChannel | string): 'free' | 'paid' | 'blocked' {
  if (channel === 'WHATSAPP_TEMPLATE') return 'paid'
  if (channel === 'HELD' || channel === 'NONE') return 'blocked'
  return 'free'
}

export const CHANNEL_ORDER: RevisionChannel[] = ['WHATSAPP_WINDOW', 'EMAIL', 'HARAJ', 'WHATSAPP_TEMPLATE', 'HELD', 'NONE']

/** The suppliers the server proposes (`preselected`). */
export function initialSelection(candidates: RevisionCandidate[]): Set<string> {
  return new Set(candidates.filter((c) => c.preselected).map((c) => c.supplier_id))
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The candidate list narrowed by the search box (name, id or channel label). */
export function filterCandidates(candidates: RevisionCandidate[], query: string): RevisionCandidate[] {
  const q = norm(query)
  if (!q) return candidates
  return candidates.filter((c) =>
    [c.name_ar, c.supplier_id, channelLabel(c.channel, c.held_reason_ar)].some((v) => norm(String(v || '')).includes(q)),
  )
}

export function sourceLabel(source: RevisionSource | string): string {
  switch (source) {
    case 'INVITED':
      return 'مدعو'
    case 'QUOTED':
      return 'قدّم عرض'
    case 'OPEN_CONVERSATION':
      return 'محادثة مفتوحة'
    case 'SEARCH':
      return 'من البحث'
    default:
      return String(source)
  }
}

/** The body of POST /revisions; ids de-duplicated, order kept. */
export function buildRevisionBody(input: {
  drafts: DraftLine[]
  changeNote: string
  supplierIds: Iterable<string>
  template?: 'REMINDER' | 'INVITE'
}): RevisionBody {
  const ids = [...new Set([...input.supplierIds].map((id) => String(id || '').trim()).filter(Boolean))]
  const body: RevisionBody = {
    lines: input.drafts.map(lineFromDraft),
    change_note: input.changeNote.trim(),
    supplier_ids: ids,
  }
  if (input.template) body.template = input.template
  return body
}

// ─── Step 3: preview and cost ─────────────────────────────────────────────

export type RecipientGroup = { channel: RevisionChannel; label: string; recipients: RevisionRecipient[] }

/** Recipients grouped by channel, in CHANNEL_ORDER; empty groups left out. */
export function groupRecipientsByChannel(recipients: RevisionRecipient[]): RecipientGroup[] {
  const groups = new Map<string, RevisionRecipient[]>()
  for (const r of recipients) {
    const key = String(r.channel)
    groups.set(key, [...(groups.get(key) || []), r])
  }
  const order = [...CHANNEL_ORDER, ...[...groups.keys()].filter((k) => !CHANNEL_ORDER.includes(k as RevisionChannel))]
  return order
    .filter((ch) => groups.has(ch))
    .map((ch) => {
      const list = groups.get(ch) || []
      const label = ch === 'HELD' ? 'موقوف' : channelLabel(ch)
      return { channel: ch as RevisionChannel, label, recipients: list }
    })
}

function sar(value: number): string {
  const n = Number(value) || 0
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/** «عدد الرسائل المدفوعة 3 × 0.05 = 0.15 ر.س» — the server's figures, worded. */
export function costSummaryAr(cost: RevisionCost): string {
  return `عدد الرسائل المدفوعة ${cost.paid_count} × ${sar(cost.unit_price_sar)} = ${sar(cost.total_sar)} ر.س`
}

/** «مجانية: 4 · مدفوعة: 2 · موقوفة: 1» */
export function costCountsAr(cost: RevisionCost): string {
  const parts = [`مجانية: ${cost.free_count}`, `مدفوعة: ${cost.paid_count}`]
  if (cost.held_count) parts.push(`موقوفة: ${cost.held_count}`)
  return parts.join(' · ')
}

/** The text one supplier would receive free of charge — the sample shown on the preview. */
export function samplePreview(recipients: RevisionRecipient[]): RevisionRecipient | null {
  return (
    recipients.find((r) => !r.paid && r.channel !== 'HELD' && r.channel !== 'NONE' && r.message_preview?.trim()) ||
    recipients.find((r) => r.message_preview?.trim()) ||
    null
  )
}

/** The confirm body: exactly the figures of the preview on screen. */
export function confirmBody(preview: Pick<RevisionPreview, 'cost'>): { expected_paid_count: number; expected_total_sar: number } {
  return { expected_paid_count: preview.cost.paid_count, expected_total_sar: preview.cost.total_sar }
}

/** How many recipients the confirm will actually try (held / no channel are not sent). */
export function sendableCount(recipients: RevisionRecipient[]): number {
  return recipients.filter((r) => r.channel !== 'HELD' && r.channel !== 'NONE').length
}

// ─── Step 4: results ──────────────────────────────────────────────────────

export function resultStatusLabel(status: string, errorCode?: string | null): { text: string; ok: boolean } {
  const s = String(status || '').toUpperCase()
  if (s === 'SENT' || s === 'DELIVERED' || s === 'QUEUED' || s === 'ACCEPTED') return { text: s === 'QUEUED' ? 'في الطابور' : 'أُرسل', ok: true }
  if (s === 'SKIPPED' || s === 'HELD') return { text: errorCode ? `لم يُرسل — ${errorCode}` : 'لم يُرسل', ok: false }
  return { text: errorCode ? `تعذّر الإرسال — ${errorCode}` : 'تعذّر الإرسال', ok: false }
}

// ─── The file header ──────────────────────────────────────────────────────

/** «النسخة 2 — تعديل: …» for the latest version; null while there is only one. */
export function versionsLabel(versions: ConstructionRfqVersion[] | null | undefined): string | null {
  const list = [...(versions || [])].sort((a, b) => a.version_number - b.version_number)
  if (list.length < 2) return null
  const last = list[list.length - 1]
  const note = last.change_note?.trim()
  return `النسخة ${last.version_number}${note ? ` — ${note}` : ''}`
}

/** Write gate for «تعديل الطلب»: a sent request still taking quotes, not awarded. */
export function canReviseRfq(
  rfq: { status?: string; submission_closed_at?: string | null; award?: { status?: string } | null },
  readOnly = false,
): boolean {
  if (readOnly) return false
  const status = String(rfq.status || '').toUpperCase()
  const awarded = Boolean(rfq.award) && String(rfq.award?.status || '').toUpperCase() !== 'CANCELLED'
  return ['SENT', 'PARTIALLY_SENT'].includes(status) && !rfq.submission_closed_at && !awarded
}
