import { describe, expect, it } from 'vitest'
import type { ConstructionInvitation, ConstructionRfq } from '../api/constructionClient'
import {
  buildTimeline,
  lowestPerLine,
  quoteCoverage,
  quoteDeadline,
  requestProgress,
  requestState,
  supplierState,
  taxLabel,
  leadTimeLabel,
} from './requestFile'

const invite = (over: Partial<ConstructionInvitation>): ConstructionInvitation =>
  ({ id: 'i', supplier_id: 's', delivery_status: 'PENDING', response_status: 'AWAITING_QUOTE', dispatch_attempts: [], ...over }) as ConstructionInvitation

describe('request status', () => {
  it('maps the server status and the award, never the deadline copy', () => {
    expect(requestState({ status: 'SENT', submission_closed_at: null, award: null }).label).toBe('بانتظار العروض')
    expect(requestState({ status: 'SENT', submission_closed_at: '2026-09-19T10:00:00Z', award: null }).label).toBe('مغلق')
    expect(requestState({ status: 'SENT', submission_closed_at: '2026-09-19T10:00:00Z', award: { id: 'a', status: 'APPROVED' } }).label).toBe('تمت الترسية')
    expect(requestState({ status: 'SENT', submission_closed_at: null, award: { id: 'a', status: 'CANCELLED' } }).key).toBe('OPEN')
  })
})

describe('deadline', () => {
  it('is computed from the stored date and time in Riyadh', () => {
    const d = quoteDeadline('2026-09-19', '17:00', Date.parse('2026-09-19T13:00:00Z'))!
    expect(d.passed).toBe(false)
    expect(d.label).toContain('5:00 مساءً')
    expect(quoteDeadline('2026-09-19', '17:00', Date.parse('2026-09-19T14:30:00Z'))!.passed).toBe(true)
    expect(quoteDeadline(null, null)).toBeNull()
  })
})

describe('supplier state and progress', () => {
  const rfq = {
    current_version: { payload: { lines: [{}, {}, {}, {}, {}] } },
    invitations: [
      invite({ id: 'a', response_status: 'QUOTED', dispatch_attempts: [{ channel: 'EMAIL', status: 'SENT', sent_at: 't', failure_code: null }] }),
      invite({ id: 'b', response_status: 'QUOTED', dispatch_attempts: [{ channel: 'WHATSAPP', status: 'SENT', sent_at: 't', failure_code: null }] }),
      invite({ id: 'c', response_status: 'QUOTED', dispatch_attempts: [{ channel: 'EMAIL', status: 'SENT', sent_at: 't', failure_code: null }] }),
      invite({ id: 'd', dispatch_attempts: [{ channel: 'EMAIL', status: 'SENT', sent_at: 't', failure_code: null }] }),
      invite({ id: 'e', dispatch_attempts: [{ channel: 'EMAIL', status: 'DELIVERY_FAILED', sent_at: null, failure_code: 'HTTP_422' }] }),
    ],
  } as unknown as ConstructionRfq

  it('counts only accepted sends as reached, and quotes as replies', () => {
    expect(requestProgress(rfq)).toEqual({ items: 5, reached: 4, quoted: 3, percent: 75 })
  })

  it('names each supplier state; a failed send is never «sent»', () => {
    const [a, , , d, e] = rfq.invitations
    expect(supplierState(e!).key).toBe('FAILED')
    expect(supplierState(d!).key).toBe('SENT')
    expect(supplierState(d!).channel).toBe('البريد')
    expect(supplierState(a!).key).toBe('QUOTED')
    expect(supplierState(a!, 'a').key).toBe('AWARDED')
  })
})

describe('quotes', () => {
  it('reads partial coverage against the lines the supplier was asked for', () => {
    expect(quoteCoverage({ coverage: { requested: 5, priced: 3, complete: false } })!.label).toBe('عرض جزئي — 3 من 5 بنود')
    expect(quoteCoverage({ coverage: { requested: 2, priced: 2, complete: true } })!.label).toBe('يغطي جميع البنود')
  })

  it('states tax and lead time without assuming either', () => {
    expect(taxLabel(true)).toBe('شامل الضريبة')
    expect(taxLabel(false)).toBe('غير شامل الضريبة')
    expect(taxLabel(null)).toBe('الضريبة غير محددة')
    expect(leadTimeLabel({})).toBe('لم يحدد مدة التوريد')
    expect(leadTimeLabel({ lead_time_days: 0 })).toBe('لم يحدد مدة التوريد')
    expect(leadTimeLabel({ lead_time_days: 7 })).toBe('7 أيام')
  })

  it('marks the lowest comparable price only; unpriced or mixed-tax lines get no winner', () => {
    const cell = (supplier_id: string, status: string, unit_price: number | null, prices_include_tax: boolean | null = false) =>
      ({ supplier_id, status, unit_price, line_total: null, quantity: 1, currency: 'SAR', prices_include_tax })
    const matrix = {
      basis: '', requested_line_count: 3, supplier_count: 3, complete_quote_count: 0,
      lines: [
        { id: 'l1', name_ar: '', quantity: 1, uom: '', offers: [cell('A', 'PRICED', 42), cell('B', 'PRICED', 39.5), cell('C', 'NOT_QUOTED', null)] },
        { id: 'l2', name_ar: '', quantity: 1, uom: '', offers: [cell('A', 'PRICED', 10, true), cell('B', 'PRICED', 9, false)] },
        { id: 'l3', name_ar: '', quantity: 1, uom: '', offers: [cell('A', 'PRICED', 5), cell('B', 'QUANTITY_MISMATCH', 1)] },
      ],
    }
    const best = lowestPerLine(matrix)
    expect(best.get('l1')).toBe('B')
    expect(best.get('l2')).toBeNull()
    expect(best.get('l3')).toBeNull()
  })
})

describe('timeline', () => {
  it('dates every event from its own field and never reuses the request creation time', () => {
    const rfq = {
      created_at: '2026-09-19T06:41:00Z',
      audit_timeline: [
        { event_type: 'RFQ_CREATED', created_at: '2026-09-19T06:41:00Z', source: 'DERIVED' },
        { event_type: 'RFQ_DISPATCHED', created_at: '2026-09-19T06:45:00Z', source: 'DERIVED' },
      ],
    } as unknown as ConstructionRfq
    const events = buildTimeline(
      rfq,
      [
        { id: '1', event_type: 'INVITED', created_at: '2026-09-19T06:45:00Z', supplier_id: 's1', details: { channel: 'EMAIL' } },
        { id: '2', event_type: 'QUOTE_RECEIVED', created_at: '2026-09-19T07:12:00Z', supplier_id: 's1' },
        { id: '3', event_type: 'OPENED', created_at: null, supplier_id: 's2' },
      ],
      (id) => (id === 's1' ? 'مؤسسة ABC' : 'شركة XYZ'),
    )
    expect(events.map((e) => e.title)).toEqual([
      'تم إنشاء الطلب',
      'تم إرسال الطلب إلى مؤسسة ABC عبر البريد',
      'تم استلام عرض من مؤسسة ABC',
      'شركة XYZ فتح الطلب',
    ])
    expect(events[2]!.at).toBe('2026-09-19T07:12:00Z')
    expect(events[3]!.at).toBeNull()
    expect(events.filter((e) => e.at === rfq.created_at)).toHaveLength(1)
  })
})
