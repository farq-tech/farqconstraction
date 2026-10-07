import { describe, expect, it, vi } from 'vitest'
import type { ConstructionBookletDetail } from '../api/constructionClient'
import {
  FALLBACK_LIMIT,
  buildHomeOverview,
  countdownLabel,
  coverageBuckets,
  isActiveBooklet,
  loadBookletDetails,
  offerCut,
  priceCutsFor,
  offersWord,
  quotesSince,
  summarizeBooklet,
  unitPriceLabel,
  visibleLines,
  vatLabel,
  withoutCancelledWaves,
} from './homeOverview'
import { FIXTURE_BOOKLETS, FIXTURE_NOW, PR580, PRH288 } from './homeOverview.fixture'

const HOUR = 3_600_000
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

describe('summarizeBooklet', () => {
  it('never promotes a held or zero price over an eligible supplier price', () => {
    const d = clone(PR580)
    const offers = d.matrix[0]!.offers
    offers[0]!.unit_price = 0
    offers[1]!.unit_price = 0.01
    offers[1]!.status = 'PRICE_REVIEW'
    const best = summarizeBooklet(d, FIXTURE_NOW).lines[0]!.best!
    expect(best.unitPrice).toBeGreaterThan(0.01)
    expect(best.needsReview).toBe(false)
    offers.forEach((o) => { o.status = 'PRICE_REVIEW' })
    expect(summarizeBooklet(d, FIXTURE_NOW).lines[0]!.best).toBeNull()
  })
  it('PR-580: six lines, block quoted by seven, both channels unquoted', () => {
    const card = summarizeBooklet(PR580, FIXTURE_NOW)
    expect(card.reference).toBe('PR-580')
    expect(card.waves).toBe(2)
    expect(card.lines.map((l) => [l.name, l.offers])).toEqual([
      ['بلوك 15 سم', 7],
      ['فوم مقاوم للحريق', 2],
      ['فوم بخاخ', 1],
      ['جسر أوميجا', 0],
      ['جسر رئيسي C', 0],
      ['غراء أبو جمل', 1],
    ])
    expect(card.lines[0]!.bookletName).toBe('بلوك خرساني مصمت مقاس 15 سم')
    expect(card.lines[0]!.best).not.toBeNull() // show the lowest recorded price despite mixed VAT
    expect(card.lines[1]!.best?.cutPercent ?? null).toBeNull()
    expect(card.lines[3]!.best).toBeNull()
    expect(card.buckets).toEqual({ none: 2, few: 3, many: 1 })
    expect([card.linesTotal, card.linesWithQuotes]).toEqual([6, 4])
    // s1 (5h) and s2 (9h) and s? within 24h: only s1, s2.
    expect(card.quotesLast24h).toBe(2)
  })

  it('uses the booklet text when there is no market name', () => {
    const card = summarizeBooklet(PRH288, FIXTURE_NOW)
    const line = card.lines.find((l) => l.key === 'pr288-3')!
    expect(line.name).toBe('أنبوب معدني EMT قطر 32 مم طول 3 م')
    expect(line.bookletName).toBeUndefined()
    expect(card.lines.find((l) => l.key === 'pr288-8')!.best).not.toBeNull() // a single quote still has a recorded lowest price
    expect(card.lines.find((l) => l.key === 'pr288-9')!.offers).toBe(0)
    expect(card.waves).toBe(2) // the cancelled wave is not counted
  })

  it('reads VAT basis per best offer', () => {
    const d = clone(PR580)
    d.matrix[0]!.offers.find((o) => o.supplier_id === 's1')!.prices_include_tax = true
    expect(summarizeBooklet(d, FIXTURE_NOW).lines[0]!.best).not.toBeNull()
    d.matrix[0]!.offers.find((o) => o.supplier_id === 's1')!.prices_include_tax = null
    expect(summarizeBooklet(d, FIXTURE_NOW).lines[0]!.best).not.toBeNull()
    expect(vatLabel('incl')).toBe('شامل الضريبة')
    expect(vatLabel('excl')).toBe('غير شامل الضريبة')
  })

  it('shows the lowest recorded SAR price with unknown VAT and tied quotes', () => {
    const d = clone(PR580)
    d.matrix[0]!.offers.forEach((o, i) => { o.unit_price = i < 2 ? 1 : 9; o.currency = 'SAR'; o.prices_include_tax = null })
    const best = summarizeBooklet(d, FIXTURE_NOW).lines[0]!.best!
    expect(best.unitPrice).toBe(1)
    expect(best.vat).toBe('unknown')
  })

  it('tolerates a detail with no lines, matrix or suppliers', () => {
    const card = summarizeBooklet({ booklet: { id: 'x', reference: null, title: null, quote_deadline: null, created_at: null } } as unknown as ConstructionBookletDetail)
    expect(card).toMatchObject({ reference: 'كراسة', linesTotal: 0, deadlineAt: null, buckets: { none: 0, few: 0, many: 0 } })
  })
})

