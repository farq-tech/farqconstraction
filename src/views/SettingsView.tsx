import { useEffect, useState } from 'react'
import { loadCompanyProfile, saveCompanyProfile } from '../lib/companyProfile'
import type { NavProps } from '../types'
import {
  getConstructionGmailStatus,
  getConstructionInboxStatus,
  getConstructionMe,
  getConstructionStatus,
} from '../api/constructionClient'
import { farqSession } from '../api/farqSession'
import { useFarqSession } from '../api/useFarqSession'

// Module scope on purpose: declared inside the component these were a new
// component type every render, so each keystroke remounted the input and the
// field lost focus after one character.
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


export function SettingsView({ navigate }: NavProps) {
  const [toast, setToast] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<string>('…')
  const [channels, setChannels] = useState<{
    email?: boolean
    whatsapp?: boolean
    whatsappManual?: boolean
    whatsappProvider?: string
    haraj?: boolean
    metaReady?: boolean
    inboxEnabled?: boolean | null
    inboxNote?: string
    gmailState?: string
  }>({})
  // What is saved here is what the send form uses. See lib/companyProfile.
  const [company, setCompany] = useState(() => loadCompanyProfile())
  const session = useFarqSession()
  // Placeholders only until `/api/construction/me` and the session answer. A
  // signed-in account overwrites both below; demo mode keeps saying so plainly
  // rather than showing an invented identity.
  const [user, setUser] = useState({ name: '—', email: '—', role: '—' })

  /** Show who is actually signed in, not a placeholder. */
  useEffect(() => {
    if (!session.user) return
    setUser((u) => ({
      ...u,
      name: session.user?.displayName || u.name,
      email: session.user?.email || u.email,
    }))
  }, [session.user])

  useEffect(() => {
    Promise.all([getConstructionStatus(), getConstructionMe()])
      .then(async ([status, me]) => {
        const flags = (status.flags || {}) as Record<string, boolean>
        const delivery = (status.delivery_channels || {}) as Record<string, unknown>
        const waConfig = (status.whatsapp_configuration || {}) as Record<string, unknown>
        setApiStatus(
          `Farq API · read=${flags.read ? '1' : '0'} write=${flags.write ? '1' : '0'} rfq=${flags.rfq ? '1' : '0'} · role=${me.role || '—'}`,
        )
        // The role is the API's answer and is authoritative. The identity is
        // not: `scope_owner_user_id` is a company scope uuid, and showing it
        // in «البريد الإلكتروني» made the owner's own account look like a
        // machine id. The email comes from the session instead.
        if (me.role) setUser((u) => ({ ...u, role: me.role || u.role }))

        let inboxEnabled: boolean | null = null
        let inboxNote = '—'
        try {
          const inbox = await getConstructionInboxStatus()
          inboxEnabled = Boolean(inbox.enabled && inbox.receiving_configured)
          inboxNote = inboxEnabled
            ? `مراسلات=${inbox.correspondence_enabled ? '1' : '0'} · عامل=${inbox.worker_enabled ? '1' : '0'}`
            : 'راجع CONSTRUCTION_INBOX_ENABLED وباقي CONSTRUCTION_INBOX_*'
        } catch (err) {
          inboxEnabled = null
          inboxNote = err instanceof Error ? err.message : 'تعذّر قراءة /inbox/status'
        }

        let gmailState = '—'
        try {
          const gmail = await getConstructionGmailStatus()
          gmailState = gmail.state || '—'
        } catch (err) {
          gmailState =
            err instanceof Error
              ? err.message.includes('AUTH') || err.message.includes('401')
                ? 'يتطلب تفويض مالك info@farq.sa'
                : err.message
              : 'غير متاح'
        }

        setChannels({
          email: Boolean(delivery.email),
          whatsapp: Boolean(delivery.whatsapp),
          whatsappManual: Boolean(delivery.whatsapp_manual),
          whatsappProvider: String(delivery.whatsapp_provider || ''),
          haraj: Boolean(delivery.haraj),
          metaReady: Boolean(waConfig.ready),
          inboxEnabled,
          inboxNote,
          gmailState,
        })
      })
      .catch((err: Error) => setApiStatus(err.message))
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const ChannelRow = ({
    label,
    on,
    detail,
    unknown,
  }: {
    label: string
    on?: boolean
    detail?: string
    unknown?: boolean
  }) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-[#0D1F1D] font-medium">{label}</div>
        {detail && <div className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">{detail}</div>}
      </div>
      <span
        className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
          unknown
            ? 'bg-neutral-100 text-neutral-500'
            : on
              ? 'bg-[#CFF5DC] text-[#1a7a45]'
              : 'bg-amber-50 text-amber-800'
        }`}
      >
        {unknown ? '?' : on ? 'ON' : 'OFF'}
      </span>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D]">الإعدادات</h1>
      </div>

      <div className="mb-4 rounded-xl border border-neutral-100 bg-white px-4 py-3 text-xs text-neutral-500 font-mono break-all">
        {apiStatus}
      </div>

      <Section title="قنوات المراسلة (حالة حية من الـ API)">
        <ChannelRow
          label="بريد صادر (Resend)"
          on={channels.email}
          detail="RESEND_API_KEY + CONSTRUCTION_RFQ_* على السيرفر"
        />
        <ChannelRow
          label="واتساب Cloud (Meta)"
          on={channels.whatsapp}
          detail={
            channels.whatsapp
              ? `جاهز للإرسال بشرط send_consent=true · مزوّد ${channels.whatsappProvider || 'META_CLOUD_API'} · kill switch WHATSAPP_ENABLED`
              : channels.metaReady
                ? 'Meta ready لكن القناة OFF (kill switch أو بانتظار نشر كود الموزّع المحدّث)'
                : 'غير مهيأ'
          }
        />
        <ChannelRow
          label="واتساب يدوي (WhatsApp Web)"
          on={channels.whatsappManual}
          detail="متاح دائمًا عند غياب consent أو تعطيل Cloud"
        />
        <ChannelRow
          label="حراج"
          on={channels.haraj}
          detail="HARAJ_SEND_ENABLED + HARAJ_USER_ID + HARAJ_TOKEN · يلزم haraj_limit"
        />
        <ChannelRow
          label="صندوق الوارد (Resend Inbound)"
          on={channels.inboxEnabled === true}
          unknown={channels.inboxEnabled == null}
          detail={channels.inboxNote}
        />
        <div className="text-xs text-neutral-500 leading-relaxed border-t border-neutral-50 pt-3">
          <span className="font-semibold text-[#0D1F1D]">Gmail:</span> {channels.gmailState || '—'}
          <button
            type="button"
            onClick={() => navigate('inbox')}
            className="block mt-2 text-[#123F3A] font-bold hover:underline"
          >
            فتح صندوق الوارد ←
          </button>
        </div>
      </Section>

      {/* Company */}
      <Section title="الشركة">
        <Field label="اسم الشركة" value={company.name} onChange={v => setCompany(p => ({ ...p, name: v }))} />
        <Field label="المدينة" value={company.city} onChange={v => setCompany(p => ({ ...p, city: v }))} />
        <Field label="رقم التواصل" value={company.phone} onChange={v => setCompany(p => ({ ...p, phone: v }))} dir="ltr" />
        <Field label="البريد الإلكتروني" value={company.email} onChange={v => setCompany(p => ({ ...p, email: v }))} dir="ltr" />
      </Section>

      {/* User: read from the session, not editable here. */}
      <Section title="المستخدم">
        {([['الاسم', user.name], ['البريد الإلكتروني', user.email], ['الدور', user.role]] as [string, string][]).map(([label, value]) => (
          <div key={label}>
            <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">{label}</label>
            <div className="px-4 py-2.5 bg-neutral-50 rounded-xl text-sm text-neutral-500" dir="auto">{value}</div>
          </div>
        ))}
      </Section>

      {/* RFQ Defaults */}
      <Section title="إعدادات الطلبات">
        <div>
          <label className="text-xs font-semibold text-neutral-600 mb-1.5 block">موعد الاستلام الافتراضي (بالأيام)</label>
          <input
            type="number"
            value={String(company.defaultDeadlineDays)}
            onChange={e => setCompany(p => ({ ...p, defaultDeadlineDays: Number(e.target.value) || 0 }))}
            min="1"
            className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors"
            dir="ltr"
          />
        </div>
        <Field label="موقع التسليم الافتراضي" value={company.defaultDeliveryCity} onChange={v => setCompany(p => ({ ...p, defaultDeliveryCity: v }))} />
      </Section>

      <button
        onClick={() => {
          const ok = saveCompanyProfile(company)
          if (ok) setCompany(loadCompanyProfile())
          showToast(ok ? 'حُفظت بيانات الشركة وإعدادات الطلبات على هذا المتصفح، وستُستخدم في طلب التسعير القادم.' : 'تعذّر الحفظ: المتصفح يمنع التخزين في هذه النافذة.')
        }}
        className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
      >
        حفظ التغييرات
      </button>

      <button
        onClick={() => {
          if (!session.isAuthenticated) {
            navigate('login')
            return
          }
          // Sign out ends the session AND clears this account's working state
          // (الكراسة، المسودات) through the identity-change listener in
          // src/store/session.ts, so a shared machine hands over nothing.
          void farqSession.signOut().then(() => navigate('login'))
        }}
        className="w-full mt-3 py-2.5 text-neutral-400 text-sm font-semibold hover:text-neutral-600 transition-colors"
      >
        {session.isAuthenticated ? 'تسجيل الخروج' : 'تسجيل الدخول'}
      </button>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#123F3A] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg animate-fade-up z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
