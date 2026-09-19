import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import {
  ConstructionApiError,
  closeConstructionRfqSubmissions,
  constructionRateLimitWaitSec,
  createConstructionAward,
  createConstructionProject,
  formatRfqReference,
  formatRfqTitle,
  getConstructionComparison,
  getConstructionProjects,
  getConstructionRfq,
  getConstructionSupplierOutcomes,
  invitePreferredChannel,
  openConstructionRfqEnvelopes,
  sendConstructionRfqInvite,
  type ConstructionComparison,
  type ConstructionInvitation,
  type ConstructionRfq,
  type ConstructionSupplierOutcomeEvent,
} from '../api/constructionClient'
import { rfqProjectName } from '../lib/rfqIdentity'
import {
  CELL_LABEL,
  buildTimeline,
  formatEventTime,
  formatMoney,
  leadTimeLabel,
  lowestPerLine,
  quoteCoverage,
  quoteDeadline,
  requestProgress,
  requestState,
  supplierState,
  taxLabel,
} from '../lib/requestFile'
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
const REASONS = ['أفضل سعر', 'أسرع توريد', 'أفضل مطابقة للمواصفات', 'مورد مفضل', 'أفضل شروط تجارية', 'أخرى'] as const
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
  const [comparison, setComparison] = useState<ConstructionComparison | null>(null)
  const [outcomes, setOutcomes] = useState<ConstructionSupplierOutcomeEvent[] | null>(null)
  const [error, setError] = useState<{ status?: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [awarding, setAwarding] = useState<Offer | null>(null)
  const [stepping, setStepping] = useState<'close' | 'open' | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(
    async (id: string, what: { comparison?: boolean; outcomes?: boolean } = {}) => {
      const [nextRfq, nextComparison, nextOutcomes] = await Promise.all([
        getConstructionRfq(id),
        what.comparison ? getConstructionComparison(id).catch(() => null) : Promise.resolve(undefined),
        what.outcomes ? getConstructionSupplierOutcomes(id).catch(() => null) : Promise.resolve(undefined),
      ])
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
    for (const row of comparison?.supplier_responses || []) if (String(row.offer.quoteVersionId) === qv) return String(row.offer.inviteId || '')
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
        const canClose = !rfq.submission_closed_at && ['SENT', 'PARTIALLY_SENT'].includes(status)
        const canOpen = Boolean(rfq.submission_closed_at) && !rfq.envelopes_opened_at && !rfq.award
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
          {rfq.award && awardedInviteId && (
            <div className="rounded-2xl border border-[#1a7a45]/30 bg-[#f0faf7] px-4 py-3 text-sm">
              <span className="font-bold text-[#1a7a45]">الترسية: </span>
              {nameOfSupplier(invites.find((i) => i.id === awardedInviteId)?.supplier_id || null)}
              {formatMoney(Number(rfq.award.approved_total)) && ` — ${formatMoney(Number(rfq.award.approved_total))}`}
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
                  winner={String(row.offer.inviteId || '') === awardedInviteId}
                />
              ))}
            </div>
          )}
          {offers.length > 0 && (
            <button onClick={() => setTab('quotes')} className="text-sm font-bold text-[#123F3A] hover:underline">
              المقارنة التفصيلية والترسية ←
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
          {offers.length === 0 ? (
            <Empty text="لا عروض لمقارنتها بعد." />
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {offers.map((row) => {
                  const cov = quoteCoverage(summaryBySupplier.get(String(row.supplier.id)))
                  return (
                    <QuoteCard
                      key={String(row.offer.quoteVersionId)}
                      row={row}
                      name={String(row.supplier.name_ar || row.supplier.name_en || 'مورد')}
                      coverage={cov}
                      winner={String(row.offer.inviteId || '') === awardedInviteId}
                      action={
                        !rfq.award && state.key !== 'CANCELLED' ? (
                          <button onClick={() => setAwarding(row)} className="w-full mt-3 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
                            ترسية على هذا المورد
                          </button>
                        ) : null
                      }
                    />
                  )
                })}
              </div>

              {matrix && matrix.lines.length > 0 && (
                <>
                  <h3 className="font-bold text-[#0D1F1D]">مقارنة الأسعار بندًا بندًا</h3>
                  <p className="text-xs text-neutral-500 -mt-3">
                    الأقل مميّز فقط حين تكون الأسعار قابلة للمقارنة (نفس أساس الضريبة والعملة). الأرخص ليس فائزًا تلقائيًا.
                  </p>
                  {/* Desktop: lines × suppliers */}
                  <div className="hidden md:block overflow-x-auto bg-white border border-neutral-100 rounded-2xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50 text-xs text-neutral-500">
                          <th className="text-right font-semibold px-3 py-2.5 min-w-[220px]">البند</th>
                          {offers.map((row) => (
                            <th key={String(row.offer.quoteVersionId)} className="text-right font-semibold px-3 py-2.5 min-w-[140px]">
                              {row.supplier.name_ar || row.supplier.name_en}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {matrix.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-2.5 align-top">
                              <div className="font-semibold text-[#0D1F1D]">{line.name_ar}</div>
                              <div className="text-[11px] text-neutral-500">{line.quantity} {line.uom}</div>
                            </td>
                            {offers.map((row) => {
                              const cell = line.offers.find((c) => c && c.supplier_id === String(row.supplier.id))
                              return <td key={String(row.offer.quoteVersionId)} className="px-3 py-2.5 align-top"><CellView cell={cell} lowest={best.get(line.id) === String(row.supplier.id)} /></td>
                            })}
                          </tr>
                        ))}
                        <tr className="bg-neutral-50/60">
                          <td className="px-3 py-2.5 text-xs font-semibold text-neutral-600">مدة التوريد</td>
                          {offers.map((row) => (
                            <td key={String(row.offer.quoteVersionId)} className="px-3 py-2.5 text-xs font-semibold text-[#0D1F1D]">{leadTimeLabel(row.offer)}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile: one card per line */}
                  <div className="md:hidden space-y-3">
                    {matrix.lines.map((line) => (
                      <div key={line.id} className="bg-white border border-neutral-100 rounded-2xl p-3">
                        <div className="font-bold text-[#0D1F1D] text-sm">{line.name_ar}</div>
                        <div className="text-[11px] text-neutral-500 mb-2">{line.quantity} {line.uom}</div>
                        <div className="divide-y divide-neutral-100">
                          {offers.map((row) => {
                            const cell = line.offers.find((c) => c && c.supplier_id === String(row.supplier.id))
                            return (
                              <div key={String(row.offer.quoteVersionId)} className="flex items-center justify-between gap-3 py-2">
                                <span className="text-xs text-[#0D1F1D] truncate">{row.supplier.name_ar || row.supplier.name_en}</span>
                                <CellView cell={cell} lowest={best.get(line.id) === String(row.supplier.id)} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
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
  if (/HARAJ_SESSION/.test(c)) return 'جلسة حراج غير متاحة الآن. حاول بعد دقائق.'
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

type Cell = NonNullable<ConstructionComparison['quote_matrix']>['lines'][number]['offers'][number] | undefined

function CellView({ cell, lowest }: { cell: Cell; lowest: boolean }) {
  if (!cell || cell.status !== 'PRICED') {
    return <span className="text-xs text-neutral-400">{CELL_LABEL[String(cell?.status || 'NOT_QUOTED')] || 'لم يسعّر'}</span>
  }
  return (
    <div className={`inline-block rounded-lg px-2 py-1 ${lowest ? 'bg-[#CFF5DC]' : ''}`}>
      <div className="text-sm font-bold text-[#0D1F1D] tabular-nums">{formatMoney(cell.line_total, cell.currency)}</div>
      <div className="text-[10px] text-neutral-500 tabular-nums">
        {formatMoney(cell.unit_price, cell.currency)} للوحدة{lowest ? ' · الأقل' : ''}
      </div>
    </div>
  )
}

/** Close submissions, or open envelopes, with the reason the server asks for when it needs one. */
function StepDialog({ step, rfq, deadlinePassed, quoted, onClose, onDone }: {
  step: 'close' | 'open'
  rfq: ConstructionRfq
  deadlinePassed: boolean
  quoted: number
  onClose: () => void
  onDone: (rfq: ConstructionRfq) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = step === 'close' ? !deadlinePassed : quoted < 2
  const ready = !needsReason || reason.trim().length >= 5

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = step === 'close'
        ? await closeConstructionRfqSubmissions(rfq.id, reason.trim())
        : await openConstructionRfqEnvelopes(rfq.id, reason.trim())
      onDone(updated)
    } catch (err) {
      const status = err instanceof ConstructionApiError ? err.status : 0
      setError(status === 403 ? (step === 'open' ? 'فتح المظاريف يحتاج صلاحية مدير أو معتمد.' : 'الإغلاق يحتاج صلاحية مشتريات أو مدير.') : err instanceof Error ? err.message : 'تعذر التنفيذ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-[#0D1F1D] mb-2">{step === 'close' ? 'إغلاق استلام العروض' : 'فتح المظاريف'}</h2>
        <p className="text-sm text-neutral-600 mb-4">
          {step === 'close'
            ? `وصل ${quoted} ${quoted === 1 ? 'عرض' : 'عروض'}. بعد الإغلاق لا يُقبل عرض جديد ولا تعديل.`
            : `${quoted} ${quoted === 1 ? 'عرض' : 'عروض'} في الظرف. يُسجَّل الفتح باسمك ووقته.`}
        </p>
        {needsReason && (
          <label className="block text-sm font-bold text-[#0D1F1D] mb-3">
            {step === 'close' ? 'سبب الإغلاق قبل الموعد' : 'سبب فتح المظاريف بأقل من عرضين'}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm min-h-20" placeholder="خمسة أحرف على الأقل" />
          </label>
        )}
        {error && <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
        <div className="flex gap-2">
          <button disabled={!ready || busy} onClick={confirm} className="flex-1 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40">
            {busy ? 'جارٍ التنفيذ…' : 'تأكيد'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-neutral-200 rounded-xl text-sm font-semibold">إلغاء</button>
        </div>
      </div>
    </div>
  )
}

function AwardDialog({ rfq, offer, coverage, onClose, onDone }: {
  rfq: ConstructionRfq
  offer: Offer
  coverage: ReturnType<typeof quoteCoverage>
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = String(offer.supplier.name_ar || offer.supplier.name_en || 'مورد')
  const money = formatMoney(offer.offer.totals?.total ?? null, String(offer.offer.currency || 'SAR'))
  const text = reason === 'أخرى' ? other.trim() : reason
  const ready = Boolean(reason) && (reason !== 'أخرى' || other.trim().length >= 5)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      let projects = (await getConstructionProjects()).projects || []
      if (!projects.length) {
        const delivery = rfq.current_version?.payload?.delivery
        projects = [await createConstructionProject({ name: formatRfqTitle({ id: rfq.id, delivery, engineering_department: rfq.engineering_department, buyer: undefined }), site_address: delivery?.site_address || delivery?.city || undefined })]
      }
      await createConstructionAward({
        rfq_id: rfq.id,
        project_id: projects[0]!.id,
        supplier_quote_version_id: String(offer.offer.quoteVersionId || ''),
        selection_reason: text,
        awarded_line_ids: [],
        approval_note: text,
      })
      onDone()
    } catch (err) {
      const status = err instanceof ConstructionApiError ? err.status : 0
      setError(status === 403 ? 'الترسية تحتاج صلاحية مدير أو معتمد في شركتك.' : err instanceof Error ? err.message : 'تعذرت الترسية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-[#0D1F1D] mb-3">تأكيد الترسية</h2>
        <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm space-y-1 mb-4">
          <div><span className="text-neutral-500">المورد: </span><span className="font-bold">{name}</span></div>
          <div><span className="text-neutral-500">قيمة العرض: </span><span className="font-bold">{money || 'غير مكتملة'}</span></div>
          {coverage && <div className="text-xs text-neutral-600">{coverage.label} · {taxLabel(offer.offer.prices_include_tax)}</div>}
          <div className="text-xs text-neutral-600">مدة التوريد: {leadTimeLabel(offer.offer)}</div>
        </div>
        <div className="text-sm font-bold text-[#0D1F1D] mb-2">سبب الترسية</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border ${reason === r ? 'border-[#123F3A] bg-[#f0faf7] text-[#123F3A]' : 'border-neutral-200 text-neutral-700'}`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === 'أخرى' && (
          <textarea
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="اكتب سبب الترسية (5 أحرف على الأقل)"
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm mb-3 min-h-[70px]"
          />
        )}
        {error && <div className="mb-3 rounded-xl bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
        <div className="flex gap-2">
          <button disabled={!ready || busy} onClick={confirm} className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40">
            {busy ? 'جارٍ التأكيد…' : 'تأكيد الترسية'}
          </button>
          <button onClick={onClose} className="px-5 py-3 border border-neutral-200 rounded-xl text-sm font-semibold">إلغاء</button>
        </div>
        <p className="text-[11px] text-neutral-500 mt-3">بعد التأكيد يُغلق استلام العروض ويُرسل إشعار الترسية للمورد، ويُسجَّل ذلك في سجل الطلب.</p>
      </div>
    </div>
  )
}

export default RequestFileView
