import { useState } from 'react'
import type { NavProps } from '../types'

const FAILED = [
  { name: 'مصنع السلام للبورسلان', city: 'الرياض', reason: 'بريد إلكتروني مرفوض', channel: 'بريد' },
  { name: 'الحديد الوطني', city: 'الدمام', reason: 'رقم واتساب غير صحيح', channel: 'واتساب' },
  { name: 'بيتومين الخليج', city: 'الدمام', reason: 'البريد ممتلئ', channel: 'بريد' },
  { name: 'مصنع الجبس', city: 'جدة', reason: 'انتهت مهلة الإرسال', channel: 'بريد' },
  { name: 'نور الخليج', city: 'الدمام', reason: 'رقم واتساب محظور', channel: 'واتساب' },
]

export function SendFailureView({ navigate }: NavProps) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [retried, setRetried] = useState<string[]>([])

  const visible = FAILED.filter(f => !dismissed.includes(f.name))

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-1">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">تعذّر إرسال بعض الدعوات</h1>
          <p className="text-neutral-500 text-sm">
            أُرسل الطلب بنجاح إلى <span className="font-bold text-[#0D1F1D]">87 موردًا</span>، لكن تعذّر إرساله إلى <span className="font-bold text-amber-700">{FAILED.length} موردين</span>.
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white border border-neutral-100 rounded-2xl mb-6 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-neutral-100">
          <div className="px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">87</div>
            <div className="text-xs text-neutral-500 mt-0.5">أُرسلت</div>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="text-2xl font-black text-amber-600">{visible.length - retried.filter(n => visible.find(f => f.name === n)).length}</div>
            <div className="text-xs text-neutral-500 mt-0.5">فشلت</div>
          </div>
          <div className="px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{retried.length}</div>
            <div className="text-xs text-neutral-500 mt-0.5">أُعيد إرسالها</div>
          </div>
        </div>
      </div>

      {/* Failed list */}
      <div className="space-y-3 mb-8">
        {visible.map(f => (
          <div key={f.name} className="bg-white border border-neutral-100 rounded-2xl px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-black text-[#0D1F1D] text-sm mb-0.5">{f.name}</div>
                <div className="text-xs text-neutral-400">{f.city} · عبر {f.channel}</div>
                <div className="text-xs text-amber-700 mt-1 font-semibold">{f.reason}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {retried.includes(f.name) ? (
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-[#CFF5DC] text-[#1a7a45] font-semibold">أُعيد الإرسال</span>
                ) : (
                  <button
                    onClick={() => setRetried(p => [...p, f.name])}
                    className="text-xs px-3 py-1.5 bg-[#123F3A] text-white rounded-lg font-semibold hover:bg-[#1a5c54] transition-colors"
                  >
                    إعادة إرسال
                  </button>
                )}
                <button
                  onClick={() => setDismissed(p => [...p, f.name])}
                  className="text-xs px-3 py-1.5 border border-neutral-200 text-neutral-500 rounded-lg font-semibold hover:bg-neutral-50 transition-colors"
                >
                  تجاهل
                </button>
              </div>
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-[#CFF5DC] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div className="font-bold text-[#0D1F1D] text-sm">تمت معالجة جميع الحالات</div>
          </div>
        )}
      </div>

      {/* CTAs */}
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
