/**
 * Per-company branding for pages a company prints or shows its management
 * (the reports first). Keyed by the company's scope owner — the user id every
 * buyer of that company is scoped to (`/api/construction/me` →
 * `scope_owner_user_id`). A company not listed here shows the Farq wordmark.
 *
 * This map is the only place a company's identity is written down: add a
 * company by adding its logo under public/brand/ and one entry here.
 */
export type CompanyBrand = {
  nameAr: string
  nameEn: string
  /** A transparent image served from public/. */
  logo: string
}

const COMPANY_BRANDS: Readonly<Record<string, CompanyBrand>> = {
  // شركة الدفع للتجارة والمقاولات — logo from aldafe.com (their official site).
  '44cdaadd-e084-4654-a84b-a95e6c920580': {
    nameAr: 'شركة الدفع للتجارة والمقاولات',
    nameEn: 'Al-Dafe Trading & Contracting',
    logo: '/brand/company-al-dafe.png',
  },
}

export function companyBrand(scopeOwnerUserId: string | null | undefined): CompanyBrand | null {
  const key = String(scopeOwnerUserId || '').trim().toLowerCase()
  return (key && COMPANY_BRANDS[key]) || null
}
