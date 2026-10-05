import { describe, expect, it } from 'vitest'
import type { RevisionCandidate, RevisionLine, RevisionRecipient } from '../api/constructionClient'
import {
  buildRevisionBody,
  canReviseRfq,
  channelLabel,
  channelTone,
  confirmBody,
  costCountsAr,
  costSummaryAr,
  diffLines,
  draftFromLine,
  draftProblem,
  emptyDraftLine,
  filterCandidates,
  groupRecipientsByChannel,
  initialSelection,
  lineFromDraft,
  linesCountAr,
  resultStatusLabel,
  samplePreview,
  sendableCount,
  suggestChangeNote,
  versionsLabel,
} from './rfqRevision'

const LINES: RevisionLine[] = [
  { line_key: 'a', name_ar: 'بلاط بورسلان', quantity: 100, uom: 'م2', spec_card: { material: 'بورسلان', dimensions: '60x60', brand: 'X' } },
  { line_key: 'b', name_ar: 'غراء بلاط', quantity: 20, uom: 'كيس', original_description: 'غراء أبيض' },
  { line_key: 'c', name_ar: 'ترويبة', quantity: 10, uom: 'كيس' },
]

function drafts() {
  return LINES.map((l, i) => draftFromLine(l, `u${i}`))
}

function candidate(patch: Partial<RevisionCandidate>): RevisionCandidate {
  return {
    supplier_id: 's1',
    name_ar: 'مؤسسة الأمل',
    invite_id: 'i1',
    quoted: false,
    open_conversation: false,
    window_open: false,
    window_until: null,
    channel: 'EMAIL',
    paid: false,
    held_reason_ar: null,
    preselected: false,
    ...patch,
  }
}

function recipient(patch: Partial<RevisionRecipient>): RevisionRecipient {
  return {
    supplier_id: 's1',
    name_ar: 'مورد',
    sources: ['INVITED'],
    channel: 'EMAIL',
    paid: false,
    window_until: null,
    held_reason_ar: null,
    message_preview: null,
    ...patch,
  }
}

describe('lines', () => {
  it('round-trips a line, keeping spec-card keys the editor does not show', () => {
    const d = draftFromLine(LINES[0], 'u')
    expect(d.material).toBe('بورسلان')
    expect(d.spec_rest).toEqual({ brand: 'X' })
    expect(lineFromDraft(d)).toEqual({
      line_key: 'a',
      name_ar: 'بلاط بورسلان',
      quantity: 100,
      uom: 'م2',
      spec_card: { brand: 'X', material: 'بورسلان', dimensions: '60x60' },
    })
  })

  it('reads Arabic digits and leaves empty spec out of a new line', () => {
    const d = { ...emptyDraftLine('n'), name_ar: ' سيليكون ', quantity: '١٢', uom: 'حبة' }
    expect(lineFromDraft(d)).toEqual({ name_ar: 'سيليكون', quantity: 12, uom: 'حبة' })
  })

  it('names what stops step 1', () => {
    expect(draftProblem([], 'x')).toMatch(/بندًا واحدًا/)
    const d = drafts()
    d[1] = { ...d[1], quantity: '0' }
    expect(draftProblem(d, 'x')).toBe('اكتب كمية صحيحة للبند 2.')
    expect(draftProblem(drafts(), '  ')).toMatch(/ملاحظة التعديل/)
    expect(draftProblem(drafts(), 'تعديل')).toBeNull()
  })
})

describe('diff and the change-note suggestion', () => {
  it('is empty when nothing changed', () => {
    const diff = diffLines(LINES, drafts())
    expect(diff).toEqual({ changed: [], added: 0, removed: 0 })
    expect(suggestChangeNote(diff)).toBe('')
  })

  it('counts changed, added and removed lines', () => {
    const d = drafts()
    d[0] = { ...d[0], quantity: '120' }
    d[1] = { ...d[1], finish: 'مطفي', quantity: '25' }
    const edited = [d[0], d[1], { ...emptyDraftLine('n'), name_ar: 'سيليكون', quantity: '5', uom: 'حبة' }]
    const diff = diffLines(LINES, edited)
    expect(diff.changed).toEqual([
      { line_key: 'a', fields: ['quantity'] },
      { line_key: 'b', fields: ['quantity', 'spec'] },
    ])
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(suggestChangeNote(diff)).toBe('تعديل: بندين (الكمية والمواصفة)، إضافة بند واحد، حذف بند واحد')
  })

  it('words counts in Arabic', () => {
    expect(linesCountAr(1)).toBe('بند واحد')
    expect(linesCountAr(2)).toBe('بندين')
    expect(linesCountAr(3)).toBe('3 بنود')
    expect(linesCountAr(11)).toBe('11 بندًا')
  })
})