describe('cancelled waves and booklets', () => {
  it('drops offers and suppliers of a cancelled wave', () => {
    const d = clone(PR580)
    d.waves[1]!.status = 'CANCELLED'
    const live = withoutCancelledWaves(d)
    expect(live.waves).toHaveLength(1)
    expect(live.suppliers.map((s) => s.supplier_id)).not.toContain('s4')
    expect(live.matrix[0]!.offers.map((o) => o.supplier_id)).not.toContain('s6')
    expect(summarizeBooklet(d, FIXTURE_NOW).lines[0]!.offers).toBe(5)
  })

  it('a booklet whose every wave is cancelled, closed or awarded is not active; one with no waves is', () => {
    expect(isActiveBooklet({ waves: [] })).toBe(true)
    expect(isActiveBooklet({ waves: [{ wave_number: 1, rfq_id: 'r', status: 'CANCELLED', invites: 1, created_at: null }] })).toBe(false)
    expect(isActiveBooklet({ waves: [{ wave_number: 1, rfq_id: 'r', status: 'AWARDED', invites: 1, created_at: null }, { wave_number: 2, rfq_id: 'q', status: 'CLOSED', invites: 1, created_at: null }] })).toBe(true)
    expect(isActiveBooklet(PRH288)).toBe(true)
    const dead = clone(PR580)
    dead.waves.forEach((w) => (w.status = 'CANCELLED'))
    expect(buildHomeOverview([dead, PRH288], FIXTURE_NOW).booklets.map((b) => b.reference)).toEqual(['PR-H288'])
  })
})

describe('buildHomeOverview', () => {
  const o = buildHomeOverview(FIXTURE_BOOKLETS, FIXTURE_NOW)

  it('totals across active booklets', () => {
    expect(o.totals).toMatchObject({
      activeBooklets: 2,
      linesTotal: 15,
      linesWithQuotes: 12,
      linesWithoutQuotes: 3,
      coveragePercent: 80,
      quotesLast24h: 4,
    })
    expect(o.totals.nearestDeadline).toMatchObject({ reference: 'PR-580', at: Date.parse('2026-09-29T20:59:00Z') })
  })

  it('nearest deadline first', () => {
    expect(o.booklets.map((b) => b.reference)).toEqual(['PR-580', 'PR-H288'])
  })

  it('attention: deadline within 48h, unquoted lines per booklet and chat-entered quotes — never «expiring»', () => {
    expect(o.attention.map((a) => [a.kind, a.reference])).toEqual([
      ['deadline', 'PR-580'],
      ['no_quotes', 'PR-580'],
      ['no_quotes', 'PR-H288'],
      ['from_chat', 'PR-580'],
      ['from_chat', 'PR-H288'],
    ])
    expect(o.attention[1]).toMatchObject({ lines: ['جسر أوميجا', 'جسر رئيسي C'], count: 2 })
    expect(o.attention[4]).toMatchObject({ supplierName: 'شركة النور الكهربائية', lines: 6 })
  })

  it('no deadline item once the deadline passed, or when it is days away', () => {
    const later = buildHomeOverview([PRH288], FIXTURE_NOW)
    expect(later.attention.some((a) => a.kind === 'deadline')).toBe(false)
    const passed = buildHomeOverview([PR580], FIXTURE_NOW + 72 * HOUR)
    expect(passed.attention.some((a) => a.kind === 'deadline')).toBe(false)
    expect(passed.totals.nearestDeadline).toBeNull()
  })

  it('«عروض الموردين لا تنتهي الصلاحية»: a quote past its stated validity raises no alert and still counts', () => {
    const later = buildHomeOverview([PR580], Date.parse('2027-06-01T00:00:00Z'))
    expect(later.attention.map((a) => a.kind as string)).not.toContain('expiring')
    expect(later.booklets[0].linesWithQuotes).toBe(buildHomeOverview([PR580], FIXTURE_NOW).booklets[0].linesWithQuotes)
    expect(JSON.stringify(later.attention)).not.toMatch(/صلاحي|expir/i)
  })

  it('a closed booklet asks for no more quotes and has no deadline to watch', () => {
    const closed = { ...PR580, booklet: { ...PR580.booklet, state: 'CLOSED', closed_at: '2026-09-28T10:00:00Z' } }
    const out = buildHomeOverview([closed], FIXTURE_NOW)
    expect(out.attention.map((a) => a.kind)).toEqual(['from_chat'])
  })

  it('empty input is an empty page, not NaN', () => {
    expect(buildHomeOverview([], FIXTURE_NOW).totals).toEqual({
      activeBooklets: 0,
      linesTotal: 0,
      linesWithQuotes: 0,
      linesWithoutQuotes: 0,
      coveragePercent: 0,
      quotesLast24h: 0,
      nearestDeadline: null,
    })
  })
})

