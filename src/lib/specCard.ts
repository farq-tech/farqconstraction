/**
 * «بطاقة المواصفة» (per line) and «الموقع والتوريد» (per request).
 *
 * Suppliers stalled on the same questions in 245 real threads: which district
 * and where is the pin, delivery or pickup, cash or transfer, which brand,
 * what thickness and length, a photo, and whether a box of 100 is fine where we
 * wrote «حبة». These are the fields that answer them before they are asked.
 * The API (api/lib/construction/rfq-spec-card.js) validates and stores them in
 * the request's version payload; an empty card sends nothing.
 */

export type SaleUnit = 'PIECE' | 'BOX' | 'CARTON' | 'CAN' | 'LENGTH' | 'ROLL' | 'BAG'

export type SpecCard = {
  brand?: string
  any_approved_brand?: boolean
  standard?: string
  grade?: string
  dimensions?: string
  thickness?: string
  length?: string
  material?: string
  finish?: string
  sale_units?: Array<{ unit: SaleUnit; pack_size?: number }>
  reference_photo_url?: string
  notes?: string
}

export type DeliveryMode = 'DELIVERY_TO_SITE' | 'PICKUP' | 'EITHER'
export type Shipping = 'IN_PRICE' | 'SEPARATE'
export type PaymentTermsCode = 'ADVANCE_TRANSFER' | 'TRANSFER_ON_DELIVERY' | 'CASH_ON_DELIVERY' | 'CREDIT' | 'OTHER'

export const SALE_UNITS: Array<{ value: SaleUnit; label: string; pack: boolean }> = [
  { value: 'PIECE', label: 'حبة', pack: false },
  { value: 'BOX', label: 'علبة', pack: true },
  { value: 'CARTON', label: 'كرتون', pack: true },
  { value: 'CAN', label: 'علبة بخاخ', pack: true },
  { value: 'LENGTH', label: 'طول', pack: true },
  { value: 'ROLL', label: 'لفة', pack: true },
  { value: 'BAG', label: 'كيس', pack: true },
]

export const DELIVERY_MODES: Array<{ value: DeliveryMode; label: string }> = [
  { value: 'DELIVERY_TO_SITE', label: 'توصيل للموقع' },
  { value: 'PICKUP', label: 'استلام من المورد' },
  { value: 'EITHER', label: 'الاثنين مقبول' },
]

export const SHIPPING_OPTIONS: Array<{ value: Shipping; label: string }> = [
  { value: 'IN_PRICE', label: 'التوصيل داخل السعر' },
  { value: 'SEPARATE', label: 'تكلفة التوصيل لحالها' },
]

export const PAYMENT_TERMS: Array<{ value: PaymentTermsCode; label: string }> = [
  { value: 'ADVANCE_TRANSFER', label: 'تحويل بنكي مقدّم' },
  { value: 'TRANSFER_ON_DELIVERY', label: 'تحويل بنكي عند الاستلام' },
  { value: 'CASH_ON_DELIVERY', label: 'كاش عند الاستلام' },
  { value: 'CREDIT', label: 'آجل' },
  { value: 'OTHER', label: 'أخرى' },
]

export const SALE_UNIT_NOTE = 'نقبل السعر بالوحدة اللي تبيع فيها (علبة/كرتون) مع ذكر العدد'

const clean = (value: unknown, max = 160): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : ''

