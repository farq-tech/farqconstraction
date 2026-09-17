import { describe, expect, it } from 'vitest'
import {
  groupNotificationsByDay,
  notificationTimestamp,
  relativeTimeAr,
  sortNotificationsNewestFirst,
} from './notificationOrder'

type Msg = { id: string; received_at?: string; [k: string]: unknown }

const ids = (list: Msg[]) => list.map((m) => m.id)

/** Local-time constructor so day-boundary tests hold in any timezone. */
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const iso = (ts: number) => new Date(ts).toISOString()

describe('notificationTimestamp', () => {
  it('prefers received_at, then falls back to sent_at, created_at, updated_at', () => {
    expect(
      notificationTimestamp({ received_at: '2026-09-17T10:00:00Z', created_at: '2020-01-01T00:00:00Z' }),
    ).toBe(Date.parse('2026-09-17T10:00:00Z'))
    expect(notificationTimestamp({ sent_at: '2026-09-16T10:00:00Z', created_at: '2020-01-01T00:00:00Z' })).toBe(
      Date.parse('2026-09-16T10:00:00Z'),
    )
    expect(notificationTimestamp({ created_at: '2026-09-15T10:00:00Z' })).toBe(Date.parse('2026-09-15T10:00:00Z'))
    expect(notificationTimestamp({ updated_at: '2026-09-14T10:00:00Z' })).toBe(Date.parse('2026-09-14T10:00:00Z'))
  })

  it('skips an unparseable preferred field instead of giving up', () => {
    expect(notificationTimestamp({ received_at: 'not a date', created_at: '2026-09-15T10:00:00Z' })).toBe(
      Date.parse('2026-09-15T10:00:00Z'),
    )
  })

  it('returns null for missing, empty, junk or non-object input', () => {
    expect(notificationTimestamp({})).toBeNull()
    expect(notificationTimestamp({ received_at: '' })).toBeNull()
    expect(notificationTimestamp({ received_at: '   ' })).toBeNull()
    expect(notificationTimestamp({ received_at: 'أمس' })).toBeNull()
    expect(notificationTimestamp({ received_at: null })).toBeNull()
    expect(notificationTimestamp({ received_at: Number.NaN })).toBeNull()
    expect(notificationTimestamp(null)).toBeNull()
    expect(notificationTimestamp(undefined)).toBeNull()
    expect(notificationTimestamp('2026-09-17')).toBeNull()
  })
})

