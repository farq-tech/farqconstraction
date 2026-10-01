import { useState } from 'react'
import { getRfqEquivalents } from '../../api/constructionClient'
import {
  MAX_CANDIDATES,
  attrText,
  candidatePriceText,
  confidenceLabel,
  isServiceDisabledError,
  missingAttrsText,
  requestedBrandHint,
  type EquivalenceLine,
} from '../../lib/brandEquivalence'

/**
 * «بدائل مكافئة» — Farq's equivalence engine, per line of a request.
 *
 * An add-on: the parent renders this only when the account has the
 * `equivalents` service. Nothing is fetched until the reader opens the
 * section, and a «service off» answer hides it silently.
 */
export default function EquivalentsPanel({ rfqId }: { rfqId: string }) {
  const [open, setOpen] = useState(false)
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
    } catch (err) {
      if (isServiceDisabledError(err)) setHidden(true)
      else setError(err instanceof Error ? err.message : 'تعذّر تحميل البدائل')
    } finally {
      setLoading(false)
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
            (lines || []).map((line) => <LineSection key={line.line_id || line.line_key} line={line} />)}
        </div>
      )}
    </div>
  )
}

function LineSection({ line }: { line: EquivalenceLine }) {
  const candidates = (line.candidates || []).slice(0, MAX_CANDIDATES)
  const hint = requestedBrandHint(line.requested_brand, line.allows_equivalent)
  return (
    <details className="rounded-xl border border-neutral-100">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        <span className="font-semibold text-[#0D1F1D]">{line.name_ar || line.line_key || 'بند'}</span>
        <span className="text-xs text-neutral-500"> · {candidates.length ? `${candidates.length} بدائل` : 'لا بدائل'}</span>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {hint && <div className="text-xs text-neutral-600">{hint}</div>}
        {line.status !== 'OK' && line.note_ar && (
          <div className="text-xs text-neutral-600 bg-neutral-50 rounded-lg px-2.5 py-1.5">{line.note_ar}</div>
        )}
        {candidates.map((c) => {
          const missing = missingAttrsText(c.missing_attrs)
          const price = candidatePriceText(c)
          const sheet = c.datasheet_url && /^https?:\/\//.test(c.datasheet_url) ? c.datasheet_url : null
          return (
            <div key={c.product_id} className="rounded-lg bg-[#fafafa] px-3 py-2">
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
                {price && <span className="font-semibold text-[#123F3A]">{price}</span>}
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
        })}
      </div>
    </details>
  )
}
