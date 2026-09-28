import type { ConstructionBookletDetail, ConstructionBookletOffer } from '../api/constructionClient'

/**
 * Two booklets shaped like PR-580 and PR-H288, for the home page tests and the
 * screenshot harness. Supplier names are invented.
 */

export const FIXTURE_NOW = Date.parse('2026-09-28T09:00:00+03:00')
const hoursAgo = (h: number) => new Date(FIXTURE_NOW - h * 3_600_000).toISOString()

type Line = { key: string; name: string; market?: string; qty: number; uom: string }
type Quote = {
  supplier: string
  name: string
  prices: Record<string, number>
  at: string
  includesTax?: boolean | null
  enteredBy?: string
  validUntil?: string
  wave?: number
  /** Unit prices of the previous version, where this one lowered them (same VAT basis). */
  previous?: Record<string, { price: number; at: string }>
}

function booklet(opts: {
  id: string
  reference: string
  title: string
  deadline: string
  waves: Array<{ n: number; status: string; invites: number }>
  lines: Line[]
  quotes: Quote[]
}): ConstructionBookletDetail {
  const rfq = (n: number) => `${opts.id}-rfq-${n}`
  const offersFor = (key: string, qty: number): ConstructionBookletOffer[] =>
    opts.quotes
      .filter((q) => q.prices[key] != null)
      .map((q) => ({
        supplier_id: q.supplier,
        unit_price: q.prices[key]!,
        total: Math.round(q.prices[key]! * qty * 100) / 100,
        currency: 'SAR',
        uom: null,
        rfq_id: rfq(q.wave ?? 1),
        quote_version_id: `${q.supplier}-v1`,
        notes: null,
        status: 'PRICED',
        prices_include_tax: q.includesTax === undefined ? false : q.includesTax,
        wave_number: q.wave ?? 1,
        submitted_at: q.at,
        entered_by: q.enteredBy ?? null,
        valid_until: q.validUntil ?? null,
        ...(q.previous?.[key]
          ? {
              previous_unit_price: q.previous[key]!.price,
              previous_prices_include_tax: q.includesTax === undefined ? false : q.includesTax,
              previous_submitted_at: q.previous[key]!.at,
              previous_quote_version_id: `${q.supplier}-v0`,
              price_cut_per_unit: Math.round((q.previous[key]!.price - q.prices[key]!) * 10000) / 10000,
              price_cut_percent: Math.round(((q.previous[key]!.price - q.prices[key]!) / q.previous[key]!.price) * 1000) / 10,
            }
          : {}),
      }))
      .sort((a, b) => a.unit_price! - b.unit_price!)
  const matrix = opts.lines.map((l) => {
    const offers = offersFor(l.key, l.qty)
    const cheapest = offers.filter((o) => o.unit_price === offers[0]?.unit_price)
    return { line_key: l.key, offers, best_supplier_id: cheapest.length === 1 ? cheapest[0]!.supplier_id : null }
  })
  return {
    booklet: { id: opts.id, reference: opts.reference, title: opts.title, quote_deadline: opts.deadline, created_at: hoursAgo(120) },
    waves: opts.waves.map((w) => ({ wave_number: w.n, rfq_id: rfq(w.n), status: w.status, invites: w.invites, created_at: hoursAgo(100 - w.n) })),
    lines: opts.lines.map((l, i) => ({
      line_key: l.key,
      position: i + 1,
      name_ar: l.name,
      ...(l.market ? { market_name_ar: l.market } : {}),
      quantity: l.qty,
      uom: l.uom,
    })),
    suppliers: opts.quotes.map((q) => ({
      supplier_id: q.supplier,
      name: q.name,
      waves: [q.wave ?? 1],
      quoted: true,
      quote_submitted_at: q.at,
      quote_total: null,
      currency: 'SAR',
      rfq_id: rfq(q.wave ?? 1),
    })),
    matrix,
    summary: {
      unique_suppliers_invited: opts.waves.reduce((s, w) => s + w.invites, 0),
      replies: opts.quotes.length,
      quotes: opts.quotes.length,
      lines_with_quotes: matrix.filter((m) => m.offers.length).length,
      lines_total: opts.lines.length,
      best_full_booklet: null,
    },
  }
}

