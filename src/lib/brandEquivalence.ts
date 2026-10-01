/*
 * «الماركة والمنشأ» و«بدائل مكافئة» — pure helpers shared by the supplier
 * quote form, the comparison table and the offer detail.
 *
 * Every field here is optional. When none is present, every helper returns
 * null / an empty object, so the screens render exactly as they did before.
 */

/** The optional brand fields a quote line may carry (API contract names). */
export type QuoteLineBrand = {
  offered_brand?: string
  origin_country?: string
  is_equivalent?: boolean | null
  certification?: string
  datasheet_file?: string
}

/** What the supplier typed, per line, before it is trimmed into `QuoteLineBrand`. */
export type BrandDraft = {
  offeredBrand: string
  originCountry: string
  /** null = untouched («لم يحدد»). */
  isEquivalent: boolean | null
  certification: string
  datasheetFile: string
}

export const EMPTY_BRAND_DRAFT: BrandDraft = {
  offeredBrand: '',
  originCountry: '',
  isEquivalent: null,
  certification: '',
  datasheetFile: '',
}

const LIMITS = { offered_brand: 80, origin_country: 60, certification: 120, datasheet_file: 300 } as const

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/** True for a datasheet link the API accepts: https only. */
export function isHttpsUrl(value: string | null | undefined): boolean {
  return /^https:\/\/\S+$/i.test(String(value || '').trim())
}

/** A soft hint under the datasheet input — never blocks the submission. */
export function datasheetHint(value: string | null | undefined): string | null {
  const v = String(value || '').trim()
  if (!v || isHttpsUrl(v)) return null
  return 'الرابط يبدأ بـ https:// — بدونه لن يُرسل الرابط، وباقي العرض يُرسل عادي.'
}

/**
 * Turn the supplier's draft into the optional body fields: trimmed, empties
 * dropped, lengths capped, and a datasheet that is not https dropped.
 */
export function brandFieldsFromDraft(draft: Partial<BrandDraft> | null | undefined): QuoteLineBrand {
  const out: QuoteLineBrand = {}
  if (!draft) return out
  const brand = text(draft.offeredBrand)
  const origin = text(draft.originCountry)
  const cert = text(draft.certification)
  const sheet = text(draft.datasheetFile)
  if (brand) out.offered_brand = clip(brand, LIMITS.offered_brand)
  if (origin) out.origin_country = clip(origin, LIMITS.origin_country)
  if (typeof draft.isEquivalent === 'boolean') out.is_equivalent = draft.isEquivalent
  if (cert) out.certification = clip(cert, LIMITS.certification)
  if (sheet && isHttpsUrl(sheet) && sheet.length <= LIMITS.datasheet_file) out.datasheet_file = sheet
  return out
}

/** Read the brand fields back from a stored quote line (pre-fill), or null. */
export function brandFromLine(line: Record<string, unknown> | null | undefined): QuoteLineBrand | null {
  if (!line) return null
  const out: QuoteLineBrand = {}
  const brand = text(line.offered_brand)
  const origin = text(line.origin_country)
  const cert = text(line.certification)
  const sheet = text(line.datasheet_file)
  if (brand) out.offered_brand = brand
  if (origin) out.origin_country = origin
  if (typeof line.is_equivalent === 'boolean') out.is_equivalent = line.is_equivalent
  if (cert) out.certification = cert
  if (sheet) out.datasheet_file = sheet
  return Object.keys(out).length ? out : null
}

/** The draft the form starts with for a line the supplier already quoted. */
export function brandDraftFromLine(line: Record<string, unknown> | null | undefined): BrandDraft {
  const b = brandFromLine(line)
  if (!b) return { ...EMPTY_BRAND_DRAFT }
  return {
    offeredBrand: b.offered_brand || '',
    originCountry: b.origin_country || '',
    isEquivalent: typeof b.is_equivalent === 'boolean' ? b.is_equivalent : null,
    certification: b.certification || '',
    datasheetFile: b.datasheet_file || '',
  }
}

/** True when anything is filled in the draft (keeps the section open on load). */
export function draftHasBrand(draft: Partial<BrandDraft> | null | undefined): boolean {
  return Object.keys(brandFieldsFromDraft(draft)).length > 0 || Boolean(text(draft?.datasheetFile))
}

/** «ITCC · السعودية» — brand and origin, or whichever is present; null otherwise. */
export function brandChipText(brand: QuoteLineBrand | null | undefined): string | null {
  if (!brand) return null
  const parts = [text(brand.offered_brand), text(brand.origin_country)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** The certification chip text, or null. */
export function certificationChipText(brand: QuoteLineBrand | null | undefined): string | null {
  return text(brand?.certification) || null
}

/** Datasheet link to show, https only. */
export function datasheetLink(brand: QuoteLineBrand | null | undefined): string | null {
  const v = text(brand?.datasheet_file)
  return isHttpsUrl(v) ? v : null
}

/** «بديل» shows only when the server says the offer is an alternative. */
export function showAlternative(alternative: unknown): boolean {
  return alternative === true
}

export type EquivalentSaving = {
  percent: number
  requested_unit_price: number
  equivalent_unit_price: number
  requested_brand: string
  equivalent_brand: string | null
  equivalent_supplier_id: string
  requested_supplier_id: string
}

/** «أرخص بديل مكافئ: X% أقل من الماركة المطلوبة», only for a real saving. */
export function savingNoteText(saving: EquivalentSaving | null | undefined): string | null {
  if (!saving) return null
  const pct = Math.round(Number(saving.percent))
  if (!Number.isFinite(pct) || pct <= 0) return null
  return `أرخص بديل مكافئ: ${pct}% أقل من الماركة المطلوبة`
}

/** «الماركة المطلوبة: X» hint for a request line, or null. */
export function requestedBrandHint(requested: string | null | undefined, allowsEquivalent?: boolean | null): string | null {
  const b = text(requested)
  if (!b) return null
  if (allowsEquivalent === true) return `الماركة المطلوبة: ${b} (أو ما يعادلها)`
  if (allowsEquivalent === false) return `الماركة المطلوبة: ${b} (بدون بدائل)`
  return `الماركة المطلوبة: ${b}`
}

/* ---------------- «بدائل مكافئة» (equivalents add-on) ---------------- */

export type EquivalenceAttr = { key: string; label_ar: string; value: string | number | null }

export type EquivalenceCandidate = {
  product_id: string
  brand: string
  product: string
  product_en: string | null
  matched_attrs: EquivalenceAttr[]
  missing_attrs: EquivalenceAttr[]
  confidence: 'HIGH' | 'NEEDS_CONFIRMATION'
  confidence_score: number
  best_price: number | null
  price_source: 'SUPPLIER_QUOTE' | 'CATALOG_OFFER' | null
  price_source_ar: string | null
  price_includes_vat: boolean | null
  supplier: { name_ar: string } | null
  price_observed_at: string | null
  standard: string | null
  origin_country: string | null
  datasheet_url: string | null
  source_url: string | null
}

export type EquivalenceLine = {
  line_id: string
  line_key: string
  name_ar: string
  requested_brand: string | null
  allows_equivalent: boolean | null
  attributes: EquivalenceAttr[]
  status: 'OK' | 'NO_ATTRIBUTES' | 'NO_CANDIDATES' | 'NO_CATALOG'
  note_ar: string | null
  candidates: EquivalenceCandidate[]
}

export const EQUIVALENTS_SERVICE = 'equivalents'
export const SERVICE_DISABLED_CODE = 'CONSTRUCTION_SERVICE_DISABLED'
export const MAX_CANDIDATES = 5

export function confidenceLabel(confidence: string | null | undefined): string {
  return confidence === 'HIGH' ? 'مكافئ مؤكد المواصفات' : 'يحتاج تأكيد'
}

export function attrText(attr: EquivalenceAttr): string {
  const v = attr.value == null || attr.value === '' ? '' : String(attr.value)
  return v ? `${attr.label_ar}: ${v}` : attr.label_ar
}

/** «يحتاج تأكيد: المقاس، الجهد» — the missing attributes, or null. */
export function missingAttrsText(attrs: EquivalenceAttr[] | null | undefined): string | null {
  const labels = (attrs || []).map((a) => text(a.label_ar)).filter(Boolean)
  return labels.length ? `يحتاج تأكيد: ${labels.join('، ')}` : null
}

/** «123.5 ر.س · عرض مورد · مؤسسة كذا · شامل الضريبة», or null without a price. */
export function candidatePriceText(c: EquivalenceCandidate): string | null {
  if (c.best_price == null || !Number.isFinite(Number(c.best_price))) return null
  const parts = [`${Number(c.best_price).toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`]
  if (text(c.price_source_ar)) parts.push(text(c.price_source_ar))
  if (text(c.supplier?.name_ar)) parts.push(text(c.supplier?.name_ar))
  if (c.price_includes_vat === true) parts.push('شامل الضريبة')
  else if (c.price_includes_vat === false) parts.push('غير شامل الضريبة')
  return parts.join(' · ')
}

/** True when an error from the equivalents endpoint means «service off» — hide silently. */
export function isServiceDisabledError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return code === SERVICE_DISABLED_CODE
}
