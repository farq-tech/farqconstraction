import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import {
  getConstructionComparison,
  listBuyerRfqs,
  type ConstructionComparison,
} from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import MarketNameNote from '../components/MarketNameNote'
import PriceReviewNote from '../components/priceReview/PriceReviewNote'
import SupplierScoreBadge from '../components/priceReview/SupplierScoreBadge'
import VatUnknownChip from '../components/priceReview/VatUnknownChip'
import { useConstructionAdmin } from '../components/priceReview/useConstructionAdmin'
import { heldSummaryLabel, isHeldOffer, taxAssumptionsText } from '../lib/priceReview'

/**
 * Side-by-side prices for one request.
 *
 * This screen used to be a constant: «لا توجد عروض للمقارنة بعد», with no fetch,
 * while four buttons led to it — so it denied offers that had arrived, and the
 * award screen behind it had no way in. Everything shown here is read from
 * `GET /rfqs/:id/comparison`; a cell the supplier did not price says so.
 */
function money(value: number | null | undefined, currency = 'SAR'): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency === 'SAR' ? 'ر.س' : currency}`
}

export function ComparisonView({ navigate }: NavProps) {
  const { selectedRfqId, setSelectedRfqId, setSelectedQuoteVersionId } = useProcurement()
  const [data, setData] = useState<ConstructionComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = useConstructionAdmin()

  // After an admin confirms or corrects a held price: re-read in place.
  const reload = async () => {
    if (!selectedRfqId) return
    try {
      setData(await getConstructionComparison(selectedRfqId))
    } catch {
      /* the next visit re-reads; the admin's decision is already saved */
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        let rfqId = selectedRfqId
        if (!rfqId) {
          const overview = await listBuyerRfqs()
          rfqId = overview.rfqs?.[0]?.id || null
          if (rfqId) setSelectedRfqId(rfqId)
        }
        if (!rfqId) {
          if (!cancelled) setData(null)
          return
        }
        const result = await getConstructionComparison(rfqId)
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذّر تحميل المقارنة')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedRfqId, setSelectedRfqId])

  const responses = useMemo(
    () => (data?.supplier_responses || []).filter((row) => row.offer?.quoteVersionId || row.offer?.offerId),
    [data],
  )
  const lines = data?.quote_matrix?.lines || []
  const summaries = useMemo(
    () => new Map((data?.quote_matrix?.supplier_summaries || []).map((s) => [String(s.supplier_id), s])),
    [data],
  )
  // A quote with a price held for review, or with VAT unstated, is not «الأقل».
  const comparable = (r: (typeof responses)[number]) => {
    const s = summaries.get(String(r.supplier.id))
    return !s?.price_review?.held && !s?.totals?.tax_unknown
  }
  const cheapestTotal = useMemo(() => {
    const totals = responses
      .filter(comparable)
      .map((r) => Number(r.offer.totals?.total))
      .filter((n) => Number.isFinite(n) && n > 0)
    return totals.length > 1 ? Math.min(...totals) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, summaries])

  const award = (quoteVersionId: string) => {
    setSelectedQuoteVersionId(quoteVersionId)
    navigate('award')
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">مقارنة العروض</h1>
          <p className="text-neutral-500 text-sm">
            {loading
              ? 'جارٍ التحميل…'
              : error
                ? 'تعذّرت القراءة'
                : `${responses.length} عرضًا مستلمًا${data?.awaiting_supplier_ids?.length ? ` · ${data.awaiting_supplier_ids.length} موردًا لم يرد بعد` : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('offers')}
          className="px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm hover:bg-neutral-50"
        >
          العودة للعروض
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — هذا فشل في القراءة، وليس دليلًا على عدم وجود عروض.
        </div>
      )}

      {!loading && !error && responses.length === 0 && (
        <div className="text-center py-20 bg-white border border-neutral-100 rounded-2xl">
          <div className="font-semibold text-[#0D1F1D] mb-1">لم يصل أي عرض على هذا الطلب بعد</div>
          <p className="text-sm text-neutral-500">تظهر المقارنة هنا فور وصول أول عرض مسعّر.</p>
        </div>
      )}

      {!loading && !error && responses.length > 0 && (
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-right">
                <th className="px-4 py-3 font-bold text-[#0D1F1D] min-w-[220px]">البند</th>
                {responses.map((r) => (
                  <th key={String(r.supplier.id)} className="px-4 py-3 font-bold text-[#0D1F1D] min-w-[160px] align-top">
                    {r.supplier.name_ar || r.supplier.name_en || 'مورد'}
                    <SupplierScoreBadge score={summaries.get(String(r.supplier.id))?.score} className="ms-1.5" />
                    {r.eligibility?.eligible === false && (
                      <div className="text-[10px] font-semibold text-amber-700 mt-0.5">عرض غير مكتمل</div>
                    )}
                    {heldSummaryLabel(summaries.get(String(r.supplier.id))?.price_review) && (
                      <div className="text-[10px] font-semibold text-amber-800 mt-0.5">
                        {heldSummaryLabel(summaries.get(String(r.supplier.id))?.price_review)}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-neutral-50 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0D1F1D]">{line.name_ar || line.name_en || '—'}</div>
                    <MarketNameNote name={line.market_name_ar} />
                    <div className="text-xs text-neutral-400">{line.quantity} {line.uom}</div>
                  </td>
                  {responses.map((r) => {
                    const cell = line.offers.find((o) => String(o.supplier_id) === String(r.supplier.id))
                    const held = isHeldOffer(cell)
                    const priced = cell && cell.unit_price != null
                    return (
                      <td key={String(r.supplier.id)} className={`px-4 py-3 ${held ? 'bg-amber-50/50' : ''}`}>
                        {held ? (
                          <>
                            {cell!.unit_price != null && (
                              <div className="text-xs text-neutral-400 line-through decoration-amber-400/70">{money(cell!.unit_price, cell!.currency)}</div>
                            )}
                            {cell!.price_review ? (
                              <PriceReviewNote
                                review={cell!.price_review}
                                currency={cell!.currency}
                                rfqId={selectedRfqId}
                                quoteVersionId={cell!.quote_version_id}
                                lineId={line.id}
                                isAdmin={isAdmin}
                                onResolved={reload}
                              />
                            ) : (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">يحتاج مراجعة</span>
                            )}
                          </>
                        ) : priced ? (
                          <>
                            <div className="font-semibold text-[#0D1F1D]">{money(cell!.unit_price, cell!.currency)}</div>
                            <div className="text-xs text-neutral-400">الإجمالي {money(cell!.line_total, cell!.currency)}</div>
                            <VatUnknownChip value={cell!.prices_include_tax} className="mt-0.5" />
                          </>
                        ) : (
                          <span className="text-xs text-neutral-400">لم يسعّره</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="bg-[#f0faf7]">
                <td className="px-4 py-3 font-black text-[#0D1F1D]">إجمالي العرض</td>
                {responses.map((r) => {
                  const total = Number(r.offer.totals?.total)
                  const id = String(r.offer.quoteVersionId || r.offer.offerId || '')
                  const assumptions = taxAssumptionsText(summaries.get(String(r.supplier.id))?.totals, r.offer.currency)
                  return (
                    <td key={String(r.supplier.id)} className="px-4 py-3">
                      {assumptions ? (
                        <>
                          <div className="text-xs font-bold text-[#123F3A]">{assumptions}</div>
                          <VatUnknownChip value={null} className="mt-0.5" />
                        </>
                      ) : (
                        <div className="font-black text-[#123F3A]">
                          {money(r.offer.totals?.total ?? (r.offer.totals as { minimum_total?: number } | undefined)?.minimum_total ?? r.offer.totals?.goods_total, r.offer.currency)}
                        </div>
                      )}
                      {!assumptions && r.offer.totals?.total == null && r.offer.totals?.goods_total != null && (
                        <div className="text-[10px] text-neutral-500">بدون التوصيل — لم يذكره المورد</div>
                      )}
                      {cheapestTotal != null && comparable(r) && total === cheapestTotal && (
                        <div className="text-[10px] font-semibold text-[#1a7a45]">الأقل إجمالًا بين المستلَم</div>
                      )}
                      <button
                        onClick={() => award(id)}
                        disabled={!id}
                        className="mt-2 px-3 py-1.5 bg-[#123F3A] text-white text-xs font-bold rounded-lg disabled:opacity-40"
                      >
                        ترسية على هذا المورد
                      </button>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
          {lines.length === 0 && (
            <div className="px-4 py-3 text-xs text-neutral-500">
              لم يُرجع الخادم تفصيل الأسعار لكل بند؛ الإجماليات أعلاه هي ما وصل.
            </div>
          )}
          <div className="px-4 py-3 text-[11px] text-neutral-400 border-t border-neutral-50">
            «الأقل إجمالًا» مقارنة حسابية فقط بين العروض المستلمة، ولا تعني أن العروض تغطي البنود نفسها. السعر «يحتاج مراجعة» لا يدخل
            المقارنة حتى يُعتمد.
          </div>
        </div>
      )}
    </div>
  )
}
