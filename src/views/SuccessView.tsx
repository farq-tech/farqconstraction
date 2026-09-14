import type { NavProps } from '../types'

export function SuccessView({ navigate }: NavProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-16 flex flex-col items-center text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-[#CFF5DC] flex items-center justify-center mb-6 animate-fade-up">
        <svg className="w-10 h-10 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-4xl font-black text-[#0D1F1D] mb-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
        تم إرسال طلب التسعير
      </h1>
      <p className="text-neutral-500 text-lg mb-8 animate-fade-up" style={{ animationDelay: '140ms' }}>
        أرسل فرق 58 بندًا إلى 92 موردًا.
      </p>

      {/* Status cards */}
      <div className="w-full bg-white rounded-2xl border border-neutral-100 overflow-hidden mb-8 animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-neutral-100">
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-[#123F3A]">61</div>
            <div className="text-xs text-neutral-500 mt-1">تم الإرسال بالبريد</div>
          </div>
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-emerald-600">24</div>
            <div className="text-xs text-neutral-500 mt-1">جاهز للواتساب</div>
          </div>
          <div className="px-5 py-5 text-center">
            <div className="text-2xl font-black text-amber-600">7</div>
            <div className="text-xs text-neutral-500 mt-1">قيد الإرسال</div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-3 animate-fade-up" style={{ animationDelay: '260ms' }}>
        <button
          onClick={() => navigate('offers')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          متابعة العروض
        </button>
        <button
          onClick={() => navigate('rfq-detail')}
          className="w-full py-3.5 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          عرض تفاصيل الطلب
        </button>
        <button
          onClick={() => navigate('sent-failure')}
          className="w-full py-2.5 text-amber-600 font-medium text-xs hover:text-amber-700 transition-colors"
        >
          معاينة حالة فشل الإرسال ←
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
