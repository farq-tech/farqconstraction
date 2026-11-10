import { useEffect, useState } from 'react'
import { companyBrand } from '../lib/companyBranding'
import { loadCompanyProfile, saveCompanyProfile } from '../lib/companyProfile'
import type { NavProps } from '../types'
import {
  getConstructionGmailStatus,
  getConstructionInboxStatus,
  getConstructionMe,
  getConstructionStatus,
  getConstructionWhatsAppStatus,
  sendConstructionWhatsAppTest,
  type ConstructionWhatsAppStatus,
} from '../api/constructionClient'
import { farqSession } from '../api/farqSession'
import { signOutAndForget } from '../store/session'
import {
  ACCESS_LEVELS,
  inviteMember,
  loadTeam,
  loadTeamContext,
  removeMember,
  revokeInvitation,
  roleLabel,
  type AccessLevel,
  type Team,
  type TeamContext,
} from '../api/teamClient'
import { useFarqSession } from '../api/useFarqSession'
import { whatsappDeliveryEvidenceLabel } from '../lib/whatsappDelivery'
import { channelAvailability, whatsAppChannelDetail } from '../lib/channelAvailability'
import { normalizeSaudiWhatsAppTestRecipient } from '../lib/whatsappTestRecipient'

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


const ROLE_AR: Record<string, string> = {
  ADMIN: 'مدير',
  PROCUREMENT: 'مشتريات',
  ENGINEER: 'مهندس',
  APPROVER: 'معتمد',
  FINANCE: 'مالية',
  MANAGEMENT: 'مشاهدة',
}

function formatEvidenceTime(value?: string | null): string {
  if (!value) return 'لا يوجد دليل مسجل'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'وقت غير صالح'
  return date.toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })
}

