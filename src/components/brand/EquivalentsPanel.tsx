import { useState } from 'react'
import { discoverRfqWebAlternatives, getRfqEquivalents, getRfqWebAlternatives } from '../../api/constructionClient'
import {
  canSearch,
  hiddenCount,
  matchStateClass,
  matchStateLabel,
  priceText,
  safeLink,
  verifiedDateText,
  visibleAlternatives,
  webStatusNote,
  type WebLine,
} from '../../lib/webAlternatives'
import {
  MAX_CANDIDATES,
  PRICE_UNKNOWN_TEXT,
  attrText,
  candidatePriceText,
  confidenceLabel,
  hiddenCandidatesLabel,
  isServiceDisabledError,
  missingAttrsText,
  referenceText,
  requestedBrandHint,
  savingText,
  type EquivalenceCandidate,
  type EquivalenceLine,
} from '../../lib/brandEquivalence'

/**
 * «بدائل مكافئة» — Farq's equivalence engine, per line of a request.
 *
 * An add-on: the parent renders this only when the account has the
 * `equivalents` service. Nothing is fetched until the reader opens the
 * section, and a «service off» answer hides it silently.
 */
export default function EquivalentsPanel({ rfqId, webEnabled = false }: { rfqId: string; webEnabled?: boolean }) {
  const [open, setOpen] = useState(false)
  // «بدائل من الإنترنت»: a second add-on; its failure never touches the internal list.
  const [webLines, setWebLines] = useState<Record<string, WebLine>>({})
  const [webAllowed, setWebOn] = useState(true)
  const webOn = webEnabled && webAllowed
  const [searching, setSearching] = useState<string | null>(null)
  const [webError, setWebError] = useState<string | null>(null)
  const [lines, setLines] = useState<EquivalenceLine[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRfqEquivalents(rfqId)
      setLines(Array.isArray(data?.lines) ? data.lines : [])
      setLoadedFor(rfqId)
      if (webOn) void loadWeb()
    } catch (err) {
      if (isServiceDisabledError(err)) setHidden(true)
      else setError(err instanceof Error ? err.message : 'تعذّر تحميل البدائل')
    } finally {
      setLoading(false)
    }
  }

  const mergeWeb = (incoming: WebLine[] | undefined) => {
    if (!Array.isArray(incoming)) return
    setWebLines((prev) => {
      const next = { ...prev }
      for (const line of incoming) if (line?.line_id) next[line.line_id] = line
      return next
    })
  }

  const loadWeb = async () => {
    try {
      const data = await getRfqWebAlternatives(rfqId)
      mergeWeb(data?.lines)
    } catch (err) {
      if (isServiceDisabledError(err)) setWebOn(false)
    }
  }

  const searchWeb = async (lineId: string) => {
    setSearching(lineId)
    setWebError(null)
    try {
      const data = await discoverRfqWebAlternatives(rfqId, [lineId])
      mergeWeb(data?.lines)
    } catch (err) {
      if (isServiceDisabledError(err)) setWebOn(false)
      else setWebError(err instanceof Error ? err.message : 'تعذّر البحث في الإنترنت')
    } finally {
      setSearching(null)
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && loadedFor !== rfqId && !loading) void load()
  }

  if (hidden) return null

  return (
    <div className="mt-5 bg-white border border-neutral-100 rounded-2xl">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right"
      >
        <span>
          <span className="font-black text-[#0D1F1D]">بدائل مكافئة</span>
          <span className="block text-xs text-neutral-500 mt-0.5">منتجات تطابق مواصفات كل بند من ماركات أخرى — للمقارنة فقط.</span>
        </span>
        <span className="text-xs font-bold text-[#123F3A] flex-shrink-0">{open ? 'إخفاء' : 'عرض'}</span>
      </button>
      {open && (
        <div className="border-t border-neutral-50 px-4 py-3 space-y-2">
          {loading && <div className="text-xs text-neutral-500">جارٍ البحث عن البدائل…</div>}
          {error && (
            <div className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
              {error}{' '}
              <button type="button" onClick={() => void load()} className="underline font-bold">
                إعادة المحاولة
              </button>
            </div>
          )}
          {!loading && !error && lines && lines.length === 0 && (
            <div className="text-xs text-neutral-500">لا توجد بنود لهذا الطلب.</div>
          )}
          {!loading &&
            !error &&
            (lines || []).map((line) => (
              <LineSection
                key={line.line_id || line.line_key}
                line={line}
                web={webOn ? { line: webLines[line.line_id] || null, searching: searching === line.line_id, busy: searching !== null, error: webError, onSearch: () => void searchWeb(line.line_id) } : null}
              />
            ))}
        </div>
      )}
    </div>
  )
}

