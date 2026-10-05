import { describe, expect, it } from 'vitest'
import type { SupplierQuoteHistoryRow } from '../api/constructionClient'
import {
  lineLabels,
  priceTrailLabel,
  quotedBadgeLabel,
  requestLabel,
  responseLabel,
  sortNewestFirst,
  sourceLabel,
  standingLabel,
  summaryTiles,
  vatBasisLabel,
} from './supplierQuoteHistory'

const row = (over: Partial<SupplierQuoteHistoryRow> = {}): SupplierQuoteHistoryRow => ({
  quote_id: 'q',
  quote_version_id: 'v',
  quote_version: 2,
  versions_count: 2,
  quoted_at: '2026-09-03T10:00:00Z',
  first_quoted_at: '2026-09-01T10:00:00Z',
  line: { line_id: 'l', line_key: 'pr288-1', line_number: 1, booklet_text: 'مواسير PPR 32', market_name: 'بايب حراري', item_name: 'ماسورة', quantity: 10, uom: 'م' },
  available: true,
  declined: false,
  unit_price: 92,
  unit_price_ex_vat: 80,
  prices_include_tax: true,
  tax_rate: 0.15,
  vat_basis: 'INCLUDES_VAT',
  currency: 'SAR',
  line_total_ex_vat: 800,
  source: 'SUPPLIER',
  chat_sourced: false,
  lead_time_days: null,
  price_trail: [
    { quote_version: 1, at: null, available: true, unit_price: 115, unit_price_ex_vat: 100, prices_include_tax: true, source: 'SUPPLIER', change_percent: null },
    { quote_version: 2, at: null, available: true, unit_price: 92, unit_price_ex_vat: 80, prices_include_tax: true, source: 'SUPPLIER', change_percent: -20 },
  ],
  price_changes: 1,
  price_cuts: 1,
  total_change_percent: -20,
  cheapest_now: true,
  rank_now: 1,
  offers_now: 2,
  pct_above_cheapest_now: 0,
  cheapest_at_time: true,
  rank_at_time: 1,
  offers_at_time: 2,
  awarded: true,
  request: { rfq_id: 'aaaaaaaa-1111-4111-8111-111111111111', department: 'CIVIL', project: null, city: null, created_at: null, booklet: null },
  invited_at: null,
  response_hours: 24,
  ...over,
})

describe('supplier quote history helpers', () => {
  it('names the VAT basis and never guesses an unstated one', () => {
    expect(vatBasisLabel(row())).toBe('شامل الضريبة')
    expect(vatBasisLabel(row({ vat_basis: 'EXCLUDES_VAT' }))).toBe('غير شامل الضريبة')
    expect(vatBasisLabel(row({ vat_basis: 'UNKNOWN' }))).toBe('الضريبة غير محددة')
  })

  it('marks prices Farq recorded from a chat', () => {
    expect(sourceLabel(row({ source: 'CHAT' }))).toBe('من المحادثة')
    expect(sourceLabel(row())).toBe('من المورد')
  })

  it('reads a price cut across versions', () => {
    expect(priceTrailLabel(row())).toBe('115 ← 92 (خفّض 20٪)')
    expect(priceTrailLabel(row({ price_trail: row().price_trail.slice(0, 1) }))).toBeNull()
  })

  it('says where the price stands: cheapest, only offer, behind, not comparable', () => {
    expect(standingLabel(row())).toEqual({ text: 'الأرخص حاليًا', tone: 'best' })
    expect(standingLabel(row({ offers_now: 1 })).text).toBe('العرض الوحيد')
    expect(standingLabel(row({ cheapest_now: false, rank_now: 2, offers_now: 3, pct_above_cheapest_now: 12.5, cheapest_at_time: true })).text)
      .toBe('أعلى من الأرخص بـ 12.5٪ · 2 من 3 · كان الأرخص وقت تقديمه')
    expect(standingLabel(row({ cheapest_now: null, vat_basis: 'UNKNOWN' })).text).toBe('لا يُقارن: الضريبة غير محددة')
    expect(standingLabel(row({ available: false })).text).toBe('اعتذر عن البند')
  })

  it('leads with the market name and keeps the booklet text beside it', () => {
    expect(lineLabels(row())).toEqual({ primary: 'بايب حراري', secondary: 'مواسير PPR 32' })
    expect(lineLabels(row({ line: { ...row().line, market_name: null } }))).toEqual({ primary: 'مواسير PPR 32', secondary: null })
  })

  it('names the request by its booklet and wave, else by its reference', () => {
    expect(requestLabel(row({ request: { ...row().request, booklet: { id: 'b', reference: 'PR-H288', wave_number: 2 } } }))).toBe('PR-H288 · الدفعة 2')
    expect(requestLabel(row())).toContain('AAAAAAAA')
  })

  it('response time, newest first, the list badge', () => {
    expect(responseLabel(0.4)).toBe('أقل من ساعة')
    expect(responseLabel(24)).toBe('24 ساعة')
    expect(responseLabel(96)).toBe('4 يوم')
    expect(responseLabel(null)).toBe('—')
    expect(sortNewestFirst([row({ quoted_at: '2026-01-01' }), row({ quoted_at: '2026-09-01' })]).map((r) => r.quoted_at)).toEqual(['2026-09-01', '2026-01-01'])
    expect(quotedBadgeLabel(3)).toBe('قدّم عروضاً سابقاً · 3')
    expect(quotedBadgeLabel(0)).toBeNull()
  })

  it('summary tiles word the numbers the API computed', () => {
    const tiles = summaryTiles({
      invites_received: 4, replies: 3, reply_rate: 0.75, quotes: 2, lines_quoted: 9, lines_declined: 1, wins: 1, lines_won: 3,
      cheapest_lines_now: 5, compared_lines: 8, avg_pct_above_cheapest: 4.2, avg_rank: 1.4, price_cuts: 2, chat_sourced_lines: 1,
      median_response_hours: 6, last_quote_at: '2026-09-03T10:00:00Z',
    })
    const by = Object.fromEntries(tiles.map((t) => [t.label, t]))
    expect(by['ردود'].hint).toBe('75٪ من الدعوات')
    expect(by['مقارنة بالأرخص'].value).toBe('+4.2٪')
    expect(by['مقارنة بالأرخص'].hint).toBe('الأرخص في 5 من 8 بندًا')
    expect(by['ترسية'].value).toBe('1')
    expect(by['آخر عرض'].hint).toBe('يرد خلال 6 ساعة')
  })
})
