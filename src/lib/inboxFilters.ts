/**
 * Filters for the conversation list («فلترة المحادثات»), pure and testable.
 *
 * Only the request filter goes to the server (`rfq_id`, which the inbox API
 * already accepts). Everything else runs here, over the rows this screen has
 * loaded — the API has no parameter for it. Each rule reads a field only when
 * the data really carries it:
 *
 * - A thread row carries unread_count, needs_reply, kind_hint, response_status,
 *   owner_user_id / can_reply and request_context (reference, first 3 items).
 * - Channel, the meaning of the supplier's last reply and "has attachment" are
 *   NOT on a list row today; they are known for a row only when the API adds
 *   them to the row, or once its conversation was opened in this session
 *   (a `ThreadInsight` recorded from the thread detail).
 *
 * A thread whose fact is unknown never matches a filter on that fact: the
 * screen says how many rows it could not judge instead of guessing.
 */
import type { ConstructionInboxThread } from '../api/constructionClient'
import { normalizeForSearch } from './inboxChat'

export type ChannelKey = 'platform' | 'whatsapp' | 'email' | 'chat'
export type StateKey = 'needs_reply' | 'waiting_supplier' | 'unread' | 'read'
export type MeaningKey =
  | 'QUOTE_FILE'
  | 'PRICE_IN_TEXT'
  | 'QUESTION'
  | 'DECLINED'
  | 'ALT_CONTACT'
  | 'INTERESTED'
  | 'AUTO_REPLY'
  | 'VOICE'
export type QuoteKey = 'submitted' | 'not_submitted' | 'new_version'
export type AccountKey = 'active' | 'not_opened' | 'declined'
export type OwnerKey = 'mine' | 'unassigned' | 'colleague'
export type DatePreset = 'today' | '7d' | 'custom'

export type InboxFilters = {
  /** Server-side: sent as `rfq_id` to the threads endpoint. */
  rfqId: string | null
  /** Client-side: every loaded request that belongs to this booklet. */
  bookletId: string | null
  channels: ChannelKey[]
  states: StateKey[]
  meanings: MeaningKey[]
  hasAttachment: boolean
  quote: QuoteKey[]
  account: AccountKey[]
  owner: OwnerKey[]
  date: { preset: DatePreset | null; from?: string | null; to?: string | null }
  /** Line / item text, searched in the items the row carries. */
  item: string
}

export const EMPTY_FILTERS: InboxFilters = Object.freeze({
  rfqId: null,
  bookletId: null,
  channels: [],
  states: [],
  meanings: [],
  hasAttachment: false,
  quote: [],
  account: [],
  owner: [],
  date: { preset: null, from: null, to: null },
  item: '',
}) as InboxFilters

export function emptyFilters(): InboxFilters {
  return { ...EMPTY_FILTERS, channels: [], states: [], meanings: [], quote: [], account: [], owner: [], date: { preset: null, from: null, to: null } }
}

/** What a conversation revealed when it was opened (thread detail). */
export type ThreadInsight = {
  /** Channel of the supplier's latest inbound message. */
  channel?: string | null
  /** reply_kind of the supplier's latest inbound message. */
  replyKind?: string | null
  /** Any inbound message carries a file. */
  hasFiles?: boolean
  /** Latest quote version known for this invite. */
  quoteVersion?: number | null
}

export type BookletLink = {
  bookletId: string
  reference: string | null
  waveNumber: number | null
  waves: number | null
}

export type FilterContext = {
  now: number
  /** The signed-in user's id; without it ownership falls back to can_reply. */
  meId?: string | null
  insights?: Record<string, ThreadInsight | undefined>
  bookletByRfq?: Record<string, BookletLink | null | undefined>
}

/** Fields the list API may carry in the future; read when present, never required. */
type LooseThread = ConstructionInboxThread & {
  channel?: string | null
  last_channel?: string | null
  reply_channel?: string | null
  reply_kind?: string | null
  has_files?: boolean | null
  has_attachments?: boolean | null
  quote_version?: number | string | null
  supplier_account_status?: string | null
  account_status?: string | null
  owner_user_id?: string | null
  can_reply?: boolean
  request_context?: ConstructionInboxThread['request_context'] & {
    response_status?: string | null
    items?: Array<{ name_ar?: string | null; name_en?: string | null }>
  }
}