type WebProps = { line: WebLine | null; searching: boolean; busy: boolean; error: string | null; onSearch: () => void }

function LineSection({ line, web }: { line: EquivalenceLine; web: WebProps | null }) {
  const [showHidden, setShowHidden] = useState(false)
  const candidates = (line.candidates || []).slice(0, MAX_CANDIDATES)
  const held = line.hidden_candidates || []
  const hint = requestedBrandHint(line.requested_brand, line.allows_equivalent)
  const reference = referenceText(line.reference)
  const heldLabel = hiddenCandidatesLabel(held)
  return (
    <details className="rounded-xl border border-neutral-100">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        <span className="font-semibold text-[#0D1F1D]">{line.name_ar || line.line_key || 'بند'}</span>
        <span className="text-xs text-neutral-500"> · {candidates.length ? `${candidates.length} بدائل` : 'لا بدائل'}</span>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {hint && <div className="text-xs text-neutral-600">{hint}</div>}
        {reference && <div className="text-xs text-neutral-600">{reference}</div>}
        {line.status !== 'OK' && line.note_ar && (
          <div className="text-xs text-neutral-700 bg-neutral-50 rounded-lg px-2.5 py-1.5 font-semibold">{line.note_ar}</div>
        )}
        {candidates.map((c) => (
          <CandidateCard key={c.product_id || `${c.brand}-${c.best_price}`} c={c} />
        ))}
        {heldLabel && (
          <button type="button" onClick={() => setShowHidden(!showHidden)} className="text-[11px] text-neutral-500 underline">
            {showHidden ? 'إخفاء البدائل المخفية' : heldLabel}
          </button>
        )}
        {showHidden && held.map((c) => <CandidateCard key={`h-${c.product_id || c.brand}`} c={c} muted />)}
        {web && <WebSection web={web} />}
      </div>
    </details>
  )
}

