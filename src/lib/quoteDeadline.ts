/**
 * The shortest time a supplier gets to price a request.
 *
 * Suppliers were given two days (the bead-mastic request went out on 7 Oct
 * with a deadline of 9 Oct) and answered late or not at all. The rule, shared
 * with the API (CONSTRUCTION_QUOTE_DEADLINE_TOO_SOON): the deadline is at least
 * the 5th Saudi business day after today in Riyadh — Sunday to Thursday, today
 * not counted. Earlier is allowed only for a request the buyer marks urgent,
 * with a short reason that the suppliers see.
 */

export const MIN_QUOTE_BUSINESS_DAYS = 5
export const URGENT_REASON_MIN = 3
export const URGENT_REASON_MAX = 120

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000 // Asia/Riyadh: UTC+3, no daylight saving.
const DAY_MS = 24 * 60 * 60 * 1000

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function parseDay(day: string): number | null {
  const m = String(day ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ts) ? null : ts
}

function dayString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Friday (5) and Saturday (6) are the Saudi weekend. */
function isBusinessDay(ts: number): boolean {
  const dow = new Date(ts).getUTCDay()
  return dow !== 5 && dow !== 6
}

/** Today's date in Riyadh as «YYYY-MM-DD», whatever the device's timezone. */
export function riyadhToday(now: Date = new Date()): string {
  return dayString(now.getTime() + RIYADH_OFFSET_MS)
}

/** The n-th business day (Sun–Thu) after `day`; `day` itself is not counted. */
export function addBusinessDays(day: string, n: number): string {
  let ts = parseDay(day)
  if (ts == null) return day
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    ts += DAY_MS
    if (isBusinessDay(ts)) left -= 1
  }
  return dayString(ts)
}

/** The earliest deadline a request may carry without being marked urgent. */
export function minimumQuoteDeadline(now: Date = new Date()): string {
  return addBusinessDays(riyadhToday(now), MIN_QUOTE_BUSINESS_DAYS)
}

/** «14 أكتوبر» — the date as a supplier or buyer reads it. */
export function arabicDayMonth(day: string): string {
  const ts = parseDay(day)
  if (ts == null) return day
  const d = new Date(ts)
  return `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}`
}

export function cleanUrgentReason(reason: string | null | undefined): string {
  return String(reason ?? '').replace(/\s+/g, ' ').trim()
}

export function urgentReasonValid(reason: string | null | undefined): boolean {
  const r = cleanUrgentReason(reason)
  return r.length >= URGENT_REASON_MIN && r.length <= URGENT_REASON_MAX
}

export type QuoteDeadlineCode = 'PAST' | 'TOO_SOON' | 'URGENT_REASON_REQUIRED'

export type QuoteDeadlineCheck = {
  ok: boolean
  code?: QuoteDeadlineCode
  /** The earliest deadline without «طلب مستعجل». */
  minimum: string
  /** True when the deadline is earlier than `minimum` (only allowed as urgent). */
  early: boolean
  message_ar?: string
}

export function tooSoonMessageAr(minimum: string): string {
  return `أقل مهلة للعروض ${MIN_QUOTE_BUSINESS_DAYS} أيام عمل (حتى ${arabicDayMonth(minimum)}). إذا الطلب مستعجل فعلاً، فعّل «طلب مستعجل» واكتب السبب.`
}

export const PAST_DEADLINE_AR = 'آخر موعد للعروض لا يمكن أن يكون قبل اليوم.'
export const URGENT_REASON_REQUIRED_AR = `اكتب سبب الاستعجال (من ${URGENT_REASON_MIN} إلى ${URGENT_REASON_MAX} حرفًا) — يظهر للموردين.`

/**
 * Whether a new request (or a revision that changes the deadline) may go out
 * with this deadline. A missing or unreadable date is reported as PAST so it
 * can never slip through.
 */
export function checkQuoteDeadline(
  input: { deadline: string | null | undefined; urgent?: boolean; urgentReason?: string | null },
  now: Date = new Date(),
): QuoteDeadlineCheck {
  const minimum = minimumQuoteDeadline(now)
  const today = riyadhToday(now)
  const ts = parseDay(String(input.deadline ?? ''))
  if (ts == null) return { ok: false, code: 'PAST', minimum, early: false, message_ar: 'حدّد آخر موعد لاستلام العروض.' }
  const deadline = dayString(ts)
  if (deadline < today) return { ok: false, code: 'PAST', minimum, early: true, message_ar: PAST_DEADLINE_AR }
  if (deadline >= minimum) return { ok: true, minimum, early: false }
  if (!input.urgent) return { ok: false, code: 'TOO_SOON', minimum, early: true, message_ar: tooSoonMessageAr(minimum) }
  if (!urgentReasonValid(input.urgentReason))
    return { ok: false, code: 'URGENT_REASON_REQUIRED', minimum, early: true, message_ar: URGENT_REASON_REQUIRED_AR }
  return { ok: true, minimum, early: true }
}

/**
 * The urgent fields for the request body: present only when the deadline is
 * early and the buyer marked it urgent with a valid reason; omitted otherwise.
 */
export function quoteUrgencyPayload(
  input: { deadline: string | null | undefined; urgent?: boolean; urgentReason?: string | null },
  now: Date = new Date(),
): { quote_urgent?: true; quote_urgent_reason?: string } {
  const check = checkQuoteDeadline(input, now)
  if (!check.ok || !check.early || !input.urgent) return {}
  return { quote_urgent: true, quote_urgent_reason: cleanUrgentReason(input.urgentReason) }
}
