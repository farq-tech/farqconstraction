import type { ConstructionEmailLinkTargets } from '../api/constructionClient'

export type UnresolvedLinkSupplier = ConstructionEmailLinkTargets['requests'][number]['suppliers'][number]

/** A sealed RFQ can appear as a historical candidate, but cannot accept a new link. */
export function isLinkableArrivalSupplier(supplier: UnresolvedLinkSupplier): boolean {
  return supplier.locked !== true
}

/** Auto-select only a single suggested supplier that the server says can be linked. */
export function uniqueSuggestedLinkSupplier(
  suppliers: readonly UnresolvedLinkSupplier[],
): UnresolvedLinkSupplier | null {
  const suggested = suppliers.filter((supplier) => supplier.suggested && isLinkableArrivalSupplier(supplier))
  return suggested.length === 1 ? suggested[0]! : null
}
