import { describe, expect, it } from 'vitest'
import type { PublicSupplierInvite } from '../api/constructionClient'
import type { SupplierMessage, TimelineStep } from '../api/supplierPortalClient'
import {
  chatDaySeparatorAr,
  daysAr,
  deadlineChip,
  deliverPending,
  deliveryLabel,
  formatDateTimeAr,
  hoursAr,
  lineRefLabel,
  outboxReducer,
  requestFromLegacyInvite,
  requestStatusChip,
  timelineRows,
  visiblePending,
  withLineRef,
  type OutboxAction,
  type PendingMessage,
} from './supplierPortal'

const NOW = Date.parse('2026-09-27T07:00:00Z') // 10:00 Riyadh

describe('dates', () => {
  it('prints Riyadh time with Arabic months', () => {
    expect(formatDateTimeAr('2026-09-30T20:59:00Z')).toBe('30 سبتمبر 2026، 11:59 م')
    expect(formatDateTimeAr('2026-09-25T06:30:00Z')).toBe('25 سبتمبر 2026، 9:30 ص')
    expect(formatDateTimeAr(null)).toBe('')
  })
  it('names today and yesterday in Riyadh', () => {
    expect(chatDaySeparatorAr('2026-09-27T05:00:00Z', NOW)).toBe('اليوم')
    expect(chatDaySeparatorAr('2026-09-26T13:00:00Z', NOW)).toBe('أمس')
    expect(chatDaySeparatorAr('2026-09-20T13:00:00Z', NOW)).toBe('20 سبتمبر 2026')
  })
  it('counts in Arabic', () => {
    expect([daysAr(1), daysAr(2), daysAr(5), daysAr(11)]).toEqual(['يوم', 'يومين', '5 أيام', '11 يوم'])
    expect([hoursAr(1), hoursAr(2), hoursAr(5)]).toEqual(['ساعة', 'ساعتين', '5 ساعات'])
  })
})

describe('deadlineChip', () => {
  it('is amber within the week and red on the last day, with the closing time', () => {
    expect(deadlineChip('2026-09-29T20:59:00Z', NOW)).toEqual({ text: 'يُغلق بعد يومين', tone: 'amber' })
    expect(deadlineChip('2026-09-27T12:30:00Z', NOW)).toEqual({ text: 'يُغلق بعد 5 ساعات — 3:30 م', tone: 'red' })
  })
  it('says nothing when the deadline is far, past, unknown, or the request is closed', () => {
    expect(deadlineChip('2026-10-30T20:59:00Z', NOW)).toBeNull()
    expect(deadlineChip('2026-09-26T20:59:00Z', NOW)).toBeNull()
    expect(deadlineChip(null, NOW)).toBeNull()
    expect(deadlineChip('2026-09-29T20:59:00Z', NOW, true)).toBeNull()
  })
})

