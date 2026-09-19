import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import { rfqClosing, rfqProjectName } from '../lib/rfqIdentity'
import {
  formatArDate,
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqApiStatus,
  formatRfqReference,
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

type Tab = 'correspondence' | 'offers' | 'items' | 'log'

// «نظرة عامة» repeated the header's numbers; the request opens on its suppliers.
const TABS: [Tab, string][] = [
  ['correspondence', 'الموردون'],
  ['offers', 'العروض'],
  ['items', 'البنود'],
  ['log', 'السجل'],
]

const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'البريد', WHATSAPP: 'واتساب', HARAJ: 'حراج' }

/** Where one supplier stands, in the buyer's words, with the colour that says it. */
function supplierStage(invite: { response_status?: string; opened_at?: string | null; dispatch_attempts?: Array<{ status: string; channel: string }> }): { label: string; cls: string } {
  const response = String(invite.response_status || '').toUpperCase()
  if (response === 'QUOTED') return { label: 'قدّم عرضًا', cls: 'bg-[#CFF5DC] text-[#1a7a45]' }
  if (response === 'DECLINED') return { label: 'اعتذر', cls: 'bg-neutral-100 text-neutral-500' }
  if (invite.opened_at) return { label: 'فتح الطلب', cls: 'bg-[#eef4fb] text-[#2F6CB5]' }
  const sent = (invite.dispatch_attempts || []).find((a) => a.status === 'SENT')
  if (sent) return { label: `وصله عبر ${CHANNEL_LABEL[sent.channel] || sent.channel}`, cls: 'bg-neutral-100 text-neutral-600' }
  const failed = (invite.dispatch_attempts || []).find((a) => a.status === 'DELIVERY_FAILED')
  if (failed) return { label: 'لم يصله', cls: 'bg-red-50 text-red-700' }
  return { label: 'لم يُرسل بعد', cls: 'bg-amber-50 text-amber-700' }
}

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
  const { selectedRfqId, openRfq, setSelectedOfferId, openInboxThread } = useProcurement()
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('correspondence')
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
  const payload = rfq.current_version?.payload as
    | { delivery?: { city?: string; site_address?: string; required_date?: string }; quote_deadline?: string; quote_deadline_time?: string }
    | undefined
  const project = rfqProjectName({ delivery: payload?.delivery })
  const reference = formatRfqReference(rfq.id, rfq.engineering_department || null)
  const lines = rfq.current_version?.payload?.lines || []
  const invites = rfq.invitations || []
  const offerRows = mapInvitationsToOfferRows(rfq)
  const replied = offerRows.filter((o) => o.status !== 'pending')
  const uiStatus = mapRfqUiStatus(rfq.status, rfq.award?.id)
  const draftNotSent = String(rfq.status).toUpperCase() === 'DRAFT_NOT_SENT'
  const deadline = payload?.delivery?.required_date
  const closing = rfqClosing(payload?.quote_deadline, payload?.quote_deadline_time)
  const quoted = invites.filter((i) => String(i.response_status || '').toUpperCase() === 'QUOTED')
  const reached = invites.filter((i) => (i.dispatch_attempts || []).some((a) => a.status === 'SENT')).length
  const opened = invites.filter((i) => i.opened_at).length
  const total = invites.length

  // The one thing to do next, stated once, above everything else.
  const next = quoted.length >= 2
    ? { text: `وصلتك ${quoted.length} عروض أسعار — قارن بينها واختر الأنسب.`, action: 'مقارنة العروض', go: () => openRfq(rfq.id, 'comparison'), tone: 'green' }
    : quoted.length === 1
      ? { text: 'وصلك أول عرض سعر. انتظر بقية الموردين أو راجعه الآن.', action: 'عرض العروض', go: () => openRfq(rfq.id, 'offers'), tone: 'green' }
      : reached === 0 && total > 0
        ? { text: 'لم يصل الطلب لأي مورد بعد.', action: null, go: null, tone: 'amber' }
        : { text: `بانتظار عروض الموردين${closing.label ? ` — ${closing.label}` : ''}. أي رد يصلك بالبريد فورًا.`, action: 'المراسلات', go: () => navigate('inbox'), tone: 'neutral' }

  const stageBar = (label: string, value: number, colour: string) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className="text-sm font-black text-[#0D1F1D] tabular-nums">{value}<span className="text-neutral-400 text-xs font-medium">/{total}</span></span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${total ? Math.round((value / total) * 100) : 0}%` }} />
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button onClick={() => navigate('rfq-list')} className="text-xs text-neutral-400 hover:text-neutral-600">
            الطلبات
          </button>
          <span className="text-neutral-300">/</span>
          <span dir="ltr" className="text-xs font-mono text-neutral-400">{reference}</span>
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
        <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">{project || title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-neutral-500">
          {project && <span>{title}</span>}
          <span>{lines.length} {lines.length === 1 ? 'بند' : 'بنود'}</span>
          {closing.label && (
            <span className={`flex items-center gap-1 font-semibold ${closing.urgent ? 'text-red-600' : ''}`}>
              <ClockIcon className="w-4 h-4" /> {closing.label}
            </span>
          )}
          {deadline && <span>التوريد: <span className="font-semibold text-[#0D1F1D]">{formatArDate(deadline)}</span></span>}
        </div>
      </div>

      {!draftNotSent && total > 0 && (
        <div
          className={`mb-5 rounded-2xl border px-4 py-4 flex flex-wrap items-center justify-between gap-3 ${
            next.tone === 'green' ? 'bg-[#f0faf7] border-[#123F3A]/20' : next.tone === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-white border-neutral-100'
          }`}
        >
          <p className="text-sm font-semibold text-[#0D1F1D]">{next.text}</p>
          {next.action && next.go && (
            <button onClick={next.go} className="px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
              {next.action}
            </button>
          )}
        </div>
      )}

      {draftNotSent && (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-3">
            الطلب محفوظ ولم يُرسل بعد إلى {invites.length} موردين.
          </p>
          <button
            type="button"
            disabled={dispatching}
            onClick={dispatchPendingEmails}
            className="px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
          >
            {dispatching ? dispatchProgress || 'جارٍ الإرسال…' : `أرسل الطلب الآن (${invites.length})`}
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

      {total > 0 && (
        <div className="mb-6 bg-white border border-neutral-100 rounded-2xl px-4 py-4 flex gap-4">
          {stageBar('وصلهم الطلب', reached, 'bg-[#123F3A]/40')}
          {stageBar('فتحوا الطلب', opened, 'bg-[#2F6CB5]/70')}
          {stageBar('قدّموا عرضًا', quoted.length, 'bg-[#1a7a45]')}
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
              {dispatching ? dispatchProgress || 'جارٍ الإرسال…' : 'أرسل لمن لم يصلهم الطلب'}
            </button>
          </div>
        )}

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
            {id === 'offers' ? ` (${quoted.length})` : ''}
          </button>
        ))}
      </div>

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
          {invites.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">لا موردين في هذا الطلب</div>
          ) : (
            [...invites]
              // Who needs a look first: quoted, then opened, then the rest.
              .sort((x, y) => {
                const rank = (i: typeof x) => (String(i.response_status || '').toUpperCase() === 'QUOTED' ? 0 : i.opened_at ? 1 : 2)
                return rank(x) - rank(y)
              })
              .slice(0, 200)
              .map((invite) => {
                const stage = supplierStage(invite)
                const isQuoted = String(invite.response_status || '').toUpperCase() === 'QUOTED'
                return (
                  <div key={invite.id} className="bg-white border border-neutral-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#0D1F1D] text-sm truncate">
                        {invite.supplier?.name_ar || invite.supplier?.name_en || invite.supplier_id}
                      </div>
                      <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${stage.cls}`}>{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openInboxThread(invite.id)}
                        className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold text-neutral-700 hover:border-[#123F3A]/40"
                      >
                        المحادثة
                      </button>
                      {isQuoted && (
                        <button
                          onClick={() => {
                            setSelectedOfferId(invite.id)
                            openRfq(rfq.id, 'offer-detail')
                          }}
                          className="text-xs px-3 py-1.5 bg-[#123F3A] text-white rounded-lg font-bold"
                        >
                          العرض
                        </button>
                      )}
                    </div>
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