export function channelKey(value: string | null | undefined): ChannelKey | null {
  const key = String(value || '').toUpperCase()
  if (key === 'WHATSAPP') return 'whatsapp'
  if (key === 'EMAIL') return 'email'
  if (key === 'HARAJ') return 'chat'
  if (key === 'FORM' || key === 'PORTAL' || key === 'PLATFORM') return 'platform'
  return null
}

const MEANINGS: MeaningKey[] = ['QUOTE_FILE', 'PRICE_IN_TEXT', 'QUESTION', 'DECLINED', 'ALT_CONTACT', 'INTERESTED', 'AUTO_REPLY', 'VOICE']

export function meaningKey(value: string | null | undefined): MeaningKey | null {
  const key = String(value || '').toUpperCase()
  return (MEANINGS as string[]).includes(key) ? (key as MeaningKey) : null
}

export function accountKey(value: string | null | undefined): AccountKey | null {
  const key = String(value || '').toUpperCase()
  if (['ACTIVE', 'ACTIVATED', 'CLAIMED'].includes(key)) return 'active'
  if (['READY', 'NOT_OPENED', 'PENDING', 'INVITED', 'UNCLAIMED'].includes(key)) return 'not_opened'
  if (['DECLINED', 'REJECTED', 'REFUSED', 'NOT_MINE'].includes(key)) return 'declined'
  return null
}

export type ThreadFacts = {
  rfqId: string | null
  bookletId: string | null
  channel: ChannelKey | null
  needsReply: boolean
  unread: boolean
  waitingSupplier: boolean
  meaning: MeaningKey | null
  hasAttachment: boolean | null
  quoteSubmitted: boolean | null
  newVersion: boolean | null
  account: AccountKey | null
  owner: OwnerKey | null
  at: number | null
  itemText: string
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function threadKey(thread: ConstructionInboxThread): string {
  return String(thread.invite_id || '')
}

export function threadFacts(thread: ConstructionInboxThread, ctx: FilterContext): ThreadFacts {
  const row = thread as LooseThread
  const insight = ctx.insights?.[threadKey(thread)]
  const rfqId = row.request_context?.rfq_id ? String(row.request_context.rfq_id) : null
  const booklet = rfqId ? ctx.bookletByRfq?.[rfqId] : null

  const channel = channelKey(row.channel ?? row.last_channel ?? row.reply_channel ?? insight?.channel ?? null)

  const kindHint = String(row.kind_hint || '').toUpperCase()
  let meaning = meaningKey(row.reply_kind ?? insight?.replyKind ?? null)
  // The list row's own kind_hint already says «question» for some replies.
  if (!meaning && kindHint === 'QUESTION') meaning = 'QUESTION'

  const hasAttachment =
    typeof row.has_files === 'boolean'
      ? row.has_files
      : typeof row.has_attachments === 'boolean'
        ? row.has_attachments
        : typeof insight?.hasFiles === 'boolean'
          ? insight.hasFiles
          : null

  const status = String(row.response_status || row.request_context?.response_status || '').toUpperCase()
  const quoteSubmitted = status ? status === 'QUOTED' : null
  const version = numberOrNull(row.quote_version) ?? numberOrNull(insight?.quoteVersion)
  const newVersion = version != null ? version > 1 : quoteSubmitted === false ? false : null

  let owner: OwnerKey | null = null
  if (row.owner_user_id === null) owner = 'unassigned'
  else if (typeof row.owner_user_id === 'string' && row.owner_user_id) {
    if (ctx.meId) owner = row.owner_user_id === ctx.meId ? 'mine' : 'colleague'
    else if (row.can_reply === true) owner = 'mine'
    else if (row.can_reply === false && !row.locked) owner = 'colleague'
  }

  const unread = Number(row.unread_count || 0) > 0
  const needsReply = Boolean(row.needs_reply)
  const ts = row.last_received_at ? Date.parse(String(row.last_received_at)) : NaN

  const items = row.request_context?.items || []
  const itemParts = items.flatMap((item) => [item?.name_ar, item?.name_en])
  if (!row.locked) itemParts.push(row.subject ?? null, row.preview ?? null)

  return {
    rfqId,
    bookletId: booklet?.bookletId ?? null,
    channel,
    needsReply,
    unread,
    // Our message is the latest activity, and nothing is waiting on us.
    waitingSupplier: !needsReply && (kindHint === 'CORRESPONDENCE' || kindHint === 'DISPATCH'),
    meaning,
    hasAttachment,
    quoteSubmitted,
    newVersion,
    account: accountKey(row.supplier_account_status ?? row.account_status ?? null),
    owner,
    at: Number.isNaN(ts) ? null : ts,
    itemText: normalizeForSearch(itemParts.filter(Boolean).join(' ')),
  }
}

const DAY_MS = 86400000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function parseDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const ts = new Date(y!, m! - 1, d!).getTime()
  return Number.isNaN(ts) ? null : ts
}

