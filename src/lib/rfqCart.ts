/**
 * «طلبك» — one cart for a request, whatever the lines came from.
 *
 * A booklet read, products found with «ابحث عن منتج», a pasted product link and
 * lines typed by hand are all BOQItems in the same session list, and all of
 * them go through the same supplier selection and the same send. Nothing here
 * creates a second request path.
 *
 * The internet gives a line its IDENTITY — name, brand, model, image, specs.
 * It never gives a price: a product card carries none, and nothing built here
 * has a field for one.
 */
import type { BOQItem } from '../types'
import type { ParsedLine } from './parseBoq'
import { cleanSpecCard, type SaleUnit, type SpecCard } from './specCard'

/** A product card as POST /api/construction/product-search returns it. */
export type ProductCard = {
  id: string
  name: string
  name_en?: string
  /** The generic Arabic name a supplier uses, with size and without brand. */
  line_name_ar: string
  brand: string
  model: string
  sku?: string
  category?: string
  specs: Array<{ label: string; value: string }>
  spec_hints?: { material?: string; finish?: string; dimensions?: string; standard?: string }
  image_url: string | null
  source: { name: string; url: string | null } | null
}

export type ProductSearchStatus =
  | 'OK'
  | 'EMPTY'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_QUERY'
  | 'GLOBAL_DAILY_LIMIT'

/** The company-wide daily search allowance (1,500 a day), shown as «عمليات البحث اليوم». */
export type ProductSearchQuota = { used: number; limit: number; remaining: number; enabled?: boolean }

export type ProductSearchResult = {
  status: ProductSearchStatus
  query: string
  mode?: 'SEARCH' | 'URL'
  cards: ProductCard[]
  cached?: boolean
  message_ar?: string
  quota?: ProductSearchQuota
}

/** «عمليات البحث اليوم: 1,432 متبقية من 1,500». */
export function quotaLabel(q: ProductSearchQuota | null | undefined): string {
  if (!q || !(q.limit > 0)) return ''
  const n = (v: number) => Math.max(0, Math.round(v)).toLocaleString('en-US')
  return `عمليات البحث اليوم: ${n(q.remaining)} متبقية من ${n(q.limit)}`
}

/** «أضف هذا المنتج» keeps the brand and model; «استخدم مواصفاته فقط» asks for any matching brand. */
export type AddMode = 'product' | 'spec-only'

/** The quick sheet: what the buyer fills after choosing a product. */
export type QuickSheet = {
  qty: string
  unit: string
  saleUnits: Array<{ unit: SaleUnit; pack_size?: number }>
  brand: string
  anyApprovedBrand: boolean
  standard: string
  dimensions: string
  thickness: string
  length: string
  material: string
  finish: string
  photoUrl: string
  notes: string
}

export const ANY_BRAND_TEXT = 'أي علامة مطابقة للمواصفات'

const clean = (value: unknown, max = 240): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : ''

/** An https image link or nothing: an http image is mixed content, anything else unsafe. */
export function safeImageUrl(value: unknown): string | undefined {
  const raw = clean(value, 600)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** The quick sheet, prefilled from a card and the chosen mode. */
export function quickSheetFor(card: ProductCard, mode: AddMode): QuickSheet {
  const hints = card.spec_hints || {}
  return {
    qty: '1',
    unit: 'عدد',
    saleUnits: [],
    brand: mode === 'product' ? clean(card.brand, 160) : '',
    anyApprovedBrand: mode === 'spec-only',
    standard: clean(hints.standard, 160),
    dimensions: clean(hints.dimensions, 160),
    thickness: '',
    length: '',
    material: clean(hints.material, 160),
    finish: clean(hints.finish, 160),
    photoUrl: mode === 'product' ? safeImageUrl(card.image_url) || '' : '',
    notes: '',
  }
}

/** The line's description as the supplier reads it: model (when kept) and key specs. */
export function productSpecText(card: ProductCard, mode: AddMode): string {
  const parts: string[] = []
  if (mode === 'product') {
    if (card.brand) parts.push(`العلامة: ${clean(card.brand, 60)}`)
    if (card.model) parts.push(`الموديل: ${clean(card.model, 60)}`)
    else if (card.sku) parts.push(`رقم الصنف: ${clean(card.sku, 60)}`)
  }
  for (const s of card.specs || []) {
    const label = clean(s.label, 40)
    const value = clean(s.value, 100)
    if (label && value) parts.push(`${label}: ${value}`)
  }
  if (mode === 'spec-only') parts.push(ANY_BRAND_TEXT)
  return parts.join(' · ').slice(0, 900)
}

function specCardFromSheet(sheet: QuickSheet): SpecCard | undefined {
  return cleanSpecCard({
    brand: sheet.anyApprovedBrand ? undefined : sheet.brand,
    any_approved_brand: sheet.anyApprovedBrand || undefined,
    standard: sheet.standard,
    dimensions: sheet.dimensions,
    thickness: sheet.thickness,
    length: sheet.length,
    material: sheet.material,
    finish: sheet.finish,
    sale_units: sheet.saleUnits,
    reference_photo_url: sheet.photoUrl,
    notes: sheet.notes,
  })
}

/** A positive quantity as text, or '1'. Arabic digits are read. */
export function cleanQty(value: string): string {
  const ascii = String(value || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,،٬\s]/g, '')
  const n = Number(ascii)
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000) : '1'
}

