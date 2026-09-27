import type { ConstructionReplyContact } from '../api/constructionClient'

/**
 * What a supplier's reply means, at a glance. The server classifies; the
 * client only names and colours it. OTHER (and anything unknown) shows nothing.
 */
export type ReplyKindBadge = {
  label: string
  /** Tailwind classes for the chip, matching the ChannelTag look. */
  className: string
}

const BADGES: Record<string, ReplyKindBadge> = {
  AUTO_REPLY: { label: 'رد آلي', className: 'bg-neutral-100 text-neutral-600' },
  ALT_CONTACT: { label: 'يطلب التواصل على رقم آخر', className: 'bg-amber-100 text-amber-800' },
  DECLINED: { label: 'اعتذر', className: 'bg-red-100 text-red-700' },
  INTERESTED: { label: 'مهتم / متوفر', className: 'bg-green-100 text-green-800' },
  QUOTE_FILE: { label: 'أرسل عرض سعر (ملف)', className: 'bg-emerald-600 text-white' },
  PRICE_IN_TEXT: { label: 'ذكر سعراً', className: 'bg-emerald-100 text-emerald-800' },
  QUESTION: { label: 'يسأل', className: 'bg-blue-100 text-blue-700' },
}

export function replyKindBadge(kind?: string | null): ReplyKindBadge | null {
  if (!kind) return null
  return BADGES[String(kind).toUpperCase()] ?? null
}

export function isAutoReply(kind?: string | null): boolean {
  return String(kind || '').toUpperCase() === 'AUTO_REPLY'
}

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

/** Digits only, Arabic-Indic numerals folded to ASCII. */
export function phoneDigits(value: string): string {
  return String(value || '')
    .replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d)
    .replace(/\D/g, '')
}

/** `tel:` target: keeps a leading «+» when the supplier wrote one. */
export function telHref(value: string): string | null {
  const digits = phoneDigits(value)
  if (digits.length < 7) return null
  const plus = /^\s*\+/.test(String(value || ''))
  return `tel:${plus ? '+' : ''}${digits}`
}

/**
 * wa.me needs the international number without «+» or «00». A Saudi mobile
 * written locally (05XXXXXXXX) is the same number as 9665XXXXXXXX; nothing
 * else is guessed — an unrecognised local number gets no WhatsApp link.
 */
export function whatsappHref(value: string): string | null {
  let digits = phoneDigits(value)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  else if (digits.startsWith('0')) return null
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits}`
}

export function mailtoHref(value: string): string | null {
  const email = String(value || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return `mailto:${email}`
}

/** Only well-formed, de-duplicated contacts the API returned — nothing added. */
export function usableReplyContacts(
  contacts?: ConstructionReplyContact[] | null,
): ConstructionReplyContact[] {
  if (!Array.isArray(contacts)) return []
  const seen = new Set<string>()
  const out: ConstructionReplyContact[] = []
  for (const c of contacts) {
    if (!c || typeof c.value !== 'string') continue
    const value = c.value.trim()
    if (!value) continue
    let key: string
    if (c.type === 'phone') {
      if (!telHref(value)) continue
      key = `p:${phoneDigits(value)}`
    } else if (c.type === 'email') {
      if (!mailtoHref(value)) continue
      key = `e:${value.toLowerCase()}`
    } else continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ type: c.type, value })
  }
  return out
}