function CandidateCard({ c, muted = false }: { c: EquivalenceCandidate; muted?: boolean }) {
  const missing = missingAttrsText(c.missing_attrs)
  const price = candidatePriceText(c)
  const saving = savingText(c)
  const sheet = c.datasheet_url && /^https?:\/\//.test(c.datasheet_url) ? c.datasheet_url : null
  return (
    <div className={`rounded-lg px-3 py-2 ${muted ? 'bg-neutral-50 opacity-80' : 'bg-[#fafafa]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-bold text-[#0D1F1D]">{c.brand}</span>
          <span className="text-neutral-600"> — {c.product}</span>
        </div>
        <span
          className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
            c.confidence === 'HIGH' ? 'bg-[#e3f4ea] text-[#1a7a45]' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {confidenceLabel(c.confidence)}
        </span>
      </div>
      {muted && c.hidden_reason_ar && <div className="mt-1 text-[10px] text-red-700">مخفي: {c.hidden_reason_ar}</div>}
      {(c.matched_attrs || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {c.matched_attrs.map((a) => (
            <span key={`m-${a.key}`} className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#e3f4ea] text-[#1a7a45]">
              {attrText(a)}
            </span>
          ))}
        </div>
      )}
      {missing && (
        <div className="mt-1">
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-neutral-100 text-neutral-500">{missing}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-neutral-600">
        {price ? (
          <span className="font-semibold text-[#123F3A]">{price}</span>
        ) : (
          <span className="text-neutral-500">{c.price_status_ar || PRICE_UNKNOWN_TEXT}</span>
        )}
        {saving && <span className="font-bold text-[#1a7a45]">{saving}</span>}
        {c.standard && <span>{c.standard}</span>}
        {c.origin_country && <span>المنشأ: {c.origin_country}</span>}
        {sheet && (
          <a href={sheet} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#123F3A] underline">
            ورقة البيانات
          </a>
        )}
      </div>
    </div>
  )
}

function WebSection({ web }: { web: WebProps }) {
  const [showAll, setShowAll] = useState(false)
  const all = web.line?.alternatives || []
  const shown = visibleAlternatives(all, showAll)
  const hidden = hiddenCount(all)
  const note = webStatusNote(web.line)
  return (
    <div className="mt-2 rounded-lg border border-dashed border-neutral-200 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#0D1F1D]">بدائل من الإنترنت</span>
        {canSearch(web.line) && (
          <button
            type="button"
            onClick={web.onSearch}
            disabled={web.busy}
            className="text-xs font-bold text-[#123F3A] underline disabled:opacity-50"
          >
            {web.searching ? 'جارٍ البحث في مواقع المصنّعين…' : 'ابحث في الإنترنت'}
          </button>
        )}
      </div>
      {web.line?.classification?.is_supply_install && web.line.classification.service_component && (
        <div className="text-[11px] text-neutral-500">بحثنا عن المادة فقط؛ جزء الخدمة ({web.line.classification.service_component}) يبقى في البند.</div>
      )}
      {note && <div className="text-[11px] text-neutral-500">{note}</div>}
      {web.error && web.searching === false && <div className="text-[11px] text-red-700">{web.error}</div>}
      {shown.map((a, i) => {
        const source = safeLink(a.source_url)
        const sheet = safeLink(a.datasheet_url)
        const missing = (a.missing_attrs || []).map((m) => m.label_ar).filter(Boolean)
        const date = verifiedDateText(a)
        return (
          <div key={a.product_master_id || `${a.source_url}-${i}`} className="rounded-lg bg-[#fafafa] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-bold text-[#0D1F1D]">{a.brand || 'ماركة غير مذكورة'}</span>
                {a.product_name && <span className="text-neutral-600"> — {a.product_name}</span>}
                {(a.model || a.sku) && <span className="text-neutral-500 text-xs"> · موديل {a.model || a.sku}</span>}
              </div>
              <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${matchStateClass(a.match_state)}`}>
                {matchStateLabel(a.match_state)}
              </span>
            </div>
            {(a.matched_attrs || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {a.matched_attrs.map((m) => (
                  <span key={`m-${m.key}`} className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#e3f4ea] text-[#1a7a45]">
                    {m.label_ar}: {String(m.value ?? '')}
                  </span>
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <div className="mt-1 text-[10px] text-neutral-500">مواصفات لم يذكرها المصدر: {missing.join('، ')}</div>
            )}
            {a.hidden_reason_ar && <div className="mt-1 text-[10px] text-red-700">مخفي: {a.hidden_reason_ar}</div>}
            {a.match_state === 'REJECTED' && a.rejection_reasons.length > 0 && (
              <div className="mt-1 text-[10px] text-red-700">{a.rejection_reasons.join(' · ')}</div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-neutral-600">
              {a.source_type_ar && <span>التحقق من: {a.source_type_ar}</span>}
              {source && (
                <a href={source} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#123F3A] underline">
                  المصدر ({a.source_domain})
                </a>
              )}
              {sheet && sheet !== source && (
                <a href={sheet} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#123F3A] underline">
                  ورقة البيانات
                </a>
              )}
              <span>{priceText(a)}</span>
              {a.saving_vs_reference_percent != null && a.saving_vs_reference_percent > 0 && (
                <span className="font-bold text-[#1a7a45]">توفير متوقع: {a.saving_vs_reference_percent}%</span>
              )}
              {date && <span>{date}</span>}
            </div>
          </div>
        )
      })}
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[11px] text-neutral-500 underline">
          {showAll ? 'إخفاء غير المطابق وغير الموثّق والأغلى' : `عرض ${hidden} غير مطابق أو غير موثّق أو أغلى`}
        </button>
      )}
    </div>
  )
}