/** A http(s) link, or null. Never javascript:/data:. */
export function validLink(value: string | null | undefined): string | null {
  const raw = clean(value, 500)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** The card as the API takes it: trimmed, bad links dropped; undefined when nothing is filled. */
export function cleanSpecCard(card: SpecCard | null | undefined): SpecCard | undefined {
  if (!card) return undefined
  const out: SpecCard = {}
  for (const key of ['brand', 'standard', 'dimensions', 'material', 'finish'] as const) {
    const v = clean(card[key])
    if (v) out[key] = v
  }
  for (const key of ['grade', 'thickness', 'length'] as const) {
    const v = clean(card[key], 80)
    if (v) out[key] = v
  }
  const notes = clean(card.notes, 300)
  if (notes) out.notes = notes
  if (card.any_approved_brand) out.any_approved_brand = true
  const units = (card.sale_units || [])
    .filter((u) => SALE_UNITS.some((s) => s.value === u.unit))
    .map((u) => {
      const pack = Number(u.pack_size)
      return u.unit !== 'PIECE' && Number.isInteger(pack) && pack >= 1 ? { unit: u.unit, pack_size: pack } : { unit: u.unit }
    })
    .slice(0, 5)
  if (units.length) out.sale_units = units
  const photo = validLink(card.reference_photo_url)
  if (photo) out.reference_photo_url = photo
  return Object.keys(out).length ? out : undefined
}

export function saleUnitLabel(unit: { unit: string; pack_size?: number | null }): string {
  const found = SALE_UNITS.find((s) => s.value === unit.unit)
  if (!found) return ''
  return found.pack && unit.pack_size ? `${found.label} ${unit.pack_size}` : found.label
}

/** One line of text for a card, the way the supplier reads it. */
export function specCardSummary(card: SpecCard | null | undefined): string {
  if (!card) return ''
  const parts: string[] = []
  if (card.brand) parts.push(`الماركة: ${card.brand}${card.any_approved_brand ? ' أو ما يعادلها' : ''}`)
  else if (card.any_approved_brand) parts.push('أي ماركة معتمدة')
  if (card.standard) parts.push(`الاعتماد: ${card.standard}`)
  if (card.grade) parts.push(`الدرجة: ${card.grade}`)
  if (card.dimensions) parts.push(`المقاس: ${card.dimensions}`)
  if (card.thickness) parts.push(`السماكة: ${card.thickness}`)
  if (card.length) parts.push(`الطول: ${card.length}`)
  if (card.material) parts.push(`الخامة: ${card.material}`)
  if (card.finish) parts.push(`التشطيب: ${card.finish}`)
  const units = (card.sale_units || []).map(saleUnitLabel).filter(Boolean)
  if (units.length) parts.push(`وحدة البيع: ${units.join(' أو ')}`)
  if (card.notes) parts.push(card.notes)
  return parts.join(' • ')
}

export type SiteSupply = {
  district: string
  mapUrl: string
  deliveryMode: DeliveryMode | ''
  shipping: Shipping | ''
  paymentCode: PaymentTermsCode | ''
  creditDays: string
  paymentNote: string
}

export const EMPTY_SITE_SUPPLY: SiteSupply = {
  district: '',
  mapUrl: '',
  deliveryMode: '',
  shipping: '',
  paymentCode: '',
  creditDays: '',
  paymentNote: '',
}

/** What blocks sending in «الموقع والتوريد»: only malformed input, never an empty optional field. */
export function siteSupplyProblems(site: SiteSupply): string[] {
  const problems: string[] = []
  if (clean(site.mapUrl) && !validLink(site.mapUrl)) problems.push('رابط الموقع على الخريطة غير صحيح — الصق رابط قوقل ماب كامل.')
  if (site.paymentCode === 'CREDIT') {
    const days = Number(site.creditDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) problems.push('حدّد عدد أيام الآجل (من 1 إلى 365).')
  }
  if (site.paymentCode === 'OTHER' && !clean(site.paymentNote)) problems.push('اكتب شروط الدفع.')
  return problems
}

/** The delivery and commercial_terms additions for the create-request body. */
export function siteSupplyPayload(site: SiteSupply): {
  delivery: Record<string, string>
  commercial_terms: Record<string, string | number>
} {
  const delivery: Record<string, string> = {}
  const district = clean(site.district, 80)
  if (district) delivery.district = district
  const map = validLink(site.mapUrl)
  if (map) delivery.map_url = map
  if (site.deliveryMode) delivery.mode = site.deliveryMode
  if (site.shipping) delivery.shipping = site.shipping
  const terms: Record<string, string | number> = {}
  if (site.paymentCode) {
    terms.payment_terms_code = site.paymentCode
    terms.payment_terms = site.paymentCode
    if (site.paymentCode === 'CREDIT') terms.credit_days = Number(site.creditDays)
  }
  const note = clean(site.paymentNote)
  if (note) terms.payment_terms_note = note
  return { delivery, commercial_terms: terms }
}

/** A price per sale unit as a price per requested unit, as the API computes it. */
export function perUnitFromSaleUnit(price: number, packSize: number): number | null {
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(packSize) || packSize < 1) return null
  return Math.round((price / packSize + Number.EPSILON) * 1e6) / 1e6
}

/** «الموقع والتوريد» of a stored request as short Arabic facts; [] for an old request. */
export function storedSiteSupplyFacts(payload: {
  delivery?: Record<string, unknown>
  commercial_terms?: Record<string, unknown>
}): string[] {
  const d = payload.delivery || {}
  const t = payload.commercial_terms || {}
  const facts: string[] = []
  const district = clean(d.district)
  if (district) facts.push(district)
  const mode = DELIVERY_MODES.find((m) => m.value === d.mode)
  if (mode) facts.push(mode.label)
  const shipping = SHIPPING_OPTIONS.find((m) => m.value === d.shipping)
  if (shipping) facts.push(shipping.label)
  const pay = PAYMENT_TERMS.find((m) => m.value === t.payment_terms_code)
  if (pay) {
    const days = Number(t.credit_days)
    const base = pay.value === 'CREDIT' && days ? `آجل ${days} يوم` : pay.value === 'OTHER' ? clean(t.payment_terms_note) || pay.label : pay.label
    facts.push(`الدفع: ${base}`)
  }
  return facts
}
