import { useState } from 'react'
import type { NavProps } from '../types'

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
      checked ? 'bg-[#123F3A]' : 'bg-neutral-200'
    }`}
  >
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
      checked ? 'right-0.5' : 'left-0.5'
    }`} />
  </button>
)

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    {open
      ? <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      : <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    }
  </svg>
)

export function SettingsView({ navigate }: NavProps) {
  const [toast, setToast] = useState<string | null>(null)
  const [company, setCompany] = useState({ name: 'شركة الإنشاءات الحديثة', city: 'الرياض', phone: '0112345678', email: 'info@modern-const.com.sa' })
  const [user, setUser] = useState({ name: 'محمد العمري', email: 'm.omari@modern-const.com.sa', role: 'مدير المشتريات' })
  const [defaults, setDefaults] = useState({ deadline: '14', location: 'الرياض' })
  const [notifs, setNotifs] = useState({ newOffer: true, closingDeadline: true, sendFail: true, award: false })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const changePassword = () => {
    setPwError(null)
    if (!pw.current) return setPwError('أدخل كلمة المرور الحالية.')
    if (pw.next.length < 8) return setPwError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')
    if (pw.next !== pw.confirm) return setPwError('كلمتا المرور غير متطابقتين.')
    setPw({ current: '', next: '', confirm: '' })
    showToast('تم تغيير كلمة المرور بنجاح.')
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-neutral-50">
        <div className="text-sm font-bold text-[#0D1F1D]">{title}</div>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )

  const Field = ({ label, value, onChange, dir = 'rtl' }: { label: string; value: string; onChange: (v: string) => void; dir?: string }) => (
    <div>
      <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        dir={dir}
        className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors"
      />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D]">الإعدادات</h1>
        <button
          onClick={() => navigate('access-denied')}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          إدارة الصلاحيات
        </button>
      </div>

      {/* Company */}
      <Section title="الشركة">
        <Field label="اسم الشركة" value={company.name} onChange={v => setCompany(p => ({ ...p, name: v }))} />
        <Field label="المدينة" value={company.city} onChange={v => setCompany(p => ({ ...p, city: v }))} />
        <Field label="رقم التواصل" value={company.phone} onChange={v => setCompany(p => ({ ...p, phone: v }))} dir="ltr" />
        <Field label="البريد الإلكتروني" value={company.email} onChange={v => setCompany(p => ({ ...p, email: v }))} dir="ltr" />
      </Section>

      {/* User */}
      <Section title="المستخدم">
        <Field label="الاسم" value={user.name} onChange={v => setUser(p => ({ ...p, name: v }))} />
        <Field label="البريد الإلكتروني" value={user.email} onChange={v => setUser(p => ({ ...p, email: v }))} dir="ltr" />
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">الدور</label>
          <div className="px-4 py-2.5 bg-neutral-50 rounded-xl text-sm text-neutral-500">{user.role}</div>
        </div>
      </Section>

      {/* Password */}
      <Section title="كلمة المرور">
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">كلمة المرور الحالية</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={pw.current}
              onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
              placeholder="••••••••"
              dir="ltr"
              className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] pl-10 transition-colors"
            />
            <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2">
              <EyeIcon open={showCurrent} />
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">كلمة المرور الجديدة</label>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              value={pw.next}
              onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
              placeholder="8 أحرف على الأقل"
              dir="ltr"
              className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] pl-10 transition-colors"
            />
            <button type="button" onClick={() => setShowNext(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2">
              <EyeIcon open={showNext} />
            </button>
          </div>
          {pw.next.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    pw.next.length < 6 ? i === 1 ? 'bg-red-400' : 'bg-neutral-100' :
                    pw.next.length < 8 ? i <= 2 ? 'bg-amber-400' : 'bg-neutral-100' :
                    pw.next.length < 12 ? i <= 3 ? 'bg-[#123F3A]/60' : 'bg-neutral-100' :
                    'bg-[#123F3A]'
                  }`} />
                ))}
              </div>
              <div className="text-[10px] text-neutral-400">
                {pw.next.length < 6 ? 'ضعيفة' : pw.next.length < 8 ? 'مقبولة' : pw.next.length < 12 ? 'جيدة' : 'قوية جداً'}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">تأكيد كلمة المرور الجديدة</label>
          <input
            type="password"
            value={pw.confirm}
            onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
            placeholder="••••••••"
            dir="ltr"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors ${
              pw.confirm && pw.confirm !== pw.next ? 'border-red-300 bg-red-50' : 'border-neutral-200'
            }`}
          />
        </div>
        {pwError && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwError}</div>}
        <button
          onClick={changePassword}
          disabled={!pw.current || !pw.next || !pw.confirm}
          className="px-5 py-2.5 bg-[#123F3A] text-white text-sm font-bold rounded-xl hover:bg-[#1a5c54] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          تغيير كلمة المرور
        </button>
      </Section>

      {/* RFQ Defaults */}
      <Section title="إعدادات الطلبات">
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">موعد الاستلام الافتراضي (بالأيام)</label>
          <input
            type="number"
            value={defaults.deadline}
            onChange={e => setDefaults(p => ({ ...p, deadline: e.target.value }))}
            min="1"
            className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors"
            dir="ltr"
          />
        </div>
        <Field label="موقع التسليم الافتراضي" value={defaults.location} onChange={v => setDefaults(p => ({ ...p, location: v }))} />
      </Section>

      {/* Notifications */}
      <Section title="الإشعارات">
        {([
          ['newOffer', 'عروض جديدة'],
          ['closingDeadline', 'قرب موعد الإغلاق'],
          ['sendFail', 'فشل إرسال دعوة'],
          ['award', 'اعتماد ترسية'],
        ] as [keyof typeof notifs, string][]).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-[#0D1F1D]">{label}</span>
            <Toggle checked={notifs[key]} onChange={() => setNotifs(p => ({ ...p, [key]: !p[key] }))} />
          </div>
        ))}
      </Section>

      <button
        onClick={() => showToast('تم حفظ التغييرات.')}
        className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
      >
        حفظ التغييرات
      </button>

      <button
        onClick={() => navigate('login')}
        className="w-full mt-3 py-2.5 text-neutral-400 text-sm font-semibold hover:text-red-500 transition-colors"
      >
        تسجيل الخروج
      </button>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#123F3A] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg animate-fade-up z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
