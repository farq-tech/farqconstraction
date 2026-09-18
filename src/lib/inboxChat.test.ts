import { describe, expect, it } from 'vitest'
import type { ConstructionInboxThread } from '../api/constructionClient'
import {
  attachmentKind,
  avatarTone,
  chatDayLabel,
  filterThreads,
  listTimeLabel,
  normalizeForSearch,
  sortThreadsNewestFirst,
  supplierInitials,
  threadSnippet,
} from './inboxChat'

const thread = (over: Partial<ConstructionInboxThread>): ConstructionInboxThread => ({ ...over })

describe('sortThreadsNewestFirst', () => {
  it('puts the newest activity first regardless of server order', () => {
    const rows = [
      thread({ invite_id: 'old', last_received_at: '2026-09-10T08:00:00Z' }),
      thread({ invite_id: 'new', last_received_at: '2026-09-17T09:30:00Z' }),
      thread({ invite_id: 'mid', last_received_at: '2026-09-15T12:00:00Z' }),
    ]
    expect(sortThreadsNewestFirst(rows).map((t) => t.invite_id)).toEqual(['new', 'mid', 'old'])
  })

  it('sends undated and unparseable rows last, in server order', () => {
    const rows = [
      thread({ invite_id: 'none' }),
      thread({ invite_id: 'junk', last_received_at: 'not a date' }),
      thread({ invite_id: 'dated', last_received_at: '2026-09-01T00:00:00Z' }),
      thread({ invite_id: 'null', last_received_at: null }),
    ]
    expect(sortThreadsNewestFirst(rows).map((t) => t.invite_id)).toEqual([
      'dated',
      'none',
      'junk',
      'null',
    ])
  })

  it('is stable for equal times and does not mutate its input', () => {
    const rows = [
      thread({ invite_id: 'a', last_received_at: '2026-09-17T09:30:00Z' }),
      thread({ invite_id: 'b', last_received_at: '2026-09-17T09:30:00Z' }),
    ]
    const copy = [...rows]
    expect(sortThreadsNewestFirst(rows).map((t) => t.invite_id)).toEqual(['a', 'b'])
    expect(rows).toEqual(copy)
  })
})

describe('threadSnippet', () => {
  it('never lets quoted history become the snippet', () => {
    const preview = [
      'السعر المطلوب مرفق، شكرًا.',
      '',
      'On Tue, Sep 15, 2026 at 7:59 PM Farq <info@farq.sa> wrote:',
      '> نرجو تزويدنا بعرض سعر للبنود التالية',
      '> بند ١',
    ].join('\n')
    expect(threadSnippet(thread({ preview }))).toBe('السعر المطلوب مرفق، شكرًا.')
  })

  it('collapses line breaks into one line', () => {
    expect(threadSnippet(thread({ preview: 'سطر أول\n\n  سطر ثانٍ' }))).toBe('سطر أول سطر ثانٍ')
  })

  it('falls back to the subject, then to empty — it invents nothing', () => {
    expect(threadSnippet(thread({ preview: '  ', subject: 'RE: ELE-RFQ-12' }))).toBe('RE: ELE-RFQ-12')
    expect(threadSnippet(thread({}))).toBe('')
  })

  it('hides sealed content and names outbound invite snapshots', () => {
    expect(threadSnippet(thread({ locked: true, preview: 'سعر سري' }))).toBe('مغلق (ظرف مختوم)')
    expect(threadSnippet(thread({ kind_hint: 'DISPATCH', preview: 'x' }))).toBe(
      'دعوة طلب عرض مرسلة (صادر)',
    )
    // A dispatch row that needs a reply is a conversation, not a snapshot.
    expect(threadSnippet(thread({ kind_hint: 'DISPATCH', needs_reply: true, preview: 'رد المورد' }))).toBe(
      'رد المورد',
    )
  })
})

