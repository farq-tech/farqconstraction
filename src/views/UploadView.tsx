import { useState, useRef, useEffect } from 'react'
import type { NavProps, BOQItem } from '../types'
import { UploadIcon, CheckIcon } from '../icons'
import { parseBoqFile, resolveBoqCardFields } from '../lib/parseBoq'
import type { BoqParseStage } from '../lib/parseBoq'
import { beginBoqUpload, clearParsedBoq, setParsedBoq, upsertDraftRfq } from '../store/session'
import { useProcurement } from '../procurementContext'

/**
 * Stages are driven by `parseBoqFile`'s real callbacks. They used to advance on
 * fixed `setTimeout`s, which pinned the bar at 69% with «البحث عن الموردين»
 * spinning two seconds into every upload — the same reading whether the parse
 * was mid-flight, finished, or hung. Never re-introduce timer-driven progress.
 */
const STAGES: Array<{ id: BoqParseStage; label: string; progress: number }> = [
  { id: 'open', label: 'فتح الملف', progress: 12 },
  { id: 'read', label: 'قراءة البنود', progress: 35 },
  { id: 'analyze', label: 'فهم المواصفات', progress: 60 },
  { id: 'match', label: 'البحث عن الموردين', progress: 80 },
]

/**
 * Hard stop for the whole upload. `parseBoqFile` caps each leg, but this is the
 * backstop that guarantees the user is never left with an endless spinner.
 */
const UPLOAD_WATCHDOG_MS = 180_000
const SLOW_HINT_AFTER_S = 15

type Phase = 'idle' | 'processing' | 'done' | 'error'