describe('timelineRows — UNKNOWN is never green', () => {
  const kinds = ['SENT', 'OPENED', 'QUOTE_RECEIVED', 'SUBMISSION_CLOSED', 'ENVELOPES_OPENED', 'AWARDED', 'NOT_AWARDED'] as const

  it('grey «غير معروفة بعد» for every UNKNOWN step, whatever its kind', () => {
    const steps: TimelineStep[] = kinds.map((kind) => ({ kind, state: 'UNKNOWN', at: '2026-09-25T06:30:00Z' }))
    const rows = timelineRows(steps)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.tone).toBe('unknown')
      expect(row.detail).toBe('غير معروفة بعد')
      // Even with an `at` on the wire, an UNKNOWN step shows no date.
      expect(row.detail).not.toMatch(/2026/)
    }
  })

  it('a missing step is grey too, not skipped into looking done', () => {
    const rows = timelineRows([{ kind: 'SENT', state: 'DONE', at: '2026-09-25T06:30:00Z' }])
    expect(rows.map((r) => [r.kind, r.tone])).toEqual([
      ['SENT', 'done'],
      ['OPENED', 'unknown'],
      ['QUOTE_RECEIVED', 'unknown'],
      ['SUBMISSION_CLOSED', 'unknown'],
      ['ENVELOPES_OPENED', 'unknown'],
      ['AWARDED', 'unknown'],
    ])
  })

  it('frame 2a: done steps carry their date, the deadline is «موعده …»', () => {
    const rows = timelineRows(
      [
        { kind: 'SENT', state: 'DONE', at: '2026-09-25T06:30:00Z' },
        { kind: 'OPENED', state: 'DONE', at: '2026-09-25T08:04:00Z' },
        { kind: 'QUOTE_RECEIVED', state: 'DONE', at: '2026-09-27T07:12:00Z' },
        { kind: 'SUBMISSION_CLOSED', state: 'UPCOMING', at: null },
        { kind: 'ENVELOPES_OPENED', state: 'UNKNOWN', at: null },
        { kind: 'AWARDED', state: 'UNKNOWN', at: null },
      ],
      '2026-09-30T20:59:00Z',
    )
    expect(rows.map((r) => `${r.label}|${r.detail}|${r.tone}`)).toEqual([
      'أُرسل الطلب|25 سبتمبر 2026، 9:30 ص|done',
      'فُتح الطلب|25 سبتمبر 2026، 11:04 ص|done',
      'استلمنا عرضك|27 سبتمبر 2026، 10:12 ص|done',
      'إغلاق التقديم|موعده 30 سبتمبر 2026، 11:59 م|upcoming',
      'فُتحت الأظرف|غير معروفة بعد|unknown',
      'الترسية|غير معروفة بعد|unknown',
    ])
  })

  it('award is the only green; not awarded is grey, not red', () => {
    const won = timelineRows([{ kind: 'AWARDED', state: 'DONE', at: '2026-09-24T09:30:00Z' }])
    expect(won[won.length - 1]).toMatchObject({ label: 'تمت الترسية عليكم', tone: 'awarded' })
    const lost = timelineRows([
      { kind: 'AWARDED', state: 'UNKNOWN', at: null },
      { kind: 'NOT_AWARDED', state: 'DONE', at: '2026-09-18T08:20:00Z' },
    ])
    expect(lost[lost.length - 1]).toMatchObject({ label: 'لم تتم الترسية عليكم هذه المرة', tone: 'muted' })
    expect(lost.filter((r) => r.kind === 'AWARDED' || r.kind === 'NOT_AWARDED')).toHaveLength(1)
  })

  it('closed before its deadline: grey, naming the deadline', () => {
    const rows = timelineRows(
      [{ kind: 'SUBMISSION_CLOSED', state: 'DONE', at: '2026-09-28T09:00:00Z' }],
      '2026-09-30T20:59:00Z',
    )
    const closed = rows.find((r) => r.kind === 'SUBMISSION_CLOSED')
    expect(closed).toMatchObject({ tone: 'muted', label: 'أُغلق التقديم قبل موعده', detail: 'كان الموعد 30 سبتمبر 2026، 11:59 م' })
  })
})

describe('requestStatusChip', () => {
  const chip = (steps: TimelineStep[]) => requestStatusChip({ status_timeline: steps })
  it('reads the furthest known fact', () => {
    expect(chip([])).toEqual({ text: 'بانتظار عرضك', tone: 'amber' })
    expect(chip([{ kind: 'QUOTE_RECEIVED', state: 'DONE', at: null }]).text).toBe('استلمنا عرضك')
    expect(chip([{ kind: 'AWARDED', state: 'DONE', at: null }]).tone).toBe('mint')
    expect(chip([{ kind: 'NOT_AWARDED', state: 'DONE', at: null }]).tone).toBe('grey')
    // UNKNOWN award is not an award.
    expect(chip([{ kind: 'AWARDED', state: 'UNKNOWN', at: null }]).text).toBe('بانتظار عرضك')
  })
})

