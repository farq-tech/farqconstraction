import { describe, expect, it } from 'vitest'
import { companyBrand } from './companyBranding'

describe('companyBrand', () => {
  it('shows شركة الدفع logo only for its own scope owner', () => {
    expect(companyBrand('44cdaadd-e084-4654-a84b-a95e6c920580')?.logo).toBe('/brand/company-al-dafe.png')
    expect(companyBrand('44CDAADD-E084-4654-A84B-A95E6C920580')?.nameEn).toBe('Al-Dafe Trading & Contracting')
  })
  it('falls back (null → Farq wordmark) for any other company or no scope', () => {
    expect(companyBrand('00000000-0000-4000-8000-000000000001')).toBeNull()
    expect(companyBrand(null)).toBeNull()
    expect(companyBrand('')).toBeNull()
  })
})
