import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/app/AuthProvider"
import { paths } from "@/app/paths"
import { env } from "@/lib/env"
import type { NavProps } from "@/types"

export function LoginView(_props: NavProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const canSubmit = email.trim().length > 0 && password.length > 0

  const handleLogin = async () => {
    if (!canSubmit || loading) return
    setError("")
    setLoading(true)

    try {
      // Phase A: wire Supabase Auth against farq-main. No invented users here.
      if (!env.supabaseAnonKey) {
        if (env.allowPrototypeChrome) {
          auth.enterPrototypeSession()
          navigate(paths.projects, { replace: true })
          return
        }
        setError(
          "لم يتم ضبط مفاتيح المصادقة بعد. سجّل الدخول الحقيقي سيُفعَّل في المرحلة التالية دون مستخدمين تجريبيين.",
        )
        return
      }

      setError("تسجيل الدخول الحقيقي عبر Supabase قيد الربط — لا يُسمح بدخول وهمي على مسار الإنتاج.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[#123F3A] flex items-center justify-center mb-4 shadow-lg">
            <span className="text-[#CFF5DC] font-black text-2xl">ف</span>
          </div>
          <div className="text-2xl font-black text-[#0D1F1D]">{env.appName}</div>
          <div className="text-sm text-neutral-500 mt-1">منصة المشتريات الذكية</div>
        </div>

        <div className="bg-white border border-neutral-100 rounded-3xl p-7 shadow-sm">
          <h1 className="text-xl font-black text-[#0D1F1D] mb-6">تسجيل الدخول</h1>

          {error ? (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 font-semibold">
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1.5 block">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com.sa"
                dir="ltr"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A] transition-colors placeholder:text-neutral-400"
                onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-600 mb-1.5 block">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#123F3A] transition-colors placeholder:text-neutral-400"
                onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={!canSubmit || loading}
            className="w-full mt-6 py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? "جاري الدخول…" : "دخول"}
          </button>

          {env.allowPrototypeChrome ? (
            <button
              type="button"
              onClick={() => {
                auth.enterPrototypeSession()
                navigate(paths.projects, { replace: true })
              }}
              className="w-full mt-3 py-3 border border-amber-200 bg-amber-50 text-amber-900 font-semibold rounded-xl text-sm"
            >
              دخول واجهة تجريبية (ليست بيانات إنتاج)
            </button>
          ) : null}
        </div>

        <div className="mt-5 text-center">
          <Link
            to={paths.supplierPortal}
            className="text-xs text-neutral-500 hover:text-[#123F3A] transition-colors"
          >
            أنت مورد؟ <span className="font-bold underline">ادخل بوابة الموردين</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