describe('filterThreads', () => {
  const rows = [
    thread({ invite_id: '1', supplier_name_ar: 'دهانات الجزيرة', preview: 'عرض السعر مرفق' }),
    thread({ invite_id: '2', supplier_name_en: 'AP Tools', preview: 'Please contact sales' }),
    thread({
      invite_id: '3',
      supplier_name_ar: 'مصنع الخرسانة',
      preview: 'تم الاستلام',
      request_context: { reference: 'ELE-RFQ-0042' },
    }),
    thread({ invite_id: '4', supplier_name_ar: 'مورد مختوم', locked: true, preview: 'كلمة سرية' }),
  ]
  const ids = (query: string) => filterThreads(rows, query).map((t) => t.invite_id)

  it('returns everything for an empty query', () => {
    expect(ids('   ')).toEqual(['1', '2', '3', '4'])
  })

  it('matches supplier names across Arabic spelling variants', () => {
    expect(ids('الجزيره')).toEqual(['1'])
    expect(ids('ap tools')).toEqual(['2'])
  })

  it('matches the snippet and the RFQ reference', () => {
    expect(ids('الاستلام')).toEqual(['3'])
    expect(ids('rfq-0042')).toEqual(['3'])
  })

  it('does not search text hidden behind a sealed envelope', () => {
    expect(ids('سرية')).toEqual([])
    expect(ids('مختوم')).toEqual(['4'])
  })
})

describe('normalizeForSearch', () => {
  it('strips diacritics and tatweel and unifies alef forms', () => {
    expect(normalizeForSearch('أَحْمَــد')).toBe('احمد')
    expect(normalizeForSearch('  إسمنت   الرياض ')).toBe('اسمنت الرياض')
  })
})

describe('supplierInitials', () => {
  it('skips legal-form words and the Arabic article', () => {
    expect(supplierInitials('شركة دهانات الجزيرة')).toBe('د‌ج')
    expect(supplierInitials('AP Tools Co.')).toBe('A‌T')
  })

  it('still answers when the name is only generic words or empty', () => {
    expect(supplierInitials('شركة')).toBe('ش')
    expect(supplierInitials('')).toBe('؟')
  })
})

describe('avatarTone', () => {
  it('is stable and inside the palette', () => {
    expect(avatarTone('دهانات الجزيرة', 6)).toBe(avatarTone('دهانات الجزيرة', 6))
    expect(avatarTone('AP Tools', 6)).toBeLessThan(6)
    expect(avatarTone('', 6)).toBe(0)
  })
})

describe('day and time labels', () => {
  // Local-time constructors on purpose: the labels are about the reader's day.
  const now = new Date(2026, 8, 17, 15, 0).getTime()
  const iso = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h, 0).toISOString()

  it('names today and yesterday', () => {
    expect(chatDayLabel(iso(2026, 8, 17, 1), now)).toBe('اليوم')
    expect(chatDayLabel(iso(2026, 8, 16, 23), now)).toBe('أمس')
    expect(chatDayLabel(iso(2026, 8, 10), now)).not.toMatch(/اليوم|أمس/)
    expect(chatDayLabel(iso(2026, 8, 10), now)).not.toBe('')
  })

  it('shows a clock today, «أمس» yesterday, then a weekday, then a date', () => {
    const today = listTimeLabel(iso(2026, 8, 17, 9), now)
    expect(today).not.toBe('')
    expect(today).not.toBe('أمس')
    expect(listTimeLabel(iso(2026, 8, 16), now)).toBe('أمس')
    const weekday = listTimeLabel(iso(2026, 8, 13), now)
    const expectedWeekday = new Date(2026, 8, 13).toLocaleDateString('en-GB', { weekday: 'long' })
    expect(weekday).toBe(expectedWeekday)
    const older = listTimeLabel(iso(2026, 7, 1), now)
    expect(older).not.toBe(expectedWeekday)
    expect(older).not.toBe('')
  })

  it('says nothing when there is no usable time', () => {
    expect(listTimeLabel(undefined, now)).toBe('')
    expect(listTimeLabel('garbage', now)).toBe('')
    expect(chatDayLabel(null, now)).toBe('')
  })
})

describe('attachmentKind', () => {
  it('prefers the file extension, then the content type', () => {
    expect(attachmentKind({ filename: 'عرض سعر.PDF' })).toBe('PDF')
    expect(attachmentKind({ filename: 'scan', content_type: 'image/png' })).toBe('PNG')
    expect(attachmentKind({ content_type: 'application/pdf' })).toBe('PDF')
    expect(attachmentKind({})).toBe('')
  })
})
