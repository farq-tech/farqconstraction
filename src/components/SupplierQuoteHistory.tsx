import { useEffect, useState } from 'react'
import { getSupplierQuoteHistory, type SupplierQuoteHistory as History } from '../api/constructionClient'
import {
  formatDate,
  formatSar,
  lineLabels,
  priceTrailLabel,
  requestLabel,
  responseLabel,
  sortNewestFirst,
  sourceLabel,
  standingLabel,
  summaryTiles,
  vatBasisLabel,
} from '../lib/supplierQuoteHistory'

const TONE = {
  best: 'bg-[#CFF5DC] text-[#1a7a45]',
  behind: 'bg-amber-50 text-amber-800',
  neutral: 'bg-neutral-100 text-neutral-600',
} as const

/**
 * «سجل العروض»: every price this supplier gave the company, newest first,
 * under a summary of how he has done. Read-only; the numbers are the API's.
 */
export default function SupplierQuoteHistory({ supplierId }: { supplierId: string }) {
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getSupplierQuoteHistory(supplierId)
      .then((value) => {
        if (!cancelled) setHistory(value)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'تعذر تحميل سجل العروض')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  const rows = history ? sortNewestFirst(history.quotes) : []

  return (
    <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-[#0D1F1D]">سجل العروض</h2>
        {history && history.summary.quotes > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-bold">
            مقدّم عروض سابقاً
          </span>
        )}
      </div>

      {loading && <div className="h-24 rounded-xl bg-neutral-100 animate-pulse" />}

      {error && !loading && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
      )}

      {!loading && !error && history && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {summaryTiles(history.summary).map((tile) => (
              <div key={tile.label} className="rounded-xl bg-[#f7faf9] px-3 py-2.5">
                <div className="text-[11px] text-neutral-500 font-semibold">{tile.label}</div>
                <div className="text-base font-black text-[#0D1F1D]">{tile.value}</div>
                {tile.hint && <div className="text-[10px] text-neutral-400">{tile.hint}</div>}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="text-xs text-neutral-500">
              لم يقدّم هذا المورد أي عرض لشركتك بعد
              {history.summary.invites_received > 0 ? ` — دُعي إلى ${history.summary.invites_received} طلبات.` : '.'}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-neutral-400 text-right">
                    <th className="font-semibold py-2 pl-3">التاريخ</th>
                    <th className="font-semibold py-2 pl-3">الطلب</th>
                    <th className="font-semibold py-2 pl-3">البند</th>
                    <th className="font-semibold py-2 pl-3">الكمية</th>
                    <th className="font-semibold py-2 pl-3">سعر الوحدة</th>
                    <th className="font-semibold py-2 pl-3">المقارنة</th>
                    <th className="font-semibold py-2">المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const names = lineLabels(row)
                    const standing = standingLabel(row)
                    const trail = priceTrailLabel(row)
                    return (
                      <tr key={`${row.quote_id}-${row.line.line_id}`} className="border-t border-neutral-100 align-top">
                        <td className="py-2.5 pl-3 whitespace-nowrap text-neutral-600">
                          {formatDate(row.quoted_at)}
                          {row.response_hours != null && (
                            <div className="text-[10px] text-neutral-400">ردّ خلال {responseLabel(row.response_hours)}</div>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 whitespace-nowrap font-semibold text-[#0D1F1D]">
                          {requestLabel(row)}
                          {row.request.project && <div className="text-[10px] font-normal text-neutral-400">{row.request.project}</div>}
                        </td>
                        <td className="py-2.5 pl-3 max-w-[220px]">
                          <div className="font-semibold text-[#0D1F1D]">{names.primary}</div>
                          {names.secondary && <div className="text-[10px] text-neutral-400">{names.secondary}</div>}
                        </td>
                        <td className="py-2.5 pl-3 whitespace-nowrap text-neutral-600">
                          {row.line.quantity ?? '—'} {row.line.uom || ''}
                        </td>
                        <td className="py-2.5 pl-3 whitespace-nowrap">
                          {row.available ? (
                            <>
                              <div className="font-bold text-[#0D1F1D]">{formatSar(row.unit_price_ex_vat)} <span className="text-[10px] font-normal text-neutral-400">بدون ضريبة</span></div>
                              <div className="text-[10px] text-neutral-400">
                                كما ذُكر: {formatSar(row.unit_price)} · {vatBasisLabel(row)}
                              </div>
                              {trail && <div className="text-[10px] text-[#1a7a45] font-semibold">{trail}</div>}
                            </>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold ${TONE[standing.tone]}`}>{standing.text}</span>
                          {row.awarded && (
                            <span className="inline-block mr-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#123F3A] text-white">رُسّي عليه</span>
                          )}
                        </td>
                        <td className="py-2.5 whitespace-nowrap text-neutral-600">
                          {sourceLabel(row)}
                          {row.versions_count > 1 && <div className="text-[10px] text-neutral-400">{row.versions_count} نسخ</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
