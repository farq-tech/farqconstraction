import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import {
  decideConstructionIntentCandidate,
  listConstructionIntentCandidates,
  type IntentCandidate,
} from '../api/constructionClient'
import { familyLabelAr, intentChoices, intentLabelAr } from '../lib/intentLabels'

/**
 * The owner's review queue.
 *
 * Every line Farq could not name is remembered by its core, with how many
 * booklet lines carried it and the material the model proposed for it. One
 * decision here covers all of those lines, in this booklet and the next. The
 * model never widens the list on its own: «صحيح» keeps its proposal, «خطأ»
 * silences it, and «صحّح» replaces it with a material of the closed list.
 */
export function LearningReviewView({ navigate }: NavProps) {
  const [rows, setRows] = useState<IntentCandidate[]>([])
  const [totalOpen, setTotalOpen] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [correcting, setCorrecting] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const choices = useMemo(() => intentChoices(), [])

  const load = () => {
    setLoading(true)
    setError(null)
    listConstructionIntentCandidates(100)
      .then((res) => {
        setRows(res.candidates || [])
        setTotalOpen(res.total_open ?? null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل قائمة المراجعة'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const decide = async (row: IntentCandidate, decision: 'APPROVE' | 'REJECT' | 'CORRECT', intent?: string) => {
    setBusyKey(row.key)
    setError(null)
    try {
      await decideConstructionIntentCandidate(row.key, { decision, intent })
      setRows((prev) => prev.filter((r) => r.key !== row.key))
      setTotalOpen((n) => (n == null ? n : Math.max(0, n - 1)))
      setDone((n) => n + 1)
      setCorrecting(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ القرار')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">مراجعة المواد</h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            مواد لم يعرفها فرق في كراساتك، مرتبة بعدد البنود التي تكررت فيها. قرارك على السطر الواحد يُطبَّق على كل بنوده، الآن وفي الكراسات القادمة.
          </p>
        </div>
        <button onClick={() => navigate('home')} className="flex-shrink-0 px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm hover:bg-neutral-50">
          الرئيسية
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className="text-neutral-500">
          بانتظار قرارك: <span className="font-black text-[#0D1F1D]">{totalOpen ?? '—'}</span>
        </span>
        {done > 0 && <span className="text-[#1a7a45] font-semibold">قرّرت {done} في هذه الجلسة</span>}
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="py-16 text-center text-sm text-neutral-400">جارٍ التحميل…</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 bg-white border border-neutral-100 rounded-2xl">
          <div className="font-semibold text-[#0D1F1D] mb-1">لا شيء بانتظار المراجعة</div>
          <p className="text-sm text-neutral-500">تمتلئ هذه القائمة من الكراسات التي ترفعها.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const busy = busyKey === row.key
          return (
            <div key={row.key} className="bg-white border border-neutral-100 rounded-2xl px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-black text-[#0D1F1D] break-words" dir="auto">{row.sample_text || '—'}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">تكرّر في {row.lines} بندًا</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-purple-50/70 border border-purple-100 px-3 py-2.5 text-sm">
                <span className="text-xs text-purple-700/80">اقتراح فرق: </span>
                <span className="font-bold text-[#0D1F1D]">
                  {row.proposed_intent ? intentLabelAr(row.proposed_intent) : 'المادة غير موجودة في القائمة'}
                </span>
                {row.proposed_family && <span className="text-xs text-neutral-500"> · نشاط: {familyLabelAr(row.proposed_family)}</span>}
              </div>

              {correcting === row.key ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void decide(row, 'CORRECT', e.target.value)}
                    className="flex-1 min-w-[220px] border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#123F3A]"
                  >
                    <option value="">اختر المادة الصحيحة من قائمة فرق…</option>
                    {choices.map((group) => (
                      <optgroup key={group.family} label={group.label}>
                        {group.intents.map((intent) => (
                          <option key={intent.id} value={intent.id}>{intent.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => setCorrecting(null)} className="text-xs font-semibold text-neutral-500 hover:underline">إلغاء</button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => void decide(row, 'APPROVE')} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-sm font-bold disabled:opacity-40">
                    صحيح
                  </button>
                  <button disabled={busy} onClick={() => setCorrecting(row.key)} className="px-4 py-2 rounded-xl border border-neutral-200 text-[#123F3A] text-sm font-bold disabled:opacity-40">
                    صحّح
                  </button>
                  <button disabled={busy} onClick={() => void decide(row, 'REJECT')} className="px-4 py-2 rounded-xl border border-neutral-200 text-red-600 text-sm font-bold disabled:opacity-40">
                    خطأ
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!loading && rows.length > 0 && totalOpen != null && totalOpen > rows.length && (
        <button onClick={load} className="mt-5 w-full py-3 rounded-xl border border-neutral-200 text-sm font-bold text-[#123F3A] hover:bg-neutral-50">
          حمّل الدفعة التالية ({totalOpen - rows.length} متبقية)
        </button>
      )}
    </div>
  )
}
