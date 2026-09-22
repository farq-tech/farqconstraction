/**
 * Taseer is for individuals. The product brand is FARQ TASEER / فرق تسعير
 * under فارك تكنولوجي. Client-company lockups (including شركة الدفع) are
 * not shown on this product.
 */
export type AccountBrand = { name: string; mark: string; logo: string; aspect: string }

export function accountBrand(_accountId?: string | null): AccountBrand | null {
  return null
}
