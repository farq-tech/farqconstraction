import type { NavProps } from '../types'

export function SendFailureView({ navigate }: NavProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-1">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">حالات فشل الإرسال</h1>
          <p className="text-neutral-500 text-sm">لا توجد إخفاقات مسجّلة حاليًا. ستظهر هنا الدعوات التي يتعذّر إرسالها فعليًا.</p>
        </div>
      </div>

      <div className="text-center py-16 bg-white border border-neutral-100 rounded-2xl mb-8">
        <div className="font-semibold text-[#0D1F1D] mb-1">لا إخفاقات</div>
        <p className="text-sm text-neutral-500">صندوق فشل الإرسال فارغ.</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => navigate('offers')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          متابعة العروض
        </button>
        <button
          onClick={() => navigate('rfq-detail')}
          className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          عرض تفاصيل الطلب
        </button>
      </div>
    </div>
  )
}
