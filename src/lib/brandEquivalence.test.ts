import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_BRAND_DRAFT,
  brandChipText,
  brandDraftFromLine,
  brandFieldsFromDraft,
  brandFromLine,
  candidatePriceText,
  certificationChipText,
  confidenceLabel,
  datasheetHint,
  draftHasBrand,
  hiddenCandidatesLabel,
  isServiceDisabledError,
  PRICE_UNKNOWN_TEXT,
  referenceText,
  savingText,
  missingAttrsText,
  requestedBrandHint,
  savingNoteText,
  showAlternative,
  type EquivalenceCandidate,
} from './brandEquivalence'
import BrandChips from '../components/brand/BrandChips'
import { ConstructionApiError } from '../api/constructionClient'

describe('brandFieldsFromDraft', () => {
  it('sends nothing for an untouched draft', () => {
    expect(brandFieldsFromDraft(EMPTY_BRAND_DRAFT)).toEqual({})
    expect(brandFieldsFromDraft(null)).toEqual({})
    expect(brandFieldsFromDraft({ offeredBrand: '   ', isEquivalent: null })).toEqual({})
  })
  it('trims, keeps what was filled, and keeps an explicit false', () => {
    expect(
      brandFieldsFromDraft({
        offeredBrand: ' ITCC ',
        originCountry: 'السعودية',
        isEquivalent: false,
        certification: ' SASO ',
        datasheetFile: 'https://x.sa/d.pdf',
      }),
    ).toEqual({
      offered_brand: 'ITCC',
      origin_country: 'السعودية',
      is_equivalent: false,
      certification: 'SASO',
      datasheet_file: 'https://x.sa/d.pdf',
    })
  })
  it('drops a datasheet that is not https, without touching the rest', () => {
    expect(brandFieldsFromDraft({ offeredBrand: 'ABB', datasheetFile: 'http://x.sa/d.pdf' })).toEqual({ offered_brand: 'ABB' })
    expect(brandFieldsFromDraft({ datasheetFile: 'www.x.sa' })).toEqual({})
  })
  it('caps lengths to the API limits', () => {
    const out = brandFieldsFromDraft({ offeredBrand: 'a'.repeat(100), originCountry: 'b'.repeat(70), certification: 'c'.repeat(130) })
    expect(out.offered_brand).toHaveLength(80)
    expect(out.origin_country).toHaveLength(60)
    expect(out.certification).toHaveLength(120)
    expect(brandFieldsFromDraft({ datasheetFile: `https://x.sa/${'d'.repeat(300)}` })).toEqual({})
  })
})

describe('pre-fill from the current quote', () => {
  it('reads stored fields back into a draft', () => {
    const line = { line_id: 'l1', offered_brand: 'ITCC', origin_country: null, is_equivalent: true, certification: 'UL 797' }
    expect(brandFromLine(line)).toEqual({ offered_brand: 'ITCC', is_equivalent: true, certification: 'UL 797' })
    expect(brandDraftFromLine(line)).toEqual({
      offeredBrand: 'ITCC',
      originCountry: '',
      isEquivalent: true,
      certification: 'UL 797',
      datasheetFile: '',
    })
    expect(draftHasBrand(brandDraftFromLine(line))).toBe(true)
  })
  it('an old quote without the fields gives an empty draft', () => {
    expect(brandFromLine({ line_id: 'l1', unit_price: 5 })).toBeNull()
    expect(brandDraftFromLine(undefined)).toEqual(EMPTY_BRAND_DRAFT)
    expect(draftHasBrand(EMPTY_BRAND_DRAFT)).toBe(false)
  })
})

describe('display text', () => {
  it('brand chip: brand · origin, either alone, or nothing', () => {
    expect(brandChipText({ offered_brand: 'ITCC', origin_country: 'السعودية' })).toBe('ITCC · السعودية')
    expect(brandChipText({ origin_country: 'الصين' })).toBe('الصين')
    expect(brandChipText({ certification: 'SASO' })).toBeNull()
    expect(brandChipText(null)).toBeNull()
    expect(certificationChipText({ certification: 'IEC 60364' })).toBe('IEC 60364')
  })
  it('«بديل» only for an explicit true', () => {
    expect(showAlternative(true)).toBe(true)
    expect(showAlternative(false)).toBe(false)
    expect(showAlternative(undefined)).toBe(false)
  })
  it('saving note rounds the percent and stays silent without a saving', () => {
    const saving = {
      percent: 18.6,
      requested_unit_price: 100,
      equivalent_unit_price: 81.4,
      requested_brand: 'ABB',
      equivalent_brand: 'ITCC',
      equivalent_supplier_id: 's2',
      requested_supplier_id: 's1',
    }
    expect(savingNoteText(saving)).toBe('أرخص بديل مكافئ: 19% أقل من الماركة المطلوبة')
    expect(savingNoteText(null)).toBeNull()
    expect(savingNoteText(undefined)).toBeNull()
    expect(savingNoteText({ ...saving, percent: 0.2 })).toBeNull()
  })
  it('requested brand hint', () => {
    expect(requestedBrandHint('ABB')).toBe('الماركة المطلوبة: ABB')
    expect(requestedBrandHint('ABB', true)).toBe('الماركة المطلوبة: ABB (أو ما يعادلها)')
    expect(requestedBrandHint(null, true)).toBeNull()
  })
  it('datasheet hint is soft and only for a non-https link', () => {
    expect(datasheetHint('')).toBeNull()
    expect(datasheetHint('https://x.sa/a.pdf')).toBeNull()
    expect(datasheetHint('x.sa/a.pdf')).toContain('https://')
  })
})

