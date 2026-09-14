import { useState } from 'react'
import type { NavProps } from '../types'

export function LoginView({ navigate }: NavProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = email.trim().length > 0 && password.length > 0

  const handleLogin = () => {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      navigate('home')
    }, 1400)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[#123F3A] flex items-center justify-center mb-4 shadow-lg">
            <span className="text-[#CFF5DC] font-black text-2xl">ف</span>
          </div>
          <div className="text-2xl font-black text-[#0D1F1D]">فرق للبناء</div>
          <div className="text-sm text-neutral-500 mt-1">منصة المشتريات الذكية</div>
        </div>

        {/* Card */}
        <div className="bg-white border border-neutral-100 rounded-3xl p-7 shadow-sm">
          <h1 className="text-xl font-black text-[#0D1F1D] mb-6">تسجيل الدخول</h1>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1.5 block">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com.sa"
                dir="ltr"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A] transition-colors placeholder:text-neutral-400"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1.5 block">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A] transition-colors placeholder:text-neutral-400"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={!canSubmit || loading}
            className="w-full mt-6 py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                جاري الدخول…
              </>
            ) : 'دخول'}
          </button>

          <div className="mt-4 text-center">
            <button className="text-xs text-neutral-400 hover:text-[#123F3A] transition-colors">
              نسيت كلمة المرور؟
            </button>
          </div>
        </div>

        {/* Supplier portal link */}
        <div className="mt-5 text-center">
          <button
            onClick={() => navigate('supplier')}
            className="text-xs text-neutral-500 hover:text-[#123F3A] transition-colors"
          >
            أنت مورد؟ <span className="font-bold underline">ادخل بوابة الموردين</span>
          </button>
        </div>
      </div>
    </div>
  )
}
