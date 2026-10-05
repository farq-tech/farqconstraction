import { describe, expect, it } from 'vitest'
import type { BOQItem } from '../types'
import {
  ANY_BRAND_TEXT,
  appendToCart,
  cartCountLabel,
  editCartLine,
  lineFromProduct,
  linesFromManualText,
  linesToMatch,
  mergeMatched,
  parseManualLine,
  quickSheetFor,
  quotaLabel,
  removeCartLine,
  safeImageUrl,
  type ProductCard,
} from './rfqCart'
import { buildRfqLinesFromItems } from './rfqPackages'

const ariston: ProductCard = {
  id: 'c1',
  name: 'سخان مياه أريستون 80 لتر',
  name_en: 'Ariston Pro1 Eco 80L',
  line_name_ar: 'سخان مياه كهربائي 80 لتر',
  brand: 'Ariston',
  model: 'PRO1 ECO 80 V',
  specs: [
    { label: 'السعة', value: '80 لتر' },
    { label: 'القدرة', value: '1500 واط' },
  ],
  spec_hints: { material: 'خزان مطلي بالمينا' },
  image_url: 'https://www.ariston.com/img/pro1.jpg',
  source: { name: 'Ariston', url: 'https://www.ariston.com/sa/pro1-eco-80' },
}

const bookletLine = (id: number, suppliers = 2): BOQItem => ({
  id,
  name: `بند كراسة ${id}`,
  qty: '10',
  unit: 'عدد',
  status: suppliers ? 'ready' : 'searching',
  supplierCount: suppliers,
  suppliers: Array.from({ length: suppliers }, (_, i) => ({ id: `s${id}-${i}`, name: 'مورد', city: 'الرياض', evidence: 'من الكتالوج', channel: 'بريد' })),
  lineKey: `line-${id}`,
})

describe('product card → cart line', () => {
  it('«أضف هذا المنتج» keeps brand and model in the spec and spec card', () => {
    const sheet = { ...quickSheetFor(ariston, 'product'), qty: '٦', saleUnits: [{ unit: 'CARTON' as const, pack_size: 2 }], notes: 'مع صمام أمان' }
    const line = lineFromProduct(ariston, 'product', sheet)
    expect(line.name).toBe('سخان مياه كهربائي 80 لتر')
    expect(line.qty).toBe('6')
    expect(line.spec).toBe('العلامة: Ariston · الموديل: PRO1 ECO 80 V · السعة: 80 لتر · القدرة: 1500 واط')
    expect(line.specCard).toEqual({
      brand: 'Ariston',
      material: 'خزان مطلي بالمينا',
      notes: 'مع صمام أمان',
      sale_units: [{ unit: 'CARTON', pack_size: 2 }],
      reference_photo_url: 'https://www.ariston.com/img/pro1.jpg',
    })
    expect(line.origin).toBe('search')
    expect(line.needsMatch).toBe(true)
    expect(line.productRef).toMatchObject({ brand: 'Ariston', model: 'PRO1 ECO 80 V', sourceName: 'Ariston' })
  })

  it('«استخدم مواصفاته فقط» drops brand and model and asks for any matching brand', () => {
    const line = lineFromProduct(ariston, 'spec-only', quickSheetFor(ariston, 'spec-only'))
    expect(line.spec).toBe(`السعة: 80 لتر · القدرة: 1500 واط · ${ANY_BRAND_TEXT}`)
    expect(line.spec).not.toMatch(/Ariston|PRO1/)
    expect(line.specCard?.brand).toBeUndefined()
    expect(line.specCard?.any_approved_brand).toBe(true)
    expect(line.specCard?.reference_photo_url).toBeUndefined()
    expect(line.productRef?.genericOnly).toBe(true)
    expect(line.productRef?.brand).toBeUndefined()
  })

  it('never carries a price into the request lines', () => {
    const withPrice = { ...ariston, price: '499 SAR' } as unknown as ProductCard
    const line = lineFromProduct(withPrice, 'product', quickSheetFor(withPrice, 'product'))
    const cart = appendToCart([bookletLine(1)], [line])
    const payload = buildRfqLinesFromItems(cart)
    expect(JSON.stringify(payload)).not.toMatch(/499|SAR|price/i)
    expect(JSON.stringify(payload)).not.toMatch(/ariston\.com\/sa/) // the store page is not sent, only the photo
    expect(payload[1]).toMatchObject({ line_key: 'line-2', name_ar: 'سخان مياه كهربائي 80 لتر', quantity: 1, uom: 'عدد' })
    expect(payload[1]!.spec_card?.brand).toBe('Ariston')
  })

  it('only https images are kept', () => {
    expect(safeImageUrl('http://x.com/a.jpg')).toBeUndefined()
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeImageUrl('https://x.com/a.jpg')).toBe('https://x.com/a.jpg')
    const line = lineFromProduct({ ...ariston, image_url: 'http://x.com/a.jpg' }, 'product', quickSheetFor({ ...ariston, image_url: 'http://x.com/a.jpg' }, 'product'))
    expect(line.productRef?.imageUrl).toBeUndefined()
    expect(line.specCard?.reference_photo_url).toBeUndefined()
  })
})

