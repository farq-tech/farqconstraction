import type { ConstructionAiDraft, ConstructionAiProfileUpdate, ConstructionAiQuoteLine } from '../api/constructionClient'

/** «نوع الرد» in the buyer's words. */
export const REPLY_KIND_AR: Record<string, string> = {
  PRICE_IN_TEXT: 'سعر في الرسالة',
  QUOTE_FILE: 'عرض سعر مرفق',
  DECLINED: 'اعتذار',
  QUESTION: 'سؤال',
  CLARIFICATION_NEEDED: 'يستفسر عن المطلوب',
  ALT_CONTACT: 'رقم أو جهة ثانية',
  INTERESTED: 'مهتم — ما ذكر سعر',
  AUTO_REPLY: 'رد آلي',
  GREETING: 'تحية',
  BUTTON: 'ضغط زر «متوفر»',
  NON_TEXT_ACK: 'ملصق أو صوت',
  WRONG_NUMBER: 'رقم غلط',
  OTHER: 'غير واضح',
}

const HUMAN_REASON_AR: Record<string, string> = {
  PROMPT_INJECTION_SUSPECT: 'الرسالة فيها طلب يغيّر التسجيل — ما نفّذنا شيء',
  TAMPER_SUSPECT: 'يطلب تغيير الكمية أو البند أو المواصفة — الطلب ما يتغير',
  RFQ_CLOSED: 'استلام العروض مقفل',
  BOX_OR_PIECE: 'السعر للعلبة أو للحبة؟ تأكد',
  PRICE_UNMATCHED: 'السعر ما ارتبط ببند واضح',
  TOTAL_ONLY: 'ذكر إجمالي بدون تفصيل البنود',
  TRADE_STATEMENT: 'ذكر نشاطه فقط — راجع هل يناسب الطلب',
  PARTIAL_DECLINE: 'اعتذر عن بعض البنود فقط',
  VOICE_NOT_TRANSCRIBED: 'رسالة صوتية — اسمعها',
  QUOTE_FILE_REVIEW: 'فيه ملف — راجعه',
  PRICE_REVIEW: 'السعر يحتاج مراجعة',
  CLASSIFIER_CONFLICT: 'القراءة غير متأكدة',
  LOW_CONFIDENCE: 'الثقة منخفضة',
  ALTERNATIVE_OFFERED: 'يعرض بديل',
  MIXED_VAT: 'الضريبة مختلطة بين البنود',
}

export function humanReasonAr(code: string): string {
  if (HUMAN_REASON_AR[code]) return HUMAN_REASON_AR[code]
  if (code.startsWith('HUMAN_ONLY:')) return 'يحتاج ردك أنت'
  return 'يحتاج مراجعة'
}

export function vatAr(value: boolean | null | undefined, inferred = false): string {
  if (value === true) return inferred ? 'شامل (يُفهم شامل الضريبة)' : 'شامل الضريبة'
  if (value === false) return 'غير شامل الضريبة'
  return 'الضريبة غير مذكورة'
}

export function deliveryAr(value: boolean | null | undefined): string {
  if (value === true) return 'شامل التوصيل'
  if (value === false) return 'التوصيل على المشتري'
  return 'غير مذكور'
}

export function leadTimeAr(days: number | null | undefined): string {
  if (!days) return 'غير مذكورة'
  if (days === 1) return 'يوم واحد'
  if (days === 2) return 'يومين'
  if (days <= 10) return `${days} أيام`
  return `${days} يوم`
}

export function confidenceAr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = Math.round(value * 100)
  const word = pct >= 85 ? 'عالية' : pct >= 70 ? 'متوسطة' : 'منخفضة'
  return `${word} (${pct}٪)`
}

export function priceLineAr(line: ConstructionAiQuoteLine): string {
  const price = Number(line.unit_price)
  const shown = Number.isFinite(price) ? String(Math.round(price * 10000) / 10000) : '—'
  if (line.sale_unit && line.pack_size && line.sale_unit_price != null) return `${line.sale_unit_price} ريال للعلبة (${line.pack_size} حبة) = ${shown} للحبة`
  return `${shown} ريال`
}

