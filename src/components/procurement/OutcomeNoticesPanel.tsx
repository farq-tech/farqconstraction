import { useCallback, useEffect, useState } from 'react'
import {
  ConstructionApiError,
  getOutcomeNotices,
  outcomeNoticesEnabled,
  sendOutcomeNotices,
  type OutcomeNotice,
  type OutcomeNoticeResult,
  type OutcomeNoticesPreview,
} from '../../api/constructionClient'
import { isReadOnlyBuild, READ_ONLY_MESSAGE } from '../../api/readOnlyMode'
import { approvalsFor, counts, OUTCOME_LABELS, resultLabel, sendable } from '../../lib/outcomeNotices'

type Props = { rfqId: string }

const OUTCOME_TONE: Record<string, string> = {
  AWARDED: 'bg-[#CFF5DC] text-[#123F3A]',
  NOT_SELECTED: 'bg-neutral-100 text-neutral-600',
  CLOSED_NO_AWARD: 'bg-neutral-100 text-neutral-600',
}

/**
 * «أبلغ الموردين بالنتيجة»: one short result note per supplier who quoted.
 * Every text is shown in full; nothing leaves until the buyer approves it —
 * per supplier, or «أرسل كل الرسائل المعروضة» after a second confirmation.
 * Hidden unless VITE_CONSTRUCTION_OUTCOME_NOTICES=1 and the API has it on.
 */