describe('the outbox', () => {
  const pending = (id: string): PendingMessage => ({
    client_message_id: id,
    body: 'سؤال',
    files: [],
    state: 'sending',
    progress: null,
    error: null,
    created_at: '2026-09-27T07:00:00Z',
  })

  it('a retry reuses the idempotency key of the failed attempt', async () => {
    let state: PendingMessage[] = []
    const dispatch = (action: OutboxAction) => {
      state = outboxReducer(state, action)
    }
    const message = pending('cm-42')
    dispatch({ type: 'enqueue', message })
    const sentIds: string[] = []
    let attempt = 0
    const deps = {
      read: async () => ({ filename: 'x', content_type: 'x', content: '', size: 0 }),
      dispatch,
      send: async (input: { client_message_id: string }) => {
        sentIds.push(input.client_message_id)
        attempt += 1
        if (attempt === 1) throw new Error('لا يوجد اتصال')
        return { id: 'srv-1', direction: 'OUT', client_message_id: input.client_message_id } as SupplierMessage
      },
    }
    expect(await deliverPending(message, deps)).toBeNull()
    expect(state[0]).toMatchObject({ state: 'failed', error: 'لا يوجد اتصال', client_message_id: 'cm-42' })

    // «أعد المحاولة» retries the entry on screen.
    const delivered = await deliverPending(state[0], deps)
    expect(sentIds).toEqual(['cm-42', 'cm-42'])
    expect(delivered?.client_message_id).toBe('cm-42')
    expect(state).toEqual([])
  })

  it('enqueuing the same id twice keeps one entry', () => {
    const one = outboxReducer([], { type: 'enqueue', message: pending('a') })
    expect(outboxReducer(one, { type: 'enqueue', message: pending('a') })).toHaveLength(1)
  })

  it('a pending message the server already has is not shown twice', () => {
    const server = [{ id: 's', client_message_id: 'a' } as SupplierMessage]
    expect(visiblePending(server, [pending('a'), pending('b')]).map((m) => m.client_message_id)).toEqual(['b'])
  })

  it('only «أُرسلت» and «قُرئت» on our messages', () => {
    expect(deliveryLabel({ direction: 'OUT', read_at: null })).toBe('أُرسلت')
    expect(deliveryLabel({ direction: 'OUT', read_at: '2026-09-27T07:00:00Z' })).toBe('قُرئت')
    expect(deliveryLabel({ direction: 'IN', read_at: null })).toBeNull()
  })
})

describe('«استفسار عن هذا البند»', () => {
  const line = { number: 2, name: 'حديد تسليح 12 مم', quantity: 20, uom: 'طن' }
  it('labels the line as in frame F3 and names it in what is sent', () => {
    expect(lineRefLabel(line)).toBe('البند 2 · حديد تسليح 12 مم — 20 طن')
    expect(withLineRef('المطلوب حديد سابك؟', line)).toBe('بخصوص البند 2 · حديد تسليح 12 مم — 20 طن:\nالمطلوب حديد سابك؟')
    expect(withLineRef('  نص  ', null)).toBe('نص')
  })
})

describe('requestFromLegacyInvite', () => {
  const invite = (extra: Partial<PublicSupplierInvite> = {}) =>
    ({
      invite_id: 'inv-1',
      rfq_id: 'r',
      rfq_version_id: 'v',
      response_status: 'PENDING',
      supplier: { name_ar: 'مصنع' },
      buyer: { company_name: 'شركة الدفع للتجارة والمقاولات' },
      commercial_terms: { quote_deadline: '2026-09-30', quote_deadline_time: '23:59' },
      lines: [{ id: 'l1', quantity: 1, uom: 'حبة' }],
      ...extra,
    }) as PublicSupplierInvite

  it('claims only what the token route knows', () => {
    const row = requestFromLegacyInvite(invite())
    expect(row.buyer_company).toBe('شركة الدفع للتجارة والمقاولات')
    expect(row.deadline).toBe('2026-09-30T23:59:00+03:00')
    const byKind = Object.fromEntries(row.status_timeline.map((s) => [s.kind, s.state]))
    expect(byKind).toMatchObject({ QUOTE_RECEIVED: 'UNKNOWN', SUBMISSION_CLOSED: 'UPCOMING', ENVELOPES_OPENED: 'UNKNOWN', AWARDED: 'UNKNOWN' })
  })

  it('a quote that went in shows as received; a closed request as closed', () => {
    const row = requestFromLegacyInvite(invite({ response_status: 'SUBMITTED', submission_closed_at: '2026-09-28T09:00:00Z' }))
    const byKind = Object.fromEntries(row.status_timeline.map((s) => [s.kind, s]))
    expect(byKind.QUOTE_RECEIVED.state).toBe('DONE')
    expect(byKind.SUBMISSION_CLOSED).toEqual({ kind: 'SUBMISSION_CLOSED', state: 'DONE', at: '2026-09-28T09:00:00Z' })
  })
})
