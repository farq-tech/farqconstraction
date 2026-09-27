/**
 * «حسابي» (frames 3a–3e). The link is enough to sign in; a password is
 * optional: a 6-digit code on the email first, then the password. A supplier
 * with a phone only is asked for an email first («أضف إيميلك»).
 */
import { useEffect, useRef, useState } from 'react'
import {
  SupplierPortalError,
  type OtpPurpose,
  type SupplierAccount,
  type SupplierPortalClient,
} from '../../api/supplierPortalClient'
import { formatDateAr } from '../../lib/supplierPortal'
import { Card, CheckIcon, Notice, PortalHeader, PrimaryButton, SecondaryButton } from './PortalChrome'

type Step = 'overview' | 'code' | 'password'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function passwordChecks(password: string, repeat: string): { long: boolean; same: boolean } {
  return { long: password.length >= 8, same: password.length > 0 && password === repeat }
}

function Row({ label, value, muted = false, ltr = false }: { label: string; value: string; muted?: boolean; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-neutral-500 flex-shrink-0">{label}</span>
      <bdi className={`text-[13px] font-semibold min-w-0 truncate ${muted ? 'text-neutral-400' : 'text-[#0D1F1D]'}`} dir={ltr ? 'ltr' : undefined}>
        {value}
      </bdi>
    </div>
  )
}

function linkReach(account: SupplierAccount): string {
  if (account.email && account.phone) return 'يصلكم على الإيميل والجوال'
  if (account.email) return 'يصلكم على الإيميل'
  if (account.phone) return 'يصلكم على الجوال'
  return '—'
}

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      {/* Boxes left-to-right, as digits are read. */}
      <div className="flex justify-center gap-2" dir="ltr" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const active = i === Math.min(value.length, 5)
          return (
            <span
              key={i}
              className={`w-11 h-12 rounded-xl border bg-white flex items-center justify-center text-lg font-bold text-[#0D1F1D] ${
                active ? 'border-[#123F3A] border-[1.5px]' : 'border-neutral-200'
              }`}
            >
              {value[i] || ''}
            </span>
          )
        })}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="رمز التحقق"
        maxLength={6}
        className="absolute inset-0 w-full h-full opacity-0"
      />
    </div>
  )
}

