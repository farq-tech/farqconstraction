import { useState, useRef, useEffect } from 'react'
import type { NavProps, BOQItem } from '../types'
import { UploadIcon, CheckIcon } from '../icons'
import { parseBoqFile, resolveBoqCardFields } from '../lib/parseBoq'
import type { BoqParseStage } from '../lib/parseBoq'
import {
  BoqEtaTracker,
  hasAnyCalibration,
  loadBoqCalibration,
  recordBoqRun,
  type BoqEtaLeg,
  type BoqEtaPhase,
  type BoqEtaUnit,
  type BoqEtaView,
} from '../lib/boqEta'
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

const PHASE_LABEL: Record<BoqEtaPhase, string> = {
  'local-read': 'قراءة الملف على جهازك',
  'server-read': 'قراءة الملف على الخادم',
  analyze: 'تحليل البنود',
  match: 'مطابقة الموردين',
}

const LEG_LABEL: Record<BoqEtaLeg, string> = {
  hash: 'بصمة الملف',
  extract: 'استخراج نص الصفحات على جهازك',
  table: 'قراءة أعمدة جدول الكميات',
  'api-parse': 'انتظار خدمة قراءة PDF على الخادم',
  resolve: 'استخراج البنود من النص',
  'match-remote': 'طلب مطابقة البنود على الخادم',
  'match-catalog': 'تنزيل دليل الموردين',
  'match-pools': 'ترشيح الموردين لكل نية شراء',
  'match-rank': 'ترتيب الموردين لكل بند',
}

const UNIT_LABEL: Record<BoqEtaUnit, { one: string; many: string }> = {
  page: { one: 'صفحة', many: 'صفحة' },
  pool: { one: 'نية', many: 'نية' },
  line: { one: 'بند', many: 'بندًا' },
}

