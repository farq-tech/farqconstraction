/**
 * «بدائل من الإنترنت» — the web path of «بدائل مكافئة» (service key
 * `internet_alternative_discovery`, the owner's company only).
 *
 * Every technical claim shown here comes from a saved public source (the
 * maker's site, its datasheet, an official distributor); nothing is shown
 * as «مطابق مؤكد» without one. Price is never a condition of equivalence.
 */
import type { EquivalenceAttr } from './brandEquivalence'

export const WEB_DISCOVERY_SERVICE = 'internet_alternative_discovery'

export type WebMatchState = 'CONFIRMED_EQUIVALENT' | 'NEEDS_CONFIRMATION' | 'REJECTED' | 'UNVERIFIED_CANDIDATE'

export type WebAlternative = {
  product_master_id: string | null
  brand: string | null
  manufacturer: string | null
  product_name: string | null
  model: string | null
  sku: string | null
  match_state: WebMatchState
  match_confidence: number
  match_reasons: string[]
  rejection_reasons: string[]
  missing_critical_attributes: string[]
  matched_attrs: EquivalenceAttr[]
  missing_attrs: EquivalenceAttr[]
  source_url: string | null
  source_domain: string | null
  source_type: string | null
  source_type_ar: string | null
  datasheet_url: string | null
  certification: string | null
  country_of_origin: string | null
  price: { price: number; currency: string | null; price_type: string; source_url: string; observed_at: string } | null
  price_type: 'public_reference' | 'supplier_quote' | 'unknown'
  price_available: boolean
  pricing_candidate: boolean
  last_verified_at: string | null
}

export type WebLine = {
  line_id: string
  line_key?: string
  name_ar?: string
  status: string
  internal_candidates_count?: number
  classification?: { family: string | null; product_type: string | null; is_supply_install: boolean; service_component: string | null } | null
  alternatives: WebAlternative[]
  log?: { cache_hit?: boolean; queries_count?: number; pages_opened?: number } | null
}

export type WebAlternativesResponse = {
  service: 'internet_alternative_discovery'
  rfq_id: string
  provider?: string
  web_search_available?: boolean
  unavailable?: boolean
  lines: WebLine[]
}

const STATE_LABEL: Record<WebMatchState, string> = {
  CONFIRMED_EQUIVALENT: 'مطابق مؤكد',
  NEEDS_CONFIRMATION: 'يحتاج تأكيد',
  REJECTED: 'غير مطابق',
  UNVERIFIED_CANDIDATE: 'غير موثّق',
}

export function matchStateLabel(state: string | null | undefined): string {
  return STATE_LABEL[state as WebMatchState] || 'يحتاج تأكيد'
}

export function matchStateClass(state: string | null | undefined): string {
  if (state === 'CONFIRMED_EQUIVALENT') return 'bg-[#e3f4ea] text-[#1a7a45]'
  if (state === 'REJECTED') return 'bg-red-50 text-red-700'
  if (state === 'UNVERIFIED_CANDIDATE') return 'bg-neutral-100 text-neutral-500'
  return 'bg-amber-100 text-amber-800'
}

/** Unverified candidates are hidden by default; rejected ones only when asked. */
export function visibleAlternatives(alternatives: WebAlternative[] | null | undefined, showAll = false): WebAlternative[] {
  const list = Array.isArray(alternatives) ? alternatives : []
  if (showAll) return list
  return list.filter((a) => a.match_state === 'CONFIRMED_EQUIVALENT' || a.match_state === 'NEEDS_CONFIRMATION')
}

export function hiddenCount(alternatives: WebAlternative[] | null | undefined): number {
  const list = Array.isArray(alternatives) ? alternatives : []
  return list.length - visibleAlternatives(list).length
}

export function safeLink(url: string | null | undefined): string | null {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null
}

/** «السعر: غير متوفر» or «مرجع عام: 1.25 USD (2026-10-02)». */
export function priceText(a: WebAlternative): string {
  if (!a.price_available || !a.price) return 'السعر: غير متوفر — يُطلب من الموردين'
  const amount = Number(a.price.price).toLocaleString('en-US', { maximumFractionDigits: 2 })
  const day = a.price.observed_at ? ` (${String(a.price.observed_at).slice(0, 10)})` : ''
  return `سعر مرجعي عام: ${amount} ${a.price.currency || ''}${day}`.replace(/\s+/g, ' ').trim()
}

export function verifiedDateText(a: WebAlternative): string | null {
  return a.last_verified_at ? `آخر تحقق: ${String(a.last_verified_at).slice(0, 10)}` : null
}

const STATUS_NOTE: Record<string, string> = {
  NEEDS_CLASSIFICATION: 'لم نتمكن من تحديد نوع المنتج من نص البند، فلم نبحث في الإنترنت.',
  INTERNAL_SUFFICIENT: 'بيانات فرق تكفي لهذا البند، فلم نحتج للبحث في الإنترنت.',
  NOT_SEARCHED: 'لم يُبحث في الإنترنت عن هذا البند بعد.',
  NO_PROVIDER: 'البحث في الإنترنت غير متاح حاليًا.',
  DAILY_CAP_REACHED: 'وصلنا لحد البحث اليومي، حاول غدًا.',
  WEB_FAILED: 'تعذّر البحث في الإنترنت الآن؛ النتائج الداخلية كما هي.',
}

export function webStatusNote(line: WebLine | null | undefined): string | null {
  if (!line) return null
  if ((line.status === 'SEARCHED' || line.status === 'CACHE') && !(line.alternatives || []).length) return 'بحثنا في الإنترنت ولم نجد منتجًا موثّقًا من نفس النوع والمواصفات.'
  return STATUS_NOTE[line.status] || null
}

/** Lines worth a web search: never searched, or the last search failed. */
export function canSearch(line: WebLine | null | undefined): boolean {
  return !line || line.status === 'NOT_SEARCHED' || line.status === 'WEB_FAILED'
}