export function AccountView({
  client,
  account,
  supplierName,
  onAccountChange,
  onClose,
}: {
  client: SupplierPortalClient
  account: SupplierAccount
  supplierName: string
  onAccountChange: (account: SupplierAccount) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('overview')
  const [purpose, setPurpose] = useState<OtpPurpose>('SET_PASSWORD')
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (step !== 'code') return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const startOtp = async (nextPurpose: OtpPurpose, toEmail?: string) => {
    setBusy(true)
    setError(null)
    try {
      const out = await client.requestOtp(nextPurpose, toEmail)
      setPurpose(nextPurpose)
      setSentTo(out.sent_to || toEmail || account.email)
      setResendAt(Date.now() + out.resend_after_sec * 1000)
      setClock(Date.now())
      setCode('')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الرمز.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await client.verifyOtp(code, password)
      onAccountChange(
        next || {
          ...account,
          has_password: true,
          email: purpose === 'SET_PASSWORD' ? account.email : sentTo,
          password_set_at: new Date().toISOString(),
        },
      )
      setSaved(true)
      setPassword('')
      setRepeat('')
      setCode('')
      setStep('overview')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر الحفظ.'
      setError(message)
      if (err instanceof SupplierPortalError && /^OTP_/.test(err.code)) setStep('code')
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setError(null)
    if (step === 'password') setStep('code')
    else if (step === 'code') setStep('overview')
    else onClose()
  }

  const title = step === 'overview' ? 'حسابي' : 'عيّن كلمة مرور'
  const checks = passwordChecks(password, repeat)
  const wait = Math.max(0, Math.ceil((resendAt - clock) / 1000))

  return (
    <div className="min-h-[100dvh] bg-[#FAFAF8]">
      <PortalHeader kind="back" title={title} subtitle={supplierName} onBack={back} />
      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {step === 'overview' && (
          <>
            {saved && <Notice tone="mint">حفظنا كلمة المرور. تدخلون بالإيميل وكلمة المرور، أو بالرابط مثل قبل.</Notice>}
            <Card>
              <div className="text-[14px] font-bold text-[#0D1F1D] mb-2">بيانات المنشأة</div>
              <Row label="المنشأة" value={supplierName} />
              <Row label="الإيميل" value={account.email || 'ما أضفتوا إيميل'} muted={!account.email} ltr={Boolean(account.email)} />
              {account.phone && <Row label="الجوال" value={account.phone} ltr />}
            </Card>
            <Card>
              <div className="text-[14px] font-bold text-[#0D1F1D] mb-2">الدخول</div>
              <Row label="رابط الدخول" value={linkReach(account)} />
              <Row
                label="كلمة المرور"
                value={
                  account.has_password
                    ? `معيّنة${account.password_set_at ? ` · ${formatDateAr(account.password_set_at)}` : ''}`
                    : 'غير معيّنة — اختياري'
                }
                muted={!account.has_password}
              />
              {account.email && (
                <div className="mt-2">
                  {account.has_password ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startOtp('SET_PASSWORD')}
                      className="text-[12px] font-bold text-[#123F3A] disabled:opacity-40"
                    >
                      غيّر كلمة المرور
                    </button>
                  ) : (
                    <SecondaryButton small disabled={busy} onClick={() => void startOtp('SET_PASSWORD')}>
                      عيّن كلمة مرور
                    </SecondaryButton>
                  )}
                </div>
              )}
              <p className="text-[11px] text-neutral-500 mt-3">كلمة المرور اختيارية: تقدرون تدخلون بدونها عن طريق الرابط.</p>
            </Card>
            {!account.email && (
              <Card className="border-[#CFF5DC]">
                <div className="text-[16px] font-black text-[#0D1F1D] mb-1">أضف إيميلك</div>
                <p className="text-[12px] text-neutral-600 leading-relaxed mb-3">
                  نحتاجه عشان نرسل لكم رمز التحقق قبل كلمة المرور، وتقدرون تدخلون فيه لو تغيّر جوالكم.
                </p>
                <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor="supplier-email">
                  الإيميل
                </label>
                <input
                  id="supplier-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A] mb-3"
                />
                <PrimaryButton disabled={busy || !EMAIL.test(email)} onClick={() => void startOtp('ADD_EMAIL', email)}>
                  {busy ? 'جارٍ الإرسال…' : 'أرسل الرمز'}
                </PrimaryButton>
              </Card>
            )}
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}
          </>
        )}

        {step === 'code' && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-[22px] font-black text-[#0D1F1D]">أدخل الرمز</h1>
              <p className="text-[13px] text-neutral-600 mt-1">
                أرسلنا رمز من 6 أرقام إلى <bdi dir="ltr">{sentTo || account.email}</bdi>
              </p>
            </div>
            <CodeBoxes value={code} onChange={setCode} />
            <div className="text-center text-[12px] text-neutral-500">
              {wait > 0 ? (
                <>
                  ما وصلكم؟ أعد الإرسال بعد {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, '0')}
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startOtp(purpose, purpose === 'SET_PASSWORD' ? undefined : sentTo || undefined)}
                  className="font-bold text-[#123F3A]"
                >
                  ما وصلكم؟ أعد الإرسال
                </button>
              )}
            </div>
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}
            <PrimaryButton
              disabled={code.length !== 6}
              onClick={() => {
                setError(null)
                setStep('password')
              }}
            >
              تأكيد
            </PrimaryButton>
          </div>
        )}

        {step === 'password' && (
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-[22px] font-black text-[#0D1F1D]">اختر كلمة مرور</h1>
              <p className="text-[13px] text-neutral-600 mt-1">
                للدخول بالإيميل <bdi dir="ltr">{sentTo || account.email}</bdi>
              </p>
            </div>
            <label className="text-[11px] text-neutral-500" htmlFor="pw1">
              كلمة المرور
            </label>
            <input
              id="pw1"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
            />
            <label className="text-[11px] text-neutral-500" htmlFor="pw2">
              أعد كتابتها
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
            />
            <ul className="text-[12px] font-semibold space-y-1">
              <li className={`flex items-center gap-1 ${checks.long ? 'text-[#1a7a45]' : 'text-neutral-400'}`}>
                <CheckIcon className="w-3.5 h-3.5" /> 8 أحرف على الأقل
              </li>
              <li className={`flex items-center gap-1 ${checks.same ? 'text-[#1a7a45]' : 'text-neutral-400'}`}>
                <CheckIcon className="w-3.5 h-3.5" /> الكلمتين متطابقتين
              </li>
            </ul>
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}
            <PrimaryButton disabled={busy || !checks.long || !checks.same} onClick={() => void save()}>
              {busy ? 'جارٍ الحفظ…' : 'احفظ كلمة المرور'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountView
