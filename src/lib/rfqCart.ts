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

/** An explicit buyer action takes the line out of review-required mode. */
export function markSupplierSelectionManual(item: BOQItem): BOQItem {
  return { ...item, supplierSelectionMode: 'MANUAL' }
}

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
  const ascii = String(value || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[,،٬\s]/g, '')
    .replace('٫', '.')
  const n = Number(ascii)
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000) : '1'
}

export function validCartQuantity(value: string): boolean {
  const ascii = String(value)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[,،٬\s]/g, '')
    .replace('٫', '.')
  const n = Number(ascii)
  return Number.isFinite(n) && n > 0 && Math.round(n * 1000) > 0
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
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const m = raw.match(/^([\d٠-٩۰-۹٬٫,.'’\u066B\u066C]+)\s*[x×*]?\s+(.+)$/i)
  if (!m) return raw.length >= 2 ? { qty: '1', unit: 'عدد', name: raw.slice(0, 240) } : null
  const quantity = normalizeManualQuantity(m[1]!)
  if (!quantity) return raw.length >= 2 ? { qty: '1', unit: 'عدد', name: raw.slice(0, 240) } : null
  let rest = m[2]!.trim()
  let unit = 'عدد'
  const [first, ...others] = rest.split(' ')
  const hit = UNIT_WORDS.find(([re]) => re.test(first || ''))
  if (hit && others.length) {
    unit = hit[1]
    rest = others.join(' ')
  }
  if (rest.length < 2) return null
  return { qty: cleanQty(quantity), unit, name: rest.slice(0, 240) }
}

/** Normalize grouped quantities before validation without treating 1,200 as 1.2. */
function normalizeManualQuantity(value: string): string | null {
  let ascii = value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[’']/g, '')
    .replace(/[\u00a0\u202f\s]/g, '')
  ascii = ascii.replace(/٬/g, ',').replace(/٫|\u066B/g, '.')
  const group = (s: string) => /^\d{1,3}(?:,\d{3})+$/.test(s)
  if (ascii.includes('.')) {
    const [integer, ...fraction] = ascii.split('.')
    if (fraction.length !== 1 || !/^\d+$/.test(fraction[0] || '') || !integer) return null
    if (integer.includes(',') && !group(integer)) return null
    ascii = `${integer.replace(/,/g, '')}.${fraction[0]}`
  } else if (ascii.includes(',')) {
    if (group(ascii)) ascii = ascii.replace(/,/g, '')
    else if (/^\d+,\d+$/.test(ascii)) ascii = ascii.replace(',', '.')
    else return null
  }
  return /^\d+(?:\.\d+)?$/.test(ascii) && validCartQuantity(ascii) ? ascii : null
}

type ManualColumn = 'serial' | 'description' | 'quantity' | 'unit' | 'ignore'
type ManualColumns = { quantity: number; description: number; unit: number | null; other: number[] }

function manualColumn(header: string): ManualColumn | null {
  const value = header.trim().toLocaleLowerCase().replace(/[.:#]/g, '').replace(/\s+/g, ' ')
  if (['الكمية', 'كمية', 'العدد', 'qty', 'quantity', "q'ty"].includes(value)) return 'quantity'
  if (['الوحدة', 'وحدة', 'unit', 'uom'].includes(value)) return 'unit'
  if (['البند', 'اسم البند', 'الوصف', 'وصف', 'الصنف', 'اسم الصنف', 'المادة', 'اسم المادة', 'المنتج', 'اسم المنتج', 'item', 'items', 'item name', 'description', 'product', 'product name', 'material', 'name'].includes(value)) return 'description'
  if (['رقم', 'الرقم', 'رقم البند', 'رقم الصنف', 'الرقم التسلسلي', 'مسلسل', 'المسلسل', 'serial', 'no', 'number', 'line no', 'line number', 'item no', 'item number', 'item code', 'code', 'sku', 'الكود', 'كود'].includes(value)) return 'serial'
  if (['السعر', 'سعر', 'سعر الوحدة', 'السعر الإفرادي', 'price', 'unit price', 'amount', 'total', 'cost'].includes(value)) return 'ignore'
  return null
}

function manualColumnsFromHeader(cells: string[]): ManualColumns | null {
  const kinds = cells.map(manualColumn)
  const quantity = kinds.indexOf('quantity')
  const description = kinds.indexOf('description')
  if (quantity < 0 || description < 0) return null
  return {
    quantity,
    description,
    unit: kinds.indexOf('unit') >= 0 ? kinds.indexOf('unit') : null,
    other: kinds.flatMap((kind, index) => kind == null && index !== quantity && index !== description ? [index] : []),
  }
}

function quantityCell(value: string): boolean {
  return normalizeManualQuantity(value) != null
}

function manualLineFromCells(cells: string[], columns?: ManualColumns | null): ReturnType<typeof parseManualLine> {
  if (columns) {
    const rawQty = cells[columns.quantity] || ''
    const description = cells[columns.description] || ''
    if (!quantityCell(rawQty) || description.trim().length < 2) return null
    const extra = columns.other.map((index) => cells[index] || '').filter(Boolean)
    const name = [description, ...extra].join(' ').replace(/\s+/g, ' ').trim()
    const quantity = normalizeManualQuantity(rawQty)
    if (!quantity) return null
    return {
      qty: cleanQty(quantity),
      unit: columns.unit == null ? 'عدد' : clean(cells[columns.unit], 40) || 'عدد',
      name: name.slice(0, 240),
    }
  }
  const quantityIndex = cells.findIndex(quantityCell)
  const unitIndex = cells.findIndex((cell, index) => index !== quantityIndex && UNIT_WORDS.some(([re]) => re.test(cell.trim())))
  const inferredUnitIndex = unitIndex >= 0
    ? unitIndex
    : cells.length === 3 && quantityIndex === 1
      ? 2
      : cells.length === 3 && quantityIndex === 2
        ? 0
        : cells.length === 3 && quantityIndex === 0
          ? 2
          : -1
  const name = cells
    .filter((_, index) => index !== quantityIndex && index !== inferredUnitIndex)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (quantityIndex >= 0) {
    if (name.length < 2) return null
    const rawQty = normalizeManualQuantity(cells[quantityIndex]!)
    if (!rawQty) return null
    return {
      qty: cleanQty(rawQty),
      unit: inferredUnitIndex >= 0
        ? UNIT_WORDS.find(([re]) => re.test(cells[inferredUnitIndex]!.trim()))?.[1] || clean(cells[inferredUnitIndex], 40) || 'عدد'
        : 'عدد',
      name: name.slice(0, 240),
    }
  }
  if (unitIndex >= 0 && name.length >= 2) {
    return { qty: '1', unit: UNIT_WORDS.find(([re]) => re.test(cells[unitIndex]!.trim()))?.[1] || clean(cells[unitIndex], 40) || 'عدد', name: name.slice(0, 240) }
  }
  return parseManualLine(cells.filter(Boolean).join(' '))
}

export type ManualLinesResult = {
  /** At most 200 valid lines; callers should block adding while overLimit > 0. */
  lines: Array<Omit<BOQItem, 'id'>>
  validCount: number
  invalidRows: number
  headerRows: number
  overLimit: number
}

/** Parse typed lines and tab-delimited rows pasted from a spreadsheet. */
export function parseManualText(text: string): ManualLinesResult {
  let invalidRows = 0
  let headerRows = 0
  let columns: ManualColumns | null = null
  const parsed = String(text || '').split(/\r?\n/).flatMap((row) => {
    if (!row.trim()) return []
    if (row.includes('\t')) {
      const cells = row.split('\t').map((cell) => cell.trim())
      const headerColumns = manualColumnsFromHeader(cells)
      if (headerColumns) {
        headerRows += 1
        columns = headerColumns
        return []
      }
      const line = manualLineFromCells(cells, columns)
      if (!line) invalidRows += 1
      return line ? [line] : []
    }
    const line = parseManualLine(row)
    if (!line) invalidRows += 1
    return line ? [line] : []
  })
  const overLimit = Math.max(0, parsed.length - 200)
  const lines = parsed.slice(0, 200).map((p) => ({
      name: p.name,
      qty: p.qty,
      unit: p.unit,
      status: 'searching' as const,
      supplierCount: 0,
      suppliers: [],
      origin: 'manual' as const,
      needsMatch: true,
    }))
  return { lines, validCount: parsed.length, invalidRows, headerRows, overLimit }
}

/** Typed lines, one per row, as cart lines. */
export function linesFromManualText(text: string): Array<Omit<BOQItem, 'id'>> {
  return parseManualText(text).lines
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
  if (patch.qty !== undefined && !validCartQuantity(patch.qty)) throw new Error('اكتب كمية أكبر من صفر.')
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

function specCardIdentity(card: BOQItem['specCard']): string {
  if (!card) return ''
  return JSON.stringify([
    card.brand?.trim() || '',
    card.any_approved_brand === true,
    card.standard?.trim() || '',
    card.grade?.trim() || '',
    card.dimensions?.trim() || '',
    card.thickness?.trim() || '',
    card.length?.trim() || '',
    card.material?.trim() || '',
    card.finish?.trim() || '',
    [...(card.sale_units || [])]
      .map((unit) => ({ unit: unit.unit, pack_size: unit.pack_size ?? null }))
      .sort((a, b) => a.unit.localeCompare(b.unit) || Number(a.pack_size || 0) - Number(b.pack_size || 0)),
    card.notes?.trim() || '',
    card.reference_photo_url?.trim() || '',
    [...(card.reference_photo_urls || [])].sort(),
    card.reference_photos_reviewed === true,
  ])
}

/** Whether the line's supplier-facing material requirements changed. */
export function lineSupplierRequirementChanged(
  before: Pick<BOQItem, 'name' | 'spec' | 'specCard'>,
  after: Pick<BOQItem, 'name' | 'spec' | 'specCard'>,
): boolean {
  return before.name !== after.name
    || (before.spec || '') !== (after.spec || '')
    || specCardIdentity(before.specCard) !== specCardIdentity(after.specCard)
}

/** Drop a line's old supplier ticks when its material identity changes. */
export function clearSelectionAfterIdentityEdit(
  selections: Record<number, string[]>,
  id: number,
  before: Pick<BOQItem, 'name' | 'spec' | 'specCard'> | undefined,
  after: Pick<BOQItem, 'name' | 'spec' | 'specCard'> | undefined,
): Record<number, string[]> {
  if (!before || !after || !selections[id]?.length) return selections
  if (!lineSupplierRequirementChanged(before, after)) return selections
  const next = { ...selections }
  delete next[id]
  return next
}

export function removeCartLine(items: BOQItem[], id: number): BOQItem[] {
  return items.filter((item) => item.id !== id)
}

/** Lines still to be matched with suppliers, as the matcher takes them. */
export function linesToMatch(items: BOQItem[]): ParsedLine[] {
  return items
    .filter((item) => item.needsMatch || item.matchFailed)
    .map((item) => ({ id: item.id, name: item.name, qty: item.qty, unit: item.unit, spec: item.spec }))
}

/** A response is safe to apply only while its document and line identity still match. */
export function lineMatchStillCurrent(
  currentDocumentId: string | null | undefined,
  expectedDocumentId: string | null | undefined,
  current: Pick<BOQItem, 'id' | 'name' | 'spec'> | undefined,
  expected: Pick<BOQItem, 'id' | 'name' | 'spec'>,
): boolean {
  return Boolean(
    currentDocumentId === expectedDocumentId && current &&
    current.id === expected.id && current.name === expected.name && (current.spec || '') === (expected.spec || ''),
  )
}

/**
 * The matcher's answer folded back into the cart. What the buyer set (spec
 * card, origin, product reference, market name) is kept; a line the matcher
 * did not answer keeps its place and stays «بلا مورد».
 */
export function mergeMatched(items: BOQItem[], matched: BOQItem[], retainedSelections: Record<number, string[]> = {}): BOQItem[] {
  const byId = new Map(matched.map((m) => [m.id, m]))
  return items.map((item) => {
    if (!item.needsMatch && !item.matchFailed) return item
    const m = byId.get(item.id)
    const base = { ...item, needsMatch: undefined }
    // A retry may cover only one row. Keep every other pending row eligible.
    if (!m) return item
    const rejected = new Set(item.rejectedSupplierIds || [])
    const automatic = new Set(item.autoPickedSupplierIds || [])
    const retained = new Set((retainedSelections[item.id] || []).filter(id => !automatic.has(id) && !rejected.has(id)))
    const matchedIds = new Set(m.suppliers.map(s => s.id))
    const suppliers = [...m.suppliers.filter(s => !rejected.has(s.id)), ...item.suppliers.filter(s => retained.has(s.id) && !matchedIds.has(s.id))]
    return {
      ...base,
      status: suppliers.length ? 'ready' : m.status,
      supplierCount: suppliers.length,
      suppliers,
      farqSpecId: m.farqSpecId,
      workOnly: m.workOnly,
      matchFailed: m.matchFailed,
      needsMatch: m.matchFailed || undefined,
      lineKey: m.lineKey || item.lineKey,
      outcomeSuggestion: m.outcomeSuggestion,
      fitReviewSuggestion: m.fitReviewSuggestion,
      exposureId: m.exposureId,
      autoPickedSupplierIds: [],
      aiSuggestion: m.aiSuggestion,
      learnedSuggestion: m.learnedSuggestion,
      preferredSuggestion: m.preferredSuggestion,
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