export function SettingsView({ navigate }: NavProps) {
  const [toast, setToast] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<string>('…')
  const [channels, setChannels] = useState<{
    email?: boolean | null
    whatsapp?: boolean | null
    whatsappManual?: boolean | null
    whatsappProvider?: string
    haraj?: boolean | null
    metaReady?: boolean | null
    inboxEnabled?: boolean | null
    inboxNote?: string
    gmailState?: string
    whatsappStatus?: ConstructionWhatsAppStatus | null
  }>({})
  // What is saved here is what the send form uses. See lib/companyProfile.
  const [company, setCompany] = useState(() => loadCompanyProfile())
  const session = useFarqSession()
  // Placeholders only until `/api/construction/me` and the session answer. A
  // signed-in account overwrites both below; demo mode keeps saying so plainly
  // rather than showing an invented identity.
  const [user, setUser] = useState({ name: '—', email: '—', role: '—' })
  const [testRecipient, setTestRecipient] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testOutcome, setTestOutcome] = useState<{ kind: 'accepted' | 'failed' | 'uncertain'; text: string } | null>(null)
  const [whatsappStatusRefreshing, setWhatsappStatusRefreshing] = useState(false)
  const [whatsappStatusRefreshNotice, setWhatsappStatusRefreshNotice] = useState<string | null>(null)

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
        const brand = companyBrand(me.scope_owner_user_id)
        if (brand) setCompany((p) => p.name ? p : ({ ...p, name: brand.nameAr }))
        const flags = (status.flags || {}) as Record<string, boolean>
        const delivery = (status.delivery_channels || {}) as Record<string, unknown>
        const waConfig = (status.whatsapp_configuration || {}) as Record<string, unknown>
        setApiStatus(
          `${flags.read && flags.write && flags.rfq ? 'النظام متصل ويعمل' : 'بعض خدمات النظام متوقفة مؤقتًا'} · صلاحيتك: ${ROLE_AR[String(me.role || '')] || me.role || '—'}`,
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
            ? `استقبال المراسلات ${inbox.correspondence_enabled ? 'مفعّل' : 'متوقف'} · معالجة الردود ${inbox.worker_enabled ? 'مفعّلة' : 'متوقفة'}`
            : 'راجع CONSTRUCTION_INBOX_ENABLED وباقي CONSTRUCTION_INBOX_*'
        } catch (err) {
          inboxEnabled = null
          inboxNote = err instanceof Error ? err.message : 'تعذّر التحقق من جاهزية استقبال الردود'
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

        let whatsappStatus: ConstructionWhatsAppStatus | null = null
        try {
          whatsappStatus = await getConstructionWhatsAppStatus()
        } catch {
          // Older API versions or a temporary read failure stay unknown below.
        }

        setChannels({
          email: channelAvailability(delivery.email),
          whatsapp: channelAvailability(delivery.whatsapp),
          whatsappManual: channelAvailability(delivery.whatsapp_manual),
          whatsappProvider: String(delivery.whatsapp_provider || ''),
          haraj: channelAvailability(delivery.haraj),
          metaReady: channelAvailability(waConfig.ready),
          inboxEnabled,
          inboxNote,
          gmailState,
          whatsappStatus,
        })
      })
      .catch((err: Error) => setApiStatus(err.message))
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const refreshWhatsAppStatus = async () => {
    if (whatsappStatusRefreshing) return
    setWhatsappStatusRefreshing(true)
    setWhatsappStatusRefreshNotice(null)
    try {
      const whatsappStatus = await getConstructionWhatsAppStatus()
      setChannels((current) => ({ ...current, whatsappStatus }))
      setWhatsappStatusRefreshNotice(
        `تم تحديث حالة الإيصالات: ${whatsappDeliveryEvidenceLabel(
          whatsappStatus.receipts?.latest_send_state,
          whatsappStatus.last_outbound_attempt?.status,
          whatsappStatus.receipts?.tracking_available,
        )}.`,
      )
    } catch {
      setWhatsappStatusRefreshNotice('تعذّر تحديث حالة الإيصالات الآن؛ حاول مرة أخرى.')
    } finally {
      setWhatsappStatusRefreshing(false)
    }
  }

  const sendWhatsAppTest = async () => {
    if (testSending || testOutcome?.kind === 'accepted' || testOutcome?.kind === 'uncertain') return
    const to = normalizeSaudiWhatsAppTestRecipient(testRecipient)
    if (!to) {
      setTestOutcome({ kind: 'failed', text: 'أدخل رقم جوال سعودي صحيح يبدأ بـ 05 أو 9665.' })
      return
    }
    setTestSending(true)
    setTestOutcome(null)
    try {
      const result = await sendConstructionWhatsAppTest(
        to,
        'السلام عليكم، هذه رسالة اختبار من فرق بناء لقناة واتساب. لا يلزم اتخاذ أي إجراء. شكرًا.',
      )
      const whatsappStatus = await getConstructionWhatsAppStatus().catch(() => channels.whatsappStatus || null)
      setChannels((current) => ({ ...current, whatsappStatus: whatsappStatus ? {
        ...whatsappStatus,
        receipts: { ...whatsappStatus.receipts, latest_send_state: result.delivery_state },
        last_outbound_attempt: {
          status: 'SENT', attempted_at: result.accepted_at, sent_at: result.accepted_at,
          source: 'CLOUD_TEST', recipient_masked: result.recipient_masked,
          message_reference: result.message_reference, delivery_state: result.delivery_state,
        },
      } : current.whatsappStatus }))
      setTestOutcome({
        kind: 'accepted',
        text: `قبلت Meta الرسالة للإرسال إلى ${result.recipient_masked}. المرجع: ${result.message_reference}. الحالة: ${whatsappDeliveryEvidenceLabel(result.delivery_state, 'SENT', true)}.`,
      })
    } catch (err) {
      const uncertain = Boolean(
        err && typeof err === 'object' && 'indeterminate' in err && (err as { indeterminate?: boolean }).indeterminate,
      ) || Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'CONSTRUCTION_REQUEST_TIMEOUT')
      setTestOutcome({
        kind: uncertain ? 'uncertain' : 'failed',
        text: uncertain
          ? 'تعذّر تأكيد النتيجة؛ قد تكون الرسالة أُرسلت. لا تعاود الإرسال الآن، وتحقق من سجل واتساب أولًا.'
          : err instanceof Error ? err.message : 'تعذّر إرسال رسالة الاختبار.',
      })
    } finally {
      setTestSending(false)
    }
  }

  const ChannelRow = ({
    label,
    on,
    detail,
    unknown,
  }: {
    label: string
    on?: boolean | null
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
          unknown={channels.email == null}
          detail="بريد طلبات التسعير الصادر من خادم فرق"
        />
        <ChannelRow
          label="واتساب Cloud (Meta)"
          on={channels.whatsapp}
          unknown={channels.whatsapp == null}
          detail={whatsAppChannelDetail(channels.whatsapp ?? null, channels.metaReady ?? null)}
        />
        <div className="rounded-xl border border-neutral-100 bg-[#FAFAF8] px-3 py-3 space-y-1.5 text-[11px] text-neutral-600 leading-relaxed">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-[#0D1F1D]">دليل نشاط WhatsApp لهذه الشركة</div>
            <button
              type="button"
              onClick={() => void refreshWhatsAppStatus()}
              disabled={whatsappStatusRefreshing}
              className="shrink-0 font-bold text-[#123F3A] disabled:opacity-50"
            >
              {whatsappStatusRefreshing ? 'جارٍ التحديث…' : 'تحديث الإيصال'}
            </button>
          </div>
          {whatsappStatusRefreshNotice && <div role="status">{whatsappStatusRefreshNotice}</div>}
          {channels.whatsappStatus ? (
            <>
              <div>مصادقة Webhook مهيّأة: {channels.whatsappStatus.webhook?.authentication_configured == null ? 'غير معروفة' : channels.whatsappStatus.webhook.authentication_configured ? 'نعم' : 'لا'}</div>
              <div>آخر محاولة إرسال: {formatEvidenceTime(channels.whatsappStatus.last_outbound_attempt?.attempted_at)}{channels.whatsappStatus.last_outbound_attempt?.status ? ` · ${channels.whatsappStatus.last_outbound_attempt.status}` : ''}</div>
              {channels.whatsappStatus.last_outbound_attempt?.recipient_masked && <div>آخر مستلم: {channels.whatsappStatus.last_outbound_attempt.recipient_masked}</div>}
              {channels.whatsappStatus.last_outbound_attempt?.source === 'CLOUD_TEST' && channels.whatsappStatus.last_outbound_attempt?.message_reference && <div>مرجع Meta: {channels.whatsappStatus.last_outbound_attempt.message_reference}</div>}
              <div>نتيجة أحدث إرسال: {whatsappDeliveryEvidenceLabel(channels.whatsappStatus.receipts?.latest_send_state, channels.whatsappStatus.last_outbound_attempt?.status, channels.whatsappStatus.receipts?.tracking_available)}</div>
              {channels.whatsappStatus.last_outbound_attempt?.delivery_error_code != null && <div>رمز خطأ الإيصال: {channels.whatsappStatus.last_outbound_attempt.delivery_error_code}</div>}
              <div>آخر إيصال من Meta: {formatEvidenceTime(channels.whatsappStatus.receipts?.last_received_at)}</div>
              <div>آخر رد مربوط: {formatEvidenceTime(channels.whatsappStatus.last_inbound_at)}</div>
              <div>رسائل تنتظر ربطًا: {channels.whatsappStatus.unresolved_count == null ? 'غير معروفة' : channels.whatsappStatus.unresolved_count}</div>
              <div className="text-neutral-400">الإعداد المهيّأ لا يثبت وحده أن Meta سلّمت الرسالة أو أن Webhook يستقبل حاليًا.</div>
            </>
          ) : (
            <div>أدلة نشاط WhatsApp غير متاحة من الـ API الآن؛ لا نستنتج أن القناة سليمة أو متوقفة.</div>
          )}
        </div>
        <ChannelRow
          label="واتساب يدوي (WhatsApp Web)"
          on={channels.whatsappManual}
          unknown={channels.whatsappManual == null}
          detail="رابط واتساب تفتحه أنت وترسله بنفسك: متاح دائمًا"
        />
        <ChannelRow
          label="محادثة"
          on={channels.haraj}
          unknown={channels.haraj == null}
          detail="قناة محادثات الموردين — يحدد مسؤول النظام جاهزيتها وحدود الإرسال"
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

      {user.role === 'ADMIN' ? <Section title="اختبار واتساب Cloud">
        <p className="text-xs text-neutral-600 leading-relaxed">
          يرسل رسالة نصية مباشرة من رقم فرق إلى الرقم أدناه؛ لا ينشئ طلب تسعير. قد تُحتسب الرسالة، والرسائل النصية الحرة تتطلب نافذة محادثة مفتوحة لدى Meta.
        </p>
        <Field
          label="رقم جوال سعودي"
          value={testRecipient}
          dir="ltr"
          onChange={(value) => {
            setTestRecipient(value)
            setTestOutcome(null)
          }}
        />
        <div className="rounded-xl border border-neutral-100 bg-[#FAFAF8] px-3 py-2.5 text-xs text-neutral-600" dir="rtl">
          «السلام عليكم، هذه رسالة اختبار من فرق بناء لقناة واتساب. لا يلزم اتخاذ أي إجراء. شكرًا.»
        </div>
        <button
          type="button"
          onClick={() => void sendWhatsAppTest()}
          disabled={testSending || testOutcome?.kind === 'accepted' || testOutcome?.kind === 'uncertain'}
          className="w-full rounded-xl bg-[#123F3A] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testSending ? 'جارٍ الإرسال…' : testOutcome?.kind === 'accepted' ? 'تم إرسال الاختبار' : 'إرسال رسالة الاختبار عبر Cloud'}
        </button>
        {testOutcome && (
          <div
            role="status"
            className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${testOutcome.kind === 'accepted' ? 'bg-emerald-50 text-emerald-800' : testOutcome.kind === 'uncertain' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}
          >
            {testOutcome.text}
          </div>
        )}
      </Section> : <Section title="اختبار واتساب Cloud"><p className="text-xs text-neutral-500">إرسال الاختبار متاح لمسؤول الشركة فقط.</p></Section>}

      {/* Company */}
      <Section title="الشركة">
        <p className="text-xs text-neutral-600 mb-3">بيانات المرسل محفوظة في هذا المتصفح وتُستخدم في نموذج الإرسال. راجع تطابقها مع الشركة قبل الإرسال.</p>
        <Field label="اسم الشركة" value={company.name} onChange={v => setCompany(p => ({ ...p, name: v }))} />
        <Field label="المدينة" value={company.city} onChange={v => setCompany(p => ({ ...p, city: v }))} />
        <Field label="رقم التواصل" value={company.phone} onChange={v => setCompany(p => ({ ...p, phone: v }))} dir="ltr" />
        <Field label="البريد الإلكتروني" value={company.email} onChange={v => setCompany(p => ({ ...p, email: v }))} dir="ltr" />
        <Field label="الاسم النظامي (كما في السجل التجاري)" value={company.legalName} onChange={v => setCompany(p => ({ ...p, legalName: v }))} />
        <Field label="رقم السجل التجاري" value={company.crNumber} onChange={v => setCompany(p => ({ ...p, crNumber: v }))} dir="ltr" />
        <Field label="الرقم الضريبي" value={company.vatNumber} onChange={v => setCompany(p => ({ ...p, vatNumber: v }))} dir="ltr" />
        <Field label="العنوان الوطني" value={company.nationalAddress} onChange={v => setCompany(p => ({ ...p, nationalAddress: v }))} />
        <p className="text-[11px] text-neutral-500">تظهر هذه البيانات للمورد في طلب التسعير حتى يصدر عرضًا رسميًا باسم شركتكم. الحقل الفارغ لا يظهر.</p>
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

      {session.isAuthenticated && <TeamSection showToast={showToast} />}
      {session.isAuthenticated && <PasswordSection showToast={showToast} />}

      <button
        onClick={() => {
          if (!session.isAuthenticated) {
            navigate('login')
            return
          }
          // Sign out ends the session AND clears this account's working state
          // (الكراسة، المسودات) through the identity-change listener in
          // src/store/session.ts, so a shared machine hands over nothing.
          void signOutAndForget().then(() => navigate('login'))
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

/**
 * Change one's own password. Accounts are handed over with a password chosen
 * by someone else; this is where the holder replaces it.
 */
function PasswordSection({ showToast }: { showToast: (message: string) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (next.length < 8) return setError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.')
    if (next !== confirm) return setError('كلمتا المرور الجديدتان غير متطابقتين.')
    if (next === current) return setError('اختر كلمة مرور مختلفة عن الحالية.')
    setBusy(true)
    try {
      await farqSession.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      showToast('غُيّرت كلمة المرور. أُغلقت الجلسات على الأجهزة الأخرى.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تغيير كلمة المرور.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-left focus:outline-none focus:border-[#123F3A]'
  return (
    <div className="mt-6 rounded-2xl border border-neutral-100 bg-white p-5" dir="rtl">
      <div className="text-sm font-bold text-[#0D1F1D] mb-3">تغيير كلمة المرور</div>
      <div className="space-y-2.5">
        <input type="password" autoComplete="current-password" placeholder="كلمة المرور الحالية" dir="ltr"
          className={input} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)" dir="ltr"
          className={input} value={next} onChange={(e) => setNext(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="أعد كتابة كلمة المرور الجديدة" dir="ltr"
          className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        onClick={() => void submit()}
        disabled={busy || !current || !next || !confirm}
        className="mt-3 w-full py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
      >
        {busy ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
      </button>
    </div>
  )
}

/**
 * The company's team, for its administrators only: who has access, pending
 * invitations, and inviting or removing someone. Everyone else never sees it.
 */
function TeamSection({ showToast }: { showToast: (message: string) => void }) {
  const [context, setContext] = useState<TeamContext | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [email, setEmail] = useState('')
  const [level, setLevel] = useState<AccessLevel>('procurement')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (ctx: TeamContext) => {
    try {
      setTeam(await loadTeam(ctx))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحميل الفريق.')
    }
  }

  useEffect(() => {
    loadTeamContext()
      .then((ctx) => {
        setContext(ctx)
        if (ctx?.canManage) void refresh(ctx)
      })
      .catch(() => setContext(null))
  }, [])

  if (!context?.canManage) return null

  const invite = async () => {
    setError('')
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return setError('اكتب بريدًا صحيحًا.')
    setBusy(true)
    try {
      await inviteMember(context, clean, level)
      setEmail('')
      showToast(`أُرسلت الدعوة إلى ${clean}. يفتح الرابط في بريده ويختار كلمة مروره.`)
      await refresh(context)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر إرسال الدعوة.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError('')
    try {
      await fn()
      showToast(done)
      await refresh(context)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر التنفيذ.')
    }
  }

  const seats = team?.seats
  return (
    <div className="mt-6 rounded-2xl border border-neutral-100 bg-white p-5" dir="rtl">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-[#0D1F1D]">فريق {context.organizationName}</div>
        {seats?.limit != null && (
          <div className="text-xs text-neutral-500">
            {seats.used} من {seats.limit} مقاعد
          </div>
        )}
      </div>

      <div className="divide-y divide-neutral-50 mb-4">
        {(team?.members || []).map((m) => (
          <div key={m.membership_id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#0D1F1D] truncate" dir="ltr">{m.email}</div>
              <div className="text-xs text-neutral-500">{roleLabel(m)}{m.is_me ? ' · أنت' : ''}</div>
            </div>
            {!m.is_me && m.organization_role !== 'OWNER' && (
              <button
                onClick={() => {
                  if (window.confirm(`إزالة ${m.email} من الشركة؟ سيفقد الدخول فورًا.`)) {
                    void act(() => removeMember(context, m.membership_id), `أُزيل ${m.email}.`)
                  }
                }}
                className="text-xs text-red-600 font-semibold flex-shrink-0"
              >
                إزالة
              </button>
            )}
          </div>
        ))}
        {(team?.invitations || []).map((i) => (
          <div key={i.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-neutral-600 truncate" dir="ltr">{i.email}</div>
              <div className="text-xs text-amber-700">دعوة لم تُقبل بعد</div>
            </div>
            <button
              onClick={() => void act(() => revokeInvitation(context, i.id), `أُلغيت دعوة ${i.email}.`)}
              className="text-xs text-neutral-500 font-semibold flex-shrink-0"
            >
              إلغاء الدعوة
            </button>
          </div>
        ))}
      </div>

      <div className="text-xs font-bold text-[#0D1F1D] mb-2">إضافة حساب</div>
      <input
        type="email"
        dir="ltr"
        placeholder="name@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-left focus:outline-none focus:border-[#123F3A]"
      />
      <div className="mt-2 space-y-1.5">
        {ACCESS_LEVELS.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="radio" name="team-level" checked={level === l.id} onChange={() => setLevel(l.id)} />
            {l.label}
          </label>
        ))}
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        onClick={() => void invite()}
        disabled={busy || !email.trim()}
        className="mt-3 w-full py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
      >
        {busy ? 'جارٍ الإرسال…' : 'أرسل الدعوة'}
      </button>
      <div className="mt-2 text-[11px] text-neutral-400 leading-relaxed">
        تصله رسالة فيها رابط، يختار منه كلمة مروره ويدخل مباشرة.
      </div>
    </div>
  )
}
