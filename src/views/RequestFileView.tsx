import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import {
  ConstructionApiError,
  constructionRateLimitWaitSec,
  formatRfqReference,
  formatRfqTitle,
  getConstructionComparison,
  getConstructionInboxThread,
  getConstructionRfq,
  getConstructionSupplierOutcomes,
  invitePreferredChannel,
  replyToConstructionInboxThread,
  sendConstructionRfqInvite,
  type ConstructionComparison,
  type ConstructionInvitation,
  type ConstructionRfq,
  type ConstructionSupplierOutcomeEvent,
} from '../api/constructionClient'
import { rfqProjectName } from '../lib/rfqIdentity'
import {
  buildTimeline,
  formatEventTime,
  formatMoney,
  leadTimeLabel,
  cheapestPerLineTotal,
  lowestPerLine,
  matrixTotals,
  quoteCoverage,
  quoteDeadline,
  requestProgress,
  invitesForMessage,
  requestState,
  supplierState,
  type MessageSupplierFilter,
  taxLabel,
} from '../lib/requestFile'
import type { CheapestBasket } from '../lib/requestFile'
import LineOfferComparison from '../components/procurement/LineOfferComparison'
import AwardDialog from '../components/procurement/AwardDialog'
import StepDialog from '../components/procurement/StepDialog'
import { awardBlockReason } from '../lib/awardFlow'
import { ChatPane } from '../components/inbox/ChatPane'
import { ChannelTag } from '../components/inbox/MessageBubble'

type Tab = 'overview' | 'items' | 'quotes' | 'suppliers' | 'messages' | 'history'
const TABS: [Tab, string][] = [
  ['overview', 'نظرة عامة'],
  ['items', 'البنود'],
  ['quotes', 'العروض'],
  ['suppliers', 'الموردون'],
  ['messages', 'الرسائل'],
  ['history', 'السجل'],
]
const TAB_IDS = new Set(TABS.map(([id]) => id))
const POLL_MS = 30_000

type Offer = ConstructionComparison['supplier_responses'][number]

function readUrl(): { tab: Tab | null; supplier: string | null } {
  try {
    const p = new URLSearchParams(window.location.search)
    const tab = p.get('tab') as Tab | null
    const supplier = p.get('supplier')
    return { tab: tab && TAB_IDS.has(tab) ? tab : null, supplier: supplier && /^[0-9a-f-]{36}$/i.test(supplier) ? supplier : null }
  } catch {
    return { tab: null, supplier: null }
  }
}

function writeUrl(rfqId: string, tab: Tab, supplier: string | null) {
  try {
    const q = new URLSearchParams({ view: 'rfq', rfq: rfqId, tab })
    if (supplier) q.set('supplier', supplier)
    window.history.replaceState(window.history.state, '', `?${q.toString()}`)
  } catch {
    /* the page works without the address */
  }
}

function lineText(line: Record<string, unknown>): { name: string; spec: string } {
  const name = String(line.original_name || line.name_ar || line.farq_spec_id || 'بند')
  const tech = line.technical_specification
  const specParts = [
    typeof line.spec === 'string' ? line.spec : '',
    tech && typeof tech === 'object' ? Object.values(tech as Record<string, unknown>).filter((v) => typeof v === 'string').join(' — ') : '',
    typeof line.item_note === 'string' ? line.item_note : '',
  ].filter((v) => v && v.trim())
  return { name, spec: specParts.join(' · ') }
}