/** Arabic counts read wrong with a bare number; 2 and 3–10 take their own forms. */
function arSeconds(total: number): string {
  const n = Math.max(0, Math.round(total))
  if (n === 0) return 'أقل من ثانية'
  if (n >= 90) {
    const m = Math.floor(n / 60)
    const rest = n % 60
    const minutes = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`
    return rest ? `${minutes} و${arSeconds(rest)}` : minutes
  }
  if (n === 1) return 'ثانية واحدة'
  if (n === 2) return 'ثانيتين'
  if (n <= 10) return `${n} ثوانٍ`
  return `${n} ثانية`
}

function secondsOf(ms: number | null): number | null {
  return ms === null ? null : Math.max(0, Math.round(ms / 1000))
}

/**
 * A live countdown rounds up: 400ms left must read as a second, never as «0»,
 * because a zero beside a spinner is the broken promise this whole panel exists
 * to avoid. Zero is reserved for "finishing right now".
 */
function countdownLabel(ms: number): string {
  if (ms <= 0) return 'أقل من ثانية'
  return arSeconds(Math.ceil(ms / 1000))
}

/**
 * Bar slices for legs that report real progress. The endpoints are as
 * hand-picked as the stage percentages they sit inside, but the movement within
 * a slice is driven only by work actually finished — pages extracted, intents
 * filtered, lines ranked. Opaque legs get no slice, so the bar holds still while
 * a single request is outstanding instead of drifting to look busy.
 */
const LEG_BAR_SPAN: Partial<Record<BoqEtaLeg, [number, number]>> = {
  extract: [35, 55],
  'match-pools': [80, 88],
  'match-rank': [88, 96],
}

/**
 * The countdown, and the four things it is allowed to say:
 *   - a number, when throughput has actually been measured;
 *   - "no estimate yet", while it is still measuring;
 *   - "this stage reports no progress, here is its ceiling", for a bare request;
 *   - "we passed our estimate", once a published number ran out.
 * It never freezes and never restarts to look better. The elapsed counter above
 * it keeps running in every one of those states.
 */
function EtaPanel({ eta, hasHistory }: { eta: BoqEtaView; hasHistory: boolean }) {
  const legCap = secondsOf(eta.legCapMs)
  const phaseLabel = eta.phase ? PHASE_LABEL[eta.phase] : 'المعالجة'
  const legLabel = eta.leg ? LEG_LABEL[eta.leg] : ''
  const unit = eta.unit
  const measured =
    unit && eta.done !== null && eta.total !== null
      ? `${eta.done} من ${eta.total} ${eta.total === 1 ? UNIT_LABEL[unit].one : UNIT_LABEL[unit].many}`
      : null
  const nextPhases = eta.remainingPhases.map((p) => PHASE_LABEL[p]).join(' ثم ')

  const tone = eta.overdue
    ? 'border-amber-200 bg-amber-50'
    : eta.remainingMs !== null
      ? 'border-[#123F3A]/15 bg-[#f0faf7]'
      : 'border-neutral-200 bg-neutral-50'

  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 animate-fade-up ${tone}`}>
      {eta.overdue ? (
        <>
          <div className="text-sm font-bold text-amber-800">تجاوزنا الوقت المتوقع</div>
          <div className="mt-1 text-xs text-amber-800 leading-relaxed">
            {eta.brokenEstimateMs !== null
              ? `قدّرنا ${arSeconds(secondsOf(eta.brokenEstimateMs)!)} لمرحلة «${phaseLabel}» وتجاوزناها بـ ${arSeconds(secondsOf(eta.overdueByMs) ?? 0)}.`
              : `تجاوزنا تقديرنا لمرحلة «${phaseLabel}».`}{' '}
            العمل ما زال جاريًا ومضى {arSeconds(secondsOf(eta.elapsedMs)!)} على القراءة. لن نعيد ضبط
            العد التنازلي ولن نعرض رقمًا جديدًا لا نستطيع إثباته.
          </div>
        </>
      ) : eta.remainingMs !== null ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-neutral-500">متوقّع لإنهاء «{phaseLabel}»</span>
            <span className="text-xl font-black text-[#123F3A] tabular-nums">
              {countdownLabel(eta.remainingMs)}
            </span>
          </div>
          <div className="mt-1 text-xs text-neutral-600 leading-relaxed">
            {eta.basis === 'in-run' && eta.ratePerSec && unit
              ? `مقيس داخل هذه القراءة: ${formatRate(eta.ratePerSec, unit)}.`
              : eta.basis === 'history-fit'
                ? `مبني على قياس ${eta.historySamples} قراءات سابقة على هذا الجهاز${eta.lines ? ` مقيسة على ${eta.lines} بندًا` : ''}.`
                : eta.basis === 'history-ratio'
                  ? 'مبني على قياس قراءة واحدة سابقة فقط — تقدير خشن قد يبتعد كثيرًا.'
                  : ''}
            {eta.revisedUp && eta.firstPromisedMs !== null
              ? ` حدّثنا التقدير للأعلى: كان ${arSeconds(secondsOf(eta.firstPromisedMs)!)} ثم قِسنا سرعة أبطأ.`
              : ''}
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-bold text-[#0D1F1D]">لا تقدير بعد</div>
          <div className="mt-1 text-xs text-neutral-600 leading-relaxed">
            {eta.leg === null
              ? 'ننتقل بين مرحلتين الآن.'
              : eta.legKind === 'opaque'
                ? `«${legLabel}» طلب واحد لا يُبلّغ عن تقدّمه من الداخل، فلا يوجد ما نقيسه لنقدّر مدته.${
                    legCap ? ` يتوقف عند ${arSeconds(legCap)} كحد أقصى ثم نكمل بما لدينا.` : ''
                  }`
                : eta.phase === 'match' && eta.lines === null
                  ? 'لا نستطيع تقدير مطابقة الموردين قبل معرفة عدد البنود — سنقدّر بعد استخراجها.'
                  : `نقيس السرعة الفعلية لهذا الملف الآن${measured ? ` (${measured})` : ''}؛ نعرض رقمًا حين يكفي القياس.`}
            {!hasHistory
              ? ' هذه أول كراسة تُقرأ على هذا الجهاز، فلا قياس سابق نبني عليه. نقيس هذه القراءة لتقدير ما بعدها.'
              : ''}
          </div>
        </>
      )}

      <div className="mt-2 pt-2 border-t border-black/5 text-[11px] text-neutral-500 leading-relaxed">
        المرحلة الحالية: {legLabel || 'بين مرحلتين'}
        {measured && !eta.overdue ? ` — ${measured}` : ''}
        {eta.overdue && measured ? ` — أنجزنا ${measured} حتى الآن` : ''}
        {legCap ? `. سقفها ${arSeconds(legCap)}` : ''}
        {nextPhases ? `. يتبعها: ${nextPhases}` : '. لا مرحلة بعدها'}
        {eta.phase !== 'match' && eta.remainingPhases.includes('match')
          ? '. مدة المطابقة تعتمد على عدد البنود، ولا تُقدَّر قبل استخراجها'
          : ''}
      </div>
    </div>
  )
}

function formatRate(rate: number, unit: BoqEtaUnit): string {
  const label = UNIT_LABEL[unit].one
  const shown = rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10
  return `${shown} ${label}/ث`
}

/**
 * The honest summary of one read. `expected` is the booklet's own numbering, so
 * `read < expected` is not an opinion — the document says how many items it has.
 */
type ReadReport = {
  read: number
  expected: number | null
  unreadable: number
  issues: string[]
  skippedTables: string[]
  matchApiFailed: boolean
  /** The served descriptions repeat too heavily to be item names. */
  descriptionColumnSuspect?: boolean
  descriptionColumnDetail?: string
  matchApiError?: string
  source: string
}

const SOURCE_LABEL: Record<string, string> = {
  'pdf-table': 'قراءة أعمدة الجدول بالإحداثيات',
  'pdf-text': 'قراءة نصية للأسطر',
  'waiting-hall-curated': 'جدول محفوظ لكراسة صالات الانتظار',
  empty: 'لا مصدر',
}

/**
 * Shown whenever the booklet numbers more items than we read. It says the count
 * first, because returning 31 of 68 lines as though they were the booklet is
 * what turned a parser defect into wrong RFQs instead of a visible error.
 */
function PartialReadPanel({ report }: { report: ReadReport }) {
  const expected = report.expected ?? report.read + report.unreadable
  return (
    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-right" dir="rtl">
      <div className="text-sm font-bold text-red-800">
        قراءة ناقصة: قرأنا {report.read} من {expected} بندًا
      </div>
      <div className="text-xs text-red-700 mt-1 leading-relaxed">
        لم نقرأ {report.unreadable} بندًا، ولم نخمّن لها كمية أو وحدة. لا ترسل طلب عرض سعر على هذه
        الكراسة قبل مراجعة البنود الناقصة — الأرقام أدناه تخص ما قرأناه فقط.
      </div>
      {report.issues.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {report.issues.slice(0, 12).map((issue, i) => (
            <li key={i} className="text-[11px] text-red-700 leading-relaxed">
              • {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Shown when the descriptions repeat too heavily to be item names.
 *
 * It leads with the fact that the read is unusable rather than with the count,
 * because the count is exactly what made this failure invisible: 180 of 180
 * items, every quantity correct, and the material absent from every line.
 */
function DescriptionColumnPanel({ report }: { report: ReadReport }) {
  return (
    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-right" dir="rtl">
      <div className="text-sm font-bold text-red-800">
        قراءة غير صالحة: قرأنا {report.read} صفًا، لكن لم نقرأ أسماء البنود
      </div>
      <div className="text-xs text-red-700 mt-1 leading-relaxed">
        {report.descriptionColumnDetail}
      </div>
      <div className="text-xs text-red-700 mt-2 leading-relaxed">
        عدد الصفوف أعلاه ليس دليل نجاح: الكميات والوحدات قد تكون صحيحة، لكن المادة نفسها مجهولة،
        ولذلك لن تُطابَق بموردين. لا ترسل طلب عرض سعر على هذه الكراسة.
      </div>
    </div>
  )
}

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
  /** How much of the booklet we actually read, and why the rest is missing. */
  const [readReport, setReadReport] = useState<ReadReport | null>(null)
  const [elapsed, setElapsed] = useState(0)
  /** Expected-time-to-finish, recomputed only from work `parseBoqFile` reports. */
  const [eta, setEta] = useState<BoqEtaView | null>(null)
  /** False on the very first read of a device: there is no history to estimate from. */
  const [hasHistory, setHasHistory] = useState(false)
  const etaRef = useRef<BoqEtaTracker | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Kept so «أعد المحاولة» retries the same booklet instead of asking again. */
  const lastFileRef = useRef<File | null>(null)
  /** Ignores a superseded run so a slow first attempt cannot overwrite a retry. */
  const runIdRef = useRef(0)

  useEffect(() => {
    if (phase !== 'processing') return
    const id = window.setInterval(() => {
      setElapsed((s) => s + 1)
      // The countdown ticks on the same clock as the elapsed counter, so it can
      // reach zero and turn into an honest overrun instead of stalling at 1.
      const tracker = etaRef.current
      if (tracker) setEta(tracker.view())
    }, 1000)
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
    setReadReport(null)

    const calibration = loadBoqCalibration()
    setHasHistory(hasAnyCalibration(calibration))
    const tracker = new BoqEtaTracker({ calibration })
    etaRef.current = tracker
    setEta(tracker.view())

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
        onWork: (event) => {
          if (!current()) return
          tracker.note(event)
          setEta(tracker.view())
        },
        onRead: (facts) => {
          if (!current()) return
          // Before matching starts, not after: the owner should not wait out the
          // longest leg believing a partial read is a complete one.
          setReadReport({
            read: facts.read,
            expected: facts.expectedLineCount ?? null,
            unreadable: facts.unreadableLineCount,
            issues: facts.readIssues ?? [],
            skippedTables: facts.skippedTables ?? [],
            matchApiFailed: false,
            source: 'pdf-table',
            descriptionColumnSuspect: facts.descriptionColumnSuspect,
            descriptionColumnDetail: facts.descriptionColumnDetail,
          })
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
        // A read that found nothing says nothing about how long a real one takes,
        // so its timings are deliberately not folded into the calibration.
        tracker.finish()
        setEta(tracker.view())
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
      // What the booklet contains versus what we read. Kept as its own state so
      // the screen can refuse to call a partial read a complete one.
      setReadReport({
        read: result.items.length,
        expected: result.expectedLineCount ?? null,
        unreadable: result.unreadableLineCount ?? 0,
        issues: result.readIssues ?? [],
        skippedTables: result.skippedTables ?? [],
        matchApiFailed: Boolean(result.matchApiFailed),
        matchApiError: result.matchApiError,
        source: result.source,
        descriptionColumnSuspect: result.descriptionColumnSuspect,
        descriptionColumnDetail: result.descriptionColumnDetail,
      })
      setProgress(100)
      // Measured durations of this run are the only basis the next one will have.
      tracker.finish()
      recordBoqRun(tracker)
      setEta(tracker.view())
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
        // Persisted as empty for the same reason the proposals screen no longer
        // pre-ticks: being returned by ranking is a suggestion, not the buyer's
        // decision, and a stored selection would put the decision back.
        selectedSupplierIds: Object.fromEntries(
          result.items.map((item) => [String(item.id), [] as string[]]),
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
      tracker.finish()
      setEta(tracker.view())
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
    etaRef.current = null
    setEta(null)
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
    setReadReport(null)
  }

  // Stage transitions set the floor; a measured leg may raise it within its own
  // slice. Nothing here moves on a timer.
  const span = eta?.leg ? LEG_BAR_SPAN[eta.leg] : undefined
  const displayProgress =
    span && eta?.legFraction !== null && eta?.legFraction !== undefined && phase === 'processing'
      ? Math.max(progress, Math.round(span[0] + (span[1] - span[0]) * eta.legFraction))
      : progress

  const readyCount = items.filter((i) => i.status === 'ready').length
  /**
 * The booklet numbers its own items, so this is a fact rather than a guess, and
 * everything on the screen below reads differently because of it.
 */
  const partialRead = Boolean(readReport && readReport.unreadable > 0)
  // A read can be complete by count and still be worthless, so «اكتملت» is not
  // allowed to depend on the count alone.
  const badRead = partialRead || Boolean(readReport?.descriptionColumnSuspect)
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
                {phase === 'processing'
                  ? `جاري المعالجة… مضى ${arSeconds(elapsed)}`
                  : partialRead
                    ? 'انتهت المعالجة بقراءة ناقصة'
                    : readReport?.descriptionColumnSuspect
                      ? 'انتهت المعالجة بقراءة غير صالحة'
                      : 'اكتملت المعالجة'}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-[#0D1F1D]">
                {phase === 'processing'
                  ? 'فرق يقرأ الكراسة…'
                  : partialRead
                    ? 'قرأنا جزءًا من الكراسة'
                    : readReport?.descriptionColumnSuspect
                      ? 'قرأنا الصفوف دون أسماء البنود'
                      : 'تمت قراءة الكراسة'}
              </span>
              <span className="text-sm font-bold text-[#123F3A]">{displayProgress}%</span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full bg-[#123F3A] transition-all duration-300" style={{ width: `${displayProgress}%` }} />
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

            {phase === 'processing' && eta && <EtaPanel eta={eta} hasHistory={hasHistory} />}

            {phase === 'processing' && partialRead && readReport && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 animate-fade-up text-right" dir="rtl">
                <div className="text-xs font-bold text-red-800">
                  قراءة ناقصة: قرأنا {readReport.read} من {readReport.expected ?? readReport.read + readReport.unreadable} بندًا
                </div>
                <div className="text-[11px] text-red-700 mt-1 leading-relaxed">
                  المطابقة الجارية الآن تخص المقروء فقط، و{readReport.unreadable} بندًا لن تظهر في النتيجة.
                  العدّ التنازلي أدناه يقدّر وقت إكمال المطابقة، لا وقت قراءة ما تعذّر.
                </div>
              </div>
            )}

            {phase === 'processing' && !partialRead && recognized > 0 && (
              <div className="mt-4 text-sm text-neutral-500 animate-fade-up">
                تم التعرف على <span className="font-bold text-[#123F3A]">{recognized}</span> بندًا
              </div>
            )}

            {phase === 'processing' && elapsed >= SLOW_HINT_AFTER_S && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 animate-fade-up">
                <div className="text-xs text-amber-700 leading-relaxed">
                  ما زال العمل جاريًا. العملية كلها تتوقف عند {arSeconds(UPLOAD_WATCHDOG_MS / 1000)} بخطأ
                  واضح، ولن نستخدم كراسة سابقة.
                </div>
                <button
                  onClick={reset}
                  className="mt-2 text-xs font-bold text-amber-800 underline"
                >
                  إلغاء
                </button>
              </div>
            )}

            {phase === 'done' && (
              <div className="mt-4 text-xs text-neutral-500 leading-relaxed">
                {partialRead ? 'توقفت القراءة' : badRead ? 'انتهت القراءة' : 'اكتملت القراءة'} في{' '}
                {arSeconds(elapsed)}.
                {eta?.overranEarlier
                  ? ' تجاوزنا تقديرًا في الطريق — حفظنا الزمن الفعلي حتى يكون تقدير المرة القادمة أقرب.'
                  : ' حفظنا زمن هذه القراءة لتقدير المرة القادمة.'}
                {readReport?.source ? ` المصدر: ${SOURCE_LABEL[readReport.source] ?? readReport.source}.` : ''}
              </div>
            )}
          </div>

          {phase === 'done' && (
            <div className="px-6 pb-6 animate-fade-up">
              {projectName && (
                <div className="text-sm font-semibold text-[#0D1F1D] mb-3 truncate">{projectName}</div>
              )}
              {partialRead && readReport && <PartialReadPanel report={readReport} />}
              {readReport?.descriptionColumnSuspect && <DescriptionColumnPanel report={readReport} />}

              {readReport?.matchApiFailed && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-right" dir="rtl">
                  <div className="text-sm font-bold text-amber-800">مطابقة الموردين لم تعمل على الخادم</div>
                  <div className="text-xs text-amber-700 mt-1 leading-relaxed">
                    الاقتراحات أدناه من مطابقة محلية بالكلمات فقط، وهي أضعف. السبب:{' '}
                    {readReport.matchApiError || 'غير معروف'}
                  </div>
                </div>
              )}

              <div className={`rounded-xl p-4 mb-5 ${partialRead ? 'bg-red-50' : 'bg-[#f0faf7]'}`}>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">
                      {partialRead && readReport
                        ? `${items.length}/${readReport.expected ?? items.length + readReport.unreadable}`
                        : items.length}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {partialRead ? 'بندًا مقروءًا من الكراسة' : 'بندًا'}
                    </div>
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
                {partialRead
                  ? `عرض الموردين للبنود المقروءة فقط (${readyCount} من ${readReport?.expected ?? items.length})`
                  : `عرض الموردين المقترحين (${readyCount} بندًا جاهزًا)`}
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
              {/* The countdown owes him a closing number even when the read failed. */}
              <div className="mt-2 text-xs text-red-500 leading-relaxed">
                توقفت المحاولة بعد {arSeconds(elapsed)}
                {eta?.leg ? ` عند «${LEG_LABEL[eta.leg]}»` : ''}. لا عد تنازلي الآن، ولم نحفظ زمن هذه
                المحاولة لأن قراءة فاشلة لا تقيس شيئًا.
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
