import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqApiStatus,
  formatRfqTitle,
  getConstructionRfq,
  invitePreferredChannel,
  isHarajSellerExternalKey,
  mapInvitationsToOfferRows,
  mapRfqUiStatus,
  prepareConstructionWhatsAppLink,
  sendConstructionRfqInvite,
  type ConstructionRfq,
} from '../api/constructionClient'

type Tab = 'overview' | 'items' | 'offers' | 'correspondence' | 'log'

const TABS: [Tab, string][] = [
  ['overview', 'نظرة عامة'],
  ['items', 'البنود'],
  ['offers', 'الردود'],
  ['correspondence', 'المراسلات'],
  ['log', 'السجل'],
]

const AUDIT_EVENT_LABELS: Record<string, string> = {
  RFQ_CREATED: 'أُنشئ الطلب',
  RFQ_VERSION_CREATED: 'أُنشئت نسخة جديدة من الطلب',
  RFQ_DISPATCHED: 'أُرسل الطلب إلى الموردين',
  RFQ_DISPATCH_FAILED: 'محاولة إرسال لم تصل إلى أي مورد',
  AWARD_DISPATCHED: 'أُرسل إشعار الترسية',
  AWARD_DISPATCH_FAILED: 'محاولة إشعار ترسية لم تصل',
  RFP_SUBMISSIONS_CLOSED: 'أُغلق باب التقديم',
  RFP_ENVELOPES_OPENED: 'فُتحت المظاريف',
  AWARD_APPROVED: 'اعتُمدت الترسية',
}

function auditEventLabel(type: string): string {
  return AUDIT_EVENT_LABELS[type] || type
}

/** One line of the numbers behind a dispatch event, so the label is never the only evidence. */
function auditEventDetail(event: { event_type: string; snapshot?: Record<string, unknown> }): string | null {
  const s = event.snapshot || {}
  if (/DISPATCH/.test(event.event_type) && typeof s.attempts === 'number') {
    return `${s.sent ?? 0} محاولة ناجحة من ${s.attempts} على ${s.invites ?? 0} دعوة — لم تُرسل: ${s.not_sent ?? 0}، بلا مستلم: ${s.skipped ?? 0}`
  }
  if (event.event_type === 'RFQ_VERSION_CREATED' && typeof s.version_number === 'number') return `النسخة ${s.version_number}`
  return null
}