describe('equivalents panel helpers', () => {
  const candidate: EquivalenceCandidate = {
    product_id: 'p1',
    brand: 'ITCC',
    product: 'قاطع 32 أمبير',
    product_en: null,
    matched_attrs: [{ key: 'amp', label_ar: 'التيار', value: '32A' }],
    missing_attrs: [
      { key: 'poles', label_ar: 'الأقطاب', value: null },
      { key: 'ka', label_ar: 'سعة القطع', value: null },
    ],
    confidence: 'NEEDS_CONFIRMATION',
    confidence_score: 0.6,
    best_price: 42.5,
    price_source: 'SUPPLIER_QUOTE',
    price_source_ar: 'عرض مورد',
    price_includes_vat: false,
    supplier: { name_ar: 'مؤسسة النور' },
    price_observed_at: null,
    standard: null,
    origin_country: null,
    datasheet_url: null,
    source_url: null,
  }
  it('labels confidence and missing attributes', () => {
    expect(confidenceLabel('HIGH')).toBe('مكافئ مؤكد المواصفات')
    expect(confidenceLabel('NEEDS_CONFIRMATION')).toBe('يحتاج تأكيد')
    expect(missingAttrsText(candidate.missing_attrs)).toBe('يحتاج تأكيد: الأقطاب، سعة القطع')
    expect(missingAttrsText([])).toBeNull()
  })
  it('price text names the source and the supplier', () => {
    expect(candidatePriceText(candidate)).toBe('42.5 ر.س · عرض مورد · مؤسسة النور · غير شامل الضريبة')
    expect(candidatePriceText({ ...candidate, best_price: null })).toBeNull()
  })
  it('recognises the «service off» refusal only', () => {
    expect(isServiceDisabledError(new ConstructionApiError('x', 403, 'CONSTRUCTION_SERVICE_DISABLED'))).toBe(true)
    expect(isServiceDisabledError(new ConstructionApiError('x', 403, 'CONSTRUCTION_FORBIDDEN'))).toBe(false)
    expect(isServiceDisabledError(null)).toBe(false)
  })
})

describe('BrandChips', () => {
  it('renders nothing when the fields are absent', () => {
    expect(renderToStaticMarkup(createElement(BrandChips, { brand: null }))).toBe('')
    expect(renderToStaticMarkup(createElement(BrandChips, { brand: undefined, alternative: false }))).toBe('')
  })
  it('shows brand · origin, certification, «بديل» and an https datasheet', () => {
    const html = renderToStaticMarkup(
      createElement(BrandChips, {
        brand: { offered_brand: 'ITCC', origin_country: 'السعودية', certification: 'SASO', datasheet_file: 'https://x.sa/d.pdf' },
        alternative: true,
      }),
    )
    expect(html).toContain('ITCC · السعودية')
    expect(html).toContain('SASO')
    expect(html).toContain('بديل')
    expect(html).toContain('href="https://x.sa/d.pdf"')
  })
})

describe('«بدائل مكافئة» — saving and held-back alternatives', () => {
  it('shows the expected saving only when there is one', () => {
    expect(savingText({ saving_vs_requested_percent: 24, saving_per_unit: 120 })).toBe('توفير متوقع: 120 ر.س للوحدة (24%)')
    expect(savingText({ saving_vs_requested_percent: 10, saving_per_unit: null })).toBe('توفير متوقع: (10%)')
    expect(savingText({ saving_vs_requested_percent: null, saving_per_unit: null })).toBeNull()
    expect(savingText({ saving_vs_requested_percent: -5, saving_per_unit: null })).toBeNull()
  })

  it('names the reference price and where it comes from', () => {
    expect(referenceText({ kind: 'LINE_QUOTE', brand: null, best_price: 500, price_source_ar: 'أقل سعر وصلك لهذا البند' })).toBe('السعر المرجعي: 500 ر.س · أقل سعر وصلك لهذا البند')
    expect(referenceText({ kind: 'REQUESTED_BRAND', brand: 'ITCC', best_price: 25, price_source_ar: 'سعر منشور في كتالوج المورد' })).toBe('السعر المرجعي: 25 ر.س · سعر منشور في كتالوج المورد · الماركة المطلوبة ITCC')
    expect(referenceText(null)).toBeNull()
    expect(referenceText({ brand: 'X', best_price: null, price_source_ar: null })).toBeNull()
  })

  it('counts held-back alternatives with their reasons', () => {
    const held = (reason: string) => ({ hidden_reason_ar: reason }) as unknown as EquivalenceCandidate
    expect(hiddenCandidatesLabel([])).toBeNull()
    expect(hiddenCandidatesLabel([held('أغلى من السعر المرجعي للبند')])).toBe('عرض 1 بديل مخفي (أغلى من السعر المرجعي للبند)')
    expect(hiddenCandidatesLabel([held('المادة غير مؤكدة من المصدر'), held('أغلى من السعر المرجعي للبند'), held('أغلى من السعر المرجعي للبند')]))
      .toBe('عرض 3 بدائل مخفية (المادة غير مؤكدة من المصدر / أغلى من السعر المرجعي للبند)')
    expect(PRICE_UNKNOWN_TEXT).toBe('السعر غير معروف')
  })
})