export default function OutcomeNoticesPanel({ rfqId }: Props) {
  const enabled = outcomeNoticesEnabled()
  const [data, setData] = useState<OutcomeNoticesPreview | null>(null)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNoPurchase, setConfirmNoPurchase] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [results, setResults] = useState<Record<string, OutcomeNoticeResult>>({})
  const readOnly = isReadOnlyBuild()

  const load = useCallback(async (confirm: boolean) => {
    try {
      setData(await getOutcomeNotices(rfqId, { confirmNoPurchase: confirm }))
      setError(null)
    } catch (e) {
      // Off on this server, or not this company's request: show nothing.
      if (e instanceof ConstructionApiError && [404, 501, 503].includes(e.status)) setHidden(true)
      else setError(e instanceof Error ? e.message : 'تعذّر تحميل رسائل النتيجة')
    }
  }, [rfqId])

  useEffect(() => {
    if (!enabled || !rfqId) return
    void load(false)
  }, [enabled, rfqId, load])

  const send = async (supplierIds: string[] | null) => {
    if (!data || busy || readOnly || !data.can_send) return
    const notices = approvalsFor(data.notices, supplierIds || undefined)
    if (!notices.length) return
    setBusy(supplierIds ? supplierIds[0] : 'ALL')
    setError(null)
    try {
      const out = await sendOutcomeNotices(rfqId, { notices, ...(data.mode === 'CLOSED_NO_AWARD' && confirmNoPurchase ? { confirm_no_purchase: true } : {}) })
      setResults((prev) => ({ ...prev, ...Object.fromEntries(out.results.map((r) => [r.supplier_id, r])) }))
      await load(confirmNoPurchase)
    } catch (e) {
      setError(e instanceof ConstructionApiError && e.code === 'INBOX_OWNER_REQUIRED'
        ? 'مراسلات هذا الطلب مسندة لزميل آخر، وهو من يرسل رسائل النتيجة.'
        : e instanceof Error ? e.message : 'تعذّر الإرسال')
    } finally {
      setBusy(null)
      setConfirmAll(false)
    }
  }

  if (!enabled || hidden || !data || data.mode === 'OPEN') return null

  if (data.mode === 'NEEDS_CONFIRMATION') {
    if (!data.quoted_count) return null
    return (
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-right" dir="rtl">
        <h2 className="text-base font-black text-[#0D1F1D] mb-1">أبلغ الموردين بالنتيجة</h2>
        <p className="text-sm text-neutral-600 mb-3">
          الطلب مغلق ولم تتم الترسية بعد. إذا قررت عدم الشراء، جهّز رسالة شكر لكل مورد قدّم عرضاً ({data.quoted_count}). تقدر تراجع كل رسالة قبل الإرسال.
        </p>
        <button
          onClick={() => { setConfirmNoPurchase(true); void load(true) }}
          className="px-4 py-2 rounded-xl border border-neutral-200 text-sm font-bold text-[#0D1F1D] hover:bg-neutral-50"
        >
          لن تتم الترسية — جهّز رسائل الشكر
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>
    )
  }

  if (!data.notices.length) return null
  const tally = counts(data.notices)
  const ready = sendable(data.notices)
  const canSend = data.can_send && !readOnly

  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-base font-black text-[#0D1F1D]">أبلغ الموردين بالنتيجة</h2>
        <span className="text-xs text-neutral-500">
          جاهزة {tally.ready} · أُرسلت {tally.sent}{tally.blocked ? ` · بدون قناة/موقوفة ${tally.blocked}` : ''}
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        رسالة واحدة لكل مورد قدّم عرضاً، بقناة مجانية فقط. ما يُرسل شيء إلا بموافقتك على النص الظاهر.
      </p>
      {data.unavailable && <p className="mb-3 text-sm text-amber-800">الخدمة غير مفعّلة بالكامل على الخادم بعد.</p>}
      {data.owner_name && <p className="mb-3 text-sm text-amber-800">مراسلات هذا الطلب مسندة إلى {data.owner_name}، وهو من يرسل رسائل النتيجة.</p>}
      {readOnly && <p className="mb-3 text-sm text-amber-800">{READ_ONLY_MESSAGE}</p>}

      <ul className="space-y-3">
        {data.notices.map((n) => (
          <NoticeRow key={n.supplier_id} notice={n} result={results[n.supplier_id]} canSend={canSend} busy={busy} onSend={() => void send([n.supplier_id])} />
        ))}
      </ul>

      {canSend && ready.length > 1 && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {!confirmAll ? (
            <button onClick={() => setConfirmAll(true)} disabled={Boolean(busy)} className="w-full py-3 rounded-xl bg-[#123F3A] text-white text-sm font-bold disabled:opacity-50">
              أرسل كل الرسائل المعروضة ({ready.length})
            </button>
          ) : (
            <div className="rounded-xl bg-[#f0faf7] px-4 py-3">
              <p className="text-sm text-[#123F3A] mb-3">بنرسل {ready.length} رسائل بالنصوص الظاهرة أعلاه بالضبط، كل مورد على قناته. متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={() => void send(null)} disabled={Boolean(busy)} className="flex-1 py-2.5 rounded-xl bg-[#123F3A] text-white text-sm font-bold disabled:opacity-50">
                  {busy === 'ALL' ? 'جارٍ الإرسال…' : 'نعم، أرسلها'}
                </button>
                <button onClick={() => setConfirmAll(false)} disabled={Boolean(busy)} className="flex-1 py-2.5 rounded-xl border border-neutral-200 text-sm font-bold text-neutral-600">
                  لا
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  )
}

function NoticeRow({ notice: n, result, canSend, busy, onSend }: { notice: OutcomeNotice; result?: OutcomeNoticeResult; canSend: boolean; busy: string | null; onSend: () => void }) {
  return (
    <li className="rounded-xl border border-neutral-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-bold text-sm text-[#0D1F1D]">{n.supplier_name}</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${OUTCOME_TONE[n.outcome] || 'bg-neutral-100 text-neutral-600'}`}>{OUTCOME_LABELS[n.outcome] || n.outcome}</span>
        <span className="text-xs text-neutral-500">
          {n.state === 'BLOCKED' ? n.reason_label_ar || 'لم يُرسل' : n.channel_label_ar ? `عبر ${n.channel_label_ar}` : ''}
        </span>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 px-3 py-2 text-sm leading-7 text-neutral-800" dir="rtl">{n.text}</p>
      {n.prior_award_message?.length ? (
        <p className="mt-2 text-xs text-amber-800">وصله سابقاً إشعار الترسية الآلي ({n.prior_award_message.map((m) => m.channel).join('، ')}).</p>
      ) : null}
      {n.last_failure && n.state === 'READY' && <p className="mt-2 text-xs text-amber-800">المحاولة السابقة لم تُرسل: {resultLabel({ supplier_id: n.supplier_id, state: 'FAILED', reason: n.last_failure })}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        {n.state === 'SENT' ? (
          <span className="text-xs font-bold text-[#1a7a45]">
            {n.send_state === 'UNKNOWN' ? 'نتيجة الإرسال غير مؤكدة — لن نعيد الإرسال' : 'أُرسلت ✓'}
          </span>
        ) : n.state === 'READY' ? (
          <button onClick={onSend} disabled={!canSend || Boolean(busy)} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-xs font-bold disabled:opacity-40">
            {busy === n.supplier_id ? 'جارٍ الإرسال…' : 'موافق — أرسل هذه الرسالة'}
          </button>
        ) : (
          <span className="text-xs text-neutral-500">لن تُرسل</span>
        )}
        {result && result.state !== 'SENT' && <span className="text-xs text-red-700">{resultLabel(result)}</span>}
      </div>
    </li>
  )
}