export const PR580: ConstructionBookletDetail = booklet({
  id: 'b-580',
  reference: 'PR-580',
  title: 'مواد البلوك والعزل — مبنى الخدمات',
  deadline: '2026-09-29T20:59:00Z',
  waves: [
    { n: 1, status: 'SENT', invites: 10 },
    { n: 2, status: 'SENT', invites: 10 },
  ],
  lines: [
    { key: 'pr580-1', name: 'بلوك خرساني مصمت مقاس 15 سم', market: 'بلوك 15 سم', qty: 3000, uom: 'حبة' },
    { key: 'pr580-2', name: 'ألواح فوم مقاوم للحريق سماكة 5 سم', market: 'فوم مقاوم للحريق', qty: 200, uom: 'لوح' },
    { key: 'pr580-3', name: 'عزل فوم بولي يوريثان بالرش', market: 'فوم بخاخ', qty: 20, uom: 'علبة' },
    { key: 'pr580-4', name: 'قناة تعليق معدنية أوميجا للأسقف', market: 'جسر أوميجا', qty: 500, uom: 'حبة' },
    { key: 'pr580-5', name: 'قناة تعليق رئيسية مقطع C', market: 'جسر رئيسي C', qty: 500, uom: 'حبة' },
    { key: 'pr580-6', name: 'لاصق بلوك جاهز', market: 'غراء أبو جمل', qty: 100, uom: 'كيس' },
  ],
  quotes: [
    { supplier: 's1', name: 'مؤسسة الركن المتين', prices: { 'pr580-1': 1.7, 'pr580-2': 38, 'pr580-6': 24 }, at: hoursAgo(5), validUntil: '2026-09-30T20:59:00Z',
      previous: { 'pr580-1': { price: 1.85, at: hoursAgo(48) } } },
    { supplier: 's2', name: 'مصنع بلوك الوادي', prices: { 'pr580-1': 1.75 }, at: hoursAgo(9), includesTax: true },
    { supplier: 's3', name: 'شركة أساس للمواد', prices: { 'pr580-1': 1.8, 'pr580-2': 41.5 }, at: hoursAgo(30) },
    { supplier: 's4', name: 'مؤسسة البنيان', prices: { 'pr580-1': 1.85 }, at: hoursAgo(40), enteredBy: 'FARQ_FROM_CHAT', includesTax: null, wave: 2 },
    { supplier: 's5', name: 'مصنع الخرسانة الأولى', prices: { 'pr580-1': 1.9 }, at: hoursAgo(50) },
    { supplier: 's6', name: 'مؤسسة الصرح', prices: { 'pr580-1': 1.95, 'pr580-3': 62 }, at: hoursAgo(60), wave: 2 },
    { supplier: 's7', name: 'شركة لبنة', prices: { 'pr580-1': 2 }, at: hoursAgo(70) },
  ],
})

export const PRH288: ConstructionBookletDetail = booklet({
  id: 'b-h288',
  reference: 'PR-H288',
  title: 'مواسير EMT وملحقاتها — أعمال الكهرباء',
  deadline: '2026-10-02T20:59:00Z',
  waves: [
    { n: 1, status: 'SENT', invites: 8 },
    { n: 2, status: 'SENT', invites: 6 },
    { n: 3, status: 'CANCELLED', invites: 2 },
  ],
  lines: [
    { key: 'pr288-1', name: 'أنبوب معدني EMT قطر 20 مم طول 3 م', market: 'ماسورة EMT ¾', qty: 300, uom: 'حبة' },
    { key: 'pr288-2', name: 'أنبوب معدني EMT قطر 25 مم طول 3 م', market: 'ماسورة EMT 1', qty: 200, uom: 'حبة' },
    { key: 'pr288-3', name: 'أنبوب معدني EMT قطر 32 مم طول 3 م', qty: 100, uom: 'حبة' },
    { key: 'pr288-4', name: 'وصلة EMT قطر 20 مم', market: 'كوبلن EMT ¾', qty: 600, uom: 'حبة' },
    { key: 'pr288-5', name: 'وصلة EMT قطر 25 مم', qty: 400, uom: 'حبة' },
    { key: 'pr288-6', name: 'رابط علبة EMT قطر 20 مم', market: 'كونكتر EMT ¾', qty: 600, uom: 'حبة' },
    { key: 'pr288-7', name: 'مشبك تثبيت EMT قطر 20 مم', market: 'كلبس EMT ¾', qty: 1000, uom: 'حبة' },
    { key: 'pr288-8', name: 'فيشر بلاستيك 8 مم', qty: 2000, uom: 'حبة' },
    { key: 'pr288-9', name: 'برغي خشب 8 مم × 50 مم', market: 'برغي 8×50', qty: 2000, uom: 'حبة' },
  ],
  quotes: [
    { supplier: 'e1', name: 'مؤسسة التيار للكهرباء', prices: { 'pr288-1': 18, 'pr288-2': 23.1, 'pr288-4': 0.85, 'pr288-6': 0.9, 'pr288-7': 0.35 }, at: hoursAgo(3) },
    { supplier: 'e2', name: 'شركة النور الكهربائية', prices: { 'pr288-1': 19.5, 'pr288-3': 31, 'pr288-4': 0.95, 'pr288-5': 1.2, 'pr288-7': 0.4, 'pr288-8': 1 }, at: hoursAgo(20), enteredBy: 'FARQ_FROM_CHAT', wave: 2,
      previous: { 'pr288-8': { price: 1.2, at: hoursAgo(70) } } },
    { supplier: 'e3', name: 'مؤسسة الوصل', prices: { 'pr288-1': 21, 'pr288-2': 24.5, 'pr288-3': 33.4, 'pr288-4': 1.1, 'pr288-5': 1.35, 'pr288-6': 1.05, 'pr288-7': 0.42 }, at: hoursAgo(45), includesTax: true,
      previous: { 'pr288-2': { price: 26, at: hoursAgo(90) } } },
  ],
})

export const FIXTURE_BOOKLETS = [PRH288, PR580]