describe('recipients', () => {
  it('labels every channel', () => {
    expect(channelLabel('WHATSAPP_WINDOW')).toBe('رسالة مجانية (النافذة مفتوحة)')
    expect(channelLabel('WHATSAPP_TEMPLATE')).toBe('قالب مدفوع')
    expect(channelLabel('EMAIL')).toBe('بريد (مجاني)')
    expect(channelLabel('HARAJ')).toBe('حراج (مجاني)')
    expect(channelLabel('NONE')).toBe('لا توجد قناة')
    expect(channelLabel('HELD', 'طلب عدم التواصل')).toBe('طلب عدم التواصل')
    expect(channelTone('WHATSAPP_TEMPLATE')).toBe('paid')
    expect(channelTone('HELD')).toBe('blocked')
    expect(channelTone('EMAIL')).toBe('free')
  })

  it('preselects what the server proposes and filters by name or channel', () => {
    const list = [
      candidate({ supplier_id: 's1', name_ar: 'مؤسسة الأمل', preselected: true }),
      candidate({ supplier_id: 's2', name_ar: 'شركة النور', channel: 'WHATSAPP_TEMPLATE' }),
    ]
    expect([...initialSelection(list)]).toEqual(['s1'])
    expect(filterCandidates(list, 'الامل').map((c) => c.supplier_id)).toEqual(['s1'])
    expect(filterCandidates(list, 'مدفوع').map((c) => c.supplier_id)).toEqual(['s2'])
    expect(filterCandidates(list, ' ')).toHaveLength(2)
  })

  it('builds the request body with de-duplicated supplier ids', () => {
    const body = buildRevisionBody({ drafts: drafts(), changeNote: ' تعديل ', supplierIds: ['s1', 's2', 's1', ''] })
    expect(body.change_note).toBe('تعديل')
    expect(body.supplier_ids).toEqual(['s1', 's2'])
    expect(body.lines).toHaveLength(3)
    expect(body.template).toBeUndefined()
    expect(buildRevisionBody({ drafts: [], changeNote: 'x', supplierIds: [], template: 'REMINDER' }).template).toBe('REMINDER')
  })
})

describe('preview and cost', () => {
  const cost = { paid_count: 3, free_count: 4, held_count: 1, unit_price_sar: 0.05, total_sar: 0.15, currency: 'SAR' as const }

  it('words the server figures', () => {
    expect(costSummaryAr(cost)).toBe('عدد الرسائل المدفوعة 3 × 0.05 = 0.15 ر.س')
    expect(costCountsAr(cost)).toBe('مجانية: 4 · مدفوعة: 3 · موقوفة: 1')
    expect(costCountsAr({ ...cost, held_count: 0 })).toBe('مجانية: 4 · مدفوعة: 3')
  })

  it('confirms exactly the figures shown', () => {
    expect(confirmBody({ cost })).toEqual({ expected_paid_count: 3, expected_total_sar: 0.15 })
  })

  it('groups recipients by channel in a fixed order', () => {
    const groups = groupRecipientsByChannel([
      recipient({ supplier_id: 'a', channel: 'WHATSAPP_TEMPLATE', paid: true }),
      recipient({ supplier_id: 'b', channel: 'EMAIL' }),
      recipient({ supplier_id: 'c', channel: 'HELD', held_reason_ar: 'محظور' }),
      recipient({ supplier_id: 'd', channel: 'WHATSAPP_WINDOW' }),
    ])
    expect(groups.map((g) => g.channel)).toEqual(['WHATSAPP_WINDOW', 'EMAIL', 'WHATSAPP_TEMPLATE', 'HELD'])
    expect(groups[3].label).toBe('موقوف')
  })

  it('samples a free message and counts what will be tried', () => {
    const list = [
      recipient({ supplier_id: 'a', channel: 'WHATSAPP_TEMPLATE', paid: true, message_preview: 'مدفوع' }),
      recipient({ supplier_id: 'b', channel: 'EMAIL', message_preview: 'مرحبا' }),
      recipient({ supplier_id: 'c', channel: 'NONE' }),
    ]
    expect(samplePreview(list)?.supplier_id).toBe('b')
    expect(samplePreview([list[0]])?.supplier_id).toBe('a')
    expect(samplePreview([list[2]])).toBeNull()
    expect(sendableCount(list)).toBe(2)
  })

  it('labels per-supplier results', () => {
    expect(resultStatusLabel('SENT')).toEqual({ text: 'أُرسل', ok: true })
    expect(resultStatusLabel('FAILED', 'X').ok).toBe(false)
  })
})

describe('header and gate', () => {
  it('shows the latest version only when there is more than one', () => {
    expect(versionsLabel(undefined)).toBeNull()
    expect(versionsLabel([{ id: '1', version_number: 1, created_at: '', change_note: null }])).toBeNull()
    expect(
      versionsLabel([
        { id: '2', version_number: 2, created_at: '', change_note: 'تعديل: بندين' },
        { id: '1', version_number: 1, created_at: '', change_note: null },
      ]),
    ).toBe('النسخة 2 — تعديل: بندين')
  })

  it('allows a revision only on a sent request still taking quotes', () => {
    expect(canReviseRfq({ status: 'SENT' })).toBe(true)
    expect(canReviseRfq({ status: 'PARTIALLY_SENT' })).toBe(true)
    expect(canReviseRfq({ status: 'DRAFT' })).toBe(false)
    expect(canReviseRfq({ status: 'SENT', submission_closed_at: '2026-01-01' })).toBe(false)
    expect(canReviseRfq({ status: 'SENT', award: { status: 'APPROVED' } })).toBe(false)
    expect(canReviseRfq({ status: 'SENT', award: { status: 'CANCELLED' } })).toBe(true)
    expect(canReviseRfq({ status: 'SENT' }, true)).toBe(false)
  })
})
