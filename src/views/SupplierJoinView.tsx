import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { supplierPortalClient, SupplierPortalError, type JoinPreview } from '../api/supplierPortalClient'
import { captureJoinToken, forgetJoinToken } from '../lib/joinLink'
import { Card, Notice, PortalHeader, PrimaryButton, SecondaryButton } from '../components/supplier/PortalChrome'
import PhoneLogin from '../components/supplier/PhoneLogin'

/*
 * «انضم لفرق كمورد» — the one-time join link (api: lib/construction/supplier-join.js).
 * We prepared the account from the supplier's record; the supplier only sets
 * a password and agrees, or says «لا أرغب». Mobile first, right to left.
 */

type Phase = 'loading' | 'invalid' | 'form' | 'joined' | 'declined'

export function SupplierJoinView({ navigate }: NavProps) {
  const token = useMemo(() => captureJoinToken(), [])
  const client = useMemo(() => supplierPortalClient(), [])
  const [phase, setPhase] = useState<Phase>(token ? 'loading' : 'invalid')
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    client
      .joinPreview(token)
      .then((p) => {
        if (cancelled) return
        setPreview(p)
        setPhase('form')
      })
      .catch(() => {
        if (!cancelled) setPhase('invalid')
      })
    return () => {
      cancelled = true
    }
  }, [client, token])

  const mismatch = confirm.length > 0 && confirm !== password
  const canJoin = password.length >= 8 && confirm === password && consent && !busy

  async function join() {
    if (!token || !canJoin) return
    setBusy('join')
    setError(null)
    try {
      await client.joinAccept(token, { password, password_confirm: confirm, consent: true })
      forgetJoinToken()
      setPassword('')
      setConfirm('')
      setPhase('joined')
    } catch (err) {
      setError(err instanceof SupplierPortalError ? err.message : 'تعذّر إتمام الانضمام — أعد المحاولة.')
    } finally {
      setBusy(null)
    }
  }

  async function decline() {
    if (!token || busy) return
    setBusy('decline')
    setError(null)
    try {
      await client.joinDecline(token)
      forgetJoinToken()
      setPhase('declined')
    } catch (err) {
      setError(err instanceof SupplierPortalError ? err.message : 'تعذّر الإرسال — أعد المحاولة.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAF8]" dir="rtl">
      <PortalHeader kind="home" title="انضم لفرق كمورد" subtitle="فرق للبناء" />
      <main className="max-w-md mx-auto px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-4">
        {phase === 'loading' && <div className="text-center py-16 text-neutral-400 font-semibold">جاري التحميل…</div>}

        {phase === 'invalid' && (
          <Card className="text-center p-6">
            <h1 className="text-lg font-black text-[#0D1F1D] mb-2">الرابط غير صالح</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              انتهت مدة الرابط أو استُخدم من قبل. إذا كان حسابك مفعّلاً ادخل برقم جوالك وكلمة السر.
            </p>
            <div className="mt-4">
              <SecondaryButton onClick={() => navigate('supplier')}>دخول المورد</SecondaryButton>
            </div>
          </Card>
        )}

        {phase === 'form' && preview && (
          <>
            <Card className="p-5">
              <p className="text-xs font-bold text-neutral-500 mb-1">جهّزنا لك حساب مورد في فرق</p>
              <h1 className="text-xl font-black text-[#0D1F1D] leading-snug">{preview.company_name || 'حساب المورد'}</h1>
              <dl className="mt-3 space-y-1.5 text-sm">
                {preview.phone_masked && (
                  <div className="flex gap-2">
                    <dt className="text-neutral-500">الجوال:</dt>
                    <dd className="font-semibold text-[#0D1F1D]" dir="ltr">{preview.phone_masked}</dd>
                  </div>
                )}
                {preview.city && (
                  <div className="flex gap-2">
                    <dt className="text-neutral-500">المدينة:</dt>
                    <dd className="font-semibold text-[#0D1F1D]">{preview.city}</dd>
                  </div>
                )}
              </dl>
              {preview.trades.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preview.trades.map((t) => (
                    <span key={t} className="rounded-full bg-[#CFF5DC] px-2.5 py-1 text-[11px] font-bold text-[#123F3A]">{t}</span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[12px] text-neutral-500 leading-relaxed">
                توصلك طلبات التسعير في تخصصك وتتابع عروضك ومحادثاتك من مكان واحد، بدون رسوم.
              </p>
            </Card>

            <Card className="p-5 space-y-3">
              <label className="block">
                <span className="block text-xs font-bold text-neutral-600 mb-1">كلمة السر</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm"
                />
                <span className="block text-[11px] text-neutral-400 mt-1">8 أحرف على الأقل</span>
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-neutral-600 mb-1">تأكيد كلمة السر</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm"
                />
                {mismatch && <span className="block text-[11px] font-semibold text-red-700 mt-1">كلمتا السر غير متطابقتين</span>}
              </label>
              <label className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-[#123F3A]"
                />
                <span className="text-[13px] text-[#0D1F1D] leading-relaxed">
                  أوافق على الانضمام لفرق كمورد وعلى{' '}
                  <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-bold text-[#123F3A] underline">
                    الشروط وسياسة الخصوصية
                  </button>
                </span>
              </label>
              {showTerms && <TermsAndPrivacy />}
              {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
              <PrimaryButton onClick={join} disabled={!canJoin}>
                {busy === 'join' ? 'جاري التفعيل…' : 'انضمام'}
              </PrimaryButton>
              <SecondaryButton onClick={decline} disabled={busy !== null}>
                {busy === 'decline' ? 'جاري الإرسال…' : 'لا أرغب'}
              </SecondaryButton>
            </Card>
          </>
        )}

        {phase === 'joined' && (
          <>
            <Notice tone="mint">تم تفعيل حسابك. تدخل من الآن برقم جوالك وكلمة السر.</Notice>
            <PhoneLogin onDone={() => navigate('supplier')} />
          </>
        )}

        {phase === 'declined' && (
          <Card className="text-center p-6">
            <h1 className="text-lg font-black text-[#0D1F1D] mb-2">تم، ما راح نرسل لك دعوة انضمام مرة ثانية</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              روابط طلبات التسعير اللي توصلك تبقى شغالة عادي. لحذف بياناتك تواصل معنا على info@farq.sa.
            </p>
          </Card>
        )}
      </main>
    </div>
  )
}

/** PDPL: what we hold, why, and how to decline or delete. */
function TermsAndPrivacy() {
  return (
    <div className="rounded-xl bg-neutral-50 border border-neutral-100 p-3 text-[12px] text-neutral-700 leading-relaxed space-y-2">
      <p className="font-bold text-[#0D1F1D]">البيانات اللي عندنا عنك</p>
      <p>اسم المنشأة، رقم الجوال (وإن وُجد الإيميل)، المدينة، ونوع النشاط — من مصادر الأدلة التجارية أو من تواصلك معنا.</p>
      <p className="font-bold text-[#0D1F1D]">وش نسوي فيها</p>
      <p>نرسل لك طلبات التسعير في تخصصك، ونحفظ عروضك ومحادثاتك مع المشترين. ما نبيع بياناتك ولا نعطيها لأحد غير المشتري اللي تتعامل معه.</p>
      <p className="font-bold text-[#0D1F1D]">نحفظ مع موافقتك</p>
      <p>وقت الموافقة ونسخة الشروط وبصمة مشفّرة لعنوان الاتصال (ليس العنوان نفسه). كلمة السر محفوظة مشفّرة ولا نطّلع عليها.</p>
      <p className="font-bold text-[#0D1F1D]">الرفض والحذف</p>
      <p>تقدر تضغط «لا أرغب» ولن نرسل لك دعوة انضمام مرة ثانية، أو تطلب حذف حسابك وبياناتك في أي وقت على info@farq.sa — وفق نظام حماية البيانات الشخصية.</p>
    </div>
  )
}
