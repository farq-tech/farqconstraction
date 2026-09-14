import type { NavProps } from '../types'

export function AwardSuccessView({ navigate }: NavProps) {
  return (
    <div className="max-w-lg mx-auto px-4 lg:px-8 py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-[#CFF5DC] flex items-center justify-center mx-auto mb-6 animate-fade-up">
        <svg className="w-10 h-10 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-4xl font-black text-[#0D1F1D] mb-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
        تم اعتماد الترسية
      </h1>
      <p className="text-neutral-500 text-base mb-8 animate-fade-up" style={{ animationDelay: '140ms' }}>
        تم إرسال إشعار الترسية إلى المورد.
      </p>

      <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden mb-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="divide-y divide-neutral-50">
          {[
            ['المورد', 'شركة البيت الحديث'],
            ['القيمة', '166,880 ر.س'],
            ['عدد البنود', '12 بندًا'],
            ['سبب الاختيار', 'أفضل سعر'],
            ['التاريخ', '16 سبتمبر 2026'],
            ['اعتمد القرار', 'محمد العمري'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between px-5 py-3.5 text-sm">
              <span className="text-neutral-500">{label}</span>
              <span className="font-semibold text-[#0D1F1D]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 animate-fade-up" style={{ animationDelay: '260ms' }}>
        <button
          onClick={() => navigate('rfq-detail')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          عرض سجل الطلب
        </button>
        <button
          onClick={() => navigate('home')}
          className="w-full py-3 text-neutral-400 font-medium text-sm hover:text-neutral-600"
        >
          العودة للرئيسية
        </button>
      </div>
    </div>
  )
}
