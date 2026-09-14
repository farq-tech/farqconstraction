import type { NavProps } from '../types'

export function AccessDeniedView({ navigate }: NavProps) {
  return (
    <div className="max-w-sm mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">ليس لديك صلاحية</h1>
      <p className="text-neutral-500 text-sm leading-relaxed mb-8">
        تواصل مع مسؤول شركتك إذا كنت تحتاج الوصول إلى هذه الميزة.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => navigate('home')}
          className="w-full px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          العودة للرئيسية
        </button>
        <button
          onClick={() => navigate('settings')}
          className="w-full px-6 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          إعدادات الحساب
        </button>
      </div>
    </div>
  )
}
