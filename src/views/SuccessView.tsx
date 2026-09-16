import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  formatRfqApiStatus,
  formatRfqTitle,
  getConstructionRfq,
  type ConstructionRfq,
} from '../api/constructionClient'

export function SuccessView({ navigate }: NavProps) {
  const { selectedRfqId, openRfq } = useProcurement()
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)

  useEffect(() => {
    if (!selectedRfqId) return
    let cancelled = false
    getConstructionRfq(selectedRfqId)
      .then((data) => {
        if (!cancelled) setRfq(data)
      })
      .catch(() => {
        if (!cancelled) setRfq(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRfqId])

  const draft = String(rfq?.status || '').includes('DRAFT')
  const invites = rfq?.invitations?.length || rfq?.supplier_count || 0
  const lines = rfq?.current_version?.payload?.lines?.length || 0
  const responses = rfq?.response_count || 0
  const title = rfq
    ? formatRfqTitle({
        id: rfq.id,
        delivery: rfq.current_version?.payload?.delivery,
        engineering_department: rfq.engineering_department,
        buyer: rfq.current_version?.payload?.buyer,
      })
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-16 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-[#CFF5DC] flex items-center justify-center mb-6 animate-fade-up">
        <svg className="w-10 h-10 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-4xl font-black text-[#0D1F1D] mb-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
        {draft ? 'تم إنشاء مسودة الطلب' : 'تم إرسال طلب التسعير'}
      </h1>
      <p className="text-neutral-500 text-lg mb-2 animate-fade-up" style={{ animationDelay: '140ms' }}>
        {title || 'سُجّل الطلب على Farq'}
      </p>
      <p className="text-neutral-400 text-sm mb-8 animate-fade-up" style={{ animationDelay: '160ms' }}>
        {rfq ? formatRfqApiStatus(rfq.status) : 'بانتظار تحميل الحالة…'}
        {draft
          ? ' — الدعوات داخل النظام؛ البريد/واتساب لم يُرسلا بعد.'
          : ''}
      </p>

      <div
        className="w-full bg-white rounded-2xl border border-neutral-100 overflow-hidden mb-8 animate-fade-up"
        style={{ animationDelay: '200ms' }}
      >
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-neutral-100">
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{lines}</div>
            <div className="text-xs text-neutral-500 mt-1">بنود</div>
          </div>
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-emerald-600">{invites}</div>
            <div className="text-xs text-neutral-500 mt-1">دعوات</div>
          </div>
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-amber-600">{responses}</div>
            <div className="text-xs text-neutral-500 mt-1">ردود وصلت</div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-3 animate-fade-up" style={{ animationDelay: '260ms' }}>
        <button
          onClick={() => (selectedRfqId ? openRfq(selectedRfqId, 'offers') : navigate('offers'))}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          متابعة المراسلات والردود
        </button>
        <button
          onClick={() => (selectedRfqId ? openRfq(selectedRfqId, 'rfq-detail') : navigate('rfq-detail'))}
          className="w-full py-3.5 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          عرض تفاصيل الطلب
        </button>
        <button
          onClick={() => navigate('home')}
          className="w-full py-2 text-neutral-400 font-medium text-xs hover:text-neutral-600"
        >
          العودة للرئيسية
        </button>
      </div>
    </div>
  )
}

export default SuccessView
