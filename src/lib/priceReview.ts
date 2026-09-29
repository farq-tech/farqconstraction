import type { PriceReview, SupplierScore, TaxAssumptionTotals } from '../api/constructionClient'

/**
 * Held prices («يحتاج مراجعة»), the VAT basis a supplier did or did not state,
 * and the supplier score. Pure: the views pass what the API returned.
 */

export const PRICE_REVIEW_STATUS = 'PRICE_REVIEW'

/**
 * A price the server held back as suspicious. It is shown, de-emphasised, but
 * never compared: not the lowest, not the best, not in a total or a saving.
 */
export function isHeldOffer(offer: { status?: string | null; price_review?: unknown } | null | undefined): boolean {
  if (!offer) return false
  if (String(offer.status || '').toUpperCase() === PRICE_REVIEW_STATUS) return true
  return offer.price_review != null
}

/** true / false as stated; anything else is «not stated», never «غير شامل». */
export function vatStatusLabel(pricesIncludeTax: boolean | null | undefined): string {
  if (pricesIncludeTax === true) return 'شامل الضريبة'
  if (pricesIncludeTax === false) return 'غير شامل الضريبة'
  return 'الضريبة غير مذكورة'
}

/** The muted «الضريبة غير مذكورة» chip: only when the API says null (not stated). */
export function vatNotStated(pricesIncludeTax: boolean | null | undefined): boolean {
  return pricesIncludeTax === null
}

function money(value: number | null | undefined, currency?: string | null): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  const n = Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
  const c = String(currency || 'SAR').toUpperCase()
  return `${n} ${c === 'SAR' ? 'ر.س' : c}`
}

export type PriceReviewText = { badge: string; reason: string; suggestion: string | null }

export function priceReviewText(review: PriceReview | null | undefined, currency?: string | null): PriceReviewText | null {
  if (!review) return null
  const reason = String(review.reason_ar || '').trim() || 'السعر بعيد عن المتوقع لهذا البند'
  let suggestion = String(review.suggestion_ar || '').trim() || null
  if (!suggestion) {
    const s = money(review.suggested_unit_price, currency)
    if (s) suggestion = `التصحيح المقترح: ${s}`
  }
  return { badge: 'يحتاج مراجعة', reason, suggestion }
}

export function canApplySuggestion(review: PriceReview | null | undefined): boolean {
  const n = review?.suggested_unit_price
  return n != null && Number.isFinite(Number(n))
}

/** What the admin action failed with, in Arabic. */
export function priceReviewErrorText(err: unknown): string {
  const status = (err as { status?: number } | null)?.status
  if (status === 403) return 'مراجعة الأسعار المعلّقة متاحة للمدير (ADMIN) فقط.'
  const message = err instanceof Error ? err.message.trim() : ''
  return message ? `تعذّر حفظ المراجعة — ${message}` : 'تعذّر حفظ المراجعة، حاول مرة أخرى.'
}

/** A supplier summary's held lines: «سعر واحد قيد المراجعة» / «3 أسعار قيد المراجعة». */
export function heldSummaryLabel(review: { held?: boolean; lines?: number } | null | undefined): string | null {
  if (!review?.held) return null
  const n = Number(review.lines) || 0
  if (n <= 1) return 'سعر قيد المراجعة'
  return `${n} أسعار قيد المراجعة`
}

type TotalsWithTax = {
  tax_unknown?: boolean
  if_tax_excluded?: TaxAssumptionTotals | null
  if_tax_included?: TaxAssumptionTotals | null
} | null | undefined

/**
 * A total whose VAT basis the supplier did not state, under both readings:
 * «إن كانت غير شاملة: X · إن كانت شاملة: Y». Null when the basis is known.
 */
export function taxAssumptionsText(totals: TotalsWithTax, currency?: string | null): string | null {
  if (!totals?.tax_unknown) return null
  const excl = money(totals.if_tax_excluded?.total, currency)
  const incl = money(totals.if_tax_included?.total, currency)
  const parts = [excl && `إن كانت غير شاملة: ${excl}`, incl && `إن كانت شاملة: ${incl}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'الضريبة غير مذكورة — الإجمالي غير محسوم'
}

export function followupsLabel(followups: number | null | undefined): string {
  if (followups == null) return 'لم يُقدّم عرضاً'
  const n = Math.max(0, Math.floor(Number(followups) || 0))
  if (n === 0) return 'من أول رسالة'
  if (n === 1) return 'بعد متابعة واحدة'
  return `بعد ${n} متابعات`
}

export const DOCUMENT_LABEL: Record<string, string> = {
  FILE: 'عرض رسمي/ملف',
  LINK: 'نموذج الرابط',
  CHAT: 'نص محادثة',
}

const pts = (p: { points?: number; max?: number } | null | undefined, fallbackMax: number) =>
  `${Math.round(Number(p?.points) || 0)}/${Number(p?.max) || fallbackMax}`
const tick = (ok: boolean | null | undefined) => (ok ? '✓' : '✗')

export function scoreBadgeText(score: SupplierScore | null | undefined): string | null {
  if (!score || score.total == null || !Number.isFinite(Number(score.total))) return null
  return `${Math.round(Number(score.total))}/100`
}

/** One line per part of the score, in Arabic, for the badge's tooltip. */
export function scoreBreakdown(score: SupplierScore | null | undefined): string[] {
  if (!score) return []
  const out: string[] = []
  const r = score.responsiveness
  if (r) out.push(`سرعة الاستجابة ${pts(r, 25)} (${followupsLabel(r.followups)})`)
  const c = score.completeness
  if (c) out.push(`اكتمال البنود ${pts(c, 20)} (${Number(c.priced) || 0} من ${Number(c.requested) || 0})`)
  const k = score.competitiveness
  if (k) out.push(`تنافسية السعر ${pts(k, 35)}${k.all_flagged ? ' — كل الأسعار قيد المراجعة' : ''}`)
  const v = score.clarity
  if (v) {
    const doc = DOCUMENT_LABEL[String(v.document || '').toUpperCase()] || 'غير محدد'
    out.push(
      `وضوح العرض ${pts(v, 20)} — الضريبة مذكورة ${tick(v.vat_stated)}، التوصيل/المدة ${tick(v.delivery_or_lead_time_stated)}، المستند: ${doc} (${Math.round(Number(v.document_points) || 0)}/5)، الوحدات سليمة ${tick(v.unit_clean)}`,
    )
  }
  return out
}

export function scoreTitle(score: SupplierScore | null | undefined): string {
  const head = scoreBadgeText(score)
  if (!head) return ''
  return [`تقييم المورد ${head}`, ...scoreBreakdown(score)].join('\n')
}
