import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatChannelLabel,
  formatDispatchAttemptStatus,
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqTitle,
  formatSar,
  getConstructionComparison,
  getConstructionRfq,
  getConstructionStatus,
  invitePreferredChannel,
  isHarajSellerExternalKey,
  prepareConstructionWhatsAppLink,
  sendConstructionRfqInvite,
  type ConstructionInvitation,
  type ConstructionRfq,
} from '../api/constructionClient'
import { buildRfqEmailPreview } from '../lib/rfqEmailPreview'
import { RfqEmailPreviewModal } from '../components/RfqEmailPreviewModal'

export function OfferDetailView({ navigate }: NavProps) {
  const { selectedRfqId, selectedOfferId, openRfq } = useProcurement()
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [invite, setInvite] = useState<ConstructionInvitation | null>(null)
  const [quoteTotal, setQuoteTotal] = useState<number | null>(null)
  const [quoteLines, setQuoteLines] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [waBusy, setWaBusy] = useState(false)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [cloudWhatsappOn, setCloudWhatsappOn] = useState(false)

  useEffect(() => {
    if (!selectedRfqId || !selectedOfferId) {
      setLoading(false)
      setError('لم يُحدَّد عرض أو دعوة')
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      getConstructionRfq(selectedRfqId),
      getConstructionComparison(selectedRfqId).catch(() => null),
      getConstructionStatus().catch(() => null),
    ])
      .then(([detail, comparison, status]) => {
        if (cancelled) return
        setRfq(detail)
        const delivery = (status?.delivery_channels || {}) as Record<string, unknown>
        setCloudWhatsappOn(Boolean(delivery.whatsapp))
        const found = (detail.invitations || []).find((row) => row.id === selectedOfferId) || null
        setInvite(found)
        const supplierId = String(found?.supplier?.id || found?.supplier_id || '')
        const response = (comparison?.supplier_responses || []).find(
          (row) => String(row.supplier.id || '') === supplierId,
        )
        const total =
          response?.offer?.totals?.total ??
          response?.offer?.totals?.goods_total ??
          response?.offer?.totals?.subtotal
        setQuoteTotal(total != null ? Number(total) : null)
        setQuoteLines(Array.isArray(response?.offer?.lines) ? response!.offer.lines! : [])
        if (!found) setError('الدعوة غير موجودة في هذا الطلب')
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRfqId, selectedOfferId])

  const emailPreview = useMemo(() => {
    if (!rfq || !invite) return null
    const payload = rfq.current_version?.payload
    const lines = payload?.lines || []
    return buildRfqEmailPreview({
      rfqId: rfq.id,
      supplierName: invite.supplier?.name_ar || invite.supplier?.name_en || undefined,
      recipientEmail: invite.supplier?.email,
      engineeringDepartment:
        rfq.engineering_department ||
        (payload?.engineering_department as
          | { key?: string; label_ar?: string; label_en?: string }
          | null
          | undefined),
      buyerCompany: payload?.buyer?.company_name,
      deliverySite: payload?.delivery?.site_address || payload?.delivery?.city,
      requiredDate: payload?.delivery?.required_date,
      lines: lines.map((line) => ({
        // Pass both through unmerged: the preview prefers the line's own text,
        // and merging them here is what hid the real description.
        original_name: line.original_name != null ? String(line.original_name) : undefined,
        name_ar: line.name_ar != null ? String(line.name_ar) : undefined,
        name_en: line.name_en != null ? String(line.name_en) : undefined,
        farq_spec_id: line.farq_spec_id != null ? String(line.farq_spec_id) : undefined,
        line_key: line.line_key != null ? String(line.line_key) : undefined,
        quantity: line.quantity as string | number | undefined,
        uom: line.uom != null ? String(line.uom) : undefined,
      })),
    })
  }, [rfq, invite])

  const preferred = invite ? invitePreferredChannel(invite) : 'EMAIL'
  const isHaraj = invite
    ? isHarajSellerExternalKey(String(invite.supplier?.id || invite.supplier_id || ''))
    : false
  const hasEmail = Boolean(String(invite?.supplier?.email || '').trim())
  const hasWhatsapp = Boolean(
    String(invite?.supplier?.whatsapp || invite?.supplier?.phone || '').trim(),
  )

  const handleSend = async () => {
    if (!rfq || !invite) return
    setSending(true)
    setSendNote(null)
    try {
      const updated = await sendConstructionRfqInvite(rfq.id, invite.id, {
        sendConsent: false,
        harajLimit: isHaraj ? 1 : undefined,
      })
      setRfq(updated)
      const next = (updated.invitations || []).find((row) => row.id === invite.id) || null
      setInvite(next)
      const attempts = next?.dispatch_attempts || []
      const emailAttempt = attempts.find((a) => a.channel === 'EMAIL')
      const harajAttempt = attempts.find((a) => a.channel === 'HARAJ')
      if (isHaraj && harajAttempt) {
        setSendNote(
          `حراج: ${formatDispatchAttemptStatus(harajAttempt.status)}${
            harajAttempt.failure_code ? ` · ${harajAttempt.failure_code}` : ''
          }`,
        )
      } else if (emailAttempt) {
        setSendNote(
          `بريد: ${formatDispatchAttemptStatus(emailAttempt.status)}${
            emailAttempt.failure_code ? ` · ${emailAttempt.failure_code}` : ''
          }`,
        )
      } else {
        setSendNote(
          String(next?.delivery_status || '').toUpperCase() === 'SENT'
            ? 'تم تسجيل محاولة الإرسال في المراسلات.'
            : 'اكتملت محاولة الإرسال — راجع حالة القناة أدناه.',
        )
      }
    } catch (err) {
      setSendNote(err instanceof Error ? err.message : 'فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  const handleWhatsAppManual = async () => {
    if (!rfq || !invite) return
    setWaBusy(true)
    setSendNote(null)
    try {
      const link = await prepareConstructionWhatsAppLink(rfq.id, invite.id)
      if (link.url) {
        window.open(link.url, '_blank', 'noopener,noreferrer')
        setSendNote(
          'فُتح واتساب ويب برابط الدعوة. هذا إرسال يدوي — فتح الرابط لا يُسجَّل كـ SENT لدى المزوّد.',
        )
      } else {
        setSendNote('تعذّر تجهيز رابط واتساب.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تجهيز واتساب'
      if (String(msg).includes('EMAIL_PREFERRED') || String((err as { code?: string })?.code) === 'CONSTRUCTION_EMAIL_PREFERRED') {
        setSendNote('لهذا المورد بريد مفضّل — أرسل عبر البريد بدل واتساب اليدوي.')
      } else {
        setSendNote(msg)
      }
    } finally {
      setWaBusy(false)
    }
  }

  const handleWhatsAppCloud = async () => {
    if (!rfq || !invite) return
    setCloudBusy(true)
    setSendNote(null)
    try {
      const updated = await sendConstructionRfqInvite(rfq.id, invite.id, {
        sendConsent: true,
      })
      setRfq(updated)
      const next = (updated.invitations || []).find((row) => row.id === invite.id) || null
      setInvite(next)
      const wa = (next?.dispatch_attempts || []).find((a) => a.channel === 'WHATSAPP')
      setSendNote(
        wa
          ? `واتساب Cloud: ${formatDispatchAttemptStatus(wa.status)}${wa.failure_code ? ` · ${wa.failure_code}` : ''}`
          : 'اكتملت محاولة Cloud — راجع حالة القناة أدناه.',
      )
    } catch (err) {
      setSendNote(err instanceof Error ? err.message : 'فشل إرسال Cloud')
    } finally {
      setCloudBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-16 text-center text-neutral-400 text-sm">
        جاري التحميل…
      </div>
    )
  }

  if (error || !invite || !rfq) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
        <div className="text-center py-20 bg-white border border-neutral-100 rounded-2xl">
          <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">لا يوجد عرض محدد</h1>
          <p className="text-sm text-neutral-500 mb-6">{error || 'اختر دعوة من المراسلات أو العروض.'}</p>
          <button
            onClick={() => navigate(selectedRfqId ? 'offers' : 'rfq-list')}
            className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
          >
            العودة
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
  const attempts = invite.dispatch_attempts || []
  const alreadySent = String(invite.delivery_status || '').toUpperCase() === 'SENT'
  const sendLabel = isHaraj ? 'إرسال عبر حراج' : 'إرسال البريد'

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-5 text-xs">
        <button onClick={() => openRfq(rfq.id, 'offers')} className="text-neutral-400 hover:text-neutral-600">
          العروض والمراسلات
        </button>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-600 font-semibold truncate">
          {invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد'}
        </span>
      </div>

      <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">
        {invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد'}
      </h1>
      <p className="text-sm text-neutral-500 mb-2">{title}</p>
      <p className="text-xs text-neutral-400 mb-6">
        القناة المفضّلة: {formatChannelLabel(preferred)}
        {hasEmail ? ' · بريد متاح' : ''}
        {hasWhatsapp ? ' · واتساب متاح' : ''}
        {isHaraj ? ' · بائع حراج' : ''}
      </p>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-4">
          <div className="text-xs text-neutral-400 mb-1">حالة الإرسال</div>
          <div className="font-bold text-[#0D1F1D] text-sm">
            {formatInviteDeliveryStatus(invite.delivery_status)}
          </div>
        </div>
        <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-4">
          <div className="text-xs text-neutral-400 mb-1">حالة الرد</div>
          <div className="font-bold text-[#0D1F1D] text-sm">
            {formatInviteResponseStatus(invite.response_status)}
          </div>
        </div>
        <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-4">
          <div className="text-xs text-neutral-400 mb-1">إجمالي العرض</div>
          <div className="font-bold text-[#0D1F1D] text-sm">
            {quoteTotal != null ? formatSar(quoteTotal) : '—'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-[#0D1F1D]">المراسلة / القنوات</h2>
          <div className="flex flex-wrap items-center gap-2">
            {emailPreview && hasEmail && (
              <button
                type="button"
                onClick={() => setShowEmailPreview(true)}
                className="px-3 py-1.5 border border-neutral-200 text-[#123F3A] text-xs font-bold rounded-lg hover:bg-neutral-50"
              >
                معاينة الإيميل
              </button>
            )}
            {!alreadySent && (hasEmail || isHaraj) && (
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                className="px-3 py-1.5 bg-[#123F3A] text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {sending ? 'جارٍ الإرسال…' : sendLabel}
              </button>
            )}
            {!alreadySent && hasWhatsapp && !hasEmail && (
              <>
                <button
                  type="button"
                  disabled={waBusy}
                  onClick={handleWhatsAppManual}
                  className="px-3 py-1.5 border border-[#123F3A] text-[#123F3A] text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  {waBusy ? 'تجهيز الرابط…' : 'فتح واتساب ويب'}
                </button>
                {cloudWhatsappOn && (
                  <button
                    type="button"
                    disabled={cloudBusy}
                    onClick={handleWhatsAppCloud}
                    className="px-3 py-1.5 bg-[#123F3A] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                    title="يرسل عبر Meta Cloud مع send_consent=true — يخصم من ميزانية التجربة"
                  >
                    {cloudBusy ? 'Cloud…' : 'إرسال Cloud (موافقة)'}
                  </button>
                )}
              </>
            )}
            {!alreadySent && hasWhatsapp && hasEmail && (
              <button
                type="button"
                disabled={waBusy}
                onClick={handleWhatsAppManual}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-600 text-xs font-bold rounded-lg disabled:opacity-50"
                title="API يفضّل البريد إن وُجد — قد يرفض الرابط بـ EMAIL_PREFERRED"
              >
                {waBusy ? '…' : 'واتساب يدوي'}
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 mb-3 leading-relaxed">
          بريد عبر Resend · حراج عند التفعيل · واتساب ويب يدوي دائمًا. Cloud WhatsApp يعمل فقط إذا أظهر
          `/status` القناة ON وبعد موافقة صريحة (`send_consent`) و`WHATSAPP_ENABLED` — SENT = قبول المزوّد.
        </p>
        {sendNote && <p className="text-xs text-[#123F3A] mb-3">{sendNote}</p>}
        {attempts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            لا محاولات إرسال مسجّلة (`dispatch_attempts`). استخدم الأزرار أعلاه حسب القناة المتاحة.
          </p>
        ) : (
          <div className="space-y-2">
            {attempts.map((attempt, index) => (
              <div
                key={`${attempt.channel}-${index}`}
                className="text-sm flex justify-between gap-3 border-b border-neutral-50 py-2"
              >
                <span className="font-semibold">{formatChannelLabel(attempt.channel)}</span>
                <span className="text-neutral-500 text-left">
                  {formatDispatchAttemptStatus(attempt.status)}
                  {attempt.failure_code ? ` · ${attempt.failure_code}` : ''}
                  {attempt.sent_at ? ` · ${formatArDate(attempt.sent_at)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-neutral-100 rounded-2xl p-5">
        <h2 className="font-bold text-[#0D1F1D] mb-3">بنود العرض</h2>
        {quoteLines.length === 0 ? (
          <p className="text-sm text-neutral-500">لم يُسجَّل عرض أسعار لهذا المورد بعد.</p>
        ) : (
          <div className="space-y-2">
            {quoteLines.map((line, index) => (
              <div
                key={String(line.line_key || line.id || index)}
                className="flex justify-between text-sm gap-3 py-2 border-b border-neutral-50"
              >
                <span className="text-[#0D1F1D] font-medium truncate">
                  {String(
                    line.original_name || line.name_ar || line.line_key || `بند ${index + 1}`,
                  )}
                </span>
                <span className="text-neutral-600 font-semibold flex-shrink-0">
                  {line.unit_price != null || line.line_total != null
                    ? formatSar(Number(line.line_total ?? line.unit_price))
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEmailPreview && emailPreview && (
        <RfqEmailPreviewModal preview={emailPreview} onClose={() => setShowEmailPreview(false)} />
      )}
    </div>
  )
}

export default OfferDetailView
