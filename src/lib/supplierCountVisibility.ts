/** Presentation only: dispatch records and procurement calculations stay exact. */
export const COMPANY_SUPPLIER_COUNT_LIMIT = 200
export function supplierCountForDisplay(actual: number, canViewActual = false): number {
  const count = Number.isFinite(actual) ? Math.max(0, Math.floor(actual)) : 0
  return canViewActual ? count : Math.min(count, COMPANY_SUPPLIER_COUNT_LIMIT)
}
export function supplierCountIsLimited(actual: number, canViewActual = false): boolean {
  return !canViewActual && actual > COMPANY_SUPPLIER_COUNT_LIMIT
}
