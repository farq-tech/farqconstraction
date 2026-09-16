import type { NavProps } from '../types'

export function ComparisonView({ navigate }: NavProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">مقارنة العروض</h1>
          <p className="text-neutral-500 text-sm">لا توجد عروض للمقارنة بعد</p>
        </div>
      </div>

      <div className="text-center py-20 bg-white border border-neutral-100 rounded-2xl">
        <div className="font-semibold text-[#0D1F1D] mb-1">المقارنة فارغة</div>
        <p className="text-sm text-neutral-500 mb-6">ستتوفر المقارنة عند استلام عرضين مكتملين على الأقل.</p>
        <button
          onClick={() => navigate('offers')}
          className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          العودة للعروض
        </button>
      </div>
    </div>
  )
}
