import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import { getConstructionComparison, type ConstructionComparison } from '../api/constructionClient'
import AwardDialog from '../components/procurement/AwardDialog'
import { awardBlockReason } from '../lib/awardFlow'
import { formatMoney, quoteCoverage } from '../lib/requestFile'

export function AwardView({ navigate }: NavProps) {
  const { selectedRfqId, selectedQuoteVersionId, setSelectedQuoteVersionId, setAwardResult, openRfq } = useProcurement()
  const [comparison, setComparison] = useState<ConstructionComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => {
    let alive = true
    setComparison(null)
    setError(null)
    if (!selectedRfqId) { setLoading(false); return }
    setLoading(true)
    getConstructionComparison(selectedRfqId).then((data) => { if (alive) setComparison(data) }).catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'تعذر تحميل العروض') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [selectedRfqId])
  const selected = comparison?.supplier_responses.find((row) => row.offer.quoteVersionId === selectedQuoteVersionId)
  if (loading) return <div className="p-10 text-center text-neutral-500">جارٍ تجهيز الترسية…</div>
  if (!comparison) return <div className="p-10 text-center"><p className="mb-4">{error || 'اختر طلبًا وعرضًا من صفحة المقارنة أولًا.'}</p><button onClick={() => navigate('rfq-list')} className="rounded-xl bg-[#123F3A] text-white px-4 py-3">عرض الطلبات</button></div>
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-black mb-2">اختيار العرض للترسية</h1>
      <p className="text-sm text-neutral-500 mb-5">اختر العرض، ثم راجع قيمته ونطاقه والمشروع وسبب الاختيار قبل تسجيل القرار.</p>
      {comparison.supplier_responses.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-neutral-500">لا توجد عروض متاحة للترسية. ارجع لملف الطلب وراجع حالة إغلاق استلام العروض.</p>}
      <div className="space-y-3">{comparison.supplier_responses.map((row) => {
        const block = awardBlockReason(comparison.rfq, row)
        return <button key={String(row.offer.quoteVersionId || row.supplier.id)} disabled={Boolean(block)} aria-pressed={row === selected} onClick={() => setSelectedQuoteVersionId(String(row.offer.quoteVersionId))} className={`w-full text-right rounded-xl border p-4 disabled:opacity-50 ${row === selected ? 'border-[#123F3A] bg-[#f0faf7]' : 'border-neutral-200 bg-white'}`}><div className="font-bold">{row.supplier.name_ar || row.supplier.name_en || 'مورد'}</div><div className="text-sm mt-1">{formatMoney(row.offer.totals?.total, row.offer.currency || 'SAR') || 'إجمالي غير مكتمل'}</div>{block && <div className="text-xs text-amber-700 mt-2">{block}</div>}</button>
      })}</div>
      <div className="flex gap-3 mt-5"><button disabled={!selected || Boolean(awardBlockReason(comparison.rfq, selected))} onClick={() => setReviewing(true)} className="flex-1 py-3 rounded-xl bg-[#123F3A] text-white font-bold disabled:opacity-40">مراجعة قرار الترسية</button><button onClick={() => openRfq(comparison.rfq.id, 'comparison')} className="px-4 py-3 rounded-xl border border-neutral-200">رجوع للمقارنة</button></div>
      {reviewing && selected && <AwardDialog rfq={comparison.rfq} comparison={comparison} offer={selected} coverage={quoteCoverage(comparison.quote_matrix?.supplier_summaries?.find((s) => s.supplier_id === selected.supplier.id), comparison.quote_matrix?.requested_line_count)} onClose={() => setReviewing(false)} onDone={(award) => { setAwardResult(award); navigate('award-success') }} />}
    </div>
  )
}
export default AwardView
