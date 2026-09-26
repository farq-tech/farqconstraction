import { useState, useRef, useEffect } from 'react'
import { autoPickFor, buildPickContext } from '../lib/autoPick'
import type { NavProps, BOQItem } from '../types'
import { UploadIcon, CheckIcon } from '../icons'
import { parseBoqFile, resolveBoqCardFields } from '../lib/parseBoq'
import type { BoqActivity, BoqParseStage } from '../lib/parseBoq'
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
import {
  beginBoqUpload,
  clearParsedBoq,
  getSession,
  resetWorkingSession,
  setParsedBoq,
  subscribeSession,
  upsertDraftRfq,
} from '../store/session'
import { takePendingUpload } from '../lib/pendingUpload'
import { clearInflightUpload, loadInflightUpload, saveInflightUpload } from '../lib/inflightUpload'
import { farqSession } from '../api/farqSession'
import { useProcurement } from '../procurementContext'
import { currentAuthMode } from '../api/constructionAuth'

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
// 180s was sized for the reference booklet. A coded BOQ read page by page on
// the server takes 1-3 minutes before matching starts, and the server's own
// extraction ceiling is 480s, so the screen must not give up before it does.
const UPLOAD_WATCHDOG_MS = 900_000
const SLOW_HINT_AFTER_S = 15

type Phase = 'idle' | 'processing' | 'done' | 'error'

const PHASE_LABEL: Record<BoqEtaPhase, string> = {
  'local-read': 'قراءة الملف على جهازك',
  'server-read': 'قراءة الملف على الخادم',
  analyze: 'تحليل البنود',
  match: 'مطابقة الموردين',
}

const LEG_LABEL: Record<BoqEtaLeg, string> = {
  hash: 'فتح الملف',
  extract: 'قراءة الصفحات',
  table: 'قراءة جدول الكميات',
  'api-parse': 'قراءة جدول الكميات',
  resolve: 'استخراج البنود',
  'match-remote': 'البحث عن الموردين',
  'match-catalog': 'البحث عن الموردين',
  'match-pools': 'البحث عن الموردين',
  'match-rank': 'ترتيب الموردين',
}

const UNIT_LABEL: Record<BoqEtaUnit, { one: string; many: string }> = {
  page: { one: 'صفحة', many: 'صفحة' },
  pool: { one: 'مادة', many: 'مادة' },
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
function EtaPanel({ eta, elapsed }: { eta: BoqEtaView; hasHistory: boolean; elapsed: number }) {
  // The owner's ruling, 2026-09-17: no promise, only a counter. Every estimate
  // this panel ever printed was eventually wrong in front of him («قدّرنا 50
  // ثانية وتجاوزناها بـ 4 دقائق»). It now states what is happening and how
  // long it has been happening, both of which are always true.
  const legLabel = eta.leg ? LEG_LABEL[eta.leg] : 'قراءة الكراسة'
  const unit = eta.unit
  const measured =
    unit && eta.done !== null && eta.total !== null
      ? `${eta.done} من ${eta.total} ${eta.total === 1 ? UNIT_LABEL[unit].one : UNIT_LABEL[unit].many}`
      : null
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  return (
    <div className="mt-5 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-4 bg-[#f0faf7] animate-fade-up">
      <div className="min-w-0 flex items-center gap-3">
        <span className="flex gap-1 flex-shrink-0" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#123F3A] animate-pulse-dot" style={{ animationDelay: `${i * 200}ms` }} />
          ))}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#0D1F1D] truncate">{legLabel}</div>
          {measured && <div className="text-xs text-neutral-500 mt-0.5">{measured}</div>}
        </div>
      </div>
      <div className="text-2xl font-black text-[#123F3A] tabular-nums flex-shrink-0" dir="ltr" aria-label="الوقت المنقضي">
        {mm}:{ss}
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
  /** Rows the read refused to serve as items — counted, never dropped silently. */
  setAsideCount?: number
  setAsideNote?: string
  setAsideRows?: Array<{ page?: number; quantity?: number | string | null; unit?: string | null; description?: string; reason?: string }>
  matchApiFailed: boolean
  /** The served descriptions repeat too heavily to be item names. */
  descriptionColumnSuspect?: boolean
  descriptionColumnDetail?: string
  /** The document prints far more item codes than rows were read. */
  codedItemsSuspect?: boolean
  codedItemsDetail?: string
  matchApiError?: string
  source: string
}