describe('helpers', () => {
  it('coverage buckets 0 / 1–2 / 3+', () => {
    expect(coverageBuckets([0, 1, 2, 3, 7, 0])).toEqual({ none: 2, few: 2, many: 2 })
  })

  it('quotes in the last 24h count each supplier once, from either stamp', () => {
    const d = clone(PR580)
    d.suppliers = []
    expect(quotesSince(d, FIXTURE_NOW)).toBe(2)
    expect(quotesSince(d, FIXTURE_NOW, 100 * HOUR)).toBe(7)
  })

  it('a collapsed card never hides an unquoted line', () => {
    const lines = summarizeBooklet(PRH288, FIXTURE_NOW).lines
    expect(visibleLines(lines, false, 3).map((l) => l.key)).toEqual(['pr288-1', 'pr288-2', 'pr288-3', 'pr288-9'])
    expect(visibleLines(lines, true, 3)).toHaveLength(9)
  })

  it('unit prices keep two decimals', () => {
    expect(unitPriceLabel(1.7)).toBe('1.70 ريال')
    expect(unitPriceLabel(23.1)).toBe('23.10 ريال')
    expect(unitPriceLabel(1250, 'USD')).toBe('1,250.00 USD')
  })

  it('countdown words', () => {
    const now = FIXTURE_NOW
    expect(countdownLabel(null, now)).toBe('بلا موعد')
    expect(countdownLabel(now - 1, now)).toBe('انتهى الموعد')
    expect(countdownLabel(now + 30 * 60_000, now)).toBe('أقل من ساعة')
    expect(countdownLabel(now + 2 * HOUR, now)).toBe('متبقٍ ساعتان')
    expect(countdownLabel(now + 39 * HOUR, now)).toBe('متبقٍ 39 ساعة')
    expect(countdownLabel(now + 5 * HOUR, now)).toBe('متبقٍ 5 ساعات')
    expect(countdownLabel(now + 4 * 24 * HOUR, now)).toBe('متبقٍ 4 أيام')
    expect(countdownLabel(now + 2 * 24 * HOUR + HOUR, now)).toBe('متبقٍ يومان')
    expect(offersWord(0)).toBe('بدون عروض')
    expect(offersWord(7)).toBe('7 عروض')
  })
})

