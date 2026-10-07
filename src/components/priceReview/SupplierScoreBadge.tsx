import type { SupplierScore } from '../../api/constructionClient'
import { scoreBadgeText, scoreBreakdown } from '../../lib/priceReview'

/**
 * «78/100» next to a supplier, with the breakdown on hover or focus (and as
 * the title for touch and screen readers). Nothing on an older API.
 */
export default function SupplierScoreBadge({ score, className = '' }: { score?: SupplierScore | null; className?: string }) {
  const text = scoreBadgeText(score)
  if (!text) return null
  const lines = scoreBreakdown(score)
  const total = Number(score!.total)
  const tone = total >= 75 ? 'bg-[#e0efec] text-[#123F3A]' : total >= 50 ? 'bg-neutral-100 text-neutral-700' : 'bg-amber-50 text-amber-800'
  return (
    <span className={`group relative inline-block align-middle ${className}`}>
      <span
        tabIndex={0}
        title={[`تقييم الاستجابة ${text} — لا يثبت اكتمال العرض أو مطابقة المنتج`, ...lines].join('\n')}
        aria-label={`تقييم الاستجابة ${text}؛ راجع اكتمال العرض والمطابقة قبل الشراء`}
        className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums cursor-help ${tone}`}
      >
        الاستجابة {text}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-30 top-full mt-1 right-0 hidden group-hover:block group-focus-within:block w-72 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] font-normal leading-relaxed text-neutral-700 shadow-lg text-right whitespace-normal"
      >
        <span className="block font-bold text-[#0D1F1D] mb-1">تقييم الاستجابة {text}</span>
        <span className="block mb-1 text-amber-800">هذا التقييم لا يثبت اكتمال شروط الشراء أو مطابقة المنتج. راجع النواقص وحالة الأسعار.</span>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </span>
  )
}
