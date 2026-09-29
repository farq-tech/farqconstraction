import { useState } from 'react'
import { resolvePriceReview, type PriceReview, type PriceReviewAction } from '../../api/constructionClient'
import { canApplySuggestion, priceReviewErrorText, priceReviewText } from '../../lib/priceReview'

type Props = {
  review: PriceReview | null | undefined
  currency?: string | null
  /** The request the quote belongs to; without it no action is offered. */
  rfqId?: string | null
  /** Falls back to the review's own ids. */
  quoteVersionId?: string | null
  lineId?: string | null
  isAdmin: boolean
  /** Re-read the comparison / booklet after the admin's decision. */
  onResolved?: () => void | Promise<void>
}

/**
 * The amber «يحتاج مراجعة» note under a held price: why it is held, the
 * suggested correction, and — for an ADMIN — «اعتمد كما هو» and «طبّق التصحيح
 * المقترح». Everyone else sees the note only.
 */
export default function PriceReviewNote({ review, currency, rfqId, quoteVersionId, lineId, isAdmin, onResolved }: Props) {
  const [pending, setPending] = useState<PriceReviewAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = priceReviewText(review, currency)
  if (!review || !text) return null

  const qv = quoteVersionId || review.quote_version_id
  const line = lineId || review.line_id
  const actionable = isAdmin && Boolean(rfqId && qv && line)

  const act = async (action: PriceReviewAction) => {
    if (!actionable || pending) return
    setPending(action)
    setError(null)
    try {
      await resolvePriceReview(String(rfqId), String(qv), {
        line_id: String(line),
        action,
        ...(action === 'APPLY_SUGGESTION' && review.suggested_unit_price != null ? { unit_price: Number(review.suggested_unit_price) } : {}),
      })
      await onResolved?.()
    } catch (err) {
      setError(priceReviewErrorText(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mt-1 max-w-[220px] text-right">
      <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">{text.badge}</span>
      <div className="text-[10px] leading-relaxed text-amber-800 mt-0.5">{text.reason}</div>
      {text.suggestion && <div className="text-[10px] leading-relaxed text-neutral-600">{text.suggestion}</div>}
      {actionable && (
        <div className="flex flex-wrap gap-1 mt-1">
          <button
            type="button"
            onClick={() => void act('CONFIRM')}
            disabled={pending != null}
            className="px-2 py-1 rounded-lg border border-neutral-200 bg-white text-[10px] font-bold text-[#123F3A] hover:bg-neutral-50 disabled:opacity-50"
          >
            {pending === 'CONFIRM' ? 'جارٍ الحفظ…' : 'اعتمد كما هو'}
          </button>
          {canApplySuggestion(review) && (
            <button
              type="button"
              onClick={() => void act('APPLY_SUGGESTION')}
              disabled={pending != null}
              className="px-2 py-1 rounded-lg bg-[#123F3A] text-[10px] font-bold text-white disabled:opacity-50"
            >
              {pending === 'APPLY_SUGGESTION' ? 'جارٍ الحفظ…' : 'طبّق التصحيح المقترح'}
            </button>
          )}
        </div>
      )}
      {error && <div className="text-[10px] text-red-700 mt-1">{error}</div>}
    </div>
  )
}