/** A cart line from a product card. No price field exists to fill. */
export function lineFromProduct(
  card: ProductCard,
  mode: AddMode,
  sheet: QuickSheet,
  origin: 'search' | 'url' = 'search',
): Omit<BOQItem, 'id'> {
  const name = clean(card.line_name_ar, 200) || clean(card.name, 200)
  return {
    name,
    qty: cleanQty(sheet.qty),
    unit: clean(sheet.unit, 40) || 'عدد',
    spec: productSpecText(card, mode) || undefined,
    status: 'searching',
    supplierCount: 0,
    suppliers: [],
    origin,
    needsMatch: true,
    specCard: specCardFromSheet(sheet),
    productRef: {
      ...(mode === 'product' && card.brand ? { brand: clean(card.brand, 60) } : {}),
      ...(mode === 'product' && (card.model || card.sku) ? { model: clean(card.model || card.sku, 60) } : {}),
      ...(safeImageUrl(card.image_url) ? { imageUrl: safeImageUrl(card.image_url) } : {}),
      ...(card.source?.name ? { sourceName: clean(card.source.name, 60) } : {}),
      ...(card.source?.url && /^https:\/\//i.test(card.source.url) ? { sourceUrl: card.source.url } : {}),
      ...(mode === 'spec-only' ? { genericOnly: true } : {}),
    },
  }
}

const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(?:حبه|حبة|حبات|حبّات)$/, 'حبة'],
  [/^(?:عدد)$/, 'عدد'],
  [/^(?:قطعه|قطعة|قطع)$/, 'قطعة'],
  [/^(?:كرتون|كراتين|كرتونة|كرتونه)$/, 'كرتون'],
  [/^(?:علبه|علبة|علب)$/, 'علبة'],
  [/^(?:كيس|أكياس|اكياس)$/, 'كيس'],
  [/^(?:لفه|لفة|لفات)$/, 'لفة'],
  [/^(?:طن|أطنان|اطنان)$/, 'طن'],
  [/^(?:متر|أمتار|امتار|م)$/, 'متر'],
  [/^(?:طول|أطوال|اطوال)$/, 'طول'],
  [/^(?:طقم|أطقم|اطقم)$/, 'طقم'],
  [/^(?:جهاز|أجهزة|اجهزة)$/, 'جهاز'],
  [/^(?:م2|م²|م٢)$/, 'م²'],
  [/^(?:م3|م³|م٣)$/, 'م³'],
]

/**
 * «6 سخانات كهربائية 80 لتر» → 6 · عدد · «سخانات كهربائية 80 لتر».
 * A leading number is the quantity; a unit word right after it is the unit.
 * Without a leading number the quantity is 1 and every word stays in the name.
 */
export function parseManualLine(text: string): { qty: string; unit: string; name: string } | null {
  const raw = String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*[x×*]?\s+(.+)$/i)
  if (!m) return raw.length >= 2 ? { qty: '1', unit: 'عدد', name: raw.slice(0, 240) } : null
  let rest = m[2]!.trim()
  let unit = 'عدد'
  const [first, ...others] = rest.split(' ')
  const hit = UNIT_WORDS.find(([re]) => re.test(first || ''))
  if (hit && others.length) {
    unit = hit[1]
    rest = others.join(' ')
  }
  if (rest.length < 2) return null
  return { qty: cleanQty(m[1]!.replace(',', '.')), unit, name: rest.slice(0, 240) }
}

