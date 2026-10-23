/** Checks a line must pass before it is put in front of a real supplier. */

import { checkQuoteDeadline } from './quoteDeadline'

/**
 * The quantity as a positive number, or null.
 *
 * This used to answer 1 for anything it could not read, so «», «0» and
 * «حسب المخطط» all reached a supplier as «الكمية: 1» with nothing on screen to
 * say so. A line without a real quantity is now refused by name.
 */
export function readQty(raw: string): number | null {
  const western = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,،٬\s]/g, '')
    .replace(/٫/g, '.')
  if (!western) return null
  const n = Number(western)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Only ever called on lines `readQty` accepted; see `sendBlockers`. */
export function parseQty(raw: string): number {
  return readQty(raw) ?? 0
}

/** A name a supplier can read: letters survive once control characters are gone. */
export function cleanLineName(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\ufffd]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type WpcDoorSpecInput = {
  name?: string | null
  spec?: string | null
  specCard?: {
    material?: string | null
    thickness?: string | null
    finish?: string | null
    notes?: string | null
  } | null
}

/** A WPC door needs enough identifying detail for a supplier to price it. */
export function wpcDoorSpecificationBlocker(item: WpcDoorSpecInput): string | null {
  const text = [
    item.name,
    item.spec,
    item.specCard?.material,
    item.specCard?.thickness,
    item.specCard?.finish,
    item.specCard?.notes,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ').toLowerCase()
  const isWpcDoor =
    (/\\bwpc\\b|wood[\\s-]*plastic[\\s-]*composite|خشب\\s?بلاستيكي|بلاستيك\\s?خشبي|دبليو\\s?بي\\s?سي/i.test(text)) &&
    (/\\bdoors?\\b|باب|أبواب|ابواب/i.test(text))
  if (!isWpcDoor) return null

  const measurements = text.match(/\\d+(?:[.,]\\d+)?\\s*(?:سم|سنتي(?:متر)?|مم|ملم|cm|mm)/gi) || []
  const thickness =
    Boolean(item.specCard?.thickness?.trim()) ||
    /(?:سماك(?:ة|ه)|سمك|thickness|thk)\\s*[:：-]?\\s*\\d+(?:[.,]\\d+)?\\s*(?:سم|سنتي(?:متر)?|مم|ملم|cm|mm)/i.test(text) ||
    (measurements.length === 1 && /(?:مقاس|size)/i.test(text))
  const color =
    Boolean(item.specCard?.finish?.trim()) ||
    /(?:لون|اللون|color|colour)\\s*[:：-]?\\s*[\\p{L}]+/iu.test(text) ||
    /كريمي|كريمه|أبيض|ابيض|أسود|اسود|بني|رمادي|رصاصي|بيج|أحمر|احمر|أزرق|ازرق|أخضر|اخضر|cream|white|black|brown|gray|grey|beige|red|blue|green/i.test(text)
  const missing = [
    ...(!thickness ? ['السماكة'] : []),
    ...(!color ? ['اللون'] : []),
  ]
  if (!missing.length) return null

  const name = String(item.name ?? '').replace(/\\s+/g, ' ').trim() || 'باب WPC'
  return `«${name.slice(0, 60)}»: حدّد ${missing.join(' و')} قبل الإرسال، من تعديل وصف ومواصفات البند.`
}

export function wpcDoorSpecificationBlockers(items: readonly WpcDoorSpecInput[]): string[] {
  return items.map(wpcDoorSpecificationBlocker).filter((issue): issue is string => Boolean(issue))
}

export const DELIVERY_BEFORE_DEADLINE_CODE = 'CONSTRUCTION_DELIVERY_BEFORE_DEADLINE'
export const DELIVERY_BEFORE_DEADLINE_AR = 'تاريخ التوريد لا يمكن أن يكون قبل آخر موعد لاستلام العروض'

/** «YYYY-MM-DD» from a date input or an ISO timestamp; null when unreadable. */
function dayOf(value: string | null | undefined): string | null {
  const m = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * True when the delivery date falls before the last day for quotes — a
 * supplier cannot deliver what he has not been asked to price yet. The same
 * day is allowed. Missing or unreadable dates are left to the other checks.
 */
export function deliveryBeforeDeadline(deliveryDate: string | null | undefined, quoteDeadline: string | null | undefined): boolean {
  const delivery = dayOf(deliveryDate)
  const deadline = dayOf(quoteDeadline)
  if (!delivery || !deadline) return false
  return delivery < deadline
}

export type RequestType = 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL'

export const REQUEST_TYPE_REQUIRED_AR = 'اختر نوع الطلب: توريد فقط أو توريد وتركيب'
export const DELIVERY_CITY_REQUIRED_AR = 'اكتب مدينة التسليم'

/**
 * «توريد وتركيب» as a suggestion, only when every line says so. Anything else
 * is left for the buyer to choose: suppliers kept quoting on the wrong basis
 * when the request silently went out as supply only.
 */
export function suggestedRequestType(lineTexts: Array<string | null | undefined>): RequestType | '' {
  const texts = lineTexts.map((t) => String(t ?? '').trim()).filter(Boolean)
  if (!texts.length) return ''
  return texts.every((t) => /توريد\s*و\s*تركيب/.test(t)) ? 'SUPPLY_AND_INSTALL' : ''
}

/**
 * The request-level terms every supplier asked about before pricing: the
 * scope, where it goes, and enough time to answer. One message per problem,
 * in the order the buyer meets the fields.
 */
export function requestTermsBlockers(
  input: {
    requestType: RequestType | '' | null | undefined
    city: string | null | undefined
    quoteDeadline: string | null | undefined
    urgent?: boolean
    urgentReason?: string | null
  },
  now: Date = new Date(),
): string[] {
  const out: string[] = []
  if (!String(input.city ?? '').trim()) out.push(DELIVERY_CITY_REQUIRED_AR)
  if (input.requestType !== 'SUPPLY_ONLY' && input.requestType !== 'SUPPLY_AND_INSTALL') out.push(REQUEST_TYPE_REQUIRED_AR)
  const check = checkQuoteDeadline({ deadline: input.quoteDeadline, urgent: input.urgent, urgentReason: input.urgentReason }, now)
  if (!check.ok && check.message_ar) out.push(check.message_ar)
  return out
}
