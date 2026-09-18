import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import { formatSar } from '../api/constructionClient'

export function AwardSuccessView({ navigate }: NavProps) {
  const { awardResult, selectedRfqId } = useProcurement()
  const total = awardResult?.approved_total != null ? Number(awardResult.approved_total) : null
  const awardId = awardResult?.id ? String(awardResult.id) : null

  return (
    <div className="max-w-lg mx-auto px-4 lg:px-8 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-[#CFF5DC] flex items-center justify-center mx-auto mb-5">
        <svg className="w-8 h-8 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">تم اعتماد الترسية</h1>
      <p className="text-neutral-500 text-sm mb-6">
        سُجّلت الترسية في النظام
        {awardId ? ` · ${awardId.slice(0, 8)}` : ''}
      </p>
      {total != null && Number.isFinite(total) && (
        <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-4 mb-6 inline-block">
          <div className="text-xs text-neutral-500 mb-1">القيمة المعتمدة</div>
          <div className="text-2xl font-black text-[#123F3A]">{formatSar(total)}</div>
        </div>
      )}
      <div className="space-y-2">
        <button
          onClick={() => navigate(selectedRfqId ? 'rfq-detail' : 'rfq-list')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          عرض الطلب
        </button>
        <button
          onClick={() => navigate('home')}
          className="w-full py-3 text-neutral-500 font-semibold text-sm"
        >
          الرئيسية
        </button>
      </div>
      <p className="text-xs text-neutral-400 mt-6">
        الترسية محفوظة في النظام. إبلاغ المورد يتم من صفحة الطلب.
      </p>
    </div>
  )
}

export default AwardSuccessView
