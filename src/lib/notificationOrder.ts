/**
 * Ordering, day grouping and relative time for the notifications drawer.
 *
 * Everything here is pure: no wall clock is read (callers pass `now`), no input
 * is mutated, and a value that cannot be parsed is reported as "unknown" rather
 * than being replaced by a guess. A notification with no readable date goes
 * LAST — it must never float above real, dated news.
 */

/**
 * Timestamp fields, most meaningful first. `received_at` is the only one the
 * inbox messages API declares today (see ConstructionInboxMessage); the others
 * are read defensively so that a server that starts sending them, or omits
 * `received_at` on some rows, still orders correctly instead of falling to the end.
 */
export const NOTIFICATION_TIME_FIELDS = ['received_at', 'sent_at', 'created_at', 'updated_at'] as const

/** Epoch milliseconds of the first parseable timestamp field, or null if none. */
export function notificationTimestamp(message: unknown): number | null {
  if (!message || typeof message !== 'object') return null
  const record = message as Record<string, unknown>
  for (const field of NOTIFICATION_TIME_FIELDS) {
    const raw = record[field]
    let ts = Number.NaN
    if (typeof raw === 'string' && raw.trim()) ts = Date.parse(raw)
    else if (typeof raw === 'number') ts = raw
    else if (raw instanceof Date) ts = raw.getTime()
    if (Number.isFinite(ts)) return ts
  }
  return null
}

/**
 * Newest first. Stable (ties and undated rows keep the server's order), never
 * mutates `messages`, never throws on junk rows. Undated rows go last.
 */
export function sortNotificationsNewestFirst<T>(messages: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(messages)) return []
  return messages
    .map((message, index) => ({ message, index, ts: notificationTimestamp(message) }))
    .sort((a, b) => {
      if (a.ts === null && b.ts === null) return a.index - b.index
      if (a.ts === null) return 1
      if (b.ts === null) return -1
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.index - b.index
    })
    .map((entry) => entry.message)
}

export type NotificationDayKind = 'today' | 'yesterday' | 'date' | 'undated'

export type NotificationDayGroup<T> = {
  /** Stable React key: `today`, `yesterday`, `undated`, or the local `YYYY-MM-DD`. */
  key: string
  kind: NotificationDayKind
  /** Local midnight of the group's day; null for the undated group. */
  dayStart: number | null
  items: T[]
}

function localDayStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function localDayKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Sorts newest-first, then cuts the list into local-calendar-day groups:
 * today, yesterday, one group per older (or future-dated) day, and a final
 * undated group. Because it sorts internally, the grouped order cannot drift
 * from the rule no matter what order the caller's state is in.
 */
export function groupNotificationsByDay<T>(
  messages: readonly T[] | null | undefined,
  now: number,
): NotificationDayGroup<T>[] {
  const todayStart = localDayStart(now)
  const yesterdayStart = localDayStart(todayStart - 1)
  const groups: NotificationDayGroup<T>[] = []
  for (const message of sortNotificationsNewestFirst(messages)) {
    const ts = notificationTimestamp(message)
    let key: string
    let kind: NotificationDayKind
    let dayStart: number | null
    if (ts === null) {
      key = 'undated'
      kind = 'undated'
      dayStart = null
    } else {
      dayStart = localDayStart(ts)
      if (dayStart === todayStart) {
        key = 'today'
        kind = 'today'
      } else if (dayStart === yesterdayStart) {
        key = 'yesterday'
        kind = 'yesterday'
      } else {
        key = localDayKey(ts)
        kind = 'date'
      }
    }
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(message)
    else groups.push({ key, kind, dayStart, items: [message] })
  }
  return groups
}

type ArabicUnit = { one: string; two: string; few: string; many: string }

const MINUTE: ArabicUnit = { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' }
const HOUR: ArabicUnit = { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' }
const DAY: ArabicUnit = { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا' }

/** Arabic counted noun: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular accusative. */
function countedAr(n: number, unit: ArabicUnit): string {
  if (n === 1) return unit.one
  if (n === 2) return unit.two
  if (n >= 3 && n <= 10) return `${n} ${unit.few}`
  return `${n} ${unit.many}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * «الآن», «قبل 5 دقائق», «قبل ساعتين», «قبل 3 أيام».
 *
 * Returns null when no honest relative phrase exists — the timestamp is
 * missing/unparseable, it is a week or more old (show the date instead), or it
 * is more than a minute in the FUTURE (a clock disagreement; saying «الآن» or
 * "قبل" would be a lie). The caller then shows the exact date.
 */
export function relativeTimeAr(ts: number | null | undefined, now: number): string | null {
  if (ts === null || ts === undefined || !Number.isFinite(ts) || !Number.isFinite(now)) return null
  const diff = now - ts
  if (diff < -MINUTE_MS) return null
  if (diff < MINUTE_MS) return 'الآن'
  if (diff < HOUR_MS) return `قبل ${countedAr(Math.floor(diff / MINUTE_MS), MINUTE)}`
  if (diff < DAY_MS) return `قبل ${countedAr(Math.floor(diff / HOUR_MS), HOUR)}`
  if (diff < 7 * DAY_MS) return `قبل ${countedAr(Math.floor(diff / DAY_MS), DAY)}`
  return null
}
