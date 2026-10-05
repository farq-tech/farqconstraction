import { describe, expect, it } from 'vitest'
import type { ConstructionComparison, ConstructionRfq, ConstructionSupplierOutcomeEvent } from '../api/constructionClient'
import { SEALED_PRICE_LABEL, buildSupplierPanel, formatAmount } from './supplierPanel'
import { DEFAULT_QUICK_REPLIES, addCustomReply, insertQuickReply, loadCustomReplies, removeCustomReply } from './quickReplies'

const rfq = {
  id: 'rfq-1',
  status: 'SENT',
  created_at: '2026-09-20T08:00:00Z',
  submission_closed_at: null,
  envelopes_opened_at: null,
  supplier_count: 2,
  response_count: 1,
  invitations: [
    { id: 'inv-1', supplier_id: 'SUP-A', delivery_status: 'SENT', response_status: 'QUOTED', supplier: {} },
    { id: 'inv-2', supplier_id: 'SUP-B', delivery_status: 'SENT', response_status: 'INVITED', supplier: {} },
  ],
  current_version: {
    payload: {
      lines: [
        { id: 'L1', name_ar: 'بلوك مقاس 15 سم', quantity: 3000, uom: 'حبة' },
        { id: 'L2', name_ar: 'حديد تسليح 12 مم', quantity: 20, uom: 'طن' },
      ],
    },
  },
} as unknown as ConstructionRfq

const comparison = {
  rfq,
  supplier_responses: [
    {
      supplier: { id: 'SUP-A' },
      offer: { inviteId: 'inv-1', quoteVersion: 2, submittedAt: '2026-09-27T07:10:00Z', totals: { total: 12180 }, currency: 'SAR' },
    },
  ],
  awaiting_supplier_ids: ['SUP-B'],
  quote_matrix: {
    basis: 'x',
    requested_line_count: 2,
    supplier_count: 1,
    complete_quote_count: 0,
    lines: [
      { id: 'L1', name_ar: 'بلوك مقاس 15 سم', quantity: 3000, uom: 'حبة', offers: [{ supplier_id: 'SUP-A', status: 'PRICED', unit_price: 3.2, line_total: 9600, quantity: 3000, currency: 'SAR', prices_include_tax: true }] },
      { id: 'L2', name_ar: 'حديد تسليح 12 مم', quantity: 20, uom: 'طن', offers: [{ supplier_id: 'SUP-A', status: 'UNAVAILABLE', unit_price: null, line_total: null, quantity: null, currency: 'SAR', prices_include_tax: null }] },
    ],
  },
} as unknown as ConstructionComparison

const outcomes: ConstructionSupplierOutcomeEvent[] = [
  { id: 'd1', event_type: 'INVITED', created_at: '2026-09-20T09:00:00Z', supplier_id: 'SUP-A', details: { channel: 'EMAIL' } },
  { id: 'o1', event_type: 'OPENED', created_at: '2026-09-21T09:00:00Z', supplier_id: 'SUP-A' },
  { id: 'q1', event_type: 'QUOTE_RECEIVED', created_at: '2026-09-25T09:00:00Z', supplier_id: 'SUP-A' },
  { id: 'q2', event_type: 'QUOTE_RECEIVED', created_at: '2026-09-27T07:10:00Z', supplier_id: 'SUP-A' },
  { id: 'x1', event_type: 'LINE_DECLINED', created_at: '2026-09-27T07:10:00Z', supplier_id: 'SUP-A', details: { line_id: 'L2' } },
  { id: 'q3', event_type: 'QUOTE_RECEIVED', created_at: '2026-09-26T09:00:00Z', supplier_id: 'SUP-B' },
]

describe('buildSupplierPanel', () => {
  it('shows prices, per-line status, versions and the timeline for an open request', () => {
    const model = buildSupplierPanel({ inviteId: 'inv-1', locked: false, comparison, outcomes })
    expect(model.sealed).toBe(false)
    expect(model.quoteStatus).toBe('submitted')
    expect(model.quoteVersion).toBe(2)
    expect(model.total).toBe(12180)
    expect(model.lines.map((l) => [l.name, l.statusLabel, l.unitPrice])).toEqual([
      ['بلوك مقاس 15 سم', 'سعّر', 3.2],
      ['حديد تسليح 12 مم', 'اعتذر', null],
    ])
    expect(model.quoteEvents.map((q) => [q.version, q.total, q.latest])).toEqual([
      [1, null, false],
      [2, 12180, true],
    ])
    expect(model.timeline.map((s) => s.title)).toEqual([
      'أُرسلت الدعوة بالإيميل',
      'فتح رابط الطلب',
      'استلمنا عرضه',
      'استلمنا عرضه — النسخة 2',
      'إغلاق التقديم',
    ])
  })

  it('sealed: never carries a price or total, even when a comparison is passed', () => {
    const model = buildSupplierPanel({ inviteId: 'inv-1', locked: true, comparison, rfq, outcomes })
    expect(model.sealed).toBe(true)
    expect(model.total).toBeNull()
    expect(model.lines.every((l) => l.unitPrice == null)).toBe(true)
    expect(model.quoteEvents.every((q) => q.total == null)).toBe(true)
    expect(model.lines.map((l) => l.statusLabel)).toEqual(['مختوم', 'اعتذر'])
    expect(model.timeline.at(-1)).toMatchObject({ title: 'فتح الأظرف', state: 'unknown' })
    expect(SEALED_PRICE_LABEL).toBe('مختوم حتى فتح الأظرف')
  })

  it('a supplier with no quote: not submitted, no cards, events of others ignored', () => {
    const model = buildSupplierPanel({ inviteId: 'inv-2', locked: false, comparison, outcomes: outcomes.filter((e) => e.supplier_id !== 'SUP-B') })
    expect(model.quoteStatus).toBe('not_submitted')
    expect(model.quoteEvents).toEqual([])
    // His scope is not in the matrix yet: no line is claimed «لم يسعّر».
    expect(model.lines).toEqual([])
  })

  it('degrades to what arrived: no data at all is «unknown», not «not submitted»', () => {
    const model = buildSupplierPanel({ inviteId: 'inv-9', locked: false })
    expect(model.quoteStatus).toBe('unknown')
    expect(model.lines).toEqual([])
    expect(model.timeline).toEqual([])
  })

  it('formats amounts in riyals', () => {
    expect(formatAmount(12180, 'SAR')).toBe('12,180 ريال')
    expect(formatAmount(null)).toBe('—')
  })
})

describe('quick replies', () => {
  const storage = () => {
    const map = new Map<string, string>()
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
  }

  it('ships the three approved replies', () => {
    expect(DEFAULT_QUICK_REPLIES.map((r) => r.label)).toEqual(['أرسل عرضك عبر الرابط', 'نحتاج المواصفة الفنية', 'تم تمديد الموعد إلى …'])
  })

  it('fills an empty box and appends to a draft', () => {
    const reply = DEFAULT_QUICK_REPLIES[1]!
    expect(insertQuickReply('', reply)).toBe(reply.text)
    expect(insertQuickReply('السلام عليكم  ', reply)).toBe(`السلام عليكم\n${reply.text}`)
  })

  it('keeps custom replies in storage, without duplicates', () => {
    const s = storage()
    addCustomReply('نرجو تأكيد مدة التوريد', s)
    const list = addCustomReply('نرجو تأكيد مدة التوريد', s)
    expect(list).toHaveLength(1)
    expect(loadCustomReplies(s)[0]).toMatchObject({ text: 'نرجو تأكيد مدة التوريد', custom: true })
    expect(removeCustomReply(list[0]!.id, s)).toEqual([])
  })
})