export function RequestFileView({ navigate, initialTab }: NavProps & { initialTab?: Tab }) {
  const { selectedRfqId } = useProcurement()
  const initial = useRef(readUrl())
  const [tab, setTab] = useState<Tab>(initial.current.tab || initialTab || 'overview')
  const [chatSupplier, setChatSupplier] = useState<string | null>(initial.current.supplier)
  const [rfq, setRfq] = useState<ConstructionRfq | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const currentRfqId = useRef(selectedRfqId)
  currentRfqId.current = selectedRfqId
  const [comparison, setComparison] = useState<ConstructionComparison | null>(null)
  const [outcomes, setOutcomes] = useState<ConstructionSupplierOutcomeEvent[] | null>(null)
  const [error, setError] = useState<{ status?: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [awarding, setAwarding] = useState<Offer | null>(null)
  const [stepping, setStepping] = useState<'close' | 'open' | null>(null)
  const [messaging, setMessaging] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(
    async (id: string, what: { comparison?: boolean; outcomes?: boolean } = {}) => {
      const [nextRfq, nextComparison, nextOutcomes] = await Promise.all([
        getConstructionRfq(id),
        what.comparison ? getConstructionComparison(id).then((result) => { if (currentRfqId.current === id) setComparisonError(null); return result }).catch(() => { if (currentRfqId.current === id) setComparisonError('تعذر تحميل العروض. أعد المحاولة أو افتح المظاريف إذا كان الطلب مغلقًا.'); return null }) : Promise.resolve(undefined),
        what.outcomes ? getConstructionSupplierOutcomes(id).catch(() => null) : Promise.resolve(undefined),
      ])
      if (currentRfqId.current !== id) return
      setRfq(nextRfq)
      if (nextComparison !== undefined) setComparison(nextComparison)
      if (nextOutcomes !== undefined) setOutcomes(nextOutcomes?.events || [])
    },
    [],
  )

  // First load: the request, and the quotes it opens on.
  useEffect(() => {
    if (!selectedRfqId) {
      setLoading(false)
      setError({ status: 404, message: 'لم يُحدَّد طلب' })
      return
    }
    let cancelled = false
    setLoading(true)
    setRfq(null)
    setComparison(null)
    setComparisonError(null)
    setAwarding(null)
    setStepping(null)
    setOutcomes(null)
    setError(null)
    load(selectedRfqId, { comparison: true, outcomes: tab === 'history' })
      .catch((err: unknown) => {
        if (cancelled) return
        const status = err instanceof ConstructionApiError ? err.status : undefined
        setError({ status, message: err instanceof Error ? err.message : 'تعذّر تحميل الطلب' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRfqId, load])

  // History loads when first opened.
  useEffect(() => {
    if (tab === 'history' && selectedRfqId && outcomes === null) {
      getConstructionSupplierOutcomes(selectedRfqId)
        .then((r) => setOutcomes(r.events || []))
        .catch(() => setOutcomes([]))
    }
  }, [tab, selectedRfqId, outcomes])

  // Freshness: a new quote or reply shows up without a manual refresh.
  useEffect(() => {
    if (!selectedRfqId) return
    const timer = window.setInterval(() => {
      if (document.hidden || constructionRateLimitWaitSec() > 0) return
      load(selectedRfqId, { comparison: true, outcomes: outcomes !== null }).catch(() => {})
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [selectedRfqId, load, outcomes])

  useEffect(() => {
    if (selectedRfqId) writeUrl(selectedRfqId, tab, tab === 'messages' ? chatSupplier : null)
  }, [selectedRfqId, tab, chatSupplier])

  const invites = useMemo(() => rfq?.invitations || [], [rfq])
  const offerByInvite = useMemo(() => {
    const map = new Map<string, Offer>()
    for (const row of comparison?.supplier_responses || []) {
      const inviteId = String(row.offer.inviteId || '')
      if (inviteId) map.set(inviteId, row)
    }
    return map
  }, [comparison])
  const summaryBySupplier = useMemo(
    () => new Map((comparison?.quote_matrix?.supplier_summaries || []).map((s) => [s.supplier_id, s])),
    [comparison],
  )
  const awardedInviteId = useMemo(() => {
    const qv = rfq?.award?.supplier_quote_version_id
    if (!qv) return null
    for (const row of comparison?.supplier_responses || []) if (String(row.offer.quoteVersionId) === qv) return String(row.offer.inviteId || '') || null
    return null
  }, [rfq, comparison])
  const nameOfSupplier = useCallback(
    (externalId: string | null) => {
      const inv = invites.find((i) => i.supplier_id === externalId)
      return String(inv?.supplier?.name_ar || inv?.supplier?.name_en || 'مورد')
    },
    [invites],
  )

  if (loading && !rfq) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10 animate-pulse" aria-busy="true">
        <div className="h-8 w-2/3 bg-neutral-100 rounded-xl mb-3" />
        <div className="h-4 w-1/3 bg-neutral-100 rounded mb-8" />
        <div className="grid grid-cols-3 gap-3 mb-6">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-neutral-100 rounded-2xl" />)}</div>
        <div className="h-64 bg-neutral-100 rounded-2xl" />
      </div>
    )
  }

  if (error || !rfq) {
    const notFound = error?.status === 404 || !selectedRfqId
    const denied = error?.status === 401 || error?.status === 403
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">
          {notFound ? 'لم نجد هذا الطلب' : denied ? 'لا تملك صلاحية عرض هذا الطلب' : 'تعذّر تحميل الطلب'}
        </h1>
        <p className="text-neutral-500 text-sm mb-6">
          {notFound ? 'قد يكون الرابط خاطئًا أو الطلب لشركة أخرى.' : denied ? 'سجّل الدخول بحساب الشركة التي أرسلت الطلب.' : error?.message}
        </p>
        <div className="flex gap-3 justify-center">
          {!notFound && !denied && selectedRfqId && (
            <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
              إعادة المحاولة
            </button>
          )}
          <button onClick={() => navigate('rfq-list')} className="px-5 py-2.5 border border-neutral-200 text-neutral-700 font-semibold rounded-xl text-sm">
            الطلبات
          </button>
        </div>
      </div>
    )
  }

  const payload = (rfq.current_version?.payload || {}) as Record<string, unknown> & {
    delivery?: { city?: string; site_address?: string; required_date?: string }
    quote_deadline?: string
    quote_deadline_time?: string
    lines?: Array<Record<string, unknown>>
  }
  const project = rfqProjectName({ delivery: payload.delivery })
  const title = project || formatRfqTitle({ id: rfq.id, delivery: payload.delivery, engineering_department: rfq.engineering_department, buyer: undefined })
  const reference = formatRfqReference(rfq.id, rfq.engineering_department || null)
  const state = requestState(rfq)
  const deadline = quoteDeadline(payload.quote_deadline, payload.quote_deadline_time)
  const progress = requestProgress(rfq)
  const lines = payload.lines || []
  const matrix = comparison?.quote_matrix || null
  const best = lowestPerLine(matrix)
  const totals = matrixTotals(matrix)
  const basket = cheapestPerLineTotal(matrix, best, totals.totals)
  const offers = [...(comparison?.supplier_responses || [])].sort((a, b) => {
    const ca = summaryBySupplier.get(String(a.supplier.id))?.coverage?.complete ? 0 : 1
    const cb = summaryBySupplier.get(String(b.supplier.id))?.coverage?.complete ? 0 : 1
    if (ca !== cb) return ca - cb
    return Number(a.offer.totals?.total ?? Infinity) - Number(b.offer.totals?.total ?? Infinity)
  })

  const resend = async (invite: ConstructionInvitation) => {
    setResending(invite.id)
    setNotice(null)
    try {
      const updated = await sendConstructionRfqInvite(rfq.id, invite.id, {
        retry: true,
        sendConsent: false,
        harajLimit: invitePreferredChannel(invite) === 'HARAJ' ? 1 : undefined,
      })
      setRfq(updated)
      const after = (updated.invitations || []).find((i) => i.id === invite.id)
      const st = after ? supplierState(after) : null
      if (st?.key === 'SENT') setNotice({ tone: 'ok', text: `تمت إعادة الإرسال إلى ${nameOfSupplier(invite.supplier_id)}.` })
      else {
        const code = (after?.dispatch_attempts || []).find((a) => a.status !== 'SENT' && a.status !== 'SKIPPED_NO_RECIPIENT')?.failure_code
        setNotice({ tone: 'bad', text: `تعذر الإرسال — ${friendlyFailure(code)}` })
      }
      if (outcomes !== null) getConstructionSupplierOutcomes(rfq.id).then((r) => setOutcomes(r.events || [])).catch(() => {})
    } catch (err) {
      setNotice({ tone: 'bad', text: `تعذر الإرسال — ${err instanceof Error ? err.message : 'خطأ غير معروف'}` })
    } finally {
      setResending(null)
    }
  }

  const openMessages = (inviteId: string) => {
    setChatSupplier(inviteId)
    setTab('messages')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
          <button onClick={() => navigate('rfq-list')} className="text-neutral-400 hover:text-neutral-600">الطلبات</button>
          <span className="text-neutral-300">/</span>
          <span dir="ltr" className="font-mono text-neutral-400">{reference}</span>
          <span className={`px-2 py-0.5 rounded-full font-semibold ${state.cls}`}>{state.label}</span>
          {deadline?.passed && state.key === 'OPEN' && <span className="px-2 py-0.5 rounded-full font-bold bg-red-50 text-red-700">انتهى الموعد</span>}
        </div>
        <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D] leading-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-neutral-600">
          {payload.delivery?.city && <span>{payload.delivery.city}</span>}
          {deadline && (
            <span className={`flex items-center gap-1 ${deadline.passed ? 'text-red-600 font-semibold' : ''}`}>
              <ClockIcon className="w-4 h-4" /> إغلاق العروض: {deadline.label}
            </span>
          )}
        </div>
      </div>

      {/* Quick figures */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Figure value={progress.items} label={progress.items === 1 ? 'بند' : 'بنود'} />
        <Figure value={progress.reached} label="موردين وصلهم الطلب" />
        <Figure value={progress.quoted} label={progress.quoted === 1 ? 'عرض مستلم' : 'عروض مستلمة'} strong />
      </div>
      <div className="mb-5 bg-white border border-neutral-100 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between mb-1.5 text-sm">
          <span className="font-semibold text-[#0D1F1D]">{progress.quoted} من {progress.reached} موردين ردّوا بعرض</span>
          <span className="text-xs text-neutral-400 tabular-nums">{progress.percent}%</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
          <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {(() => {
        const status = String(rfq.status || '').toUpperCase()
        const canClose = state.key !== 'AWARDED' && !rfq.submission_closed_at && ['SENT', 'PARTIALLY_SENT'].includes(status)
        const canOpen = Boolean(rfq.submission_closed_at) && !rfq.envelopes_opened_at && state.key !== 'AWARDED' && state.key !== 'CANCELLED'
        if (!canClose && !canOpen) return null
        return (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {canClose && (
              <button onClick={() => setStepping('close')} className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-[#0D1F1D] hover:bg-neutral-50">
                إغلاق استلام العروض
              </button>
            )}
            {canOpen && (
              <button onClick={() => setStepping('open')} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-sm font-bold hover:bg-[#1a5c54]">
                فتح المظاريف
              </button>
            )}
            <span className="text-xs text-neutral-500">
              {canClose ? 'بعد الإغلاق لا يستطيع الموردون تقديم عرض أو تعديله.' : 'فتح المظاريف يُسجَّل باسمك ووقته في سجل الطلب.'}
            </span>
          </div>
        )
      })()}

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${notice.tone === 'ok' ? 'bg-[#f0faf7] text-[#123F3A]' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-100 mb-5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-[#123F3A] text-[#123F3A]' : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {label}
            {id === 'quotes' && progress.quoted > 0 ? ` (${progress.quoted})` : ''}
            {id === 'suppliers' ? ` (${invites.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {state.key === 'AWARDED' && rfq.award && (
            <div className="rounded-2xl border border-[#1a7a45]/30 bg-[#f0faf7] px-4 py-3 text-sm">
              <span className="font-bold text-[#1a7a45]">الترسية: </span>
              {offers.find((row) => row.offer.quoteVersionId === rfq.award?.supplier_quote_version_id)?.supplier.name_ar || offers.find((row) => row.offer.quoteVersionId === rfq.award?.supplier_quote_version_id)?.supplier.name_en || nameOfSupplier(invites.find((i) => i.id === awardedInviteId)?.supplier_id || null)}
              {rfq.award.approved_total != null && formatMoney(Number(rfq.award.approved_total)) && ` — ${formatMoney(Number(rfq.award.approved_total))}`}
              {rfq.award.project_name && <span className="text-neutral-600"> · المشروع: {rfq.award.project_name}</span>}
              {rfq.award.selection_reason && <span className="text-neutral-600"> · السبب: {rfq.award.selection_reason}</span>}
            </div>
          )}
          {offers.length === 0 ? (
            <Empty text={progress.reached ? `لم تصل عروض بعد — ${progress.reached} موردين وصلهم الطلب.` : 'لم يصل الطلب لأي مورد بعد.'} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {offers.slice(0, 6).map((row) => (
                <QuoteCard
                  key={String(row.offer.quoteVersionId)}
                  row={row}
                  name={String(row.supplier.name_ar || row.supplier.name_en || 'مورد')}
                  coverage={quoteCoverage(summaryBySupplier.get(String(row.supplier.id)))}
                  winner={Boolean(state.key === 'AWARDED' && rfq.award?.supplier_quote_version_id && String(row.offer.quoteVersionId || '') === rfq.award.supplier_quote_version_id)}
                />
              ))}
            </div>
          )}
          {offers.length > 0 && (
            <button onClick={() => setTab('quotes')} className="text-sm font-bold text-[#123F3A] hover:underline">
              {state.key === 'AWARDED' ? 'مراجعة العروض والترسية المعتمدة ←' : 'المقارنة التفصيلية والترسية ←'}
            </button>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-2">
          {lines.length === 0 ? (
            <Empty text="لا بنود في هذه النسخة من الطلب." />
          ) : (
            lines.map((line, index) => {
              const key = String(line.line_key || index)
              const { name, spec } = lineText(line)
              const open = expanded.has(key)
              const long = spec.length > 140
              return (
                <div key={key} className="bg-white border border-neutral-100 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-neutral-400 w-6 pt-0.5">{String(line.line_number ?? index + 1)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#0D1F1D] text-sm">{name}</div>
                      {spec && (
                        <div className={`text-xs text-neutral-600 mt-1 leading-relaxed whitespace-pre-line ${long && !open ? 'line-clamp-2' : ''}`}>{spec}</div>
                      )}
                      {long && (
                        <button
                          onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })}
                          className="text-[11px] font-bold text-[#123F3A] mt-1"
                        >
                          {open ? 'إخفاء' : 'المواصفة كاملة'}
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-black text-[#0D1F1D] whitespace-nowrap tabular-nums">
                      {String(line.quantity ?? '—')} <span className="text-xs font-semibold text-neutral-500">{String(line.uom || '')}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-5">
          <div className="rounded-xl bg-[#f0faf7] p-4"><h2 className="text-sm font-bold text-[#123F3A]">المقارنة ← اختيار المورد ← مراجعة القرار ← الترسية</h2><p className="mt-2 text-xs text-neutral-500">راجع السعر وتغطية البنود والضريبة ومدة التوريد. الترسية تحتاج اختيار المشروع وسبب القرار قبل التأكيد.</p><button onClick={() => void load(rfq.id, { comparison: true }).catch(() => setComparisonError('تعذر تحديث العروض. أعد المحاولة.'))} className="mt-3 text-xs font-bold text-[#123F3A]">تحديث العروض</button></div>
          {comparisonError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{comparisonError}</div>}
          {offers.length === 0 ? (
            <Empty text={comparisonError ? 'العروض غير متاحة حاليًا.' : 'لا عروض لمقارنتها بعد.'} />
          ) : (
            <>
              {comparison && matrix?.lines.length ? <LineOfferComparison key={rfq.id} comparison={comparison} onReviewOffer={state.key !== 'AWARDED' && state.key !== 'CANCELLED' ? (row) => setAwarding(row) : undefined} /> : null}
              {basket && <details className="rounded-2xl border border-neutral-100 bg-white p-4"><summary className="text-xs font-bold text-[#123F3A] cursor-pointer">تقدير شراء الأرخص من عدة موردين</summary><div className="mt-3"><CheapestBasketCard basket={basket} nameOf={nameOfSupplier} /></div></details>}
              <h3 className="text-sm font-bold text-[#123F3A]">ملخص عروض الموردين واختيار الترسية</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {offers.map((row) => {
                  const cov = quoteCoverage(summaryBySupplier.get(String(row.supplier.id)))
                  return (
                    <QuoteCard
                      key={String(row.offer.quoteVersionId)}
                      row={row}
                      name={String(row.supplier.name_ar || row.supplier.name_en || 'مورد')}
                      coverage={cov}
                      winner={Boolean(state.key === 'AWARDED' && rfq.award?.supplier_quote_version_id && String(row.offer.quoteVersionId || '') === rfq.award.supplier_quote_version_id)}
                      action={
                        state.key !== 'AWARDED' && state.key !== 'CANCELLED' ? (
                          <button disabled={Boolean(awardBlockReason(rfq, row))} title={awardBlockReason(rfq, row) || undefined} onClick={() => setAwarding(row)} className="w-full mt-3 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40">
                            {awardBlockReason(rfq, row) || 'مراجعة العرض والترسية'}
                          </button>
                        ) : null
                      }
                    />
                  )
                })}
              </div>


            </>
          )}
        </div>
      )}

      {tab === 'suppliers' && invites.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setMessaging(true)} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-sm font-bold hover:bg-[#1a5c54]">
            رسالة لموردين محددين
          </button>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="space-y-2">
          {invites.length === 0 ? (
            <Empty text="لا موردين في هذا الطلب." />
          ) : (
            invites.map((invite) => {
              const st = supplierState(invite, awardedInviteId)
              return (
                <div key={invite.id} className="bg-white border border-neutral-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-[#0D1F1D] text-sm">{invite.supplier?.name_ar || invite.supplier?.name_en || invite.supplier_id}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      <ChannelTag channel={invitePreferredChannel(invite)} />
                      {invite.supplier?.city && <span className="text-[11px] text-neutral-500">{invite.supplier.city}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {st.key === 'FAILED' && (
                      <button
                        disabled={resending === invite.id}
                        onClick={() => resend(invite)}
                        className="text-xs px-3 py-1.5 bg-[#123F3A] text-white rounded-lg font-bold disabled:opacity-50"
                      >
                        {resending === invite.id ? 'جارٍ الإرسال…' : 'إعادة الإرسال'}
                      </button>
                    )}
                    <button onClick={() => openMessages(invite.id)} className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold text-neutral-700 hover:border-[#123F3A]/40">
                      رسائل
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'messages' && invites.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-neutral-500">اكتب رسالة واحدة، ثم اختر الموردين الذين تصلهم.</span>
          <button type="button" onClick={() => setMessaging(true)} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-sm font-bold hover:bg-[#1a5c54]">
            رسالة لموردين محددين
          </button>
        </div>
      )}

      {tab === 'messages' && (
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden flex h-[70vh] min-h-[480px]">
          <div className={`w-full lg:w-72 border-l border-neutral-100 overflow-y-auto ${chatSupplier ? 'hidden lg:block' : ''}`}>
            {invites.map((invite) => (
              <button
                key={invite.id}
                onClick={() => setChatSupplier(invite.id)}
                className={`w-full text-right px-4 py-3 border-b border-neutral-50 ${chatSupplier === invite.id ? 'bg-[#f0faf7]' : 'hover:bg-neutral-50'}`}
              >
                <div className="text-sm font-semibold text-[#0D1F1D] truncate">{invite.supplier?.name_ar || invite.supplier?.name_en}</div>
                <div className="text-[11px] text-neutral-500">{supplierState(invite, awardedInviteId).label}</div>
              </button>
            ))}
          </div>
          <div className={`flex-1 min-w-0 ${chatSupplier ? '' : 'hidden lg:flex lg:items-center lg:justify-center'}`}>
            {chatSupplier ? (
              <ChatPane key={chatSupplier} inviteId={chatSupplier} requestScoped onBack={() => setChatSupplier(null)} onOpenRfq={() => setTab('overview')} />
            ) : (
              <p className="text-sm text-neutral-500">اختر موردًا لعرض محادثته في هذا الطلب.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {outcomes === null ? (
            <Empty text="جارٍ تحميل السجل…" />
          ) : (
            <ol className="relative border-r-2 border-neutral-100 mr-2 space-y-4">
              {buildTimeline(rfq, outcomes, nameOfSupplier, (id) => matrix?.lines.find((l) => l.id === id)?.name_ar || null).map((event) => {
                const when = formatEventTime(event.at)
                return (
                  <li key={event.key} className="pr-5 relative">
                    <span className="absolute -right-[7px] top-1.5 w-3 h-3 rounded-full bg-[#123F3A]" />
                    {when && <div className="text-[11px] text-neutral-400 tabular-nums">{when}</div>}
                    <div className="text-sm font-bold text-[#0D1F1D]">{event.title}</div>
                    {event.detail && <div className="text-xs text-neutral-500">{event.detail}</div>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      {messaging && (
        <MessageSuppliersDialog
          invites={invites}
          awardedInviteId={awardedInviteId}
          onClose={() => setMessaging(false)}
        />
      )}

      {stepping && (
        <StepDialog
          step={stepping}
          rfq={rfq}
          deadlinePassed={deadline ? deadline.passed : true}
          quoted={progress.quoted}
          onClose={() => setStepping(null)}
          onDone={(updated) => {
            setStepping(null)
            setRfq(updated)
            setNotice({ tone: 'ok', text: stepping === 'close' ? 'أُغلق استلام العروض.' : 'فُتحت المظاريف.' })
            load(rfq.id, { comparison: true, outcomes: outcomes !== null }).catch(() => {})
          }}
        />
      )}

      {awarding && (
        <AwardDialog
          rfq={rfq}
          comparison={comparison!}
          offer={awarding}
          coverage={quoteCoverage(summaryBySupplier.get(String(awarding.supplier.id)))}
          onClose={() => setAwarding(null)}
          onDone={async () => {
            setAwarding(null)
            setNotice({ tone: 'ok', text: `تمت الترسية على ${awarding.supplier.name_ar || awarding.supplier.name_en}.` })
            await load(rfq.id, { comparison: true, outcomes: outcomes !== null }).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

function friendlyFailure(code?: string | null): string {
  const c = String(code || '')
  if (/HARAJ_SESSION/.test(c)) return 'قناة المحادثة غير متاحة الآن. حاول بعد دقائق.'
  if (/REFUSED|RATE/.test(c)) return 'رفض المزوّد الإرسال مؤقتًا. حاول لاحقًا.'
  if (/HTTP_4|INVALID/.test(c)) return 'عنوان المورد غير صالح.'
  if (/MANUAL_WHATSAPP/.test(c)) return 'هذا المورد له واتساب فقط — أرسل له من شاشة الإرسال.'
  return c ? `سبب تقني: ${c}` : 'لم يصل المورد.'
}

function Figure({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl px-3 py-3 text-center">
      <div className={`text-2xl font-black tabular-nums ${strong ? 'text-[#1a7a45]' : 'text-[#0D1F1D]'}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-12 bg-white border border-neutral-100 rounded-2xl text-sm text-neutral-500">{text}</div>
}

function QuoteCard({ row, name, coverage, winner, action }: {
  row: Offer
  name: string
  coverage: ReturnType<typeof quoteCoverage>
  winner?: boolean
  action?: React.ReactNode
}) {
  const offer = row.offer
  const total = offer.totals?.total
  const complete = (offer.totals as { complete?: boolean } | undefined)?.complete
  const money = complete !== false ? formatMoney(total ?? null, String(offer.currency || 'SAR')) : null
  const submitted = formatEventTime(offer.submittedAt || null)
  return (
    <div className={`bg-white rounded-2xl border p-4 ${winner ? 'border-[#1a7a45] ring-1 ring-[#1a7a45]/30' : 'border-neutral-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-[#0D1F1D] text-sm">{name}</div>
        {winner && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45]">الفائز</span>}
      </div>
      <div className="mt-2 text-xl font-black text-[#0D1F1D] tabular-nums">
        {money || <span className="text-sm font-semibold text-amber-700">إجمالي غير مكتمل — بعض الرسوم غير محددة</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {coverage && (
          <span className={`px-2 py-0.5 rounded-full font-semibold ${coverage.complete ? 'bg-[#e0efec] text-[#123F3A]' : 'bg-amber-50 text-amber-700'}`}>{coverage.label}</span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{taxLabel(offer.prices_include_tax)}</span>
        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{leadTimeLabel(offer)}</span>
      </div>
      {submitted && <div className="mt-2 text-[11px] text-neutral-400">وصل: {submitted}</div>}
      {typeof offer.notes === 'string' && offer.notes.trim() && <div className="mt-2 text-xs text-neutral-600 line-clamp-2">ملاحظات: {offer.notes}</div>}
      {action}
    </div>
  )
}

/**
 * What the request costs if each line is bought from whoever is cheapest on it —
 * the buyer's alternative to awarding the whole request to one supplier.
 */
function CheapestBasketCard({ basket, nameOf }: { basket: CheapestBasket; nameOf: (id: string | null) => string }) {
  const partial = basket.covered < basket.requested
  return (
    <div className="bg-[#0D1F1D] text-white rounded-2xl p-4">
      <div className="text-xs text-white/60">لو أخذت الأرخص في كل بند</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{formatMoney(basket.total, basket.currency)}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-white/10">من {basket.suppliers} موردين</span>
        <span className={`px-2 py-0.5 rounded-full ${partial ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10'}`}>
          {partial ? `يغطي ${basket.covered} من ${basket.requested} بنود` : 'كل البنود'}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-white/10">بدون التوصيل والتنزيل والضريبة</span>
      </div>
      {basket.saving != null && basket.bestSingle && (
        <div className="mt-2 text-xs text-white/70">
          {basket.saving > 0
            ? `أقل بـ ${formatMoney(basket.saving, basket.currency)} من أرخص عرض كامل (${nameOf(basket.bestSingle.supplier_id)}).`
            : 'لا يوفّر شيئًا عن أرخص عرض كامل — التوريد من مورد واحد أبسط.'}
        </div>
      )}
      {partial && (
        <div className="mt-2 text-[11px] text-amber-200/90">
          البنود الباقية بلا أرخص واضح — إما لم يسعّرها أحد، أو تعادل فيها موردان، أو اختلف أساس الضريبة.
        </div>
      )}
      <div className="mt-2 text-[11px] text-white/50">
        رقم استرشادي: التوريد من عدة موردين يعني عدة أوامر شراء وعدة عمليات توصيل.
      </div>
    </div>
  )
}

/** A supplier's column total at the foot of the comparison. */
const SUPPLIER_FILTERS: { key: MessageSupplierFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'waiting', label: 'بانتظار الرد' },
  { key: 'quoted', label: 'وصل عرض' },
  { key: 'unreached', label: 'لم يصل' },
]

function supplierLabel(invite: ConstructionInvitation) {
  return invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد'
}

/** One message, sent only to the suppliers the buyer checks. */
function MessageSuppliersDialog({
  invites,
  awardedInviteId,
  onClose,
}: {
  invites: ConstructionInvitation[]
  awardedInviteId: string | null
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MessageSupplierFilter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ id: string; name: string; ok: boolean; detail: string }> | null>(null)
  const visible = useMemo(
    () => invitesForMessage(invites, query, status, awardedInviteId),
    [invites, query, status, awardedInviteId],
  )
  const visibleIds = visible.map((invite) => invite.id)
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id))

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const send = async () => {
    const body = text.trim()
    const targets = invites.filter((invite) => picked.has(invite.id))
    if (!body || targets.length === 0 || busy) return
    setBusy(true)
    setError(null)
    const next: Array<{ id: string; name: string; ok: boolean; detail: string }> = []
    for (const invite of targets) {
      const name = supplierLabel(invite)
      try {
        const thread = await getConstructionInboxThread(invite.id)
        if (thread.reply_channel === 'WHATSAPP') {
          next.push({ id: invite.id, name, ok: false, detail: 'محادثته على واتساب — أرسلها يدويًا من محادثته' })
          continue
        }
        const channel = thread.reply_channel === 'HARAJ' ? 'HARAJ' : 'EMAIL'
        await replyToConstructionInboxThread(invite.id, {
          idempotency_key: crypto.randomUUID(),
          text: body,
          parent_message_id: thread.last_message_id ?? null,
          channel,
        })
        next.push({ id: invite.id, name, ok: true, detail: 'أُرسلت' })
      } catch (err) {
        next.push({ id: invite.id, name, ok: false, detail: err instanceof Error ? err.message : 'تعذر الإرسال' })
      }
    }
    setResults(next)
    setBusy(false)
    if (next.every((row) => !row.ok)) setError('لم تصل الرسالة لأي مورد')
  }

  const sentCount = results?.filter((row) => row.ok).length ?? 0
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black text-[#0D1F1D] mb-1">رسالة لموردين محددين</h2>
        <p className="text-sm text-neutral-600 mb-3">النص نفسه يصل فقط لمن تحدده، كل واحد في محادثته.</p>
        {results ? (
          <>
            <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm font-bold text-[#0D1F1D]">
              وصلت إلى {sentCount} من {results.length}
            </div>
            <ul className="mt-2 space-y-1">
              {results.map((row) => (
                <li key={row.id} className={`text-xs rounded-lg px-3 py-2 ${row.ok ? 'bg-[#f0faf7] text-[#123F3A]' : 'bg-amber-50 text-amber-800'}`}>
                  <span className="font-bold">{row.name}</span>
                  <span className="text-neutral-600"> — {row.detail}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose} className="w-full mt-3 py-2.5 border border-neutral-200 rounded-xl text-sm font-semibold">إغلاق</button>
          </>
        ) : (
          <>
            <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm min-h-28" placeholder="اكتب الرسالة…" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث باسم المورد"
              aria-label="بحث باسم المورد"
              className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUPPLIER_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={status === filter.key}
                  onClick={() => setStatus(filter.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold ${status === filter.key ? 'bg-[#123F3A] text-white' : 'bg-neutral-100 text-neutral-600'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#0D1F1D]">
              <input
                type="checkbox"
                checked={allVisiblePicked}
                onChange={() => {
                  setPicked((current) => {
                    const next = new Set(current)
                    if (allVisiblePicked) visibleIds.forEach((id) => next.delete(id))
                    else visibleIds.forEach((id) => next.add(id))
                    return next
                  })
                }}
              />
              تحديد الظاهر ({visible.length})
            </label>
            <div className="mt-2 space-y-1">
              {visible.map((invite) => {
                const state = supplierState(invite, awardedInviteId)
                return (
                  <label key={invite.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-neutral-50">
                    <input type="checkbox" checked={picked.has(invite.id)} onChange={() => toggle(invite.id)} />
                    <span className="min-w-0 flex-1 text-sm text-[#0D1F1D] truncate">{supplierLabel(invite)}</span>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${state.cls}`}>{state.label}</span>
                  </label>
                )
              })}
              {visible.length === 0 && <div className="text-[11px] text-neutral-400 py-3 text-center">لا مورد يطابق التصفية</div>}
            </div>
            {error && <div className="mt-2 rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                disabled={!text.trim() || picked.size === 0 || busy}
                onClick={() => void send()}
                className="flex-1 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40"
              >
                {busy ? 'جارٍ الإرسال…' : `إرسال لـ ${picked.size}`}
              </button>
              <button type="button" onClick={onClose} className="px-5 py-2.5 border border-neutral-200 rounded-xl text-sm font-semibold">إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


export default RequestFileView
