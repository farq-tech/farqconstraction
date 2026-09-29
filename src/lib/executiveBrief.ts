import type { ConstructionComparison } from '../api/constructionClient'

/**
 * The numbers behind «العرض التنفيذي» — the management presentation of every
 * line that suppliers priced, compared side by side.
 *
 * Only PRICED cells count. A price held for review, an unavailable line or a
 * line the supplier skipped is never the lowest and never in a spread: the
 * same rule the request file's own comparison follows. Nothing here estimates.
 */

export type BriefOffer = {
  supplierId: string
  supplierName: string
  unitPrice: number
  lineTotal: number | null
  /** true = includes VAT, false = excludes it, null = the supplier did not say. */
  includesTax: boolean | null
}

export type BriefLine = {
  rfqId: string
  projectTitle: string
  lineId: string
  name: string
  quantity: number
  uom: string
  currency: string
  /** Cheapest first. */
  offers: BriefOffer[]
  lowest: BriefOffer
  highest: BriefOffer
  /** (highest − lowest) unit price × quantity. 0 with a single offer. */
  spreadValue: number
  /** highest / lowest − 1, as a percent; null with a single offer. */
  spreadPercent: number | null
  /** Offers on this line do not share one VAT basis, so the gap may be partly tax. */
  mixedTaxBasis: boolean
}

export type BriefSupplier = {
  id: string
  name: string
  /** Lines this supplier priced. */
  priced: number
  /** Lines where this supplier is the cheapest of two or more offers. */
  wins: number
  /** Sum of this supplier's line totals (unit × requested quantity when absent). */
  offeredValue: number
}

export type BriefProject = { rfqId: string; title: string; lines: BriefLine[] }

export type ExecutiveBrief = {
  projects: BriefProject[]
  lines: BriefLine[]
  suppliers: BriefSupplier[]
  pricedLines: number
  comparedLines: number
  pricesReceived: number
  /** Σ lowest unit × quantity over every priced line. */
  lowestBasket: number
  /** Σ highest unit × quantity over the lines with two or more offers. */
  spreadTotal: number
  currency: string
}

function finite(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function supplierNames(comparison: ConstructionComparison, fallback: ReadonlyMap<string, string>): Map<string, string> {
  const names = new Map<string, string>()
  for (const r of comparison.supplier_responses || []) {
    const id = String(r.supplier?.id || '')
    const name = String(r.supplier?.name_ar || r.supplier?.name_en || '').trim()
    if (id && name) names.set(id, name)
  }
  for (const [id, name] of fallback) if (!names.has(id) && name) names.set(id, name)
  return names
}

/** One project's priced lines, from its comparison matrix. */
export function briefLinesFromComparison(
  comparison: ConstructionComparison,
  projectTitle: string,
  fallbackNames: ReadonlyMap<string, string> = new Map(),
): BriefLine[] {
  const matrix = comparison.quote_matrix
  if (!matrix) return []
  const names = supplierNames(comparison, fallbackNames)
  const rfqId = String(comparison.rfq?.id || '')
  const out: BriefLine[] = []
  for (const line of matrix.lines || []) {
    const quantity = finite(line.quantity) ?? 0
    const offers: BriefOffer[] = []
    let currency = 'SAR'
    for (const cell of line.offers || []) {
      if (cell.status !== 'PRICED' || cell.price_review) continue
      const unit = finite(cell.unit_price)
      if (unit == null || unit <= 0) continue
      currency = cell.currency || currency
      offers.push({
        supplierId: cell.supplier_id,
        supplierName: names.get(cell.supplier_id) || 'مورد',
        unitPrice: unit,
        lineTotal: finite(cell.line_total),
        includesTax: cell.prices_include_tax ?? null,
      })
    }
    if (!offers.length) continue
    offers.sort((a, b) => a.unitPrice - b.unitPrice)
    const lowest = offers[0]
    const highest = offers[offers.length - 1]
    const bases = new Set(offers.map((o) => String(o.includesTax)))
    out.push({
      rfqId,
      projectTitle,
      lineId: line.id,
      name: String(line.market_name_ar || line.name_ar || line.name_en || 'بند').trim(),
      quantity,
      uom: String(line.uom || ''),
      currency,
      offers,
      lowest,
      highest,
      spreadValue: offers.length > 1 ? (highest.unitPrice - lowest.unitPrice) * quantity : 0,
      spreadPercent: offers.length > 1 ? Math.round((highest.unitPrice / lowest.unitPrice - 1) * 1000) / 10 : null,
      mixedTaxBasis: bases.size > 1,
    })
  }
  return out
}

export function buildExecutiveBrief(projects: BriefProject[]): ExecutiveBrief {
  const lines = projects.flatMap((p) => p.lines)
  const suppliers = new Map<string, BriefSupplier>()
  let lowestBasket = 0
  let spreadTotal = 0
  let pricesReceived = 0
  let comparedLines = 0
  for (const line of lines) {
    pricesReceived += line.offers.length
    lowestBasket += line.lowest.unitPrice * line.quantity
    if (line.offers.length > 1) {
      comparedLines += 1
      spreadTotal += line.spreadValue
    }
    for (const offer of line.offers) {
      const row = suppliers.get(offer.supplierId) || { id: offer.supplierId, name: offer.supplierName, priced: 0, wins: 0, offeredValue: 0 }
      row.priced += 1
      row.offeredValue += offer.lineTotal ?? offer.unitPrice * line.quantity
      suppliers.set(offer.supplierId, row)
    }
    // A single offer is not a win: nothing was beaten.
    if (line.offers.length > 1) {
      const cheapest = line.offers.filter((o) => o.unitPrice === line.lowest.unitPrice)
      if (cheapest.length === 1) suppliers.get(cheapest[0].supplierId)!.wins += 1
    }
  }
  return {
    projects: projects.filter((p) => p.lines.length),
    lines,
    suppliers: [...suppliers.values()].sort((a, b) => b.wins - a.wins || b.priced - a.priced),
    pricedLines: lines.length,
    comparedLines,
    pricesReceived,
    lowestBasket,
    spreadTotal,
    currency: lines[0]?.currency || 'SAR',
  }
}

/** Lines ranked by what choosing the lowest over the highest is worth. */
export function topSpreadLines(brief: ExecutiveBrief, limit = 8): BriefLine[] {
  return brief.lines
    .filter((l) => l.offers.length > 1 && l.spreadValue > 0)
    .sort((a, b) => b.spreadValue - a.spreadValue)
    .slice(0, limit)
}