function matchState(facts: ThreadFacts, state: StateKey): boolean {
  if (state === 'needs_reply') return facts.needsReply
  if (state === 'waiting_supplier') return facts.waitingSupplier
  if (state === 'unread') return facts.unread
  return !facts.unread
}

function matchQuote(facts: ThreadFacts, key: QuoteKey): boolean {
  if (key === 'submitted') return facts.quoteSubmitted === true
  if (key === 'not_submitted') return facts.quoteSubmitted === false
  return facts.newVersion === true
}

function matchDate(facts: ThreadFacts, date: InboxFilters['date'], now: number): boolean {
  if (!date.preset) return true
  if (facts.at == null) return false
  if (date.preset === 'today') return startOfDay(facts.at) === startOfDay(now)
  if (date.preset === '7d') return facts.at >= startOfDay(now) - 6 * DAY_MS && facts.at <= now + DAY_MS
  const from = parseDay(date.from)
  const to = parseDay(date.to)
  if (from != null && facts.at < from) return false
  if (to != null && facts.at >= to + DAY_MS) return false
  return true
}

/** One criterion of the filter set, the unit of an active chip. */
export type FilterCriterion =
  | { group: 'rfq'; value: string }
  | { group: 'booklet'; value: string }
  | { group: 'channel'; value: ChannelKey }
  | { group: 'state'; value: StateKey }
  | { group: 'meaning'; value: MeaningKey }
  | { group: 'attachment'; value: 'yes' }
  | { group: 'quote'; value: QuoteKey }
  | { group: 'account'; value: AccountKey }
  | { group: 'owner'; value: OwnerKey }
  | { group: 'date'; value: DatePreset }
  | { group: 'item'; value: string }

export function matchesCriterion(facts: ThreadFacts, c: FilterCriterion, filters: InboxFilters, now: number): boolean {
  switch (c.group) {
    case 'rfq':
      return facts.rfqId === c.value
    case 'booklet':
      return facts.bookletId === c.value
    case 'channel':
      return facts.channel === c.value
    case 'state':
      return matchState(facts, c.value)
    case 'meaning':
      return facts.meaning === c.value
    case 'attachment':
      return facts.hasAttachment === true
    case 'quote':
      return matchQuote(facts, c.value)
    case 'account':
      return facts.account === c.value
    case 'owner':
      return facts.owner === c.value
    case 'date':
      return matchDate(facts, filters.date, now)
    case 'item': {
      // Every word typed must appear, in any order: «بلوك 15» finds «بلوك مقاس 15 سم».
      const words = normalizeForSearch(c.value).split(' ').filter(Boolean)
      return words.every((word) => facts.itemText.includes(word))
    }
  }
}

/** Every active criterion, in the order the chips show them. */
export function criteriaOf(filters: InboxFilters): FilterCriterion[] {
  const out: FilterCriterion[] = []
  if (filters.rfqId) out.push({ group: 'rfq', value: filters.rfqId })
  if (filters.bookletId) out.push({ group: 'booklet', value: filters.bookletId })
  for (const value of filters.channels) out.push({ group: 'channel', value })
  for (const value of filters.states) out.push({ group: 'state', value })
  for (const value of filters.meanings) out.push({ group: 'meaning', value })
  if (filters.hasAttachment) out.push({ group: 'attachment', value: 'yes' })
  for (const value of filters.quote) out.push({ group: 'quote', value })
  for (const value of filters.account) out.push({ group: 'account', value })
  for (const value of filters.owner) out.push({ group: 'owner', value })
  if (filters.date.preset) out.push({ group: 'date', value: filters.date.preset })
  if (filters.item.trim()) out.push({ group: 'item', value: filters.item.trim() })
  return out
}