const SOURCE_LABEL: Record<string, string> = {
  'pdf-table': 'قراءة أعمدة الجدول بالإحداثيات',
  'pdf-text': 'قراءة نصية للأسطر',
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
/**
 * WHAT THE READ REFUSED, WHERE THE BUYER CAN SEE IT.
 *
 * «لا أريد أي بند يختفي بصمت». A row with no quantity, no readable text, or a
 * number sitting off the quantity column is not shown as an item. Those are
 * almost always totals and section headings — and «almost always» is why they
 * are listed rather than deleted in silence.
 */
function SetAsidePanel({ report }: { report: ReadReport }) {
  const [open, setOpen] = useState(false)
  const rows = report.setAsideRows || []
  return (
    <div className="mb-4 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3 text-right" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-[#0D1F1D]">
          سطور لم تُعرض كبنود: {report.setAsideCount}
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-bold text-[#123F3A] hover:underline flex-shrink-0"
          >
            {open ? 'إخفاء' : 'اعرضها'}
          </button>
        )}
      </div>
      <div className="text-xs text-neutral-600 mt-1 leading-relaxed">{report.setAsideNote}</div>
      {open && (
        <div className="mt-3 max-h-64 overflow-auto space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="bg-white border border-neutral-100 rounded-lg px-3 py-2">
              <div className="text-[11px] text-neutral-400">
                صفحة {row.page ?? '؟'} · {row.reason === 'NO_QUANTITY' ? 'بلا كمية' : row.reason === 'NO_TEXT' ? 'بلا نص مقروء' : 'خارج عمود الكميات'}
                {row.quantity ? ` · ${row.quantity} ${row.unit || ''}` : ''}
              </div>
              <div className="text-xs text-[#0D1F1D] leading-relaxed">{String(row.description || '').slice(0, 160)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CodedItemsPanel({ report }: { report: ReadReport }) {
  return (
    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-right" dir="rtl">
      <div className="text-sm font-bold text-red-800">قراءة غير صالحة: لم نقرأ جدول البنود</div>
      <div className="text-xs text-red-700 mt-1 leading-relaxed">{report.codedItemsDetail}</div>
      <div className="text-xs text-red-700 mt-2 leading-relaxed">
        اكتمال المعالجة وسرعتها ليسا دليل نجاح. هذا التخطيط لا يقرؤه فرق بعد قراءة صحيحة، فلا تُرسل
        طلب تسعير من هذه القراءة.
      </div>
    </div>
  )
}

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
  const [activity, setActivity] = useState<BoqActivity[]>([])
  const [recognized, setRecognized] = useState(0)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<BOQItem[]>([])
  const [projectName, setProjectName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
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
    // No session on a deployed build means no call reaches the API at all: the
    // server-side readers never run, no supplier is matched, and the screen then
    // apologises for a read it should not have started. Seen twice on
    // 2026-09-17 — a coded BOQ read locally in two seconds, the invalid-read
    // guard, and the actual cause («لم تسجّل الدخول») buried under it. Ask first.
    if (import.meta.env.PROD && currentAuthMode() === 'demo') {
      setNeedsSignIn(true)
      return
    }
    void saveInflightUpload(file, farqSession.getUser()?.id ?? null)
    setNeedsSignIn(false)
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

    setActivity([])
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
        onActivity: (event) => {
          if (!current()) return
          setActivity((prev) => [...prev, event])
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
            setAsideCount: facts.setAsideCount,
            setAsideNote: facts.setAsideNote,
            setAsideRows: facts.setAsideRows,
            matchApiFailed: false,
            source: 'pdf-table',
            descriptionColumnSuspect: facts.descriptionColumnSuspect,
            descriptionColumnDetail: facts.descriptionColumnDetail,
            codedItemsSuspect: facts.codedItemsSuspect,
            codedItemsDetail: facts.codedItemsDetail,
          })
        },
      })
      const result = await new Promise<Awaited<typeof parsed>>((resolve, reject) => {
        watchdog = window.setTimeout(
          () =>
            reject(
              new Error(
                'توقفت قراءة الكراسة عند مرحلة «البحث عن الموردين» ولم تكتمل. لم نستخدم أي كراسة سابقة. أعد المحاولة، وإن تكرر الأمر تواصل مع فرق.',
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
        void clearInflightUpload()
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
        setAsideCount: result.setAsideCount,
        setAsideNote: result.setAsideNote,
        setAsideRows: result.setAsideRows,
        matchApiFailed: Boolean(result.matchApiFailed),
        matchApiError: result.matchApiError,
        source: result.source,
        descriptionColumnSuspect: result.descriptionColumnSuspect,
        descriptionColumnDetail: result.descriptionColumnDetail,
        codedItemsSuspect: result.codedItemsSuspect,
        codedItemsDetail: result.codedItemsDetail,
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
      const unreadLines = result.unreadableLineCount ?? 0
      setParsedBoq({
        fileName: file.name,
        projectName: result.projectName,
        items: result.items,
        documentId: result.documentId,
        // The verdict travels with the lines, so the send step can enforce it.
        readIssue: result.codedItemsSuspect
          ? { kind: 'invalid', detail: result.codedItemsDetail || 'الكراسة ترقّم بنودًا أكثر بكثير مما قرأناه.' }
          : result.descriptionColumnSuspect
            ? { kind: 'invalid', detail: result.descriptionColumnDetail || 'عمود الوصف قُرئ بدل اسم البند.' }
            : unreadLines > 0
              ? { kind: 'partial', detail: `${unreadLines} بندًا في الكراسة لم تُقرأ ولن تكون في طلب التسعير.` }
              : null,
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
      const dateLabel = today.toLocaleDateString('en-GB', {
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
      void clearInflightUpload()
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
      void clearInflightUpload()
      setErrorMsg(err instanceof Error ? err.message : 'تعذّرت قراءة الملف')
    } finally {
      if (watchdog) window.clearTimeout(watchdog)
    }
  }

  const retry = () => {
    const file = lastFileRef.current
    if (file) void runProcessing(file)
  }

  // A file chosen on the home screen starts reading here, once.
  useEffect(() => {
    const file = takePendingUpload()
    if (file) {
      void runProcessing(file)
      return
    }
    // A refresh (or a closed tab) while a booklet was being read: carry on.
    let cancelled = false
    void loadInflightUpload(farqSession.getUser()?.id ?? null).then((saved) => {
      if (!cancelled && saved) void runProcessing(saved)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // What a restore brought back, if anything.
  const [restoredItems, setRestoredItems] = useState(() => getSession().boqItems.length)
  const [restoredName, setRestoredName] = useState(() => getSession().fileName)
  useEffect(
    () =>
      subscribeSession(() => {
        setRestoredItems(getSession().boqItems.length)
        setRestoredName(getSession().fileName)
      }),
    [],
  )

  const reset = () => {
    void clearInflightUpload()
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

  /**
 * The booklet numbers its own items, so this is a fact rather than a guess, and
 * everything on the screen below reads differently because of it.
 */
  const partialRead = Boolean(readReport && readReport.unreadable > 0)
  // A read can be complete by count and still be worthless, so «اكتملت» is not
  // allowed to depend on the count alone.
  const badRead = partialRead || Boolean(readReport?.descriptionColumnSuspect) || Boolean(readReport?.codedItemsSuspect)
  // The same choice the proposals page makes, so both screens say one thing.
  const pickContext = buildPickContext(items)
  const picksById = new Map(items.map((i) => [i.id, i.workOnly ? [] : autoPickFor(i, undefined, pickContext)]))
  const searchingCount = items.filter((i) => !i.workOnly && !(picksById.get(i.id) || []).length).length
  const supplierCount = new Set([...picksById.values()].flat().map((s) => s.id)).size
  const coveredCount = items.filter((i) => (picksById.get(i.id) || []).length > 0).length

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">ارفع الكراسة</h1>
        <p className="text-neutral-500">ارفع ملف الكراسة وسيقرأ فرق البنود تلقائيًا</p>
      </div>

      {/*
        A booklet already read is not lost by leaving the screen, so say so and
        offer the way back. Only «ابدأ من جديد» throws it away.
      */}
      {phase === 'idle' && restoredItems > 0 && (
        <div className="mb-6 rounded-2xl border border-[#CFF5DC] bg-[#F3FBF6] px-5 py-4">
          <div className="text-sm font-bold text-[#123F3A] mb-1">كراستك السابقة ما زالت محفوظة</div>
          <div className="text-xs text-neutral-600 mb-3">
            {restoredName ? `${restoredName} · ` : ''}
            {restoredItems} بندًا واختياراتك للموردين. لن تُحذف إلا إذا بدأت من جديد.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('create-proposals')}
              className="text-xs font-bold bg-[#123F3A] text-white rounded-lg px-3 py-2"
            >
              تابع من حيث توقفت
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('سيُحذف ما قرأناه من الكراسة واختياراتك للموردين. هل تريد البدء من جديد؟')) return
                resetWorkingSession()
                reset()
              }}
              className="text-xs font-bold text-neutral-500 border border-neutral-200 rounded-lg px-3 py-2 hover:text-red-700 hover:border-red-200"
            >
              ابدأ من جديد
            </button>
          </div>
        </div>
      )}

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
          {needsSignIn && (
            <div
              className="mx-6 mt-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-right"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold text-amber-900">سجّل الدخول أولًا، ثم ارفع الكراسة</div>
              <div className="text-xs text-amber-800 mt-1 leading-relaxed">
                قراءة الكراسة ومطابقة الموردين تجريان على خادم فرق، وهو لا يستقبل ملفًا بلا جلسة. لم نقرأ
                ملفك ولم نرفعه.
              </div>
              <button
                onClick={() => navigate('login')}
                className="mt-2 text-xs font-bold text-white bg-[#123F3A] rounded-lg px-3 py-1.5"
              >
                تسجيل الدخول
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
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
                  ? 'جاري المعالجة…'
                  : partialRead
                    ? 'انتهت المعالجة بقراءة ناقصة'
                    : readReport?.descriptionColumnSuspect || readReport?.codedItemsSuspect
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
                    : readReport?.codedItemsSuspect
                      ? 'لم نقرأ جدول البنود'
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

            {phase === 'processing' && (
              <LiveActivity events={activity} reading={activeStage !== 'match'} />
            )}
            {phase === 'processing' && eta && <EtaPanel eta={eta} hasHistory={hasHistory} elapsed={elapsed} />}

            {phase === 'processing' && partialRead && readReport && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 animate-fade-up text-right" dir="rtl">
                <div className="text-xs font-bold text-red-800">
                  قراءة ناقصة: قرأنا {readReport.read} من {readReport.expected ?? readReport.read + readReport.unreadable} بندًا
                </div>
                <div className="text-[11px] text-red-700 mt-1 leading-relaxed">
                  {readReport.unreadable} بندًا لن تظهر في النتيجة.
                </div>
              </div>
            )}

            {phase === 'processing' && !partialRead && recognized > 0 && (
              <div className="mt-4 text-sm text-neutral-500 animate-fade-up">
                تم التعرف على <span className="font-bold text-[#123F3A]">{recognized}</span> بندًا
              </div>
            )}

            {/* The browser has not handed the file over yet. Measured 2026-09-17: a
                booklet on an iCloud-synced Desktop that was not downloaded sat
                on «فتح الملف» for five minutes; even `cp` stalled on it. */}
            {phase === 'processing' && eta?.leg === 'hash' && elapsed >= 10 && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800 leading-relaxed animate-fade-up">
                المتصفح لم يستلم الملف من جهازك بعد. إن كان الملف محفوظًا في iCloud أو Google Drive وعليه علامة السحابة،
                افتحه مرة من جهازك حتى يُنزَّل، ثم ارفعه من جديد.
              </div>
            )}

            {phase === 'processing' && elapsed >= SLOW_HINT_AFTER_S && (
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 animate-fade-up">
                <span>ما زال العمل جاريًا.</span>
                <button onClick={reset} className="font-bold text-[#123F3A] hover:underline">
                  إلغاء
                </button>
              </div>
            )}

            {phase === 'done' && (
              <div className="mt-4 text-xs text-neutral-500 leading-relaxed">
                {partialRead ? 'توقفت القراءة' : badRead ? 'انتهت القراءة' : 'اكتملت القراءة'} في{' '}
                {arSeconds(elapsed)}.
              </div>
            )}
          </div>

          {phase === 'done' && (
            <div className="px-6 pb-6 animate-fade-up">
              {projectName && (
                <div className="text-sm font-semibold text-[#0D1F1D] mb-3 truncate">{projectName}</div>
              )}
              {partialRead && readReport && <PartialReadPanel report={readReport} />}
              {Boolean(readReport?.setAsideCount) && <SetAsidePanel report={readReport!} />}
              {readReport?.codedItemsSuspect && <CodedItemsPanel report={readReport} />}
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
                    <div className={`text-2xl font-black ${searchingCount ? 'text-amber-600' : 'text-[#123F3A]'}`}>
                      {searchingCount ? searchingCount : coveredCount}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {searchingCount ? 'بلا مورد في دليلنا' : 'بندًا لها موردون'}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">{supplierCount}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">موردًا مختارًا</div>
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
                {items.slice(0, 60).map((item) => {
                  const { name, qty, unit, spec } = resolveBoqCardFields(item)
                  return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 text-right">
                    <span className="text-xs font-bold text-neutral-400 w-6 pt-0.5">{item.id}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0D1F1D]">{name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2" title={spec || undefined}>
                        <span className="font-semibold text-[#0D1F1D]">{qty} {unit}</span>
                        {spec ? ` · ${spec}` : ''}
                      </div>
                    </div>
                    {(() => {
                      const n = (picksById.get(item.id) || []).length
                      return (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                            n ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {n === 0 ? 'بلا مورد' : n === 1 ? 'مورد واحد' : n === 2 ? 'موردان' : `${n} موردين`}
                        </span>
                      )
                    })()}
                  </div>
                  )
                })}
                {items.length > 60 && (
                  <div className="px-4 py-3 text-xs text-neutral-500 text-center">
                    و{(items.length - 60).toLocaleString('en-US')} بندًا آخر تجدها كلها في الخطوة التالية
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate('create-proposals')}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
              >
                {partialRead
                  ? `عرض الموردين للبنود المقروءة فقط (${coveredCount} من ${readReport?.expected ?? items.length})`
                  : `عرض الموردين المقترحين (${coveredCount} بندًا لها موردون)`}
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

/**
 * THE WORK, SHOWN HAPPENING.
 *
 * A bar and a percentage said nothing about what Farq was doing for the three
 * minutes of a read. This panel shows it: while the server reads the pages a
 * scanning line runs; once the lines are known they scroll past as they are
 * counted, and every line the matcher answers appears with how many suppliers
 * it found. Everything shown is a real line and a real count from this upload.
 */
export function LiveActivity({ events, reading }: { events: BoqActivity[]; reading: boolean }) {
  const [shown, setShown] = useState<Array<{ key: number; text: string; count?: number }>>([])
  const [readCount, setReadCount] = useState(0)
  const [matched, setMatched] = useState(0)
  const [candidates, setCandidates] = useState(0)
  const [total, setTotal] = useState(0)
  const [samples, setSamples] = useState(1)
  const [pages, setPages] = useState<{ done: number; count: number | null } | null>(null)
  const [serverItems, setServerItems] = useState(0)
  const sawLiveNames = useRef(false)
  const cursor = useRef(0)
  const queue = useRef<Array<{ text: string; count?: number; read?: boolean }>>([])
  // A line matched twice (a retried batch, a resumed read) is counted once:
  // the counter read «2,088 طوبق» against 1,514 lines read.
  const matchedKeys = useRef(new Set<string>())
  const seq = useRef(0)

  useEffect(() => {
    for (; cursor.current < events.length; cursor.current++) {
      const e = events[cursor.current]!
      if (e.kind === 'reading') {
        setPages({ done: e.pagesDone, count: e.pageCount })
        setServerItems(e.itemCount)
        if (e.newNames.length) sawLiveNames.current = true
        const step = Math.max(1, Math.floor(e.newNames.length / 30))
        e.newNames.forEach((name, i) => {
          if (i % step === 0) queue.current.push({ text: name, read: true })
        })
        continue
      }
      if (e.kind === 'read' && sawLiveNames.current) {
        // The lines already scrolled past while the server read them.
        setTotal(e.names.length)
        setServerItems(e.names.length)
        continue
      }
      if (e.kind === 'read') {
        setTotal(e.names.length)
        const step = Math.max(1, Math.floor(e.names.length / 60))
        let n = 0
        e.names.forEach((name, i) => {
          if (i % step === 0 || i === e.names.length - 1) {
            queue.current.push({ text: name, read: true })
            n++
          }
        })
        setSamples(Math.max(1, n))
      } else {
        for (const row of e.rows) {
          const key = row.key || row.name
          if (matchedKeys.current.has(key)) continue
          matchedKeys.current.add(key)
          queue.current.push({ text: row.name, count: row.suppliers })
        }
      }
    }
  }, [events])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const burst = Math.max(1, Math.ceil(queue.current.length / 25))
      for (let i = 0; i < burst; i++) {
        const next = queue.current.shift()
        if (!next) break
        if (next.read) setReadCount((n) => n + 1)
        else {
          setMatched((n) => n + 1)
          setCandidates((n) => n + (next.count || 0))
        }
        const key = ++seq.current
        setShown((prev) => [{ key, text: next.text, count: next.read ? undefined : next.count }, ...prev].slice(0, 6))
      }
    }, 120)
    return () => window.clearInterval(timer)
  }, [])

  const readingLines = (total > 0 || serverItems > 0) && matched === 0
  return (
    <div className="mt-4 rounded-xl border border-[#CFF5DC] bg-[#F3FBF6] px-4 py-3 text-right" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-[#123F3A] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1a7a45] animate-pulse" />
          {reading && total === 0
            ? pages?.count
              ? `نقرأ صفحات الكراسة: صفحة ${Math.min(pages.done, pages.count)} من ${pages.count}…`
              : 'نقرأ صفحات الكراسة ونتعرف على الجدول…'
            : readingLines
              ? 'نقرأ البنود…'
              : 'نبحث في دليل الموردين ونطابق كل بند…'}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <div className="text-lg font-black text-[#123F3A] tabular-nums">{(sawLiveNames.current || serverItems ? serverItems : Math.min(total, Math.round((readCount / samples) * total))).toLocaleString('en-US')}</div>
          <div className="text-[10px] text-neutral-500">بندًا مقروءًا</div>
        </div>
        <div>
          <div className="text-lg font-black text-[#123F3A] tabular-nums">{matched.toLocaleString('en-US')}</div>
          <div className="text-[10px] text-neutral-500">بندًا طوبق</div>
        </div>
        <div>
          <div className="text-lg font-black text-[#123F3A] tabular-nums">{candidates.toLocaleString('en-US')}</div>
          <div className="text-[10px] text-neutral-500">ترشيح مورد</div>
        </div>
      </div>
      <div className="space-y-1 min-h-[132px] overflow-hidden">
        {reading && total === 0 && !shown.length && (
          <div className="h-1 rounded-full bg-[#CFF5DC] overflow-hidden">
            <div className="h-full w-1/3 bg-[#1a7a45] animate-scan" />
          </div>
        )}
        {shown.map((row, i) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-2 text-xs animate-fade-up"
            style={{ opacity: 1 - i * 0.14 }}
          >
            <span className="truncate text-[#0D1F1D]">{row.text}</span>
            {row.count === undefined ? (
              <span className="flex-shrink-0 text-neutral-400">قُرئ</span>
            ) : row.count > 0 ? (
              <span className="flex-shrink-0 font-semibold text-[#1a7a45]">{row.count} موردين ✓</span>
            ) : (
              <span className="flex-shrink-0 text-amber-700">نبحث عن بديل</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
