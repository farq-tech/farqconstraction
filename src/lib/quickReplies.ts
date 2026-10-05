/**
 * «ردود جاهزة» in the chat composer. A reply only fills the box — the buyer
 * still reads it, edits it and presses «إرسال»; nothing is sent from here.
 * The buyer's own replies live in this browser (localStorage), nowhere else.
 */
export type QuickReply = { id: string; label: string; text: string; custom?: boolean }

/** Where the buyer still has to type something, e.g. the new date. */
export const QUICK_REPLY_BLANK = '…'

export const DEFAULT_QUICK_REPLIES: readonly QuickReply[] = Object.freeze([
  {
    id: 'send-via-link',
    label: 'أرسل عرضك عبر الرابط',
    text: 'حياكم الله، نرجو إرسال عرضكم عبر رابط الطلب المرسل لكم — فيه كل البنود والكميات، ويصلنا العرض مرتباً ومحفوظاً مع الطلب.',
  },
  {
    id: 'need-spec',
    label: 'نحتاج المواصفة الفنية',
    text: 'شكراً لكم. نحتاج المواصفة الفنية (Data Sheet) للمنتج المعروض، مع بلد المنشأ، لو تكرمتم.',
  },
  {
    id: 'deadline-extended',
    label: `تم تمديد الموعد إلى ${QUICK_REPLY_BLANK}`,
    text: `تم تمديد موعد استلام العروض إلى ${QUICK_REPLY_BLANK}. نقدر نستقبل عرضكم على كل البنود.`,
  },
])

export const QUICK_REPLIES_KEY = 'farq.inbox.quickReplies.v1'
const MAX_CUSTOM = 12

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadCustomReplies(storage: StorageLike | null = defaultStorage()): QuickReply[] {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(QUICK_REPLIES_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r) => r && typeof r.id === 'string' && typeof r.text === 'string' && r.text.trim())
      .slice(0, MAX_CUSTOM)
      .map((r) => ({ id: r.id, label: String(r.label || r.text).slice(0, 40), text: String(r.text).slice(0, 2000), custom: true }))
  } catch {
    return []
  }
}

function write(storage: StorageLike | null, replies: QuickReply[]): QuickReply[] {
  try {
    storage?.setItem(QUICK_REPLIES_KEY, JSON.stringify(replies.map(({ id, label, text }) => ({ id, label, text }))))
  } catch {
    /* quota / private mode: kept for this page only */
  }
  return replies
}

/** A short label from the text: its first words, «…» when cut. */
export function quickReplyLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 28 ? `${flat.slice(0, 28).trim()}…` : flat
}

export function addCustomReply(text: string, storage: StorageLike | null = defaultStorage()): QuickReply[] {
  const clean = text.trim().slice(0, 2000)
  const existing = loadCustomReplies(storage)
  if (!clean || existing.some((r) => r.text === clean)) return existing
  const reply: QuickReply = { id: `c${Date.now().toString(36)}`, label: quickReplyLabel(clean), text: clean, custom: true }
  return write(storage, [...existing, reply].slice(-MAX_CUSTOM))
}

export function removeCustomReply(id: string, storage: StorageLike | null = defaultStorage()): QuickReply[] {
  return write(storage, loadCustomReplies(storage).filter((r) => r.id !== id))
}

/** Puts a reply in the box: replaces an empty draft, otherwise adds a line. */
export function insertQuickReply(current: string, reply: QuickReply): string {
  return current.trim() ? `${current.replace(/\s+$/, '')}\n${reply.text}` : reply.text
}
