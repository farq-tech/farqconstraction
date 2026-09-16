import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  createConstructionAward,
  createConstructionProject,
  formatRfqTitle,
  formatSar,
  getConstructionComparison,
  getConstructionProjects,
  listBuyerRfqs,
  type ConstructionComparison,
} from '../api/constructionClient'

const REASONS = ['أفضل سعر', 'أسرع توريد', 'مورد معتمد', 'أفضل قيمة', 'سبب آخر']

export function AwardView({ navigate }: NavProps) {
  const {
    selectedRfqId,
    selectedQuoteVersionId,
    setSelectedRfqId,
    setSelectedQuoteVersionId,
    setAwardResult,
    openRfq,
  } = useProcurement()
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [comparison, setComparison] = useState<ConstructionComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        let rfqId = selectedRfqId
        if (!rfqId) {
          const overview = await listBuyerRfqs()
          rfqId = overview.rfqs?.[0]?.id || null
          if (rfqId) setSelectedRfqId(rfqId)
        }
        if (!rfqId) throw new Error('لا يوجد طلب للترسية')
        const data = await getConstructionComparison(rfqId)
        if (cancelled) return
        setComparison(data)
        if (!selectedQuoteVersionId) {
          const first = data.supplier_responses.find((row) => row.offer.quoteVersionId || row.offer.offerId)
          const id = String(first?.offer.quoteVersionId || first?.offer.offerId || '')
          if (id) setSelectedQuoteVersionId(id)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الترسية')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedRfqId, selectedQuoteVersionId, setSelectedQuoteVersionId, setSelectedRfqId])

  const selected = useMemo(() => {
    if (!comparison) return null
    return (
      comparison.supplier_responses.find((row) => {
        const id = String(row.offer.quoteVersionId || row.offer.offerId || '')
        return id && id === selectedQuoteVersionId
      }) || comparison.supplier_responses[0] || null
    )
  }, [comparison, selectedQuoteVersionId])

  const canAward = Boolean(reason && (reason !== 'سبب آخر' || customReason.trim()) && selected)

  const submitAward = async () => {
    if (!comparison || !selected) return
    const quoteVersionId = String(selected.offer.quoteVersionId || selected.offer.offerId || '')
    if (!quoteVersionId) {
      setError('لا يوجد إصدار عرض للترسية')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      let projects = (await getConstructionProjects()).projects || []
      if (!projects.length) {
        const delivery = comparison.rfq.current_version?.payload?.delivery
        const created = await createConstructionProject({
          name: formatRfqTitle({
            id: comparison.rfq.id,
            delivery,
            engineering_department: comparison.rfq.engineering_department,
            buyer: comparison.rfq.current_version?.payload?.buyer,
          }),
          site_address: delivery?.site_address || delivery?.city || undefined,
        })
        projects = [created]
      }
      const selectionReason = reason === 'سبب آخر' ? customReason.trim() : reason
      const award = await createConstructionAward({
        rfq_id: comparison.rfq.id,
        project_id: projects[0]!.id,
        supplier_quote_version_id: quoteVersionId,
        selection_reason: selectionReason,
        awarded_line_ids: [],
        approval_note: 'Client demo award from farqconstraction UI',
      })
      setAwardResult(award)
      navigate('award-success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت الترسية')
      setShowConfirm(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-16 text-center text-neutral-400 font-semibold">
        جاري تجهيز الترسية…
      </div>
    )
  }

  if (!comparison || !selected) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-16 text-center">
        <div className="text-neutral-600 font-semibold mb-3">{error || 'لا عرض للاعتماد'}</div>
        <button
          onClick={() => navigate('comparison')}
          className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          العودة للمقارنة
        </button>
      </div>
    )
  }

  const total = Number(selected.offer.totals?.total ?? selected.offer.totals?.goods_total ?? NaN)
  const supplierName = selected.supplier.name_ar || selected.supplier.name_en || 'مورد'
  const pricedLines = Array.isArray(selected.offer.lines)
    ? selected.offer.lines.filter((line) => {
        const price = line.unit_price ?? line.base_price
        return price != null && String(price) !== ''
      }).length
    : 0

  if (showConfirm) {
    return (
      <div className="max-w-lg mx-auto px-4 lg:px-8 py-8">
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
          <div className="bg-[#f0faf7] px-6 py-5 text-center border-b border-neutral-100">
            <h2 className="text-xl font-black text-[#0D1F1D]">اعتماد الترسية</h2>
            <p className="text-xs text-neutral-500 mt-2">سيتم استدعاء Farq API الحقيقي</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">المورد</span>
              <span className="font-bold text-[#0D1F1D]">{supplierName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">بنود مسعّرة</span>
              <span className="font-bold text-[#0D1F1D]">{pricedLines}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">قيمة العقد</span>
              <span className="font-bold text-[#0D1F1D]">{formatSar(Number.isFinite(total) ? total : null)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">سبب الاختيار</span>
              <span className="font-bold text-[#0D1F1D]">
                {reason === 'سبب آخر' ? customReason : reason}
              </span>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          </div>
          <div className="px-6 pb-6 space-y-2">
            <button
              disabled={submitting}
              onClick={submitAward}
              className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-60"
            >
              {submitting ? 'جارٍ الاعتماد…' : 'اعتماد الترسية'}
            </button>
            <button
              disabled={submitting}
              onClick={() => setShowConfirm(false)}
              className="w-full py-3 text-neutral-500 font-semibold text-sm hover:text-neutral-700"
            >
              العودة
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">اختيار العرض</h1>
        <p className="text-neutral-500 text-sm">
          {formatRfqTitle({
            id: comparison.rfq.id,
            delivery: comparison.rfq.current_version?.payload?.delivery,
            engineering_department: comparison.rfq.engineering_department,
            buyer: comparison.rfq.current_version?.payload?.buyer,
          })}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-[#f0faf7] border border-[#123F3A]/10 rounded-2xl p-5 mb-6">
        <div className="text-sm font-semibold text-[#123F3A] mb-3">ملخص الترسية</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-neutral-500 mb-1">المورد</div>
            <div className="font-bold text-[#0D1F1D] text-sm">{supplierName}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">القيمة</div>
            <div className="font-bold text-[#0D1F1D] text-sm">
              {formatSar(Number.isFinite(total) ? total : null)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">بنود مسعّرة</div>
            <div className="font-bold text-[#0D1F1D] text-sm">{pricedLines}</div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold text-[#0D1F1D] mb-2">اختر عرضًا</div>
        <div className="space-y-2">
          {comparison.supplier_responses.map((row, idx) => {
            const id = String(row.offer.quoteVersionId || row.offer.offerId || idx)
            const active = id === selectedQuoteVersionId || (!selectedQuoteVersionId && idx === 0)
            return (
              <button
                key={id}
                onClick={() => setSelectedQuoteVersionId(id)}
                className={`w-full text-right px-4 py-3 rounded-xl border transition-colors ${
                  active ? 'border-[#123F3A] bg-[#f0faf7]' : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="font-bold text-[#0D1F1D]">
                  {row.supplier.name_ar || row.supplier.name_en}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {formatSar(Number(row.offer.totals?.total ?? row.offer.totals?.goods_total ?? null))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-sm font-semibold text-[#0D1F1D] mb-2">سبب الاختيار</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                reason === r ? 'bg-[#123F3A] text-white' : 'bg-white border border-neutral-200 text-neutral-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === 'سبب آخر' && (
          <input
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="اكتب السبب (٥ أحرف على الأقل)…"
            className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A]"
          />
        )}
      </div>

      <div className="flex gap-3">
        <button
          disabled={!canAward}
          onClick={() => setShowConfirm(true)}
          className="flex-1 py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40"
        >
          متابعة الاعتماد
        </button>
        <button
          onClick={() => openRfq(comparison.rfq.id, 'comparison')}
          className="px-5 py-3.5 border border-neutral-200 rounded-xl text-sm font-semibold text-neutral-600"
        >
          رجوع
        </button>
      </div>
    </div>
  )
}

export default AwardView