export function activeFilterCount(filters: InboxFilters): number {
  return criteriaOf(filters).length
}

/** OR inside a group, AND across groups. */
function matchesFacts(facts: ThreadFacts, filters: InboxFilters, now: number): boolean {
  const byGroup = new Map<string, FilterCriterion[]>()
  for (const c of criteriaOf(filters)) {
    const list = byGroup.get(c.group) || []
    list.push(c)
    byGroup.set(c.group, list)
  }
  for (const list of byGroup.values()) {
    if (!list.some((c) => matchesCriterion(facts, c, filters, now))) return false
  }
  return true
}

export function matchesFilters(thread: ConstructionInboxThread, filters: InboxFilters, ctx: FilterContext): boolean {
  return matchesFacts(threadFacts(thread, ctx), filters, ctx.now)
}

export function applyFilters<T extends ConstructionInboxThread>(threads: readonly T[], filters: InboxFilters, ctx: FilterContext): T[] {
  if (!activeFilterCount(filters)) return [...threads]
  return threads.filter((t) => matchesFilters(t, filters, ctx))
}

export function sameCriterion(a: FilterCriterion, b: FilterCriterion): boolean {
  return a.group === b.group && a.value === b.value
}

export function hasCriterion(filters: InboxFilters, c: FilterCriterion): boolean {
  return criteriaOf(filters).some((x) => sameCriterion(x, c))
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Adds the criterion when absent, removes it when present. */
export function toggleCriterion(filters: InboxFilters, c: FilterCriterion): InboxFilters {
  const on = hasCriterion(filters, c)
  switch (c.group) {
    case 'rfq':
      return { ...filters, rfqId: on ? null : c.value }
    case 'booklet':
      return { ...filters, bookletId: on ? null : c.value }
    case 'channel':
      return { ...filters, channels: toggleIn(filters.channels, c.value) }
    case 'state':
      return { ...filters, states: toggleIn(filters.states, c.value) }
    case 'meaning':
      return { ...filters, meanings: toggleIn(filters.meanings, c.value) }
    case 'attachment':
      return { ...filters, hasAttachment: !filters.hasAttachment }
    case 'quote':
      return { ...filters, quote: toggleIn(filters.quote, c.value) }
    case 'account':
      return { ...filters, account: toggleIn(filters.account, c.value) }
    case 'owner':
      return { ...filters, owner: toggleIn(filters.owner, c.value) }
    case 'date':
      return { ...filters, date: on ? { preset: null, from: null, to: null } : { ...filters.date, preset: c.value } }
    case 'item':
      return { ...filters, item: on ? '' : c.value }
  }
}

export function removeCriterion(filters: InboxFilters, c: FilterCriterion): InboxFilters {
  return hasCriterion(filters, c) ? toggleCriterion(filters, c) : filters
}

/** How many of `threads` match this criterion alone (the chip's count). */
export function countCriterion(
  threads: readonly ConstructionInboxThread[],
  c: FilterCriterion,
  filters: InboxFilters,
  ctx: FilterContext,
): number {
  let n = 0
  for (const t of threads) if (matchesCriterion(threadFacts(t, ctx), c, filters, ctx.now)) n += 1
  return n
}

export type Labels = {
  request?: (rfqId: string) => string | null | undefined
  booklet?: (bookletId: string) => string | null | undefined
}

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  platform: 'عبر المنصة',
  whatsapp: 'واتساب',
  email: 'إيميل',
  chat: 'محادثة',
}
export const STATE_LABEL: Record<StateKey, string> = {
  needs_reply: 'تحتاج رد',
  waiting_supplier: 'بانتظار المورّد',
  unread: 'غير مقروءة',
  read: 'مقروءة',
}
export const MEANING_LABEL: Record<MeaningKey, string> = {
  QUOTE_FILE: 'عرض سعر',
  PRICE_IN_TEXT: 'ذكر سعراً',
  QUESTION: 'استفسار',
  DECLINED: 'اعتذار',
  ALT_CONTACT: 'رقم بديل',
  INTERESTED: 'مهتم',
  AUTO_REPLY: 'رد آلي',
  VOICE: 'صوتية',
}
export const QUOTE_LABEL: Record<QuoteKey, string> = {
  submitted: 'قدّم عرضاً',
  not_submitted: 'لم يقدّم',
  new_version: 'نسخة جديدة',
}
export const ACCOUNT_LABEL: Record<AccountKey, string> = {
  active: 'مفعّل',
  not_opened: 'لم يفتح',
  declined: 'رفض الحساب',
}
export const OWNER_LABEL: Record<OwnerKey, string> = {
  mine: 'محادثاتي',
  unassigned: 'غير مستلمة',
  colleague: 'لزميل',
}
export const DATE_LABEL: Record<DatePreset, string> = {
  today: 'اليوم',
  '7d': 'آخر 7 أيام',
  custom: 'مخصص',
}