export function RFQDetailView({ navigate }: NavProps) {
  const { selectedRfqId, openRfq, setSelectedOfferId } = useProcurement()
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchProgress, setDispatchProgress] = useState<string | null>(null)
  const [dispatchNote, setDispatchNote] = useState<string | null>(null)
  const [waLinks, setWaLinks] = useState<Array<{ name: string; url: string }>>([])

  const reload = async (id: string) => {
    const data = await getConstructionRfq(id)
    setRfq(data)
    return data
  }

  useEffect(() => {
    if (!selectedRfqId) {
      setLoading(false)
      setError('لم يُحدَّد طلب تسعير')
      setRfq(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getConstructionRfq(selectedRfqId)
      .then((data) => {
        if (!cancelled) setRfq(data)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRfq(null)
          setError(err.message || 'تعذّر تحميل الطلب')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRfqId])

  const dispatchPendingEmails = async () => {
    if (!rfq) return
    const pending = (rfq.invitations || []).filter(
      (invite) => String(invite.delivery_status || '').toUpperCase() !== 'SENT',
    )
    if (!pending.length) {
      setDispatchNote('كل الدعوات مُرسلة بالفعل.')
      return
    }
    setDispatching(true)
    setDispatchNote(null)
    setWaLinks([])
    let sent = 0
    let failed = 0
    let waPrepared = 0
    const reasons = new Map<string, number>()
    const links: Array<{ name: string; url: string }> = []
    const noteFailure = (err: unknown) => {
      failed += 1
      const code =
        (err as { code?: string } | null)?.code ||
        (err instanceof Error ? err.message.slice(0, 60) : 'سبب غير معروف')
      reasons.set(code, (reasons.get(code) || 0) + 1)
    }
    try {
      for (let i = 0; i < pending.length; i += 1) {
        const invite = pending[i]!
        const channel = invitePreferredChannel(invite)
        const supplierId = String(invite.supplier?.id || invite.supplier_id || '')
        setDispatchProgress(
          `إرسال ${i + 1}/${pending.length} (${channel === 'HARAJ' ? 'حراج' : channel === 'WHATSAPP' ? 'واتساب' : 'بريد'})…`,
        )
        if (channel === 'WHATSAPP') {
          try {
            const link = await prepareConstructionWhatsAppLink(rfq.id, invite.id)
            if (link.url) {
              // Links are listed, not opened in a loop: a pop-up blocker kept the
              // first tab and dropped the rest while all were counted as prepared.
              waPrepared += 1
              links.push({ name: String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد'), url: link.url })
            }
          } catch (err) {
            noteFailure(err)
          }
          continue
        }
        try {
          await sendConstructionRfqInvite(rfq.id, invite.id, {
            sendConsent: false,
            harajLimit: isHarajSellerExternalKey(supplierId) ? 1 : undefined,
          })
          sent += 1
        } catch (err) {
          noteFailure(err)
        }
      }
      // The outcome is stated BEFORE the screen re-reads the request. When that
      // re-read failed (likely right after a batch) nothing was shown at all,
      // and the natural reaction to silence is to press send again.
      const why = [...reasons].map(([code, count]) => `${code} ×${count}`).join('، ')
      setWaLinks(links)
      setDispatchNote(
        failed
          ? `قبل الخادم ${sent}${waPrepared ? ` · روابط واتساب ${waPrepared}` : ''} وفشل ${failed} (${why}). الحالة المؤكدة لكل مورد في «المراسلات».`
          : `قبل الخادم ${sent} دعوة${waPrepared ? ` · روابط واتساب ${waPrepared}` : ''}.`,
      )
      setTab('correspondence')
      try {
        await reload(rfq.id)
      } catch {
        setDispatchNote((note) => `${note || ''} تعذّر تحديث الصفحة بعد الإرسال: لا تُعد الإرسال، حدّث الصفحة.`)
      }
    } finally {
      setDispatching(false)
      setDispatchProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-16 text-center text-neutral-400 text-sm">
        جاري تحميل الطلب من Farq…
      </div>
    )
  }

  if (error || !rfq) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">لا يوجد طلب تسعير</h1>
        <p className="text-neutral-500 text-sm mb-6">{error || 'افتح طلبًا من القائمة أو أنشئ طلبًا جديدًا.'}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('rfq-list')}
            className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
          >
            طلبات التسعير
          </button>
          <button
            onClick={() => navigate('create-upload')}
            className="px-6 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl text-sm"
          >
            رفع كراسة
          </button>
        </div>
      </div>
    )
  }

  const title = formatRfqTitle({
    id: rfq.id,
    delivery: rfq.current_version?.payload?.delivery,
    engineering_department: rfq.engineering_department,
    buyer: rfq.current_version?.payload?.buyer,
  })
  const lines = rfq.current_version?.payload?.lines || []
  const invites = rfq.invitations || []
  const offerRows = mapInvitationsToOfferRows(rfq)
  const replied = offerRows.filter((o) => o.status !== 'pending')
  const uiStatus = mapRfqUiStatus(rfq.status, rfq.award?.id)
  const draftNotSent = String(rfq.status).toUpperCase() === 'DRAFT_NOT_SENT'
  const deadline = rfq.current_version?.payload?.delivery?.required_date

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button onClick={() => navigate('rfq-list')} className="text-xs text-neutral-400 hover:text-neutral-600">
            طلبات التسعير
          </button>
          <span className="text-neutral-300">/</span>
          <span className="text-xs font-mono text-neutral-400">{rfq.id.slice(0, 8)}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              uiStatus === 'draft'
                ? 'bg-neutral-100 text-neutral-600'
                : uiStatus === 'active'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-[#CFF5DC] text-[#1a7a45]'
            }`}
          >
            {formatRfqApiStatus(rfq.status)}
          </span>
        </div>
        <h1 className="text-3xl font-black text-[#0D1F1D]">{title}</h1>
        {deadline && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-neutral-500">
            <ClockIcon className="w-4 h-4" />
            الموعد النهائي: <span className="font-semibold text-[#0D1F1D]">{formatArDate(deadline)}</span>
          </div>
        )}
      </div>

      {draftNotSent && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-3">
            الطلب محفوظ كمسودة مع {invites.length} دعوة داخل Farq. لم يُرسل بريد بعد — اضغط للإرسال عبر
            Resend، ثم راقب «المراسلات».
          </p>
          <button
            type="button"
            disabled={dispatching}
            onClick={dispatchPendingEmails}
            className="px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
          >
            {dispatching ? dispatchProgress || 'جارٍ الإرسال…' : `إرسال البريد الآن (${invites.length})`}
          </button>
        </div>
      )}

      {dispatchNote && (
        <div className="mb-5 rounded-2xl border border-[#d7efe6] bg-[#f0faf7] px-4 py-3 text-sm text-[#123F3A]">
          {dispatchNote}
          {waLinks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {waLinks.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                    افتح واتساب: {link.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!draftNotSent &&
        invites.some((invite) => String(invite.delivery_status || '').toUpperCase() !== 'SENT') && (
          <div className="mb-5">
            <button
              type="button"
              disabled={dispatching}
              onClick={dispatchPendingEmails}
              className="px-4 py-2.5 border border-neutral-200 text-neutral-700 font-semibold rounded-xl text-sm disabled:opacity-50"
            >
              {dispatching ? dispatchProgress || 'جارٍ الإرسال…' : 'إعادة إرسال الدعوات غير المُرسلة'}
            </button>
          </div>
        )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { n: String(lines.length), label: 'بندًا' },
          { n: String(rfq.supplier_count || invites.length), label: 'موردًا مدعوًا' },
          { n: String(rfq.response_count || replied.length), label: 'ردًا' },
          {
            n: String(offerRows.filter((o) => o.status === 'complete').length),
            label: 'عروض مكتملة',
          },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{m.n}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-neutral-100 mb-6 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === id ? 'border-[#123F3A] text-[#123F3A]' : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {label}
            {id === 'correspondence' ? ` (${invites.length})` : ''}
            {id === 'offers' ? ` (${rfq.response_count || replied.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white border border-neutral-100 rounded-2xl p-5">
            <h3 className="font-bold text-[#0D1F1D] mb-4">ملخص الطلب</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500">المشروع / الموقع</span>
                <span className="font-semibold text-left max-w-[65%]">{title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">تاريخ الإنشاء</span>
                <span className="font-semibold">{formatArDate(rfq.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">البنود</span>
                <span className="font-semibold">{lines.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">الدعوات</span>
                <span className="font-semibold">{invites.length}</span>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => setTab('correspondence')}
              className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
            >
              عرض المراسلات ({invites.length})
            </button>
            <button
              onClick={() => openRfq(rfq.id, 'offers')}
              className="w-full py-3.5 border border-neutral-200 text-neutral-700 font-semibold rounded-xl text-sm"
            >
              صندوق الردود والعروض
            </button>
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-2">
          {lines.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">لا توجد بنود في نسخة الطلب</div>
          ) : (
            lines.map((line, index) => (
              <div
                key={String(line.line_key || line.farq_spec_id || index)}
                className="bg-white border border-neutral-100 rounded-xl px-4 py-3.5 flex items-center gap-4"
              >
                <span className="text-xs font-bold text-neutral-400 w-6">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#0D1F1D] text-sm truncate">
                    {/* Line's own text first; the catalog name is a fallback. */}
                    {String(line.original_name || line.name_ar || line.farq_spec_id || 'بند')}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {String(line.quantity ?? '—')} {String(line.uom || '')}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-3">
          {replied.length === 0 ? (
            <div className="text-center py-10 bg-white border border-neutral-100 rounded-2xl">
              <p className="text-sm text-neutral-500 mb-4">
                لا ردود بعد — {invites.length} دعوة بانتظار عرض المورد.
              </p>
              <button
                onClick={() => openRfq(rfq.id, 'offers')}
                className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
              >
                فتح صندوق العروض
              </button>
            </div>
          ) : (
            replied.slice(0, 40).map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setSelectedOfferId(row.id)
                  openRfq(rfq.id, 'offer-detail')
                }}
                className="w-full text-right bg-white border border-neutral-100 rounded-xl px-4 py-3.5 hover:border-[#123F3A]/25"
              >
                <div className="font-semibold text-[#0D1F1D] text-sm">{row.supplierName}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {formatInviteResponseStatus(row.responseStatus)} · {row.amount} ر.س
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'correspondence' && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 mb-3">
            حالة إرسال الطلب لكل مورد ورده عليه.
          </p>
          {invites.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">لا دعوات مسجّلة لهذا الطلب</div>
          ) : (
            invites.slice(0, 200).map((invite) => {
              const attempts = invite.dispatch_attempts || []
              return (
                <div
                  key={invite.id}
                  className="bg-white border border-neutral-100 rounded-xl px-4 py-3.5 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#0D1F1D] text-sm truncate">
                      {invite.supplier?.name_ar || invite.supplier?.name_en || invite.supplier_id}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      الإرسال: {formatInviteDeliveryStatus(invite.delivery_status)} · الرد:{' '}
                      {formatInviteResponseStatus(invite.response_status)}
                    </div>
                    {attempts.length > 0 ? (
                      <div className="text-[11px] text-neutral-400 mt-1">
                        {attempts
                          // Channels the supplier has no address for were never
                          // tried; listing them read like failures.
                          .filter((a) => !String(a.status).startsWith('SKIPPED'))
                          .map((a) => {
                            const channel = ({ EMAIL: 'البريد', WHATSAPP: 'واتساب', HARAJ: 'حراج' } as Record<string, string>)[a.channel] || a.channel
                            const status =
                              ({ SENT: 'أُرسل', DELIVERY_FAILED: 'لم يصل', NOT_SENT: 'لم يُرسل', PARTIALLY_SENT: 'أُرسل جزئيًا' } as Record<string, string>)[a.status] ||
                              a.status
                            return `${channel}: ${status}`
                          })
                          .join(' · ')}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700/80 mt-1">
                        لا محاولات إرسال قنوات — الدعوة داخل النظام فقط
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedOfferId(invite.id)
                      openRfq(rfq.id, 'offer-detail')
                    }}
                    className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold text-neutral-600"
                  >
                    تفاصيل
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-2">
          {(rfq.audit_timeline || []).length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">
              لا أحداث مسجّلة ولا محاولات إرسال لهذا الطلب.
            </div>
          ) : (
            (rfq.audit_timeline || []).map((event, index) => (
              <div key={`${event.event_type}-${index}`} className="bg-white border border-neutral-100 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#0D1F1D]">{auditEventLabel(event.event_type)}</div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${event.source === 'RECORDED' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}
                    title={event.source === 'RECORDED' ? 'حدث كتبه النظام لحظة وقوعه' : 'حدث مشتق من محاولات الإرسال وطوابع الطلب عند القراءة'}
                  >
                    {event.source === 'RECORDED' ? 'مسجّل' : 'مشتق'}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-1">{formatArDate(event.created_at)}</div>
                {auditEventDetail(event) && <div className="text-xs text-neutral-600 mt-1">{auditEventDetail(event)}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default RFQDetailView
