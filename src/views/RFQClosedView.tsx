import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatRfqTitle,
  getConstructionRfq,
  type ConstructionRfq,
} from '../api/constructionClient'

export function RFQClosedView({ navigate }: NavProps) {
  const { selectedRfqId, openRfq } = useProcurement()
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedRfqId) {
      setLoading(false)
      setError('لم يُحدَّد طلب')
      return
    }
    let cancelled = false
    getConstructionRfq(selectedRfqId)
      .then((data) => {
        if (!cancelled) setRfq(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRfqId])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-16 text-center text-neutral-400 font-semibold">
        جاري التحميل…
      </div>
    )
  }

  if (error || !rfq) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-16 text-center">
        <div className="font-semibold text-neutral-600 mb-3">{error || 'غير موجود'}</div>
        <button onClick={() => navigate('rfq-list')} className="px-5 py-2.5 bg-[#123F3A] text-white rounded-xl text-sm font-bold">
          القائمة
        </button>
      </div>
    )
  }

  const title = formatRfqTitle({
    id: rfq.id,
    delivery: rfq.current_version?.payload?.delivery,
    engineering_department: rfq.engineering_department,
    buyer: rfq.current_version?.payload?.buyer,
  })
  const lines = rfq.current_version?.payload?.lines || []

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('rfq-list')} className="text-xs text-neutral-400 hover:text-neutral-600">
            طلبات التسعير
          </button>
          <span className="text-neutral-300">/</span>
          <span className="text-xs text-neutral-500 truncate">{title}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-black text-[#0D1F1D]">{title}</h1>
          <span className="px-3 py-1 rounded-full bg-neutral-200 text-neutral-600 text-xs font-bold">مغلق</span>
        </div>
        <div className="text-sm text-neutral-500 mt-1 font-mono">
          {rfq.id.slice(0, 8)} · أُغلق {formatArDate(rfq.submission_closed_at || rfq.created_at)}
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 mb-6">
        <div className="text-sm font-bold text-[#0D1F1D] mb-0.5">انتهى استلام العروض</div>
        <div className="text-xs text-neutral-500">
          {rfq.closure_note || 'يمكنك مراجعة العروض المستلمة وإجراء المقارنة والترسية.'}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { n: String(lines.length), label: 'بندًا' },
          { n: String(rfq.supplier_count), label: 'موردًا' },
          { n: String(rfq.response_count), label: 'عرضًا' },
          {
            n: String(rfq.invitations.filter((i) => i.response_status === 'QUOTED').length),
            label: 'مكتملة',
          },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{m.n}</div>
            <div className="text-xs text-neutral-500 mt-0.5 font-semibold">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <button
          onClick={() => openRfq(rfq.id, 'offers')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          عرض العروض المستلمة ({rfq.response_count})
        </button>
        <button
          onClick={() => openRfq(rfq.id, 'comparison')}
          className="w-full py-3.5 border border-neutral-200 text-neutral-700 font-bold rounded-xl text-sm"
        >
          مقارنة العروض
        </button>
        <button
          onClick={() => navigate('rfq-list')}
          className="w-full py-2.5 text-neutral-400 font-semibold text-sm"
        >
          العودة للقائمة
        </button>
      </div>
    </div>
  )
}

export default RFQClosedView