function customRangeLabel(date: InboxFilters['date']): string {
  const from = date.from || '…'
  const to = date.to || '…'
  return `${from} — ${to}`
}

export function criterionLabel(c: FilterCriterion, filters: InboxFilters, labels: Labels = {}): string {
  switch (c.group) {
    case 'rfq':
      return `الطلب: ${labels.request?.(c.value) || c.value.slice(0, 8)}`
    case 'booklet':
      return `الكراسة: ${labels.booklet?.(c.value) || c.value.slice(0, 8)}`
    case 'channel':
      return `القناة: ${CHANNEL_LABEL[c.value]}`
    case 'state':
      return STATE_LABEL[c.value]
    case 'meaning':
      return MEANING_LABEL[c.value]
    case 'attachment':
      return 'فيها مرفق'
    case 'quote':
      return QUOTE_LABEL[c.value]
    case 'account':
      return ACCOUNT_LABEL[c.value]
    case 'owner':
      return OWNER_LABEL[c.value]
    case 'date':
      return c.value === 'custom' ? `التاريخ: ${customRangeLabel(filters.date)}` : DATE_LABEL[c.value]
    case 'item':
      return `البند: ${c.value}`
  }
}

export type ActiveChip = { key: string; criterion: FilterCriterion; label: string; count: number }

export function activeChips(
  threads: readonly ConstructionInboxThread[],
  filters: InboxFilters,
  ctx: FilterContext,
  labels: Labels = {},
): ActiveChip[] {
  return criteriaOf(filters).map((criterion) => ({
    key: `${criterion.group}:${criterion.value}`,
    criterion,
    label: criterionLabel(criterion, filters, labels),
    count: countCriterion(threads, criterion, filters, ctx),
  }))
}

/**
 * «ما فيه محادثات تطابق الفلاتر»: the one chip whose removal brings back the
 * most conversations, or null when removing any single one would not help.
 */
export function noResultSuggestion(
  threads: readonly ConstructionInboxThread[],
  filters: InboxFilters,
  ctx: FilterContext,
  labels: Labels = {},
): { chip: ActiveChip; results: number } | null {
  let best: { chip: ActiveChip; results: number } | null = null
  for (const chip of activeChips(threads, filters, ctx, labels)) {
    // The request filter is applied by the server; the loaded rows already
    // belong to it, so removing it here cannot be measured.
    if (chip.criterion.group === 'rfq') continue
    const results = applyFilters(threads, removeCriterion(filters, chip.criterion), ctx).length
    if (results > 0 && (!best || results > best.results)) best = { chip, results }
  }
  return best
}

/** Rows whose fact is unknown for each client-side group that depends on opening the thread. */
export function unknownFacts(threads: readonly ConstructionInboxThread[], ctx: FilterContext) {
  const out = { channel: 0, meaning: 0, attachment: 0, quote: 0, owner: 0, total: threads.length }
  for (const t of threads) {
    const f = threadFacts(t, ctx)
    if (!f.channel) out.channel += 1
    if (!f.meaning) out.meaning += 1
    if (f.hasAttachment == null) out.attachment += 1
    if (f.quoteSubmitted == null) out.quote += 1
    if (!f.owner) out.owner += 1
  }
  return out
}

