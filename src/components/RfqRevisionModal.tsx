/**
 * «تعديل الطلب» — four steps on a sent request:
 *   1. «تعديل البنود»       edit / add / remove lines, and the change note;
 *   2. «اختيار المستلمين»   who receives the new version, and on which channel;
 *   3. «المعاينة والتكلفة»  the server prepares the revision — nothing is sent;
 *   4. «تأكيد الإرسال»      an explicit confirmation of the figures on screen.
 *
 * Every channel and cost figure is the server's. A confirm whose figures no
 * longer hold (a free WhatsApp window closed meanwhile) is refused with 409;
 * the preview is re-read and the buyer asked again.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  cancelRfqRevision,
  confirmRfqRevision,
  getRfqRevision,
  getRfqRevisionCandidates,
  isRevisionPreviewChanged,
  prepareRfqRevision,
  type RevisionCandidate,
  type RevisionCandidates,
  type RevisionConfirmResult,
  type RevisionPreview,
} from '../api/constructionClient'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import {
  buildRevisionBody,
  channelLabel,
  channelTone,
  confirmBody,
  costCountsAr,
  costSummaryAr,
  diffLines,
  draftFromLine,
  draftProblem,
  emptyDraftLine,
  filterCandidates,
  groupRecipientsByChannel,
  initialSelection,
  resultStatusLabel,
  samplePreview,
  sendableCount,
  sourceLabel,
  suggestChangeNote,
  type DraftLine,
} from '../lib/rfqRevision'
import { formatEventTime } from '../lib/requestFile'

type Step = 1 | 2 | 3 | 4
const STEPS: Array<[Step, string]> = [
  [1, 'تعديل البنود'],
  [2, 'اختيار المستلمين'],
  [3, 'المعاينة والتكلفة'],
  [4, 'تأكيد الإرسال'],
]

type SearchHit = { id: string; name: string; city: string }

const input =
  'w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#123F3A] bg-white'
const primary = 'px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40'
const secondary = 'px-5 py-2.5 border border-neutral-200 rounded-xl text-sm font-semibold text-neutral-700 disabled:opacity-40'

const TONE_CLS: Record<'free' | 'paid' | 'blocked', string> = {
  free: 'bg-[#e8f7ee] text-[#1a7a45]',
  paid: 'bg-amber-50 text-amber-800',
  blocked: 'bg-neutral-100 text-neutral-600',
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export default function RfqRevisionModal({
  rfqId,
  onClose,
  onSent,
}: {
  rfqId: string
  onClose: () => void
  onSent: (result: RevisionConfirmResult) => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [data, setData] = useState<RevisionCandidates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const uidRef = useRef(0)
  const nextUid = () => `l${(uidRef.current += 1)}`

  // Step 1
  const [drafts, setDrafts] = useState<DraftLine[]>([])
  const [note, setNote] = useState('')
  const [noteTouched, setNoteTouched] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  // Step 2
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [extra, setExtra] = useState<SearchHit[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Steps 3–4
  const [preview, setPreview] = useState<RevisionPreview | null>(null)
  const [preparedKey, setPreparedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<'prepare' | 'confirm' | 'cancel' | 'reload' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [changedNotice, setChangedNotice] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [result, setResult] = useState<RevisionConfirmResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getRfqRevisionCandidates(rfqId)
      .then((next) => {
        if (cancelled) return
        setData(next)
        setDrafts(next.lines.map((l) => draftFromLine(l, nextUid())))
        setSelected(initialSelection(next.candidates))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'تعذّر تحميل بنود الطلب ومورديه.'))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId])

  const diff = useMemo(() => (data ? diffLines(data.lines, drafts) : null), [data, drafts])
  const changed = Boolean(diff && (diff.changed.length || diff.added || diff.removed))

  // The note follows the edits until the buyer writes his own.
  useEffect(() => {
    if (diff && !noteTouched) setNote(suggestChangeNote(diff))
  }, [diff, noteTouched])

  // «إضافة مورد من البحث»: the same directory search the proposals screen uses.
  useEffect(() => {
    if (!showSearch) return
    const q = searchQ.trim()
    if (q.length < 2) {
      setHits([])
      setSearchError(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError(null)
    const timer = window.setTimeout(() => {
      listConstructionSuppliers({ query: q, limit: 20, offset: 0, contactableOnly: true })
        .then((r) => {
          if (cancelled) return
          setHits(r.suppliers.map((s) => ({ id: s.id, name: s.name, city: s.city })))
          setSearching(false)
        })
        .catch((err) => {
          if (cancelled) return
          setHits([])
          setSearchError(errorText(err, 'تعذّر البحث في الدليل'))
          setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQ, showSearch])

  const candidates = data?.candidates || []
  const candidateIds = useMemo(() => new Set(candidates.map((c) => c.supplier_id)), [candidates])
  const visible = filterCandidates(candidates, query)
  const body = useMemo(
    () => buildRevisionBody({ drafts, changeNote: note, supplierIds: selected }),
    [drafts, note, selected],
  )
  const bodyKey = JSON.stringify(body)
  const prepared = preview && preview.state === 'PREPARED' && !result ? preview : null

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addHit = (hit: SearchHit) => {
    if (!candidateIds.has(hit.id) && !extra.some((e) => e.id === hit.id)) setExtra((prev) => [...prev, hit])
    setSelected((prev) => new Set(prev).add(hit.id))
  }

  const updateDraft = (uid: string, patch: Partial<DraftLine>) =>
    setDrafts((prev) => prev.map((d) => (d.uid === uid ? { ...d, ...patch } : d)))

  const goStep2 = () => {
    const problem = draftProblem(drafts, note)
    if (problem) return setStepError(problem)
    if (!changed) return setStepError('لم يتغيّر شيء في البنود بعد.')
    setStepError(null)
    setStep(2)
  }

  const goStep3 = async () => {
    if (!selected.size) return setStepError('اختر موردًا واحدًا على الأقل.')
    setStepError(null)
    setStep(3)
    if (preview && preparedKey === bodyKey && preview.state === 'PREPARED') return
    setBusy('prepare')
    setActionError(null)
    try {
      // A preview of other inputs is dropped first: only one prepared revision at a time.
      if (prepared) await cancelRfqRevision(rfqId, prepared.revision_id).catch(() => null)
      const next = await prepareRfqRevision(rfqId, body)
      setPreview(next)
      setPreparedKey(bodyKey)
      setReviewed(false)
      setChangedNotice(false)
    } catch (err) {
      setPreview(null)
      setPreparedKey(null)
      setActionError(errorText(err, 'تعذّرت المعاينة.'))
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    if (!prepared) return
    setBusy('confirm')
    setActionError(null)
    try {
      const out = await confirmRfqRevision(rfqId, prepared.revision_id, confirmBody(prepared))
      setResult(out)
      setPreview({ ...prepared, state: 'SENT' })
      onSent(out)
    } catch (err) {
      if (isRevisionPreviewChanged(err)) {
        setBusy('reload')
        try {
          setPreview(await getRfqRevision(rfqId, prepared.revision_id))
          setChangedNotice(true)
          setReviewed(false)
        } catch (reloadErr) {
          setActionError(errorText(reloadErr, 'تغيّرت المعاينة وتعذّرت إعادة قراءتها.'))
        }
      } else {
        setActionError(errorText(err, 'تعذّر الإرسال.'))
      }
    } finally {
      setBusy(null)
    }
  }

  /** «إلغاء»: a prepared revision is cancelled on the server before the dialog closes. */
  const cancelAndClose = async () => {
    if (prepared) {
      setBusy('cancel')
      setActionError(null)
      try {
        await cancelRfqRevision(rfqId, prepared.revision_id)
      } catch (err) {
        setBusy(null)
        setActionError(errorText(err, 'تعذّر إلغاء التعديل المُجهّز.'))
        return
      }
      setBusy(null)
    }
    onClose()
  }

  const recipientsByChannel = preview ? groupRecipientsByChannel(preview.recipients) : []
  const sample = preview ? samplePreview(preview.recipients) : null

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" dir="rtl">
      <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0D1F1D]">تعديل الطلب</h2>
              {data && (
                <p className="text-xs text-neutral-500 mt-0.5">
                  النسخة الحالية {data.current_version_number} — يُرسل التعديل نسخةً {data.current_version_number + 1} للموردين الذين تختارهم.
                </p>
              )}
            </div>
            <button onClick={() => void cancelAndClose()} disabled={busy === 'cancel' || busy === 'confirm'} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none" aria-label="إغلاق">
              ×
            </button>
          </div>
          <ol className="mt-3 flex gap-1.5 overflow-x-auto text-[11px] font-bold">
            {STEPS.map(([n, label]) => (
              <li
                key={n}
                className={`px-2.5 py-1 rounded-full whitespace-nowrap ${step === n ? 'bg-[#123F3A] text-white' : step > n ? 'bg-[#e0efec] text-[#123F3A]' : 'bg-neutral-100 text-neutral-500'}`}
              >
                {n}. {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loadError ? (
            <div className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{loadError}</div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-neutral-400">جارٍ تحميل البنود والموردين…</div>
          ) : step === 1 ? (
            <div className="space-y-3">
              {drafts.map((d, index) => (
                <div key={d.uid} className="border border-neutral-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-neutral-400">
                      {index + 1}
                      {!d.line_key && <span className="ms-1.5 text-[#1a7a45]">بند جديد</span>}
                    </span>
                    <button onClick={() => setDrafts((prev) => prev.filter((x) => x.uid !== d.uid))} className="text-[11px] font-bold text-red-600 hover:underline">
                      حذف البند
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_110px] gap-2">
                    <label className="text-[11px] text-neutral-500">
                      اسم البند
                      <input className={input} value={d.name_ar} onChange={(e) => updateDraft(d.uid, { name_ar: e.target.value })} />
                    </label>
                    <label className="text-[11px] text-neutral-500">
                      الكمية
                      <input className={input} inputMode="decimal" dir="ltr" value={d.quantity} onChange={(e) => updateDraft(d.uid, { quantity: e.target.value })} />
                    </label>
                    <label className="text-[11px] text-neutral-500">
                      الوحدة
                      <input className={input} value={d.uom} onChange={(e) => updateDraft(d.uid, { uom: e.target.value })} />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        ['material', 'الخامة'],
                        ['finish', 'التشطيب'],
                        ['dimensions', 'المقاس'],
                        ['thickness', 'السماكة'],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="text-[11px] text-neutral-500">
                        {label}
                        <input className={input} value={d[field]} onChange={(e) => updateDraft(d.uid, { [field]: e.target.value } as Partial<DraftLine>)} />
                      </label>
                    ))}
                  </div>
                  <label className="block text-[11px] text-neutral-500">
                    الوصف
                    <textarea className={`${input} min-h-14`} value={d.description} onChange={(e) => updateDraft(d.uid, { description: e.target.value })} />
                  </label>
                </div>
              ))}
              <button onClick={() => setDrafts((prev) => [...prev, emptyDraftLine(nextUid())])} className="text-sm font-bold text-[#123F3A] hover:underline">
                + إضافة بند
              </button>
              <label className="block text-sm font-bold text-[#0D1F1D] pt-2">
                ملاحظة التعديل <span className="text-red-600">*</span>
                <textarea
                  value={note}
                  onChange={(e) => {
                    setNoteTouched(true)
                    setNote(e.target.value)
                  }}
                  maxLength={500}
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm min-h-16 font-normal"
                  placeholder="ماذا تغيّر في الطلب؟ تصل للموردين مع النسخة الجديدة."
                />
              </label>
            </div>
          ) : step === 2 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${input} flex-1 min-w-[180px]`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في القائمة بالاسم أو القناة…" />
                <span className="text-xs text-neutral-500">اخترت {selected.size}</span>
              </div>
              <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
                {visible.map((c) => (
                  <CandidateRow key={c.supplier_id} candidate={c} checked={selected.has(c.supplier_id)} onToggle={() => toggle(c.supplier_id)} />
                ))}
                {extra.map((hit) => (
                  <li key={hit.id} className="flex items-start gap-3 px-3 py-2.5">
                    <input type="checkbox" className="mt-1 accent-[#123F3A]" checked={selected.has(hit.id)} onChange={() => toggle(hit.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0D1F1D]">{hit.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Chip cls="bg-[#eef2ff] text-[#3b4cca]">{sourceLabel('SEARCH')}</Chip>
                        <Chip cls={TONE_CLS.blocked}>تُحدَّد القناة في المعاينة</Chip>
                        {hit.city && hit.city !== '—' && <span className="text-[11px] text-neutral-500">{hit.city}</span>}
                      </div>
                    </div>
                  </li>
                ))}
                {visible.length === 0 && extra.length === 0 && <li className="px-3 py-4 text-center text-xs text-neutral-500">لا موردين يطابقون البحث.</li>}
              </ul>
              {!showSearch ? (
                <button onClick={() => setShowSearch(true)} className="text-sm font-bold text-[#123F3A] hover:underline">
                  + إضافة مورد من البحث
                </button>
              ) : (
                <div className="border border-neutral-200 rounded-xl p-3 space-y-2">
                  <input className={input} autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="ابحث في دليل الموردين (حرفان على الأقل)…" />
                  {searching && <div className="text-xs text-neutral-400">جارٍ البحث…</div>}
                  {searchError && <div className="text-xs text-red-700">{searchError}</div>}
                  <ul className="max-h-48 overflow-y-auto divide-y divide-neutral-50">
                    {hits.map((hit) => {
                      const added = selected.has(hit.id)
                      return (
                        <li key={hit.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="text-sm text-[#0D1F1D] truncate">
                            {hit.name}
                            {hit.city && hit.city !== '—' && <span className="text-[11px] text-neutral-500"> · {hit.city}</span>}
                          </span>
                          <button disabled={added} onClick={() => addHit(hit)} className="text-xs px-2.5 py-1 border border-neutral-200 rounded-lg font-semibold disabled:opacity-50">
                            {added ? 'مُضاف' : 'إضافة'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : step === 3 ? (
            busy === 'prepare' ? (
              <div className="py-10 text-center text-sm text-neutral-400">جارٍ تجهيز المعاينة… لا يُرسل شيء الآن.</div>
            ) : preview ? (
              <PreviewBody preview={preview} groups={recipientsByChannel} sampleText={sample?.message_preview || null} sampleName={sample?.name_ar || null} />
            ) : null
          ) : preview ? (
            result ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#f0faf7] text-[#123F3A] text-sm px-3 py-2 font-bold">
                  أُرسلت النسخة {result.version_number} من الطلب.
                </div>
                <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
                  {result.results.map((r) => {
                    const st = resultStatusLabel(r.status, r.error_code)
                    const name = preview.recipients.find((x) => x.supplier_id === r.supplier_id)?.name_ar || r.supplier_id
                    return (
                      <li key={r.supplier_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="truncate text-[#0D1F1D]">{name}</span>
                        <span className="flex items-center gap-1.5">
                          <Chip cls={TONE_CLS[channelTone(r.channel)]}>{channelLabel(r.channel)}</Chip>
                          <span className={`text-xs font-bold ${st.ok ? 'text-[#1a7a45]' : 'text-red-700'}`}>{st.text}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                {changedNotice && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
                    تغيّرت القنوات أو التكلفة منذ المعاينة (قد تكون نافذة واتساب مجانية أُغلقت). هذه الأرقام الجديدة — راجعها وأكّد مرة أخرى.
                  </div>
                )}
                <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm space-y-1">
                  <div className="font-bold text-[#0D1F1D]">
                    النسخة {preview.to_version_number} إلى {sendableCount(preview.recipients)} موردين
                  </div>
                  <div className="text-neutral-600">{costCountsAr(preview.cost)}</div>
                  <div className="font-bold text-[#0D1F1D] tabular-nums">{costSummaryAr(preview.cost)}</div>
                  <div className="text-xs text-neutral-500">ملاحظة التعديل: {preview.change_note}</div>
                </div>
                {changedNotice && <PreviewBody preview={preview} groups={recipientsByChannel} sampleText={null} sampleName={null} compact />}
                <label className="flex items-start gap-2 text-sm text-[#0D1F1D] cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-[#123F3A]" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                  راجعت المستلمين والتكلفة
                </label>
              </div>
            )
          ) : null}

          {(stepError || actionError) && (
            <div className="mt-3 rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{stepError || actionError}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-100 flex flex-wrap items-center gap-2">
          {result ? (
            <button onClick={onClose} className={`${primary} flex-1`}>
              إغلاق
            </button>
          ) : (
            <>
              {step === 1 && (
                <button disabled={!data} onClick={goStep2} className={`${primary} flex-1`}>
                  التالي: اختيار المستلمين
                </button>
              )}
              {step === 2 && (
                <button disabled={!selected.size} onClick={() => void goStep3()} className={`${primary} flex-1`}>
                  التالي: المعاينة والتكلفة
                </button>
              )}
              {step === 3 && (
                <button disabled={!prepared || busy !== null} onClick={() => { setActionError(null); setStep(4) }} className={`${primary} flex-1`}>
                  التالي: تأكيد الإرسال
                </button>
              )}
              {step === 4 && (
                <button disabled={!prepared || !reviewed || busy !== null} onClick={() => void confirm()} className={`${primary} flex-1`}>
                  {busy === 'confirm' ? 'جارٍ الإرسال…' : busy === 'reload' ? 'جارٍ تحديث المعاينة…' : 'أؤكد الإرسال'}
                </button>
              )}
              {step > 1 && (
                <button
                  disabled={busy !== null}
                  onClick={() => {
                    setStepError(null)
                    setActionError(null)
                    setStep((step - 1) as Step)
                  }}
                  className={secondary}
                >
                  رجوع
                </button>
              )}
              <button disabled={busy === 'cancel' || busy === 'confirm'} onClick={() => void cancelAndClose()} className={secondary}>
                {busy === 'cancel' ? 'جارٍ الإلغاء…' : prepared ? 'إلغاء التعديل' : 'إلغاء'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function CandidateRow({ candidate: c, checked, onToggle }: { candidate: RevisionCandidate; checked: boolean; onToggle: () => void }) {
  const until = c.channel === 'WHATSAPP_WINDOW' ? formatEventTime(c.window_until) : null
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <input type="checkbox" className="mt-1 accent-[#123F3A]" checked={checked} onChange={onToggle} aria-label={c.name_ar} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#0D1F1D]">{c.name_ar || c.supplier_id}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {c.quoted && <Chip cls="bg-[#e0efec] text-[#123F3A]">قدّم عرض</Chip>}
          {c.open_conversation && <Chip cls="bg-[#eef6ff] text-[#1d5fa8]">محادثة مفتوحة</Chip>}
          <Chip cls={TONE_CLS[channelTone(c.channel)]}>{channelLabel(c.channel, c.held_reason_ar)}</Chip>
          {until && <span className="text-[11px] text-neutral-500">حتى {until}</span>}
        </div>
      </div>
    </li>
  )
}

function PreviewBody({
  preview,
  groups,
  sampleText,
  sampleName,
  compact = false,
}: {
  preview: RevisionPreview
  groups: ReturnType<typeof groupRecipientsByChannel>
  sampleText: string | null
  sampleName: string | null
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      {!compact && (
        <>
          <div className="rounded-xl bg-[#f0faf7] text-[#123F3A] text-xs px-3 py-2">
            معاينة فقط — لم يُرسل شيء. الإرسال في الخطوة التالية بعد تأكيدك.
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Count value={preview.cost.free_count} label="مجانية" />
            <Count value={preview.cost.paid_count} label="مدفوعة" />
            <Count value={preview.cost.held_count} label="موقوفة" />
          </div>
          <div className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-bold text-[#0D1F1D] tabular-nums">{costSummaryAr(preview.cost)}</div>
        </>
      )}
      {groups.map((g) => (
        <div key={g.channel}>
          <div className="text-xs font-bold text-neutral-600 mb-1">
            {g.label} ({g.recipients.length})
          </div>
          <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
            {g.recipients.map((r) => (
              <li key={r.supplier_id} className="px-3 py-2 text-sm flex flex-wrap items-center gap-1.5">
                <span className="text-[#0D1F1D] font-semibold me-auto">{r.name_ar || r.supplier_id}</span>
                {r.sources.map((s) => (
                  <Chip key={s} cls="bg-neutral-100 text-neutral-600">{sourceLabel(s)}</Chip>
                ))}
                {r.channel === 'HELD' && r.held_reason_ar && <span className="w-full text-[11px] text-neutral-500">{r.held_reason_ar}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!compact && sampleText && (
        <div>
          <div className="text-xs font-bold text-neutral-600 mb-1">نص الرسالة{sampleName ? ` (كما تصل إلى ${sampleName})` : ''}</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-[#0D1F1D] bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2">{sampleText}</pre>
        </div>
      )}
    </div>
  )
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-xl px-2 py-2">
      <div className="text-xl font-black tabular-nums text-[#0D1F1D]">{value}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  )
}