/** Typed lines, one per row, as cart lines. */
export function linesFromManualText(text: string): Array<Omit<BOQItem, 'id'>> {
  return String(text || '')
    .split(/\r?\n/)
    .map(parseManualLine)
    .filter((x): x is NonNullable<ReturnType<typeof parseManualLine>> => Boolean(x))
    .slice(0, 200)
    .map((p) => ({
      name: p.name,
      qty: p.qty,
      unit: p.unit,
      status: 'searching' as const,
      supplierCount: 0,
      suppliers: [],
      origin: 'manual' as const,
      needsMatch: true,
    }))
}

/** Ids continue after the highest in the cart, so a booklet's numbering is never reused. */
export function appendToCart(items: BOQItem[], added: Array<Omit<BOQItem, 'id'>>): BOQItem[] {
  let next = items.reduce((max, i) => Math.max(max, Number(i.id) || 0), 0)
  return [
    ...items,
    ...added.map((line) => {
      next += 1
      return { ...line, id: next, lineKey: `line-${next}` } as BOQItem
    }),
  ]
}

/**
 * An edit to a line. A change to what the line IS (name or description)
 * sends it back to supplier matching; quantity and unit do not.
 */
export function editCartLine(
  items: BOQItem[],
  id: number,
  patch: Partial<Pick<BOQItem, 'name' | 'qty' | 'unit' | 'spec' | 'specCard'>>,
): BOQItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const next = { ...item, ...patch }
    if (patch.qty !== undefined) next.qty = cleanQty(patch.qty)
    if (patch.name !== undefined) next.name = clean(patch.name, 240) || item.name
    const identityChanged =
      (patch.name !== undefined && next.name !== item.name) || (patch.spec !== undefined && (patch.spec || '') !== (item.spec || ''))
    return identityChanged ? { ...next, needsMatch: true } : next
  })
}

export function removeCartLine(items: BOQItem[], id: number): BOQItem[] {
  return items.filter((item) => item.id !== id)
}

/** Lines still to be matched with suppliers, as the matcher takes them. */
export function linesToMatch(items: BOQItem[]): ParsedLine[] {
  return items
    .filter((item) => item.needsMatch)
    .map((item) => ({ id: item.id, name: item.name, qty: item.qty, unit: item.unit, spec: item.spec }))
}

/**
 * The matcher's answer folded back into the cart. What the buyer set (spec
 * card, origin, product reference, market name) is kept; a line the matcher
 * did not answer keeps its place and stays «بلا مورد».
 */
export function mergeMatched(items: BOQItem[], matched: BOQItem[]): BOQItem[] {
  const byId = new Map(matched.map((m) => [m.id, m]))
  return items.map((item) => {
    if (!item.needsMatch) return item
    const m = byId.get(item.id)
    const base = { ...item, needsMatch: undefined }
    if (!m) return base
    return {
      ...base,
      status: m.status,
      supplierCount: m.supplierCount,
      suppliers: m.suppliers,
      farqSpecId: m.farqSpecId,
      lineKey: m.lineKey || item.lineKey,
      outcomeSuggestion: m.outcomeSuggestion,
      exposureId: m.exposureId,
      autoPickedSupplierIds: [],
      aiSuggestion: m.aiSuggestion,
      learnedSuggestion: m.learnedSuggestion,
      familySuggestion: m.familySuggestion,
      mapSuggestion: m.mapSuggestion,
    }
  })
}

/** «طلبك — 1 بند / بندان / 3 بنود / 11 بندًا». */
export function cartCountLabel(n: number): string {
  if (n === 1) return 'بند واحد'
  if (n === 2) return 'بندان'
  if (n >= 3 && n <= 10) return `${n} بنود`
  return `${n} بندًا`
}

/** An id for a request that did not start from a booklet, so it is stored like one. */
export function newCartDocumentId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(16).slice(2) + Date.now().toString(16)
  return `cart-${rand.slice(0, 24)}`
}