/** Supplier account status is shown only when at least one row carries it. */
export function hasAccountData(threads: readonly ConstructionInboxThread[]): boolean {
  return threads.some((t) => accountKey((t as LooseThread).supplier_account_status ?? (t as LooseThread).account_status ?? null) != null)
}

/* ------------------------------------------------------------ saved views */

export type SavedView = { id: string; name: string; filters: InboxFilters; createdAt: string }

export const SAVED_VIEWS_KEY = 'farq.inbox.savedViews.v1'
const MAX_SAVED_VIEWS = 20

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

function pickList<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v)))]
}

const CHANNELS: ChannelKey[] = ['platform', 'whatsapp', 'email', 'chat']
const STATES: StateKey[] = ['needs_reply', 'waiting_supplier', 'unread', 'read']
const QUOTES: QuoteKey[] = ['submitted', 'not_submitted', 'new_version']
const ACCOUNTS: AccountKey[] = ['active', 'not_opened', 'declined']
const OWNERS: OwnerKey[] = ['mine', 'unassigned', 'colleague']
const DATES: DatePreset[] = ['today', '7d', 'custom']

/** Whatever was stored (older shape, hand-edited, another tab) comes back valid. */
export function sanitizeFilters(raw: unknown): InboxFilters {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const date = (src.date && typeof src.date === 'object' ? src.date : {}) as Record<string, unknown>
  const preset = typeof date.preset === 'string' && (DATES as string[]).includes(date.preset) ? (date.preset as DatePreset) : null
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  return {
    rfqId: str(src.rfqId, 64),
    bookletId: str(src.bookletId, 64),
    channels: pickList(src.channels, CHANNELS),
    states: pickList(src.states, STATES),
    meanings: pickList(src.meanings, MEANINGS),
    hasAttachment: src.hasAttachment === true,
    quote: pickList(src.quote, QUOTES),
    account: pickList(src.account, ACCOUNTS),
    owner: pickList(src.owner, OWNERS),
    date: { preset, from: preset === 'custom' ? day(date.from) : null, to: preset === 'custom' ? day(date.to) : null },
    item: typeof src.item === 'string' ? src.item.slice(0, 120) : '',
  }
}

export function loadSavedViews(storage: StorageLike | null = defaultStorage()): SavedView[] {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(SAVED_VIEWS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v) => v && typeof v === 'object' && typeof v.id === 'string' && typeof v.name === 'string')
      .map((v) => ({
        id: String(v.id),
        name: String(v.name).slice(0, 80),
        filters: sanitizeFilters(v.filters),
        createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
      }))
      .slice(0, MAX_SAVED_VIEWS)
  } catch {
    return []
  }
}

function writeViews(storage: StorageLike | null, views: SavedView[]): SavedView[] {
  try {
    storage?.setItem(SAVED_VIEWS_KEY, JSON.stringify(views))
  } catch {
    /* private mode / quota: the view lives for this page only */
  }
  return views
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Saves the current filters under a name; a view with the same name is replaced. */
export function saveView(
  name: string,
  filters: InboxFilters,
  storage: StorageLike | null = defaultStorage(),
  now: Date = new Date(),
): SavedView[] {
  const clean = name.trim().slice(0, 80)
  if (!clean || !activeFilterCount(filters)) return loadSavedViews(storage)
  const existing = loadSavedViews(storage).filter((v) => v.name !== clean)
  const view: SavedView = { id: newId(), name: clean, filters: sanitizeFilters(filters), createdAt: now.toISOString() }
  return writeViews(storage, [view, ...existing].slice(0, MAX_SAVED_VIEWS))
}

export function deleteSavedView(id: string, storage: StorageLike | null = defaultStorage()): SavedView[] {
  return writeViews(storage, loadSavedViews(storage).filter((v) => v.id !== id))
}

/** A default name for «احفظ كعرض»: the chips, joined — «تحتاج رد — PR-580». */
export function suggestViewName(filters: InboxFilters, labels: Labels = {}): string {
  return criteriaOf(filters)
    .map((c) => {
      const label = criterionLabel(c, filters, labels)
      return label.replace(/^(الطلب|الكراسة|القناة|البند|التاريخ): /, '')
    })
    .slice(0, 3)
    .join(' — ')
}
