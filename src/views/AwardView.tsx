import { useState } from 'react'
import type { NavProps } from '../types'

const REASONS = ['أفضل سعر', 'أسرع توريد', 'مورد معتمد', 'أفضل قيمة', 'سبب آخر']

export function AwardView({ navigate }: NavProps) {
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const canAward = reason && (reason !== 'سبب آخر' || customReason.trim())

  if (showConfirm) {
    return (
      <div className="max-w-lg mx-auto px-4 lg:px-8 py-8">
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
          <div className="bg-[#f0faf7] px-6 py-5 text-center border-b border-neutral-100">
            <div className="w-12 h-12 rounded-full bg-[#CFF5DC] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-[#0D1F1D]">اعتماد الترسية</h2>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">المورد</span>
              <span className="font-bold text-[#0D1F1D]">شركة البيت الحديث</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">عدد البنود</span>
              <span className="font-bold text-[#0D1F1D]">12 بندًا</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">قيمة العقد</span>
              <span className="font-bold text-[#0D1F1D]">166,880 ر.س</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">سبب الاختيار</span>
              <span className="font-bold text-[#0D1F1D]">{reason === 'سبب آخر' ? customReason : reason}</span>
            </div>
            <div className="h-px bg-neutral-100" />
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">التوفير مقابل أعلى عرض</span>
              <span className="font-bold text-emerald-600">17,920 ر.س</span>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-2">
            <button
              onClick={() => navigate('award-success')}
              className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
            >
              اعتماد الترسية
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="w-full py-3 text-neutral-500 font-semibold text-sm hover:text-neutral-700"
            >
              العودة
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">اختيار العرض</h1>
        <p className="text-neutral-500 text-sm">بورسلان أرضيات · 5,600 م²</p>
      </div>

      {/* Live summary */}
      <div className="bg-[#f0faf7] border border-[#123F3A]/10 rounded-2xl p-5 mb-6">
        <div className="text-sm font-semibold text-[#123F3A] mb-3">ملخص الترسية</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-xl font-black text-[#0D1F1D]">166,880</div>
            <div className="text-xs text-neutral-500 mt-0.5">ر.س إجمالي</div>
          </div>
          <div>
            <div className="text-xl font-black text-[#0D1F1D]">1</div>
            <div className="text-xs text-neutral-500 mt-0.5">مورد</div>
          </div>
          <div>
            <div className="text-xl font-black text-[#0D1F1D]">12</div>
            <div className="text-xs text-neutral-500 mt-0.5">بندًا</div>
          </div>
          <div>
            <div className="text-xl font-black text-emerald-600">17,920</div>
            <div className="text-xs text-neutral-500 mt-0.5">ر.س توفير</div>
          </div>
        </div>
      </div>

      {/* Selected offer */}
      <div className="bg-white border-2 border-[#123F3A]/20 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="font-black text-xl text-[#0D1F1D]">شركة البيت الحديث</div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-semibold">الأقل تكلفة</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-neutral-400">سعر الوحدة</div><div className="font-bold mt-0.5">29.80 ر.س</div></div>
          <div><div className="text-xs text-neutral-400">الإجمالي</div><div className="font-bold mt-0.5">166,880 ر.س</div></div>
          <div><div className="text-xs text-neutral-400">التوريد</div><div className="font-bold mt-0.5">21 يوم</div></div>
        </div>
      </div>

      {/* Reason */}
      <div className="mb-6">
        <div className="text-sm font-bold text-[#0D1F1D] mb-3">سبب الاختيار</div>
        <div className="flex flex-wrap gap-2">
          {REASONS.map(r => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                reason === r
                  ? 'border-[#123F3A] bg-[#f0faf7] text-[#123F3A]'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === 'سبب آخر' && (
          <input
            type="text"
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            placeholder="أدخل سبب الاختيار…"
            className="mt-3 w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A]"
            autoFocus
          />
        )}
      </div>

      <button
        disabled={!canAward}
        onClick={() => setShowConfirm(true)}
        className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        متابعة الترسية
      </button>
    </div>
  )
}
