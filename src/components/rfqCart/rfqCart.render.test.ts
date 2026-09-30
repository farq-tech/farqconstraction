/**
 * Rendered-markup checks (no DOM: react-dom/server) for «كيف تبي تبدأ طلب
 * التسعير؟», the product card, the quick sheet and «طلبك».
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BOQItem } from '../../types'
import { appendToCart, lineFromProduct, quickSheetFor, type ProductCard } from '../../lib/rfqCart'
import StartChooser from './StartChooser'
import { ProductCardView } from './ProductSearchPanel'
import QuickAddSheet from './QuickAddSheet'
import CartPanel from './CartPanel'

const card: ProductCard = {
  id: 'c1',
  name: 'سخان مياه أريستون 80 لتر',
  line_name_ar: 'سخان مياه كهربائي 80 لتر',
  brand: 'Ariston',
  model: 'PRO1 ECO 80 V',
  specs: [{ label: 'السعة', value: '80 لتر' }],
  image_url: 'https://www.ariston.com/img/pro1.jpg',
  source: { name: 'Ariston', url: 'https://www.ariston.com/sa/pro1-eco-80' },
}
const noop = () => {}

describe('StartChooser', () => {
  it('offers the three ways in, with the owner’s wording', () => {
    const html = renderToStaticMarkup(createElement(StartChooser, { active: null, onChoose: noop }))
    expect(html).toContain('كيف تبي تبدأ طلب التسعير؟')
    expect(html).toContain('ارفع كراسة')
    expect(html).toContain('ابحث عن منتج')
    expect(html).toContain('ابحث بالاسم أو الموديل وأضفه للطلب')
    expect(html).toContain('اكتب البنود يدويًا')
    expect(html).toContain('مثال: 6 سخانات كهربائية 80 لتر')
    expect(html.match(/data-path=/g)).toHaveLength(3)
  })
  it('marks the open path', () => {
    const html = renderToStaticMarkup(createElement(StartChooser, { active: 'search', onChoose: noop }))
    expect(html).toMatch(/aria-pressed="true" data-path="search"|data-path="search" aria-pressed="true"/)
  })
})

describe('ProductCardView', () => {
  it('shows identity and both actions, and never a price', () => {
    const html = renderToStaticMarkup(createElement(ProductCardView, { card: { ...card, price: '499 SAR' } as ProductCard, onChoose: noop }))
    expect(html).toContain('سخان مياه أريستون 80 لتر')
    expect(html).toContain('Ariston · PRO1 ECO 80 V')
    expect(html).toContain('السعة: 80 لتر')
    expect(html).toContain('أضف هذا المنتج')
    expect(html).toContain('استخدم مواصفاته فقط')
    expect(html).toMatch(/referrerpolicy="no-referrer"/i)
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).not.toMatch(/499|SAR|ريال/)
  })
  it('refuses an http image', () => {
    const html = renderToStaticMarkup(createElement(ProductCardView, { card: { ...card, image_url: 'http://x.com/a.jpg' }, onChoose: noop }))
    expect(html).not.toContain('<img')
    expect(html).toContain('بلا صورة')
  })
})

describe('QuickAddSheet', () => {
  it('asks quantity, unit, sale units with pack size, brand and notes', () => {
    const html = renderToStaticMarkup(
      createElement(QuickAddSheet, { card, mode: 'product', initial: quickSheetFor(card, 'product'), onCancel: noop, onConfirm: noop }),
    )
    for (const text of ['الكمية', 'الوحدة', 'يقبل المورد البيع بـ', 'كرتون', 'علبة', 'العلامة التجارية', 'ملاحظات', 'أضف للطلب']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('value="Ariston"')
  })
  it('spec-only: no brand field, «أي علامة مطابقة للمواصفات»', () => {
    const html = renderToStaticMarkup(
      createElement(QuickAddSheet, { card, mode: 'spec-only', initial: quickSheetFor(card, 'spec-only'), onCancel: noop, onConfirm: noop }),
    )
    expect(html).not.toContain('العلامة التجارية')
    expect(html).toContain('أي علامة مطابقة للمواصفات')
  })
})

describe('CartPanel', () => {
  const booklet: BOQItem = { id: 1, name: 'ماسورة PPR 32 مم', qty: '40', unit: 'طول', status: 'ready', supplierCount: 3, suppliers: [] }
  const items = appendToCart([booklet], [lineFromProduct(card, 'product', quickSheetFor(card, 'product'))])
  it('«طلبك — N بنود» with every line editable and removable, one CTA', () => {
    const html = renderToStaticMarkup(
      createElement(CartPanel, { items, busy: false, error: '', onEdit: noop, onRemove: noop, onContinue: noop }),
    )
    expect(html).toContain('طلبك — بندان')
    expect(html.match(/data-action="edit"/g)).toHaveLength(2)
    expect(html.match(/data-action="remove"/g)).toHaveLength(2)
    expect(html.match(/data-action="continue"/g)).toHaveLength(1)
    expect(html).toContain('متابعة لاختيار الموردين')
    expect(html).toContain('من الكراسة')
    expect(html).toContain('من البحث')
    expect(html).toContain('نطابق الموردين عند المتابعة')
    expect(html).toContain('الماركة: Ariston')
  })
  it('empty: says how to start and cannot continue', () => {
    const html = renderToStaticMarkup(
      createElement(CartPanel, { items: [], busy: false, error: '', onEdit: noop, onRemove: noop, onContinue: noop }),
    )
    expect(html).toContain('طلبك فاضي')
    expect(html).toMatch(/disabled=""[^>]*data-action="continue"|data-action="continue"[^>]*disabled=""/)
  })
})
