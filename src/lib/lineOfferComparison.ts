import type { ConstructionComparison } from '../api/constructionClient'

export type ComparisonMatrix = NonNullable<ConstructionComparison['quote_matrix']>
export type ComparisonLine = ComparisonMatrix['lines'][number]
export type ComparisonCell = ComparisonLine['offers'][number]
export type LineAnalysis = {
  priced: ComparisonCell[]
  comparable: boolean
  reason: string | null
  lowestSupplierIds: string[]
  minimum: number | null
  maximum: number | null
  gap: number | null
  gapPercent: number | null
}
const validAmount = (value: unknown) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
export function isComparablePrice(cell?: ComparisonCell): boolean {
  return Boolean(cell && cell.status === 'PRICED' && (cell as ComparisonCell & { price_review?: unknown }).price_review == null && validAmount(cell.unit_price) && validAmount(cell.line_total))
}

/** Only equivalent, valid prices compete. Equal lowest prices share the badge. */
export function analyzeComparisonLine(line: ComparisonLine): LineAnalysis {
  const priced = line.offers.filter(isComparablePrice)
  const empty: LineAnalysis = { priced, comparable: false, reason: null, lowestSupplierIds: [], minimum: null, maximum: null, gap: null, gapPercent: null }
  if (!priced.length) return { ...empty, reason: 'لا توجد أسعار مكتملة للمقارنة' }
  if (priced.some((cell) => cell.quantity == null || !Number.isFinite(Number(cell.quantity)) || Math.abs(Number(cell.quantity) - line.quantity) > 0.000001)) return { ...empty, reason: 'كميات العروض تختلف عن كمية البند؛ راجعها أولًا' }
  if (priced.some((cell) => Math.abs(Number(cell.unit_price) * line.quantity - Number(cell.line_total)) > 0.015)) return { ...empty, reason: 'سعر الوحدة وإجمالي البند غير متوافقين؛ راجع العرض' }
  if (priced.length === 1) return { ...empty, reason: 'عرض واحد فقط؛ لا يوجد سعر آخر للمقارنة' }
  if (priced.some((cell) => typeof cell.prices_include_tax !== 'boolean')) return { ...empty, reason: 'أساس الضريبة غير محدد؛ راجعه قبل المقارنة' }
  if (new Set(priced.map((cell) => cell.prices_include_tax)).size > 1) return { ...empty, reason: 'الأسعار تختلف في شمول الضريبة' }
  if (priced.some((cell) => !cell.currency?.trim()) || new Set(priced.map((cell) => cell.currency.trim().toUpperCase())).size > 1) return { ...empty, reason: 'العملات غير موحدة؛ لا يمكن تحديد الأقل' }
  const minimum = Math.min(...priced.map((cell) => Number(cell.line_total)))
  const maximum = Math.max(...priced.map((cell) => Number(cell.line_total)))
  return { priced, comparable: true, reason: null, lowestSupplierIds: priced.filter((cell) => Number(cell.line_total) === minimum).map((cell) => cell.supplier_id), minimum, maximum, gap: maximum - minimum, gapPercent: minimum > 0 ? ((maximum - minimum) / minimum) * 100 : null }
}

export function priceDifference(cell: ComparisonCell, analysis: LineAnalysis, basis: 'unit' | 'total') {
  if (!analysis.comparable || !isComparablePrice(cell) || analysis.minimum == null) return null
  const minimum = basis === 'unit' ? Math.min(...analysis.priced.map((offer) => Number(offer.unit_price))) : analysis.minimum
  const difference = Math.max(0, Number(basis === 'unit' ? cell.unit_price : cell.line_total) - minimum)
  return { amount: difference, percent: minimum > 0 ? (difference / minimum) * 100 : null }
}
