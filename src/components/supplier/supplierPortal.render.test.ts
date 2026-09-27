/**
 * Rendered-markup checks for the supplier portal (no DOM: react-dom/server).
 * They pin the facts a reviewer would otherwise check by eye: right-to-left,
 * the approved copy, the countdown, and that an unknown step is never green.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicSupplierInvite } from '../../api/constructionClient'
import type { SupplierRequest } from '../../api/supplierPortalClient'
import { timelineRows } from '../../lib/supplierPortal'
import { QuoteForm } from './QuoteForm'
import { RequestsList } from './RequestsList'
import { StatusPanel, Timeline } from './StatusPanel'
import { SupplierPortalView } from '../../views/SupplierPortalView'

const NOW = Date.parse('2026-09-27T07:00:00Z')

const request: SupplierRequest = {
  invite_id: 'inv-1',
  buyer_company: 'شركة الدفع للتجارة والمقاولات',
  reference: 'PR-580',
  title: '',
  deadline: '2026-09-29T20:59:00Z',
  unread_count: 2,
  line_count: 4,
  quote_version: 2,
  status_timeline: [
    { kind: 'SENT', state: 'DONE', at: '2026-09-25T06:30:00Z' },
    { kind: 'OPENED', state: 'DONE', at: '2026-09-25T08:04:00Z' },
    { kind: 'QUOTE_RECEIVED', state: 'DONE', at: '2026-09-27T07:12:00Z' },
    { kind: 'SUBMISSION_CLOSED', state: 'UPCOMING', at: null },
    { kind: 'ENVELOPES_OPENED', state: 'UNKNOWN', at: null },
    { kind: 'AWARDED', state: 'UNKNOWN', at: null },
  ],
}

describe('Timeline', () => {
  it('never paints an unknown step green', () => {
    const html = renderToStaticMarkup(createElement(Timeline, { rows: timelineRows(request.status_timeline, request.deadline) }))
    const unknownItems = html.split('<li').filter((chunk) => chunk.includes('data-tone="unknown"'))
    expect(unknownItems).toHaveLength(2)
    for (const item of unknownItems) {
      expect(item).toContain('غير معروفة بعد')
      expect(item).not.toMatch(/#1a7a45|#123F3A|mint/)
    }
  })
})

describe('StatusPanel (frame F1)', () => {
  it('shows the status chip, the countdown and «راسل …»', () => {
    const html = renderToStaticMarkup(createElement(StatusPanel, { request, now: NOW, onMessage: () => {} }))
    expect(html).toContain('استلمنا عرضك')
    expect(html).toContain('يُغلق بعد يومين')
    expect(html).toContain('عرضك: النسخة 2')
    expect(html).toContain('راسل الدفع للتجارة والمقاولات')
    expect(html).toContain('التواريخ بتوقيت الرياض')
  })
  it('no «راسل» button without a chat', () => {
    const html = renderToStaticMarkup(createElement(StatusPanel, { request, now: NOW, onMessage: null }))
    expect(html).not.toContain('راسل ')
  })
})

describe('RequestsList (frame 2b)', () => {
  it('counts requests and companies, with an unread badge and a countdown', () => {
    const other: SupplierRequest = {
      ...request,
      invite_id: 'inv-2',
      buyer_company: 'شركة رواسي العمران',
      reference: 'RQ-1043',
      unread_count: 0,
      deadline: null,
      status_timeline: [{ kind: 'AWARDED', state: 'DONE', at: '2026-09-24T09:30:00Z' }],
    }
    const html = renderToStaticMarkup(createElement(RequestsList, { requests: [request, other], onOpen: () => {}, now: NOW }))
    expect(html).toContain('طلبين من شركتين')
    expect(html).toContain('تمت الترسية عليكم')
    expect(html).toContain('يُغلق بعد يومين')
    expect(html).toContain('2 رسائل غير مقروءة')
  })
})

describe('QuoteForm (frames 1a / F2)', () => {
  const invite = {
    invite_id: 'inv-1',
    rfq_id: 'r',
    rfq_version_id: 'v',
    response_status: 'PENDING',
    supplier: { name_ar: 'مصنع الطليعة للبلك الأسمنتي' },
    buyer: { company_name: 'شركة الدفع للتجارة والمقاولات' },
    lines: [
      { id: 'l1', line_number: 1, quantity: 3000, uom: 'حبة', original_name: 'بلوك مقاس 15 سم' },
      {
        id: 'l2',
        line_number: 2,
        quantity: 20,
        uom: 'طن',
        market_name_ar: 'حديد تسليح 12 مم',
        booklet_name_ar: 'حديد تسليح عالي المقاومة قطر 12 مم حسب المواصفة',
      },
    ],
  } as PublicSupplierInvite

  it('keeps the market name large with «كما في الكراسة» and offers an inquiry per line', () => {
    const html = renderToStaticMarkup(
      createElement(QuoteForm, {
        token: 't',
        invite,
        deadline: '2026-09-27T12:30:00Z',
        now: NOW,
        onSubmitted: () => {},
        onInquire: () => {},
      }),
    )
    expect(html).toContain('حديد تسليح 12 مم')
    expect(html).toContain('كما في الكراسة: حديد تسليح عالي المقاومة قطر 12 مم حسب المواصفة')
    expect(html.match(/استفسار عن هذا البند/g)).toHaveLength(2)
    expect(html).toContain('يُغلق بعد 5 ساعات — 3:30 م')
    expect(html).toContain('التقديم حتى 27 سبتمبر 2026، 3:30 م')
    // The submit stays disabled until the supplier has chosen and declared.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>إرسال العرض<\/button>/)
  })

  it('no inquiry buttons without a chat (token-only portal)', () => {
    const html = renderToStaticMarkup(
      createElement(QuoteForm, { token: 't', invite, deadline: null, now: NOW, onSubmitted: () => {}, onInquire: null }),
    )
    expect(html).not.toContain('استفسار عن هذا البند')
  })
})

describe('SupplierPortalView', () => {
  it('renders right-to-left and asks for the link when there is none', () => {
    const html = renderToStaticMarkup(createElement(SupplierPortalView, { navigate: () => {} }))
    expect(html).toMatch(/^<div[^>]*dir="rtl"/)
    expect(html).toContain('افتح رابط الدعوة')
    // The buyer-side link is not offered to a supplier.
    expect(html).not.toContain('واجهة المشتري')
  })
})
