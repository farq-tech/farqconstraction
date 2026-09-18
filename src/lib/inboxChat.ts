/**
 * Pure helpers for the two-pane correspondence screen («المراسلات»).
 *
 * Everything here works on what the inbox API really returns and nothing
 * else: a thread row carries `last_received_at`, `unread_count`, `preview`,
 * `subject` and `request_context.reference`. There is no separate
 * "last activity" field, so ordering and the row clock both read
 * `last_received_at` — and a row without it sorts last instead of being
 * given an invented time.
 */
import {
  inboxThreadSupplierLabel,
  isOutboundInviteSnapshot,
  type ConstructionInboxThread,
} from '../api/constructionClient'
import { splitQuotedReply } from './quotedEmail'

const DAY_MS = 86400000

function parseTime(value?: string | null): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  return Number.isNaN(ts) ? null : ts
}

function startOfDay(value: number): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Newest activity first, always. Undated rows go last, and rows that tie keep
 * the order the server sent (the sort is stable), so a refresh never shuffles
 * conversations that did not change.
 */
export function sortThreadsNewestFirst<T extends { last_received_at?: string | null }>(
  threads: readonly T[],
): T[] {
  return threads
    .map((thread, index) => ({ thread, index, ts: parseTime(thread.last_received_at) }))
    .sort((a, b) => {
      if (a.ts == null && b.ts == null) return a.index - b.index
      if (a.ts == null) return 1
      if (b.ts == null) return -1
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.index - b.index
    })
    .map((entry) => entry.thread)
}

/**
 * Folds the spelling differences an Arabic reader does not type on purpose:
 * diacritics, tatweel, hamza seats on alef, ى/ي and ة/ه — so «الجزيره» finds
 * «الجزيرة». Latin text is lower-cased.
 */
export function normalizeForSearch(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‌-‏‪-‮⁦-⁩]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

const collapse = (value: string | null | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim()

/**
 * The one-line snippet under the supplier name.
 *
 * Quoted history is cut with the same splitter the chat uses, so a reply that
 * drags our whole RFQ back never shows our own words as the supplier's latest
 * message. Falls back to the subject; returns '' when the row has neither —
 * the caller says «بدون نص» rather than this function inventing content.
 */
export function threadSnippet(thread: ConstructionInboxThread): string {
  if (thread.locked) return 'مغلق (ظرف مختوم)'
  if (isOutboundInviteSnapshot(thread)) return 'دعوة طلب عرض مرسلة (صادر)'
  const preview = collapse(splitQuotedReply(thread.preview).visible)
  if (preview) return preview
  return collapse(thread.subject)
}

/** Client-side only: supplier name, snippet, subject and RFQ reference. */
export function filterThreads(
  threads: readonly ConstructionInboxThread[],
  query: string,
): ConstructionInboxThread[] {
  const needle = normalizeForSearch(query)
  if (!needle) return [...threads]
  return threads.filter((thread) => {
    // A sealed thread is matched by who it is, never by text we are hiding.
    const haystack = thread.locked
      ? [inboxThreadSupplierLabel(thread), thread.request_context?.reference]
      : [
          inboxThreadSupplierLabel(thread),
          threadSnippet(thread),
          thread.subject,
          thread.request_context?.reference,
        ]
    return haystack.some((part) => normalizeForSearch(part).includes(needle))
  })
}

/** Legal-form words that would give every supplier the same first letter. */
const GENERIC_NAME_WORDS = new Set(
  [
    'شركة', 'شركه', 'مؤسسة', 'مؤسسه', 'مصنع', 'مصانع', 'مجموعة', 'مجموعه', 'مكتب', 'محل', 'محلات',
    'معرض', 'مورد', 'company', 'co', 'co.', 'est', 'est.', 'the', 'factory', 'group',
  ].map((word) => normalizeForSearch(word)),
)

/**
 * Avatar initials: first letter of the first two distinctive words. Arabic
 * letters are joined with ZWNJ so two initials do not fuse into one ligature.
 */
export function supplierInitials(name: string | null | undefined): string {
  const words = collapse(name)
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const distinctive = words.filter((word) => !GENERIC_NAME_WORDS.has(normalizeForSearch(word)))
  const picked = (distinctive.length ? distinctive : words).slice(0, 2)
  const letters = picked
    .map((word) => {
      // «الجزيرة» → ج: the article is not the supplier's initial.
      const bare = word.length > 3 && word.startsWith('ال') ? word.slice(2) : word
      return Array.from(bare)[0] || ''
    })
    .filter(Boolean)
  if (!letters.length) return '؟'
  return letters.join('‌').toUpperCase()
}

/** Stable palette slot for an avatar, so a supplier keeps one colour. */
export function avatarTone(seed: string | null | undefined, slots: number): number {
  const text = String(seed ?? '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return slots > 0 ? hash % slots : 0
}

/** Day separator inside a chat: «اليوم», «أمس», otherwise the full date. */
export function chatDayLabel(value: string | null | undefined, now: number = Date.now()): string {
  const ts = parseTime(value)
  if (ts == null) return ''
  const today = startOfDay(now)
  const day = startOfDay(ts)
  if (day === today) return 'اليوم'
  if (day === startOfDay(today - DAY_MS / 2)) return 'أمس'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function chatTimeLabel(value: string | null | undefined): string {
  const ts = parseTime(value)
  if (ts == null) return ''
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * The clock on a conversation row, WhatsApp-style: the time today, «أمس»,
 * the weekday within the last week, then a short date. Empty when the row has
 * no usable time — never "now".
 */
export function listTimeLabel(value: string | null | undefined, now: number = Date.now()): string {
  const ts = parseTime(value)
  if (ts == null) return ''
  const today = startOfDay(now)
  const day = startOfDay(ts)
  if (day === today) return chatTimeLabel(value)
  if (day === startOfDay(today - DAY_MS / 2)) return 'أمس'
  if (day < today && today - day < 7 * DAY_MS) {
    return new Date(ts).toLocaleDateString('en-GB', { weekday: 'long' })
  }
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

/** File-type tag for an attachment card, from the fields the API really has. */
export function attachmentKind(file: { filename?: string; content_type?: string }): string {
  const name = String(file.filename || '')
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ''
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext.toUpperCase()
  const type = String(file.content_type || '').toLowerCase()
  if (type.includes('pdf')) return 'PDF'
  if (type.startsWith('image/')) return type.slice(6).toUpperCase() || 'IMG'
  if (type.includes('csv')) return 'CSV'
  if (type.startsWith('text/')) return 'TXT'
  return ''
}
