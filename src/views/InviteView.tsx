import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { farqSession } from '../api/farqSession'
import { acceptInvitation, claimInvitation, previewInvitation } from '../api/teamClient'

/**
 * Where an invitation email lands. The colleague sets a password (a new
 * account, or the existing one addressed by the invitation), joins the company
 * and goes straight into the app. The token rides in the URL fragment, which
 * browsers never send to a server.
 */
export function InviteView({ navigate }: NavProps) {
  const token = (() => {
    try {
      return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('invite') || ''
    } catch {
      return ''
    }
  })()
  const [info, setInfo] = useState<{ email: string; organization_name: string; has_account: boolean } | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('رابط الدعوة غير مكتمل. افتحه من البريد مرة أخرى.')
      return
    }
    previewInvitation(token)
      .then(setInfo)
      .catch(() => setError('الدعوة منتهية أو استُخدمت من قبل. اطلب من مدير الشركة دعوة جديدة.'))
  }, [token])

  const join = async () => {
    if (!info) return
    setError('')
    if (password.length < 8) return setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
    if (password !== confirm) return setError('كلمتا المرور غير متطابقتين.')
    setBusy(true)
    try {
      if (info.has_account) {
        const session = await claimInvitation(token, password)
        if (!farqSession.adoptSession(session)) throw new Error('تعذّر فتح الجلسة.')
      } else {
        await farqSession.signUp(info.email, password)
      }
      await acceptInvitation(token)
      window.history.replaceState(null, '', window.location.pathname)
      navigate('home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر قبول الدعوة.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm text-left focus:outline-none focus:border-[#123F3A]'
  return (
    <div className="min-h-screen bg-[#F7F8F7] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-neutral-100 p-6">
        <div className="text-lg font-black text-[#0D1F1D] mb-1">دعوة للانضمام</div>
        {!info && !error && <div className="text-sm text-neutral-500">جارٍ فتح الدعوة…</div>}
        {info && (
          <>
            <div className="text-sm text-neutral-600 mb-4 leading-relaxed">
              دُعيت إلى <span className="font-bold text-[#0D1F1D]">{info.organization_name}</span> في فرق تسعير
              بالبريد <span dir="ltr" className="font-semibold">{info.email}</span>. اختر كلمة مرور لحسابك.
            </div>
            <div className="space-y-2.5">
              <input type="password" autoComplete="new-password" dir="ltr" placeholder="كلمة المرور (8 أحرف على الأقل)"
                className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
              <input type="password" autoComplete="new-password" dir="ltr" placeholder="أعد كتابة كلمة المرور"
                className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button onClick={() => void join()} disabled={busy || !password || !confirm}
              className="mt-4 w-full py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50">
              {busy ? 'جارٍ الانضمام…' : 'انضم وابدأ'}
            </button>
          </>
        )}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <button onClick={() => navigate('login')} className="mt-4 w-full text-xs text-neutral-400">لديك حساب بالفعل؟ تسجيل الدخول</button>
      </div>
    </div>
  )
}
