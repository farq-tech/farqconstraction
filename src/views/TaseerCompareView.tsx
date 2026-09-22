import { useEffect, useState } from 'react'
import { fetchTaseerCompare } from '../api/taseerClient'
import { formatSar, type CompareFilter } from '../lib/taseerCompare'
import { useProcurement } from '../procurementContext'

const FILTERS: Array<[CompareFilter, string]> = [
  ['cheapest', 'الأقل سعرًا'],
  ['materials', 'شامل المواد'],
  ['delivery', 'شامل التوصيل'],
  ['fastest', 'الأسرع'],
  ['rating', 'الأعلى تقييمًا'],
  ['all', 'الكل'],
]

function flag(value?: boolean): string {
  if (value === true) return 'نعم'
  if (value === false) return 'لا'
  return '—'
}

export function TaseerCompareView() {
  const { taseerNeed, openTaseerChat, openTaseerNeed } = useProcurement()
  const need = taseerNeed || 'سباك'
  const [filter, setFilter] = useState<CompareFilter>('all')
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTaseerCompare>> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTaseerCompare(need, filter)
      .then((row) => {
        if (!cancelled) setData(row)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [need, filter])

  const summary = data?.summary
  const rows = data?.rows || []

  return (
    <div className="px-3 py-5 pb-24" dir="rtl">
      <button type="button" onClick={() => openTaseerNeed(need)} className="text-xs font-bold text-[#123F3A] mb-3">
        ← {need}
      </button>
      <h1 className="text-xl font-black text-[#0D1F1D] mb-3">مقارنة عروض {need}</h1>

      {summary && (
        <div className="rounded-2xl bg-[#123F3A] text-white px-4 py-4 mb-4">
          <div className="text-sm font-black mb-2">{summary.arrived} عروض وصلت</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>أقل سعر: {formatSar(summary.cheapest)}</div>
            <div>أقل تكلفة مكتملة: {formatSar(summary.cheapestComplete)}</div>
            <div className="col-span-2">النطاق: {formatSar(summary.min)} – {formatSar(summary.max)}</div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/75">{summary.completeNote}</p>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-3">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${
              filter === key ? 'bg-[#123F3A] text-white' : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-100 bg-white">
        <table className="min-w-[640px] w-full text-right text-[11px]">
          <thead className="bg-[#FAFAF8] text-neutral-500">
            <tr>
              {['المزود', 'السعر', 'يشمل المواد', 'يشمل الحضور', 'التوصيل / النقل', 'الموعد', 'التقييم', 'الحالة'].map((h) => (
                <th key={h} className="px-2 py-2 font-bold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.token}
                className="border-t border-neutral-50 cursor-pointer hover:bg-[#f0faf7]"
                onClick={() => openTaseerChat(row.token, need)}
              >
                <td className="px-2 py-2.5 font-bold text-[#0D1F1D] whitespace-nowrap">{row.name}</td>
                <td className="px-2 py-2.5 tabular-nums">{formatSar(row.price)}</td>
                <td className="px-2 py-2.5">{flag(row.includesMaterials)}</td>
                <td className="px-2 py-2.5">{flag(row.includesAttendance)}</td>
                <td className="px-2 py-2.5">{flag(row.includesDelivery)}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">{row.appointment || '—'}</td>
                <td className="px-2 py-2.5">
                  {row.ratingValue != null ? `${row.ratingValue}${row.ratingCount ? ` (${row.ratingCount})` : ''}` : '—'}
                </td>
                <td className="px-2 py-2.5 font-bold text-[#123F3A] whitespace-nowrap">{row.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-neutral-500">ما فيه صفوف لهذا التصفية.</div>
        )}
      </div>
    </div>
  )
}
