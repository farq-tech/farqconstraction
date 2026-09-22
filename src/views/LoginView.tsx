import { useState } from 'react'
import { FarqAuthError, farqSession } from '../api/farqSession'
import type { NavProps } from '../types'

/**
 * Real sign-in against Farq's own identity store (`POST /api/auth/login`).
 *
 * This screen used to be a 1.4-second `setTimeout` that navigated home no
 * matter what was typed. Now a failed password fails, and a successful one
 * issues a session belonging to that account.
 *
 * "المتابعة بدون تسجيل دخول" stays for now: demo mode is still how the app is
 * driven locally, and the Farq API only honours it outside production with
 * `CONSTRUCTION_DEMO_MODE=1`. It is removed once real login is proven in
 * production, not before.
 */
export function LoginView({ navigate }: NavProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = email.trim().length > 0 && password.length > 0

  const handleLogin = async () => {
    if (!canSubmit || loading) return
    setError('')
    setLoading(true)
    try {
      await farqSession.signIn(email.trim(), password)
      // Never keep the password in component state after it has been spent.
      setPassword('')
      navigate('home')
    } catch (err) {
      setError(loginErrorAr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[#123F3A] flex items-center justify-center mb-4 shadow-lg">
            <span className="text-[#CFF5DC] font-black text-2xl">ف</span>
          </div>
          <div className="text-2xl font-black text-[#0D1F1D]">فرق تسعير</div>
          <div className="text-sm text-neutral-500 mt-1">فارك تكنولوجي</div>
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
                onKeyDown={e => e.key === 'Enter' && void handleLogin()}
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
                autoComplete="current-password"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A] transition-colors placeholder:text-neutral-400"
                onKeyDown={e => e.key === 'Enter' && void handleLogin()}
              />
            </div>
          </div>

          <button
            onClick={() => void handleLogin()}
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

{!import.meta.env.PROD && (
          <button
            type="button"
            onClick={() => navigate('home')}
            className="w-full mt-3 py-3 border border-neutral-200 text-[#123F3A] font-bold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
          >
            المتابعة بدون تسجيل دخول
          </button>
          )}

          <div className="mt-4 text-center">
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              الحسابات على قاعدة بيانات فرق نفسها — لا تعتمد على مزوّد خارجي.
            </p>
          </div>
        </div>

        {/* Supplier portal link.
            Suppliers do NOT sign in — they open the one-use link in their
            invitation. This is a hint for a supplier who landed here by
            mistake, not a second way into the buyer app. */}
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

/**
 * One cause, one instruction.
 *
 * A wrong password, a locked account, an API with no signing secret and an
 * unreachable server need four different actions from the person reading this.
 * Collapsing them into «فشل تسجيل الدخول» is what makes an operator problem
 * look like a forgotten password.
 */
function loginErrorAr(err: unknown): string {
  if (err instanceof FarqAuthError) {
    if (err.code === 'LOCAL_AUTH_NOT_CONFIGURED') {
      return 'خدمة الدخول غير متاحة الآن. حاول بعد قليل، وإن استمر الأمر تواصل مع فرق.'
    }
    if (err.code === 'ACCOUNT_LOCKED') {
      return 'محاولات دخول كثيرة من هذا الجهاز أو هذه الشبكة. انتظر ربع ساعة ثم أعد المحاولة.'
    }
    if (err.status === 0) {
      return 'تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.'
    }
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  }
  return 'تعذّر تسجيل الدخول — أعد المحاولة.'
}
