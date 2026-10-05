import { useState } from 'react'
import { FarqAuthError, farqSession } from '../../api/farqSession'

function loginErrorAr(err: unknown): string {
  if (err instanceof FarqAuthError) {
    if (err.code === 'LOCAL_AUTH_NOT_CONFIGURED') return 'خدمة الدخول غير متاحة الآن. حاول بعد قليل.'
    if (err.code === 'ACCOUNT_LOCKED') return 'محاولات دخول كثيرة. انتظر ربع ساعة ثم أعد المحاولة.'
    if (err.status === 0) return 'تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.'
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  }
  return 'تعذّر تسجيل الدخول. أعد المحاولة.'
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      await farqSession.signIn(email.trim(), password)
      setPassword('')
    } catch (err) {
      setError(loginErrorAr(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#123F3A] flex flex-col m-safe-top m-safe-bottom" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-10">
        <img src="/brand/farq-wordmark.png" alt="فرق" className="h-14 w-auto brightness-0 invert opacity-95" />
        <div className="mt-4 h-[3px] w-24 rounded-full bg-[#9BC53D]" />
        <div className="mt-3 text-[13px] tracking-[0.3em] text-white/70 font-semibold">CONSTRUCTION</div>
        <p className="mt-6 text-white/75 text-[15px] text-center leading-relaxed">طلبات التسعير وعروض الموردين في مكان واحد</p>
      </div>
      <form onSubmit={submit} className="bg-[#f2f3ef] rounded-t-[32px] px-5 pt-7 pb-8 space-y-3">
        <h1 className="text-[24px] font-black text-[#0D1F1D] mb-2">تسجيل الدخول</h1>
        {error && <div className="rounded-2xl bg-red-50 text-red-700 text-[14px] font-semibold px-4 py-3">{error}</div>}
        <label className="block">
          <span className="text-[13px] font-semibold text-neutral-500 px-1">البريد الإلكتروني</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com.sa"
            className="mt-1 w-full h-[52px] rounded-2xl bg-white px-4 text-right outline-none focus:ring-2 focus:ring-[#123F3A]/30"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-neutral-500 px-1">كلمة المرور</span>
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full h-[52px] rounded-2xl bg-white px-4 text-right outline-none focus:ring-2 focus:ring-[#123F3A]/30"
          />
        </label>
        <button type="submit" disabled={!canSubmit} className="w-full h-[52px] mt-3 rounded-2xl bg-[#123F3A] text-white font-bold text-[17px] disabled:opacity-40 m-press">
          {loading ? 'جارٍ الدخول…' : 'دخول'}
        </button>
      </form>
    </div>
  )
}