describe('loadBookletDetails', () => {
  it('one call when the overview route exists', async () => {
    const list = vi.fn()
    const detail = vi.fn()
    const got = await loadBookletDetails({ overview: async () => ({ booklets: FIXTURE_BOOKLETS }), list, detail })
    expect(got).toHaveLength(2)
    expect(list).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
  })

  it('older API: the list, then each booklet (bounded); one failure is skipped', async () => {
    const ids = Array.from({ length: FALLBACK_LIMIT + 3 }, (_, i) => `b${i}`)
    const detail = vi.fn(async (id: string) => {
      if (id === 'b1') throw new Error('boom')
      return { ...clone(PR580), booklet: { ...PR580.booklet, id } }
    })
    const got = await loadBookletDetails({
      overview: async () => null,
      list: async () => ({ booklets: ids.map((id) => ({ id }) as never) }),
      detail,
    })
    expect(detail).toHaveBeenCalledTimes(FALLBACK_LIMIT)
    expect(got).toHaveLength(FALLBACK_LIMIT - 1)
  })

  it('no booklets surface (list 404 → empty) reads as none', async () => {
    await expect(loadBookletDetails({ overview: async () => null, list: async () => ({ booklets: [] }), detail: vi.fn() })).resolves.toEqual([])
  })

  it('every booklet failing is an error, not an empty page', async () => {
    await expect(
      loadBookletDetails({
        overview: async () => null,
        list: async () => ({ booklets: [{ id: 'a' } as never] }),
        detail: async () => {
          throw new Error('down')
        },
      }),
    ).rejects.toThrow('down')
  })
})

describe('price cuts («موردون خفّضوا أسعارهم»)', () => {
  const o = buildHomeOverview(FIXTURE_BOOKLETS, FIXTURE_NOW)

  it('every lowered line across booklets, newest first, with the cut for the line quantity', () => {
    expect(o.priceCuts.map((c) => [c.reference, c.supplierName, c.lineName, c.oldPrice, c.newPrice, c.percent])).toEqual([
      ['PR-580', 'مؤسسة الركن المتين', 'بلوك 15 سم', 1.85, 1.7, 8.1],
      ['PR-H288', 'شركة النور الكهربائية', 'فيشر بلاستيك 8 مم', 1.2, 1, 16.7],
      ['PR-H288', 'مؤسسة الوصل', 'ماسورة EMT 1', 26, 24.5, 5.8],
    ])
    expect(o.priceCuts[0]).toMatchObject({ perUnit: 0.15, lineAmount: 450, quantity: 3000, cheapestNow: false, fromChat: false, oldVat: 'excl' })
    expect(o.priceCuts[1]).toMatchObject({ lineAmount: 400, cheapestNow: false, fromChat: true })
    expect(o.priceCuts[2]).toMatchObject({ lineAmount: 300, cheapestNow: false, newVat: 'incl' })
  })

  it('no cuts: an empty list (the section hides)', () => {
    const d = clone(PR580)
    d.matrix.forEach((m) => m.offers.forEach((x) => (x.previous_unit_price = null)))
    expect(priceCutsFor(d, summarizeBooklet(d, FIXTURE_NOW))).toEqual([])
  })

  it('a cancelled wave\'s cut is not shown', () => {
    const d = clone(PRH288)
    d.waves[1]!.status = 'CANCELLED'
    expect(buildHomeOverview([d], FIXTURE_NOW).priceCuts.map((c) => c.supplierName)).toEqual(['مؤسسة الوصل'])
  })

  it('offerCut trusts the server; an older payload is compared only on the same basis', () => {
    const base = PR580.matrix[0]!.offers[0]!
    expect(offerCut(base)).toEqual({ percent: 8.1, perUnit: 0.15, previous: 1.85 })
    expect(offerCut({ ...base, price_cut_percent: null, price_cut_per_unit: null })).toEqual({ percent: 8.1, perUnit: 0.15000000000000013, previous: 1.85 })
    expect(offerCut({ ...base, price_cut_percent: null, price_cut_per_unit: null, previous_prices_include_tax: true })).toBeNull()
    expect(offerCut({ ...base, previous_unit_price: 1.6, price_cut_percent: null, price_cut_per_unit: null })).toBeNull()
    expect(offerCut({ ...base, previous_unit_price: null })).toBeNull()
    expect(offerCut(null)).toBeNull()
  })
})
