/**
 * «عروض على النسخة السابقة» — quotes given before the request was revised.
 * Shown apart from the comparison and never ranked against current quotes:
 * they priced lines that have since changed.
 */
import type { PreviousVersionResponse } from '../api/constructionClient'
import { formatEventTime, formatMoney } from '../lib/requestFile'

export default function PreviousVersionResponses({ responses }: { responses?: PreviousVersionResponse[] | null }) {
  const list = responses || []
  if (!list.length) return null
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-[#0D1F1D]">عروض على النسخة السابقة</h3>
      <p className="text-xs text-neutral-500">
        قدّمها الموردون قبل تعديل الطلب، فلا تدخل المقارنة أعلاه. الأسعار للبنود كما كانت في تلك النسخة.
      </p>
      <div className="space-y-2">
        {list.map((row) => {
          const total = formatMoney(row.total, row.currency || 'SAR')
          const when = formatEventTime(row.submitted_at)
          return (
            <details key={`${row.supplier.id}:${row.rfq_version_id}`} className="bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3">
              <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm text-[#0D1F1D]">{row.supplier.name_ar || 'مورد'}</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  {row.label_ar || 'على النسخة السابقة'}
                </span>
                <span className="text-[11px] text-neutral-500">النسخة {row.version_number}</span>
                {when && <span className="text-[11px] text-neutral-400 tabular-nums">{when}</span>}
                <span className="ms-auto text-sm font-black text-neutral-700 tabular-nums">{total || 'بلا إجمالي'}</span>
              </summary>
              {row.lines.length > 0 && (
                <ul className="mt-2 divide-y divide-neutral-200 text-xs">
                  {row.lines.map((line) => (
                    <li key={line.line_key} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-[#0D1F1D]">
                        {line.name_ar}
                        <span className="text-neutral-500"> · {line.quantity} {line.uom}</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums font-semibold text-neutral-700">
                        {line.available === false
                          ? 'غير متوفر'
                          : line.unit_price == null
                            ? '—'
                            : formatMoney(line.unit_price, row.currency || 'SAR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        })}
      </div>
    </section>
  )
}
