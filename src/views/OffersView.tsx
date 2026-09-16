import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqApiStatus,
  formatRfqTitle,
  getConstructionComparison,
  getConstructionRfq,
  listBuyerRfqs,
  mapInvitationsToOfferRows,
  type ConstructionRfq,
  type ConstructionRfqSummary,
} from '../api/constructionClient'

const STATUS_CONF = {
  complete: { label: 'وصل عرض', className: 'bg-[#CFF5DC] text-[#1a7a45]' },
  partial: { label: 'عرض جزئي', className: 'bg-amber-50 text-amber-700' },
  pending: { label: 'بانتظار الرد', className: 'bg-neutral-100 text-neutral-500' },
}

type RowFilter = 'received' | 'all' | 'pending' | 'sent'

function formatAttempt(channel: string, status: string): string {
  const ch =
    channel === 'EMAIL' ? 'بريد' : channel === 'WHATSAPP' ? 'واتساب' : channel === 'HARAJ' ? 'حراج' : channel
  const st =
    status === 'SENT' || status === 'DELIVERED'
      ? 'أُرسل'
      : status.startsWith('SKIPPED')
        ? 'تخطّي'
        : status === 'FAILED'
          ? 'فشل'
          : status
  return `${ch}: ${st}`
}

export function OffersView({ navigate }: NavProps) {
  const { selectedRfqId, openRfq, setSelectedOfferId, setSelectedQuoteVersionId } =
    useProcurement()
  const [rfqList, setRfqList] = useState<ConstructionRfqSummary[]>([])
  const [activeRfqId, setActiveRfqId] = useState<string | null>(selectedRfqId)
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [rows, setRows] = useState<ReturnType<typeof mapInvitationsToOfferRows>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowFilter, setRowFilter] = useState<RowFilter>('received')

  // Prefer the RFQ the user just opened/created. Never steal focus to an older
  // RFQ that happens to have responses — that made المراسلات look "empty".
  useEffect(() => {
    let cancelled = false
    listBuyerRfqs()
      .then((overview) => {
        if (cancelled) return
        const list = overview.rfqs || []
        setRfqList(list)
        const selectedInList = selectedRfqId && list.some((r) => r.id === selectedRfqId)
        const pick =
          (selectedInList && selectedRfqId) ||
          selectedRfqId ||
          list[0]?.id ||
          null
        setActiveRfqId(pick)
        if (pick && pick !== selectedRfqId) openRfq(pick, 'offers')
        const active = list.find((r) => r.id === pick)
        if ((active?.response_count || 0) > 0) setRowFilter('received')
        else setRowFilter('all')
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'تعذّر تحميل الطلبات')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once on mount / selected change
  }, [selectedRfqId])

  useEffect(() => {
    if (!activeRfqId) {
      setLoading(false)
      setRfq(null)
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      getConstructionRfq(activeRfqId),
      getConstructionComparison(activeRfqId).catch(() => null),
    ])
      .then(([detail, comparison]) => {
        if (cancelled) return
        setRfq(detail)
        const mapped = mapInvitationsToOfferRows(detail, comparison)
        // Received offers first, then those with outbound mail, then the rest.
        mapped.sort((a, b) => {
          const rank = (row: (typeof mapped)[number]) => {
            if (row.status === 'complete') return 0
            if (row.status === 'partial') return 1
            if ((row.dispatchAttempts || []).some((a) => a.status === 'SENT')) return 2
            return 3
          }
          return rank(a) - rank(b)
        })
        setRows(mapped)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || 'تعذّر تحميل العروض')
          setRfq(null)
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeRfqId])

  const completed = rows.filter((o) => o.status === 'complete')
  const partial = rows.filter((o) => o.status === 'partial')
  const pending = rows.filter((o) => o.status === 'pending')
  const withMail = rows.filter((o) =>
    (o.dispatchAttempts || []).some((a) => a.channel === 'EMAIL' || a.channel === 'WHATSAPP'),
  )

  const visibleRows = useMemo(() => {
    if (rowFilter === 'received') return rows.filter((o) => o.status !== 'pending')
    if (rowFilter === 'pending') return rows.filter((o) => o.status === 'pending')
    if (rowFilter === 'sent') {
      return rows.filter((o) =>
        (o.dispatchAttempts || []).some((a) => a.status === 'SENT' || a.status === 'DELIVERED'),
      )
    }
    return rows
  }, [rows, rowFilter])

  const title = rfq
    ? formatRfqTitle({
        id: rfq.id,
        delivery: rfq.current_version?.payload?.delivery,
        engineering_department: rfq.engineering_department,
        buyer: rfq.current_version?.payload?.buyer,
      })
    : null

  if (loading && !rfq) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-16 text-center text-neutral-400 text-sm">
        جاري تحميل الدعوات والردود من Farq…
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">العروض والمراسلات</h1>
          <p className="text-neutral-500 text-sm">
            {title ? `${title} · ${formatRfqApiStatus(rfq!.status)}` : error || 'لا يوجد طلب نشط'}
          </p>
        </div>
        <div className="flex gap-2">
          {rfq && (
            <button
              onClick={() => openRfq(rfq.id, 'rfq-detail')}
              className="px-4 py-2.5 border border-neutral-200 text-neutral-600 font-semibold rounded-xl text-sm"
            >
              تفاصيل الطلب
            </button>
          )}
          {completed.length >= 1 && (
            <button
              onClick={() => navigate('comparison')}
              className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
            >
              مقارنة العروض
            </button>
          )}
        </div>
      </div>

      {rfqList.length > 1 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {rfqList.map((entry) => {
            const active = entry.id === activeRfqId
            const label = formatRfqTitle(entry)
            return (
              <button
                key={entry.id}
                onClick={() => {
                  setActiveRfqId(entry.id)
                  openRfq(entry.id, 'offers')
                }}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-[#123F3A] text-white border-[#123F3A]'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-[#123F3A]/40'
                }`}
              >
                {label.slice(0, 42)}
                {(entry.response_count || 0) > 0 && (
                  <span className={`mr-2 ${active ? 'text-[#CFF5DC]' : 'text-[#123F3A]'}`}>
                    · {entry.response_count} رد
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {rfq && String(rfq.status).includes('DRAFT') && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          الدعوات مسجّلة ({rows.length}) لكن القنوات الخارجية قد لا تكون أُرسلت بعد — من تفاصيل الطلب
          اضغط «إرسال البريد الآن».
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="bg-white border border-neutral-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-[#123F3A]">{completed.length}</span>
          <span className="text-sm text-neutral-500">عروض مستلمة</span>
        </div>
        <div className="bg-amber-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-amber-700">{partial.length}</span>
          <span className="text-sm text-amber-600">جزئية</span>
        </div>
        <div className="bg-neutral-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-neutral-500">{pending.length}</span>
          <span className="text-sm text-neutral-500">بانتظار</span>
        </div>
        <div className="bg-[#f0faf7] rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-[#123F3A]">{withMail.length}</span>
          <span className="text-sm text-[#123F3A]">بمراسلات</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ['received', `المستلمة (${completed.length + partial.length})`],
            ['sent', `مراسلات أُرسلت (${withMail.length})`],
            ['pending', `بانتظار (${pending.length})`],
            ['all', `الكل (${rows.length})`],
          ] as [RowFilter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setRowFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              rowFilter === id
                ? 'bg-[#123F3A] text-white'
                : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!rfq || visibleRows.length === 0 ? (
        <div className="text-center py-16 bg-white border border-neutral-100 rounded-2xl">
          <div className="font-semibold text-[#0D1F1D] mb-1">
            {error ||
              (rows.length > 0 && rowFilter === 'received'
                ? 'لا عروض مستلمة بعد — الدعوات موجودة تحت «الكل» أو «بانتظار»'
                : rows.length > 0
                  ? 'لا صفوف في هذا التبويب'
                  : 'لا توجد دعوات على هذا الطلب')}
          </div>
          <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto leading-relaxed">
            {rows.length > 0
              ? 'تصفية «المستلمة» تُخفي الدعوات التي لم يرد عليها المورد بعد. اختر «الكل» لترى حالة الإرسال.'
              : error
                ? error
                : 'إن أُنشئ الطلب للتو ولم يظهر هنا: تأكد أنك على نفس المشتري (demo/JWT) ثم حدّث الصفحة أو اختر الطلب من الشريط.'}
          </p>
          {rows.length > 0 ? (
            <button
              onClick={() => setRowFilter('all')}
              className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
            >
              عرض كل الدعوات ({rows.length})
            </button>
          ) : (
            <button
              onClick={() => navigate('rfq-list')}
              className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
            >
              طلبات التسعير
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((offer) => {
            const cfg = STATUS_CONF[offer.status]
            const attempts = offer.dispatchAttempts || []
            return (
              <div
                key={offer.id}
                className="bg-white border border-neutral-100 rounded-2xl overflow-hidden"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.className}`}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-xs text-neutral-400">
                        إرسال: {formatInviteDeliveryStatus(offer.deliveryStatus)}
                      </span>
                      <span className="text-xs text-neutral-400">
                        رد: {formatInviteResponseStatus(offer.responseStatus)}
                      </span>
                    </div>
                    <div className="text-lg font-black text-[#0D1F1D]">
                      {offer.supplierName}
                    </div>

                    {attempts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {attempts.map((a, idx) => (
                          <span
                            key={`${a.channel}-${a.sent_at || idx}`}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              a.status === 'SENT' || a.status === 'DELIVERED'
                                ? 'bg-[#e0efec] text-[#123F3A]'
                                : a.status === 'FAILED'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-neutral-100 text-neutral-500'
                            }`}
                          >
                            {formatAttempt(a.channel, a.status)}
                            {a.sent_at
                              ? ` · ${new Date(a.sent_at).toLocaleString('ar-SA', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}`
                              : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {offer.status === 'pending' ? (
                      <div className="text-sm text-neutral-400 mt-2">
                        {attempts.length === 0
                          ? 'دعوة مسجّلة — لا محاولات بريد/واتساب بعد، ولم يصل عرض.'
                          : 'أُرسلت المراسلات — بانتظار رد المورد في النظام.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <div className="text-xs text-neutral-400">الإجمالي</div>
                          <div className="text-sm font-bold text-[#0D1F1D]">
                            {offer.amount}
                            {offer.amount !== 'وصل عرض' && offer.amount !== '—' ? ' ر.س' : ''}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-400">تغطية البنود</div>
                          <div className="text-sm font-bold text-[#0D1F1D]">
                            {offer.itemsPriced} / {offer.itemsTotal || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-400">مراسلات</div>
                          <div className="text-sm font-bold text-[#0D1F1D]">
                            {attempts.length || '—'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setSelectedOfferId(offer.id)
                        if (offer.quoteVersionId) {
                          setSelectedQuoteVersionId(offer.quoteVersionId)
                        }
                        openRfq(rfq!.id, 'offer-detail')
                      }}
                      className="text-xs px-3 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg font-semibold hover:bg-neutral-50"
                    >
                      تفاصيل
                    </button>
                    {offer.status !== 'pending' && (
                      <button
                        onClick={() => {
                          if (offer.quoteVersionId) {
                            setSelectedQuoteVersionId(offer.quoteVersionId)
                          }
                          openRfq(rfq!.id, 'comparison')
                        }}
                        className="text-xs px-3 py-1.5 border border-[#123F3A]/30 text-[#123F3A] rounded-lg font-semibold"
                      >
                        مقارنة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default OffersView