const PROFILE_TYPE_AR: Record<string, string> = {
  TRADE_SPECIALTY: 'تخصصه', PRODUCT_CATEGORY: 'يبيع', PRODUCT: 'يبيع منتج', BRAND: 'ماركة', MANUFACTURER: 'مصنع',
  AUTHORIZED_DISTRIBUTOR: 'وكيل معتمد', DISTRIBUTOR: 'موزع', WHOLESALER: 'بيع جملة', RETAILER: 'بيع تجزئة',
  SERVICE_AREA: 'موقعه', DELIVERY_AREA: 'يوصل إلى', MIN_ORDER: 'أقل طلب', NOT_SUPPORTED_CATEGORY: 'ما يبيع',
  NOT_SUPPORTED_PRODUCT: 'ما يبيع', TEMPORARILY_UNAVAILABLE: 'غير متوفر عنده حالياً', PERMANENTLY_STOPPED: 'أوقف بيع',
}
const VALUE_AR: Record<string, string> = {
  lighting: 'إنارة', air_conditioning: 'تكييف', solar: 'طاقة شمسية', furniture: 'أثاث', plumbing: 'سباكة', appliances: 'أجهزة كهربائية',
  electrical: 'كهرباء', cement_block: 'بلوك', cement_sand: 'أسمنت ورمل', paint: 'دهانات', insulation: 'عوازل', fasteners: 'براغي وتثبيت',
  gypsum: 'جبس', steel: 'حديد', tiles_stone: 'بلاط وحجر', wood: 'خشب', safety: 'سلامة', wholesaler: 'جملة', retailer: 'تجزئة',
}

export function profileUpdateAr(update: ConstructionAiProfileUpdate): string {
  const type = PROFILE_TYPE_AR[update.type] || update.type
  const value = VALUE_AR[update.normalized_value] || update.normalized_value.replace(/_/g, ' ')
  return `${type}: ${value}`
}

export function declineScopeAr(scope: string | undefined): string {
  if (scope === 'temporary') return 'غير متوفر حالياً — لهذا الطلب فقط، بدون تغيير في نشاطه'
  if (scope === 'trade') return 'ليس من مجاله'
  if (scope === 'lines') return 'بعض البنود فقط'
  return 'اعتذر عن الطلب'
}

/** Drafts the panel shows, in the order a buyer acts on them. */
export function panelDrafts(drafts: ConstructionAiDraft[]): ConstructionAiDraft[] {
  const order = { QUOTE_DRAFT: 0, DECLINE_DRAFT: 1, SUPPLIER_PROFILE_DRAFT: 2, REPLY_DRAFT: 3 } as const
  return drafts
    .filter((d) => d.state === 'PENDING' && d.type !== 'REPLY_DRAFT')
    .sort((a, b) => order[a.type] - order[b.type])
}

/** A conflicting update needs إضافة / استبدال / تجاهل before «اعتماد». */
export function profileChoicesReady(updates: ConstructionAiProfileUpdate[], choices: Record<number, string>): boolean {
  return updates.every((u, i) => u.merge !== 'CONFLICT' || ['ADD', 'REPLACE', 'IGNORE'].includes(choices[i] || ''))
}

export function aiErrorAr(code: string | undefined): string {
  if (code === 'AI_ACTIONS_DISABLED') return 'التنفيذ موقوف حالياً — الاعتماد يرجع بعد تفعيله.'
  if (code === 'AI_DRAFT_NOT_PENDING') return 'هذي المسودة انحسمت من قبل.'
  if (code === 'AI_DRAFT_CONFLICT_CHOICE_REQUIRED') return 'اختر إضافة أو استبدال أو تجاهل للمعلومة المتعارضة.'
  if (code === 'AI_DRAFT_INVALID_PRICE') return 'السعر غير صحيح.'
  return 'ما قدرنا ننفذ — حاول مرة ثانية.'
}