export function UploadView({ navigate }: NavProps) {
  const { setDraftBoq } = useProcurement()
  const [phase, setPhase] = useState<Phase>('idle')
  const [fileName, setFileName] = useState('')
  const [completedStages, setCompletedStages] = useState<string[]>([])
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [recognized, setRecognized] = useState(0)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<BOQItem[]>([])
  const [projectName, setProjectName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Kept so «أعد المحاولة» retries the same booklet instead of asking again. */
  const lastFileRef = useRef<File | null>(null)
  /** Ignores a superseded run so a slow first attempt cannot overwrite a retry. */
  const runIdRef = useRef(0)

  useEffect(() => {
    if (phase !== 'processing') return
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const runProcessing = async (file: File) => {
    // Isolate this upload immediately — never keep previous booklet lines around.
    beginBoqUpload({ fileName: file.name })
    setDraftBoq(null)
    lastFileRef.current = file
    const runId = ++runIdRef.current
    const current = () => runIdRef.current === runId
    setFileName(file.name)
    setPhase('processing')
    setCompletedStages([])
    setActiveStage(STAGES[0].id)
    setRecognized(0)
    setProgress(8)
    setElapsed(0)
    setItems([])
    setProjectName('')
    setErrorMsg('')

    let watchdog: number | undefined
    try {
      const parsed = parseBoqFile(file, {
        onStage: (id) => {
          if (!current()) return
          const i = STAGES.findIndex((s) => s.id === id)
          if (i < 0) return
          setActiveStage(id)
          setCompletedStages(STAGES.slice(0, i).map((s) => s.id))
          setProgress((p) => Math.max(p, STAGES[i]!.progress))
        },
      })
      const result = await new Promise<Awaited<typeof parsed>>((resolve, reject) => {
        watchdog = window.setTimeout(
          () =>
            reject(
              new Error(
                'توقفت قراءة الكراسة عند مرحلة «البحث عن الموردين» ولم تكتمل. لم نستخدم أي كراسة سابقة. أعد المحاولة، وإن تكرر الأمر تأكد أن Farq API يعمل.',
              ),
            ),
          UPLOAD_WATCHDOG_MS,
        )
        parsed.then(resolve, reject)
      })
      if (!current()) return

      if (result.items.length === 0) {
        clearParsedBoq()
        setDraftBoq(null)
        setItems([])
        setProgress(35)
        setPhase('error')
        setErrorMsg(
          result.matchWarning ||
            'لم نعثر على بنود في هذا الملف. لم نُعد استخدام كراسة سابقة. تأكد أن الملف يحتوي جدول كميات قابل للقراءة.',
        )
        return
      }

      setCompletedStages(STAGES.map((s) => s.id))
      setActiveStage(null)
      setRecognized(result.items.length)
      setProgress(100)
      setItems(result.items)
      setProjectName(result.projectName)
      if (result.matchWarning) {
        setErrorMsg(result.matchWarning)
      }
      setParsedBoq({
        fileName: file.name,
        projectName: result.projectName,
        items: result.items,
        documentId: result.documentId,
      })
      setDraftBoq({
        documentId: result.documentId,
        fileName: file.name,
        items: result.items,
        selectedSupplierIds: Object.fromEntries(
          result.items.map((item) => [String(item.id), item.suppliers.map((s) => s.id)]),
        ),
      })

      const today = new Date()
      const dateLabel = today.toLocaleDateString('ar-SA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      // New RFQ draft bound to this document identity (timestamp + hash prefix).
      const rfqId = `RFQ-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(today.getHours()).padStart(2, '0')}${String(today.getMinutes()).padStart(2, '0')}-${result.documentId.slice(0, 8)}`
      const supplierSet = new Set(result.items.flatMap((i) => i.suppliers.map((s) => s.id)))
      upsertDraftRfq({
        id: rfqId,
        name: result.projectName,
        items: result.items.length,
        offers: 0,
        suppliers: supplierSet.size,
        status: 'draft',
        date: dateLabel,
      })

      setPhase('done')
    } catch (err) {
      if (!current()) return
      // Document isolation: a failed run shows an error, never the last booklet.
      clearParsedBoq()
      setDraftBoq(null)
      setItems([])
      setActiveStage(null)
      setProgress(35)
      setPhase('error')
      setErrorMsg(err instanceof Error ? err.message : 'تعذّرت قراءة الملف')
    } finally {
      if (watchdog) window.clearTimeout(watchdog)
    }
  }

  const retry = () => {
    const file = lastFileRef.current
    if (file) void runProcessing(file)
  }

  const reset = () => {
    clearParsedBoq()
    setDraftBoq(null)
    runIdRef.current += 1
    lastFileRef.current = null
    setElapsed(0)
    setPhase('idle')
    setFileName('')
    setCompletedStages([])
    setActiveStage(null)
    setRecognized(0)
    setProgress(0)
    setItems([])
    setProjectName('')
    setErrorMsg('')
  }

  const readyCount = items.filter((i) => i.status === 'ready').length
  const searchingCount = items.filter((i) => i.status === 'searching').length
  const supplierCount = new Set(items.flatMap((i) => i.suppliers.map((s) => s.id))).size

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">ارفع الكراسة</h1>
        <p className="text-neutral-500">ارفع ملف الكراسة وسيقرأ فرق البنود تلقائيًا</p>
      </div>

      {phase === 'idle' && (
        <div
          className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
            dragging ? 'border-[#123F3A] bg-[#f0faf7]' : 'border-neutral-200 bg-white hover:border-[#123F3A]/40'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) void runProcessing(f)
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void runProcessing(f)
            }}
          />
          <div className="flex flex-col items-center py-20 px-8">
            <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
              <UploadIcon className="w-8 h-8 text-[#123F3A]" />
            </div>
            <div className="text-xl font-bold mb-2 text-[#0D1F1D]">اختر ملفًا</div>
            <p className="text-neutral-400 text-sm mb-6 text-center">اسحب الملف أو اضغط للاختيار</p>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">PDF</span>
              <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">Excel</span>
            </div>
          </div>
        </div>
      )}

      {(phase === 'processing' || phase === 'done') && (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden animate-fade-up">
          <div className="px-6 pt-6 pb-4 border-b border-neutral-50 flex items-center gap-4">
            <div className="w-10 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-xs font-bold">{fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'XLS' : 'PDF'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0D1F1D] text-sm truncate">{fileName}</div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {phase === 'processing' ? `جاري المعالجة… ${elapsed} ثانية` : 'اكتملت المعالجة'}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-[#0D1F1D]">
                {phase === 'processing' ? 'فرق يقرأ الكراسة…' : 'تمت قراءة الكراسة'}
              </span>
              <span className="text-sm font-bold text-[#123F3A]">{progress}%</span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full bg-[#123F3A] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            <div className="space-y-3">
              {STAGES.map((stage) => {
                const done = completedStages.includes(stage.id)
                const active = activeStage === stage.id
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        done ? 'bg-[#123F3A]' : active ? 'border-2 border-[#123F3A]' : 'border-2 border-neutral-200'
                      }`}
                    >
                      {done && <CheckIcon className="w-3 h-3 text-white" />}
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-[#123F3A] animate-pulse-dot" />}
                    </div>
                    <span
                      className={`text-sm ${
                        done ? 'text-[#0D1F1D] font-medium' : active ? 'text-[#123F3A] font-semibold' : 'text-neutral-400'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {phase === 'processing' && recognized > 0 && (
              <div className="mt-4 text-sm text-neutral-500 animate-fade-up">
                تم التعرف على <span className="font-bold text-[#123F3A]">{recognized}</span> بندًا
              </div>
            )}

            {phase === 'processing' && elapsed >= SLOW_HINT_AFTER_S && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 animate-fade-up">
                <div className="text-xs text-amber-700 leading-relaxed">
                  ما زال العمل جاريًا — مطابقة الموردين على كراسة كبيرة قد تستغرق نحو دقيقة.
                  سنعرض خطأً واضحًا إذا لم تكتمل، ولن نستخدم كراسة سابقة.
                </div>
                <button
                  onClick={reset}
                  className="mt-2 text-xs font-bold text-amber-800 underline"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>

          {phase === 'done' && (
            <div className="px-6 pb-6 animate-fade-up">
              {projectName && (
                <div className="text-sm font-semibold text-[#0D1F1D] mb-3 truncate">{projectName}</div>
              )}
              <div className="bg-[#f0faf7] rounded-xl p-4 mb-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">{items.length}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">بندًا</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-amber-600">{searchingCount}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">تحتاج موردين</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">{supplierCount}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">موردًا مطابقًا</div>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                  {errorMsg}
                </div>
              )}

              {/* البنود appear immediately */}
              <div className="mb-5 max-h-72 overflow-y-auto rounded-xl border border-neutral-100 divide-y divide-neutral-50">
                {items.map((item) => {
                  const { name, qty, unit, spec } = resolveBoqCardFields(item)
                  return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 text-right">
                    <span className="text-xs font-bold text-neutral-400 w-6 pt-0.5">{item.id}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0D1F1D]">{name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {qty} {unit}
                        {spec ? ` · ${spec}` : ''}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                        item.status === 'ready' ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {item.status === 'ready' ? `${item.supplierCount} مورد` : 'بحث'}
                    </span>
                  </div>
                  )
                })}
              </div>

              <button
                onClick={() => navigate('create-proposals')}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
              >
                عرض الموردين المقترحين ({readyCount} بندًا جاهزًا)
              </button>
              <button
                onClick={reset}
                className="w-full mt-2 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                رفع ملف آخر
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden animate-fade-up">
          <div className="px-6 pt-6 pb-4 border-b border-neutral-50 flex items-center gap-4">
            <div className="w-10 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-xs font-bold">PDF</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0D1F1D] text-sm truncate">{fileName}</div>
              <div className="text-xs text-red-500 mt-0.5">تعذّرت القراءة</div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-4 mb-5">
              <div className="text-sm font-bold text-red-700 mb-1">تعذّرت قراءة الملف</div>
              <div className="text-xs text-red-600 leading-relaxed">
                {errorMsg || 'يبدو أن الملف تالف أو بصيغة غير مدعومة أو لا يحتوي جدول كميات.'}
              </div>
            </div>
            <div className="space-y-2">
              {lastFileRef.current && (
                <button
                  onClick={retry}
                  className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
                >
                  أعد المحاولة لنفس الكراسة
                </button>
              )}
              <button
                onClick={reset}
                className="w-full py-3.5 border border-[#123F3A] text-[#123F3A] font-bold rounded-xl hover:bg-[#f0faf7] transition-colors text-sm"
              >
                رفع ملف آخر
              </button>
              <button
                onClick={() => navigate('home')}
                className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
