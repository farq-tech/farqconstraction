import type { NavProps } from '../types'

export function RFQClosedView({ navigate }: NavProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('rfq-list')} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
            طلبات التسعير
          </button>
          <span className="text-neutral-300">/</span>
          <span className="text-xs text-neutral-500">فلل الواحة السكنية</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-black text-[#0D1F1D]">فلل الواحة السكنية</h1>
          <span className="px-3 py-1 rounded-full bg-neutral-200 text-neutral-600 text-xs font-bold">مغلق</span>
        </div>
        <div className="text-sm text-neutral-500 mt-1">RFQ-2024-055 · أُغلق في 28 أغسطس 2026</div>
      </div>

      {/* Closed banner */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-bold text-[#0D1F1D] mb-0.5">انتهى موعد استلام العروض</div>
          <div className="text-xs text-neutral-500">انتهى الموعد النهائي. يمكنك مراجعة العروض المستلمة وإجراء المقارنة والترسية.</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { n: '33', label: 'بندًا', sub: 'في الطلب' },
          { n: '54', label: 'موردًا', sub: 'أُرسل إليهم' },
          { n: '28', label: 'عرضًا', sub: 'مستلمًا' },
          { n: '18', label: 'مكتملة', sub: 'عروض كاملة' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{m.n}</div>
            <div className="text-xs text-neutral-500 mt-0.5 font-semibold">{m.label}</div>
            <div className="text-[10px] text-neutral-400">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress bar — frozen */}
      <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-[#0D1F1D]">معدل الاستجابة النهائي</span>
          <span className="text-sm text-neutral-500">28 / 54 موردًا استجابوا</span>
        </div>
        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div className="h-full bg-neutral-400 rounded-full" style={{ width: `${(28 / 54) * 100}%` }} />
        </div>
        <div className="text-xs text-neutral-400 mt-2">52% نسبة الاستجابة</div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('offers')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          عرض العروض المستلمة (28)
        </button>
        <button
          onClick={() => navigate('comparison')}
          className="w-full py-3.5 border border-neutral-200 text-neutral-700 font-bold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          مقارنة العروض
        </button>
        <button
          onClick={() => navigate('rfq-list')}
          className="w-full py-2.5 text-neutral-400 font-semibold text-sm hover:text-neutral-600 transition-colors"
        >
          العودة للقائمة
        </button>
      </div>
    </div>
  )
}