describe('typed lines', () => {
  it('reads the quantity first and a unit word after it', () => {
    expect(parseManualLine('6 سخانات كهربائية 80 لتر')).toEqual({ qty: '6', unit: 'عدد', name: 'سخانات كهربائية 80 لتر' })
    expect(parseManualLine('٢٠ كيس أسمنت مقاوم')).toEqual({ qty: '20', unit: 'كيس', name: 'أسمنت مقاوم' })
    expect(parseManualLine('3 كرتون بلاط 60×60')).toEqual({ qty: '3', unit: 'كرتون', name: 'بلاط 60×60' })
    expect(parseManualLine('سخان 80 لتر')).toEqual({ qty: '1', unit: 'عدد', name: 'سخان 80 لتر' })
    expect(parseManualLine('  ')).toBeNull()
  })
  it('one line per row, marked as typed', () => {
    const lines = linesFromManualText('6 سخانات كهربائية 80 لتر\n\n20 كيس أسمنت')
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.origin === 'manual' && l.needsMatch)).toBe(true)
  })
})

describe('one cart, mixed sources', () => {
  it('40 booklet lines + 2 searched + 1 typed: numbering continues, any line edits or goes', () => {
    const booklet = Array.from({ length: 40 }, (_, i) => bookletLine(i + 1))
    let cart = appendToCart(booklet, [
      lineFromProduct(ariston, 'product', quickSheetFor(ariston, 'product')),
      lineFromProduct(ariston, 'spec-only', quickSheetFor(ariston, 'spec-only')),
      ...linesFromManualText('6 سخانات كهربائية 80 لتر'),
    ])
    expect(cart.map((i) => i.id).slice(-3)).toEqual([41, 42, 43])
    expect(cart.at(-1)!.lineKey).toBe('line-43')
    expect(cartCountLabel(cart.length)).toBe('43 بندًا')
    // Only what is new is matched.
    expect(linesToMatch(cart).map((l) => l.id)).toEqual([41, 42, 43])
    // A quantity edit keeps a booklet line's match; a name edit re-matches it.
    cart = editCartLine(cart, 3, { qty: '15' })
    expect(cart[2]).toMatchObject({ qty: '15', supplierCount: 2 })
    expect(cart[2]!.needsMatch).toBeUndefined()
    cart = editCartLine(cart, 5, { name: 'ماسورة PPR 32 مم' })
    expect(cart[4]!.needsMatch).toBe(true)
    cart = removeCartLine(cart, 42)
    expect(cart).toHaveLength(42)
    expect(linesToMatch(cart).map((l) => l.id)).toEqual([5, 41, 43])
  })

  it('the match is folded back without losing what the buyer set', () => {
    const cart = appendToCart([bookletLine(1)], [lineFromProduct(ariston, 'product', quickSheetFor(ariston, 'product'))])
    const matched: BOQItem[] = [{ ...bookletLine(2, 3), name: 'x' }]
    const merged = mergeMatched(cart, matched)
    expect(merged[0]).toBe(cart[0])
    expect(merged[1]).toMatchObject({ supplierCount: 3, status: 'ready', origin: 'search', name: 'سخان مياه كهربائي 80 لتر' })
    expect(merged[1]!.specCard?.brand).toBe('Ariston')
    expect(merged[1]!.needsMatch).toBeUndefined()
  })

  it('counts in Arabic', () => {
    expect(cartCountLabel(1)).toBe('بند واحد')
    expect(cartCountLabel(2)).toBe('بندان')
    expect(cartCountLabel(3)).toBe('3 بنود')
  })
})

describe('quotaLabel — «عمليات البحث اليوم»', () => {
  it('shows what is left of the 1,500 a day', () => {
    expect(quotaLabel({ used: 68, limit: 1500, remaining: 1432 })).toBe('عمليات البحث اليوم: 1,432 متبقية من 1,500')
    expect(quotaLabel({ used: 1500, limit: 1500, remaining: 0 })).toBe('عمليات البحث اليوم: 0 متبقية من 1,500')
    expect(quotaLabel(null)).toBe('')
  })
})
