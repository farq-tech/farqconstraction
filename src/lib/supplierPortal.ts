/**
 * Pure helpers for the supplier portal: what each status step says and how it
 * is coloured, the deadline countdown, the chat outbox, and the bridge from the
 * token-only portal (today's API) to the request shape the new screens read.
 *
 * Two rules the screens depend on, tested in supplierPortal.test.ts:
 *   • a step whose state is UNKNOWN is grey and says «غير معروفة بعد» — never green;
 *   • a retried message keeps its `client_message_id`, so the API can refuse a duplicate.
 */
import type { PublicSupplierInvite } from '../api/constructionClient'
import type {
  OutboundAttachment,
  SupplierMessage,
  SupplierRequest,
  TimelineKind,
  TimelineStep,
} from '../api/supplierPortalClient'

// ─── Dates: Riyadh time, Arabic months, Latin digits (as the design) ─────

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

type RiyadhParts = { year: number; month: number; day: number; hour: number; minute: number }

function riyadhParts(ts: number): RiyadhParts {
  // Riyadh has no daylight saving: UTC+3 all year. Computed, not looked up, so
  // the result is the same under Node, every browser and every device zone.
  const d = new Date(ts + 3 * 3600_000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

function parse(value: string | null | undefined): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  return Number.isNaN(ts) ? null : ts
}

/** «11:59 م» */
export function formatTimeAr(value: string | null | undefined): string {
  const ts = parse(value)
  if (ts == null) return ''
  const p = riyadhParts(ts)
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'ص' : 'م'}`
}

/** «30 سبتمبر 2026» */
export function formatDateAr(value: string | null | undefined): string {
  const ts = parse(value)
  if (ts == null) return ''
  const p = riyadhParts(ts)
  return `${p.day} ${MONTHS_AR[p.month]} ${p.year}`
}

/** «30 سبتمبر» — the short form in a list row. */
export function formatDayMonthAr(value: string | null | undefined): string {
  const ts = parse(value)
  if (ts == null) return ''
  const p = riyadhParts(ts)
  return `${p.day} ${MONTHS_AR[p.month]}`
}

/** «30 سبتمبر 2026، 11:59 م» */
export function formatDateTimeAr(value: string | null | undefined): string {
  const date = formatDateAr(value)
  return date ? `${date}، ${formatTimeAr(value)}` : ''
}

function riyadhDayKey(ts: number): number {
  const p = riyadhParts(ts)
  return Date.UTC(p.year, p.month, p.day)
}

/** Day separator in the chat: «اليوم» / «أمس» / «25 سبتمبر 2026». */
export function chatDaySeparatorAr(value: string | null | undefined, now: number = Date.now()): string {
  const ts = parse(value)
  if (ts == null) return ''
  const diff = Math.round((riyadhDayKey(now) - riyadhDayKey(ts)) / 86400_000)
  if (diff === 0) return 'اليوم'
  if (diff === 1) return 'أمس'
  return formatDateAr(value)
}

// ─── Arabic counting ─────────────────────────────────────────────────────

function countAr(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  if (n >= 3 && n <= 10) return `${n} ${few}`
  return `${n} ${many}`
}

export function daysAr(n: number): string {
  return countAr(n, 'يوم', 'يومين', 'أيام', 'يوم')
}

export function hoursAr(n: number): string {
  return countAr(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')
}

export function linesAr(n: number): string {
  return countAr(n, 'بند واحد', 'بندين', 'بنود', 'بند')
}

// ─── Deadline countdown chip ─────────────────────────────────────────────

export type DeadlineChip = { text: string; tone: 'red' | 'amber' }

/**
 * «يُغلق بعد يومين» (amber, within a week) → «يُغلق بعد 5 ساعات — 11:59 م»
 * (red, the last day). Nothing once the deadline has passed or the request is
 * closed, and nothing for a date the API did not give.
 */
export function deadlineChip(
  deadline: string | null | undefined,
  now: number = Date.now(),
  closed = false,
): DeadlineChip | null {
  const ts = parse(deadline)
  if (ts == null || closed) return null
  const left = ts - now
  if (left <= 0) return null
  const hours = left / 3600_000
  if (hours < 1) return { text: `يُغلق خلال أقل من ساعة — ${formatTimeAr(deadline)}`, tone: 'red' }
  if (hours < 24) return { text: `يُغلق بعد ${hoursAr(Math.floor(hours))} — ${formatTimeAr(deadline)}`, tone: 'red' }
  const days = Math.floor(hours / 24)
  if (days > 7) return null
  return { text: `يُغلق بعد ${daysAr(days)}`, tone: 'amber' }
}

// ─── The status path ──────────────────────────────────────────────────────

export type StepTone = 'done' | 'awarded' | 'upcoming' | 'unknown' | 'muted'

export type TimelineRow = {
  kind: TimelineKind
  label: string
  /** The date line above the label. Never a date the API did not report. */
  detail: string
  tone: StepTone
}

const DONE_LABEL: Record<TimelineKind, string> = {
  SENT: 'أُرسل الطلب',
  OPENED: 'فُتح الطلب',
  QUOTE_RECEIVED: 'استلمنا عرضك',
  SUBMISSION_CLOSED: 'أُغلق التقديم',
  ENVELOPES_OPENED: 'فُتحت الأظرف',
  AWARDED: 'تمت الترسية عليكم',
  NOT_AWARDED: 'لم تتم الترسية عليكم هذه المرة',
}

const PENDING_LABEL: Record<TimelineKind, string> = {
  SENT: 'أُرسل الطلب',
  OPENED: 'فُتح الطلب',
  QUOTE_RECEIVED: 'استلام عرضك',
  SUBMISSION_CLOSED: 'إغلاق التقديم',
  ENVELOPES_OPENED: 'فُتحت الأظرف',
  AWARDED: 'الترسية',
  NOT_AWARDED: 'الترسية',
}

/**
 * The rows of «مسار الطلب».
 *
 *   DONE      → dark dot, its real date (or none, if the API had none);
 *   UPCOMING  → hollow dot, «موعده …» when a date is known;
 *   UNKNOWN   → hollow grey dot, «غير معروفة بعد». Never green.
 *
 * AWARDED is the only green row. NOT_AWARDED is grey, not red. A submission
 * closed before its deadline is grey and names the deadline it was closed ahead of.
 * AWARDED and NOT_AWARDED are one step: once either is DONE the other is dropped;
 * while neither is, a single «الترسية» row stands for both.
 */
export function timelineRows(steps: readonly TimelineStep[], deadline: string | null = null): TimelineRow[] {
  const byKind = new Map(steps.map((step) => [step.kind, step]))
  const awarded = byKind.get('AWARDED')
  const notAwarded = byKind.get('NOT_AWARDED')
  const decided = awarded?.state === 'DONE' ? awarded : notAwarded?.state === 'DONE' ? notAwarded : null
  const order: TimelineKind[] = ['SENT', 'OPENED', 'QUOTE_RECEIVED', 'SUBMISSION_CLOSED', 'ENVELOPES_OPENED']
  const rows: TimelineRow[] = []
  for (const kind of order) {
    const step = byKind.get(kind)
    if (!step) {
      // Not reported is not done: the row stays, grey, without a date.
      if (kind === 'SUBMISSION_CLOSED' && deadline) {
        rows.push({ kind, label: PENDING_LABEL[kind], detail: `موعده ${formatDateTimeAr(deadline)}`, tone: 'upcoming' })
      } else {
        rows.push({ kind, label: PENDING_LABEL[kind], detail: 'غير معروفة بعد', tone: 'unknown' })
      }
      continue
    }
    rows.push(rowFor(step, deadline))
  }
  if (decided) rows.push(rowFor(decided, deadline))
  else {
    const pending = awarded || notAwarded
    rows.push(
      pending && pending.state === 'UPCOMING' && pending.at
        ? { kind: 'AWARDED', label: 'الترسية', detail: `موعدها ${formatDateTimeAr(pending.at)}`, tone: 'upcoming' }
        : { kind: 'AWARDED', label: 'الترسية', detail: 'غير معروفة بعد', tone: 'unknown' },
    )
  }
  return rows
}

function rowFor(step: TimelineStep, deadline: string | null): TimelineRow {
  const { kind, state, at } = step
  if (state === 'UNKNOWN') return { kind, label: PENDING_LABEL[kind], detail: 'غير معروفة بعد', tone: 'unknown' }
  if (state === 'UPCOMING') {
    const due = at || (kind === 'SUBMISSION_CLOSED' ? deadline : null)
    return {
      kind,
      label: PENDING_LABEL[kind],
      detail: due ? `موعده ${formatDateTimeAr(due)}` : 'غير معروفة بعد',
      tone: due ? 'upcoming' : 'unknown',
    }
  }
  // DONE
  const when = formatDateTimeAr(at)
  if (kind === 'AWARDED') return { kind, label: DONE_LABEL[kind], detail: when, tone: 'awarded' }
  if (kind === 'NOT_AWARDED') return { kind, label: DONE_LABEL[kind], detail: when, tone: 'muted' }
  if (kind === 'SUBMISSION_CLOSED') {
    const closedAt = parse(at)
    const due = parse(deadline)
    if (closedAt != null && due != null && closedAt < due) {
      return { kind, label: 'أُغلق التقديم قبل موعده', detail: `كان الموعد ${formatDateTimeAr(deadline)}`, tone: 'muted' }
    }
  }
  return { kind, label: DONE_LABEL[kind], detail: when, tone: 'done' }
}

// ─── One-word status of a request (the chip on a list row) ───────────────

export type StatusChip = { text: string; tone: 'mint' | 'farq' | 'amber' | 'grey' }

function isDone(steps: readonly TimelineStep[], kind: TimelineKind): boolean {
  return steps.some((step) => step.kind === kind && step.state === 'DONE')
}

export function requestStatusChip(request: Pick<SupplierRequest, 'status_timeline'>): StatusChip {
  const steps = request.status_timeline
  if (isDone(steps, 'AWARDED')) return { text: 'تمت الترسية عليكم', tone: 'mint' }
  if (isDone(steps, 'NOT_AWARDED')) return { text: 'لم تتم الترسية', tone: 'grey' }
  if (isDone(steps, 'QUOTE_RECEIVED')) return { text: 'استلمنا عرضك', tone: 'farq' }
  if (isDone(steps, 'SUBMISSION_CLOSED')) return { text: 'أُغلق التقديم', tone: 'grey' }
  return { text: 'بانتظار عرضك', tone: 'amber' }
}

export function isSubmissionClosed(request: Pick<SupplierRequest, 'status_timeline'>): boolean {
  return isDone(request.status_timeline, 'SUBMISSION_CLOSED')
}

/** «مبروك!» / «شكراً على عرضكم» under the head card, or nothing. */
export function outcomeNote(request: SupplierRequest): { text: string; tone: 'mint' | 'grey' } | null {
  const company = request.buyer_company || 'المشتري'
  if (isDone(request.status_timeline, 'AWARDED'))
    return { text: `مبروك! ${company} بتتواصل معكم هنا لترتيب التوريد.`, tone: 'mint' }
  if (isDone(request.status_timeline, 'NOT_AWARDED'))
    return { text: `شكراً على عرضكم. نبلغكم بالطلبات الجاية من ${company}.`, tone: 'grey' }
  return null
}

/** «الدفع للتجارة والمقاولات» — the company without «شركة/مؤسسة» for «راسل …». */
export function shortCompany(name: string): string {
  return name.replace(/^(شركة|مؤسسة|مصنع|مجموعة)\s+/, '').trim() || name
}

/** Initial for the round avatar on a list row. */
export function companyInitial(name: string): string {
  const short = shortCompany(name)
  return Array.from(short.trim())[0] || '؟'
}

// ─── Today's token portal → the request shape ────────────────────────────

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = value == null ? '' : String(value).trim()
    if (text) return text
  }
  return null
}

/** The deadline wherever the booklet payload keeps it (date, optional time). */
export function legacyDeadline(invite: PublicSupplierInvite): string | null {
  const terms = (invite.commercial_terms || {}) as Record<string, unknown>
  const raw = invite as unknown as Record<string, unknown>
  const date = pickString(raw.quote_deadline, terms.quote_deadline, raw.deadline, terms.deadline)
  if (!date) return null
  if (/T\d/.test(date)) return date
  const time = pickString(raw.quote_deadline_time, terms.quote_deadline_time) || '23:59'
  // A bare date is a Riyadh date.
  const iso = `${date.slice(0, 10)}T${time.length === 5 ? `${time}:00` : time}+03:00`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

const RESPONDED = new Set(['SUBMITTED', 'RESPONDED', 'QUOTED', 'RECEIVED', 'REVISED'])

/**
 * What the token portal can honestly say about the path: the request was sent
 * (the supplier is holding its link), a quote went in when `response_status`
 * says so, and submission closed when it did. Everything else is UNKNOWN.
 */
export function requestFromLegacyInvite(invite: PublicSupplierInvite): SupplierRequest {
  const buyer = (invite.buyer || {}) as Record<string, unknown>
  const raw = invite as unknown as Record<string, unknown>
  const terms = (invite.commercial_terms || {}) as Record<string, unknown>
  const responded = RESPONDED.has(String(invite.response_status || '').toUpperCase())
  const deadline = legacyDeadline(invite)
  const steps: TimelineStep[] = [
    { kind: 'SENT', state: 'DONE', at: null },
    { kind: 'OPENED', state: 'DONE', at: null },
    { kind: 'QUOTE_RECEIVED', state: responded ? 'DONE' : 'UNKNOWN', at: null },
    invite.submission_closed_at
      ? { kind: 'SUBMISSION_CLOSED', state: 'DONE', at: invite.submission_closed_at }
      : { kind: 'SUBMISSION_CLOSED', state: deadline ? 'UPCOMING' : 'UNKNOWN', at: deadline },
    { kind: 'ENVELOPES_OPENED', state: 'UNKNOWN', at: null },
    { kind: 'AWARDED', state: 'UNKNOWN', at: null },
  ]
  return {
    invite_id: invite.invite_id,
    buyer_company: pickString(buyer.company_name, buyer.name) || '',
    reference: pickString(raw.reference, raw.rfq_reference, terms.reference) || '',
    title: '',
    deadline,
    status_timeline: steps,
    unread_count: 0,
    line_count: invite.lines?.length ?? null,
    quote_version: null,
  }
}

// ─── Chat: the outbox ─────────────────────────────────────────────────────

export type PendingState = 'queued' | 'sending' | 'failed'

export type PendingMessage = {
  client_message_id: string
  body: string
  files: File[]
  state: PendingState
  progress: number | null
  error: string | null
  created_at: string
}

export type OutboxAction =
  | { type: 'enqueue'; message: PendingMessage }
  | { type: 'sending'; id: string }
  | { type: 'progress'; id: string; progress: number }
  | { type: 'failed'; id: string; error: string }
  | { type: 'delivered'; id: string }

/**
 * The outbox of messages that have not been confirmed by the API.
 * A retry moves the SAME entry (same `client_message_id`) back to sending;
 * nothing here ever mints a second id for a message already written.
 */
export function outboxReducer(state: PendingMessage[], action: OutboxAction): PendingMessage[] {
  switch (action.type) {
    case 'enqueue':
      return state.some((m) => m.client_message_id === action.message.client_message_id)
        ? state
        : [...state, action.message]
    case 'sending':
      return state.map((m) =>
        m.client_message_id === action.id ? { ...m, state: 'sending', progress: m.files.length ? 0 : null, error: null } : m,
      )
    case 'progress':
      return state.map((m) => (m.client_message_id === action.id ? { ...m, progress: action.progress } : m))
    case 'failed':
      return state.map((m) =>
        m.client_message_id === action.id ? { ...m, state: 'failed', progress: null, error: action.error } : m,
      )
    case 'delivered':
      return state.filter((m) => m.client_message_id !== action.id)
    default:
      return state
  }
}

/**
 * Send one outbox entry. Called again by «أعد المحاولة» with the SAME entry,
 * so the API sees the same `client_message_id` and stores the message once
 * even when the first attempt did reach it before the connection dropped.
 */
export async function deliverPending(
  message: PendingMessage,
  deps: {
    send: (
      input: { body: string; attachments: OutboundAttachment[]; client_message_id: string },
      onProgress: (fraction: number) => void,
    ) => Promise<SupplierMessage>
    read: (file: File) => Promise<OutboundAttachment>
    dispatch: (action: OutboxAction) => void
  },
): Promise<SupplierMessage | null> {
  const id = message.client_message_id
  deps.dispatch({ type: 'sending', id })
  try {
    const attachments = await Promise.all(message.files.map((file) => deps.read(file)))
    const sent = await deps.send({ body: message.body, attachments, client_message_id: id }, (fraction) =>
      deps.dispatch({ type: 'progress', id, progress: fraction }),
    )
    deps.dispatch({ type: 'delivered', id })
    return { ...sent, client_message_id: sent.client_message_id || id }
  } catch (err) {
    deps.dispatch({
      type: 'failed',
      id,
      error: err instanceof Error ? err.message : 'لم تُرسل — أعد المحاولة.',
    })
    return null
  }
}

export function newClientMessageId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Server messages, oldest first, without a pending twin the server already has. */
export function visiblePending(server: readonly SupplierMessage[], pending: readonly PendingMessage[]): PendingMessage[] {
  const known = new Set(server.map((m) => m.client_message_id).filter(Boolean))
  return pending.filter((m) => !known.has(m.client_message_id))
}

export function sortMessages(messages: readonly SupplierMessage[]): SupplierMessage[] {
  return messages
    .map((message, index) => ({ message, index, ts: parse(message.created_at) }))
    .sort((a, b) => {
      if (a.ts == null || b.ts == null || a.ts === b.ts) return a.index - b.index
      return a.ts - b.ts
    })
    .map((entry) => entry.message)
}

/** The supplier sees only two states on a sent message. */
export function deliveryLabel(message: Pick<SupplierMessage, 'direction' | 'read_at'>): 'قُرئت' | 'أُرسلت' | null {
  if (message.direction !== 'OUT') return null
  return message.read_at ? 'قُرئت' : 'أُرسلت'
}

// ─── «استفسار عن هذا البند» ───────────────────────────────────────────────

export type LineRef = { number: number; name: string; quantity: number | string; uom: string }

/** The chip above the composer: «البند 2 · حديد تسليح 12 مم — 20 طن». */
export function lineRefLabel(line: LineRef): string {
  return `البند ${line.number} · ${line.name} — ${line.quantity} ${line.uom}`.trim()
}

/** What is sent: the item named first, so the buyer reads which line is asked about. */
export function withLineRef(body: string, line: LineRef | null): string {
  const text = body.trim()
  if (!line) return text
  return `بخصوص ${lineRefLabel(line)}:\n${text}`
}

// ─── Cached last messages for the offline state ──────────────────────────

const CACHE_PREFIX = 'farq_supplier_chat:'

export function cacheMessages(inviteId: string, messages: readonly SupplierMessage[]): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + inviteId, JSON.stringify(messages.slice(-100)))
  } catch {
    /* no storage: the offline banner shows over an empty chat */
  }
}

export function cachedMessages(inviteId: string): SupplierMessage[] {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + inviteId)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as SupplierMessage[]) : []
  } catch {
    return []
  }
}

/** «438 ك.ب» / «2.1 م.ب». */
export function fileSizeAr(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}

// ─── A link of an older version of the request («تعديل الطلب») ─────────────

export type SupersededNotice = {
  title: string
  text: string
  note: string | null
  /** True when this supplier was invited to the current version: «افتح النسخة الجديدة». */
  canOpenCurrent: boolean
  /** Said instead of the button when he was not invited to it. */
  notInvitedText: string | null
}

/**
 * What the portal says on a link the buyer has since revised. Null for a link
 * of the current version — the quote form stays as it is. A superseded link is
 * read-only: the API refuses a quote on it.
 */
export function supersededNotice(invite: Pick<PublicSupplierInvite, 'revision'> | null | undefined): SupersededNotice | null {
  const rev = invite?.revision
  if (!rev || rev.superseded !== true) return null
  const n = Number(rev.current_version_number)
  const version = Number.isFinite(n) && n > 0 ? ` (تم تحديثه إلى النسخة ${n})` : ''
  const canOpenCurrent = rev.invited_to_current === true
  return {
    title: 'تم تحديث الطلب',
    text: `هذا الرابط لنسخة سابقة من الطلب${version}.`,
    note: rev.change_note?.trim() || null,
    canOpenCurrent,
    notInvitedText: canOpenCurrent ? null : 'لم تُدعَ إلى النسخة الجديدة.',
  }
}

/** Where «افتح النسخة الجديدة» goes: this page with the new link token. */
export function currentVersionHref(pathname: string, token: string): string {
  return `${pathname || '/'}?supplier_token=${encodeURIComponent(token)}`
}