describe('sortNotificationsNewestFirst', () => {
  it('orders by timestamp descending whatever order the server sent', () => {
    const input: Msg[] = [
      { id: 'old', received_at: '2026-09-01T08:00:00Z' },
      { id: 'newest', received_at: '2026-09-17T12:00:00Z' },
      { id: 'mid', received_at: '2026-09-10T08:00:00Z' },
    ]
    expect(ids(sortNotificationsNewestFirst(input))).toEqual(['newest', 'mid', 'old'])
  })

  it('compares instants, not strings (timezone offsets)', () => {
    const input: Msg[] = [
      // 09:00+03:00 is 06:00Z — earlier than 07:00Z although the string sorts later.
      { id: 'riyadh-0900', received_at: '2026-09-17T09:00:00+03:00' },
      { id: 'utc-0700', received_at: '2026-09-17T07:00:00Z' },
    ]
    expect(ids(sortNotificationsNewestFirst(input))).toEqual(['utc-0700', 'riyadh-0900'])
  })

  it('puts undated and unparseable messages last, never first, keeping their relative order', () => {
    const input: Msg[] = [
      { id: 'no-date-1' },
      { id: 'junk', received_at: 'garbage' },
      { id: 'dated-old', received_at: '2020-01-01T00:00:00Z' },
      { id: 'no-date-2', received_at: '' },
      { id: 'dated-new', received_at: '2026-09-17T00:00:00Z' },
    ]
    expect(ids(sortNotificationsNewestFirst(input))).toEqual([
      'dated-new',
      'dated-old',
      'no-date-1',
      'junk',
      'no-date-2',
    ])
  })

  it('is stable for equal timestamps', () => {
    const same = '2026-09-17T10:00:00Z'
    const input: Msg[] = [
      { id: 'a', received_at: same },
      { id: 'b', received_at: same },
      { id: 'c', received_at: same },
      { id: 'd', received_at: same },
    ]
    expect(ids(sortNotificationsNewestFirst(input))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not mutate its input and returns a new array', () => {
    const input: Msg[] = [
      { id: 'old', received_at: '2026-09-01T08:00:00Z' },
      { id: 'new', received_at: '2026-09-17T08:00:00Z' },
    ]
    const frozen = Object.freeze([...input]) as readonly Msg[]
    const out = sortNotificationsNewestFirst(frozen)
    expect(out).not.toBe(frozen)
    expect(ids([...frozen])).toEqual(['old', 'new'])
    expect(out[0]).toBe(input[1]) // same object identity — items are not cloned
  })

  it('keeps the order after a mark-as-read style update (order cannot drift)', () => {
    const input: Msg[] = [
      { id: 'new', received_at: '2026-09-17T08:00:00Z', unread: true },
      { id: 'old', received_at: '2026-09-01T08:00:00Z', unread: true },
    ]
    const updated = input.map((m) => (m.id === 'old' ? { ...m, unread: false } : m)).reverse()
    expect(ids(sortNotificationsNewestFirst(updated))).toEqual(['new', 'old'])
  })

  it('never crashes on null, undefined, or junk rows', () => {
    expect(sortNotificationsNewestFirst(null)).toEqual([])
    expect(sortNotificationsNewestFirst(undefined)).toEqual([])
    expect(sortNotificationsNewestFirst([])).toEqual([])
    const junk = [null, { id: 'x', received_at: '2026-09-17T08:00:00Z' }, undefined] as unknown as Msg[]
    const out = sortNotificationsNewestFirst(junk)
    expect(out[0]).toEqual({ id: 'x', received_at: '2026-09-17T08:00:00Z' })
    expect(out).toHaveLength(3)
  })
})

describe('groupNotificationsByDay', () => {
  const now = local(2026, 9, 17, 15, 0)

  it('groups into today, yesterday, older dates, then undated — newest first inside each', () => {
    const input: Msg[] = [
      { id: 'undated' },
      { id: 'last-week', received_at: iso(local(2026, 9, 10, 9, 0)) },
      { id: 'today-early', received_at: iso(local(2026, 9, 17, 0, 1)) },
      { id: 'yesterday-late', received_at: iso(local(2026, 9, 16, 23, 59)) },
      { id: 'today-late', received_at: iso(local(2026, 9, 17, 14, 0)) },
      { id: 'last-week-2', received_at: iso(local(2026, 9, 10, 18, 0)) },
    ]
    const groups = groupNotificationsByDay(input, now)
    expect(groups.map((g) => g.kind)).toEqual(['today', 'yesterday', 'date', 'undated'])
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', '2026-09-10', 'undated'])
    expect(groups.map((g) => ids(g.items))).toEqual([
      ['today-late', 'today-early'],
      ['yesterday-late'],
      ['last-week-2', 'last-week'],
      ['undated'],
    ])
    expect(groups[2].dayStart).toBe(local(2026, 9, 10))
    expect(groups[3].dayStart).toBeNull()
  })

  it('treats the midnight boundary by local calendar day, not by 24 hours', () => {
    const justAfterMidnight = local(2026, 9, 17, 0, 5)
    const input: Msg[] = [{ id: 'ten-min-ago', received_at: iso(local(2026, 9, 16, 23, 55)) }]
    expect(groupNotificationsByDay(input, justAfterMidnight)[0].kind).toBe('yesterday')
  })

  it('gives a future-dated message its own dated group rather than calling it today', () => {
    const input: Msg[] = [{ id: 'future', received_at: iso(local(2026, 9, 19, 9, 0)) }]
    const [group] = groupNotificationsByDay(input, now)
    expect(group.kind).toBe('date')
    expect(group.key).toBe('2026-09-19')
  })

  it('returns no groups for an empty or missing list', () => {
    expect(groupNotificationsByDay([], now)).toEqual([])
    expect(groupNotificationsByDay(null, now)).toEqual([])
  })
})

describe('relativeTimeAr', () => {
  const now = Date.parse('2026-09-17T12:00:00Z')
  const ago = (ms: number) => relativeTimeAr(now - ms, now)
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('says الآن under a minute', () => {
    expect(ago(0)).toBe('الآن')
    expect(ago(59_999)).toBe('الآن')
  })

  it('uses the correct Arabic forms for minutes', () => {
    expect(ago(1 * MIN)).toBe('قبل دقيقة')
    expect(ago(2 * MIN)).toBe('قبل دقيقتين')
    expect(ago(3 * MIN)).toBe('قبل 3 دقائق')
    expect(ago(5 * MIN)).toBe('قبل 5 دقائق')
    expect(ago(10 * MIN)).toBe('قبل 10 دقائق')
    expect(ago(11 * MIN)).toBe('قبل 11 دقيقة')
    expect(ago(59 * MIN + 59_000)).toBe('قبل 59 دقيقة')
  })

  it('uses the correct Arabic forms for hours', () => {
    expect(ago(1 * HOUR)).toBe('قبل ساعة')
    expect(ago(2 * HOUR)).toBe('قبل ساعتين')
    expect(ago(3 * HOUR)).toBe('قبل 3 ساعات')
    expect(ago(10 * HOUR)).toBe('قبل 10 ساعات')
    expect(ago(11 * HOUR)).toBe('قبل 11 ساعة')
    expect(ago(23 * HOUR + 59 * MIN)).toBe('قبل 23 ساعة')
  })

  it('uses the correct Arabic forms for days, up to a week', () => {
    expect(ago(1 * DAY)).toBe('قبل يوم')
    expect(ago(2 * DAY)).toBe('قبل يومين')
    expect(ago(3 * DAY)).toBe('قبل 3 أيام')
    expect(ago(6 * DAY + 23 * HOUR)).toBe('قبل 6 أيام')
  })

  it('returns null from a week on, so the caller shows the real date', () => {
    expect(ago(7 * DAY)).toBeNull()
    expect(ago(400 * DAY)).toBeNull()
  })

  it('tolerates small clock skew but never calls a future message past or now', () => {
    expect(relativeTimeAr(now + 30_000, now)).toBe('الآن')
    expect(relativeTimeAr(now + 5 * MIN, now)).toBeNull()
  })

  it('returns null for a missing or invalid timestamp', () => {
    expect(relativeTimeAr(null, now)).toBeNull()
    expect(relativeTimeAr(undefined, now)).toBeNull()
    expect(relativeTimeAr(Number.NaN, now)).toBeNull()
    expect(relativeTimeAr(now, Number.NaN)).toBeNull()
  })
})
