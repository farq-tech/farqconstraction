import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setPendingUpload } from '../lib/pendingUpload'
import NewRequestButton from '../components/rfqCart/NewRequestButton'
import type { NavProps } from '../types'
import { UploadIcon, ArrowRightIcon, ClockIcon, FileIcon, ChatIcon } from '../icons'
import {
  getConstructionBooklet,
  getConstructionBookletsOverview,
  inboxUnreadConversations,
  listConstructionBooklets,
  listConstructionInboxMessages,
  type ConstructionBookletDetail,
} from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { useFarqSession } from '../api/useFarqSession'
import { loadInboxTab } from '../lib/inboxTabs'
import { formatQuantity } from '../lib/booklet'
import {
  DEADLINE_SOON_MS,
  buildHomeOverview,
  countdownLabel,
  linesWord,
  loadBookletDetails,
  offersWord,
  unitPriceLabel,
  vatLabel,
  visibleLines,
  type AttentionItem,
  type PriceCut,
  type CoverageBuckets,
  type HomeBooklet,
  type HomeLine,
} from '../lib/homeOverview'

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'صباح الخير' : 'مساء الخير'
}

type Inbox = { needsReply: number | null; unread: number | null }

async function loadInbox(): Promise<Inbox> {
  const page = await loadInboxTab('needs_reply')
  let unread = page.unreadThreads
  if (unread == null) {
    unread = await listConstructionInboxMessages()
      .then((p) => inboxUnreadConversations(p).count)
      .catch(() => null)
  }
  return { needsReply: page.counts.needs_reply ?? page.total, unread }
}

/**
 * «الرئيسية»: the booklets (الكراسات) and their lines in one picture — what is
 * covered, what has no quote yet, what is closing. Requests stay under
 * «الطلبات»; nothing here lists them one by one.
 */
export function HomeView({ navigate }: NavProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [details, setDetails] = useState<ConstructionBookletDetail[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [inbox, setInbox] = useState<Inbox>({ needsReply: null, unread: null })
  const [now, setNow] = useState(() => Date.now())
  const { openBooklet } = useProcurement()
  const session = useFarqSession()
  const name = session.user?.displayName?.trim() || ''

  useEffect(() => {
    let cancelled = false
    setState('loading')
    loadBookletDetails({
      overview: getConstructionBookletsOverview,
      list: listConstructionBooklets,
      detail: getConstructionBooklet,
    })
      .then((result) => {
        if (cancelled) return
        setDetails(result)
        setNow(Date.now())
        setState('ok')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    loadInbox()
      .then((result) => {
        if (!cancelled) setInbox(result)
      })
      .catch(() => {
        if (!cancelled) setInbox({ needsReply: null, unread: null })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Countdowns move on their own.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const overview = useMemo(() => buildHomeOverview(details, now), [details, now])
  const { totals, booklets, attention, priceCuts } = overview
  const pickFile = () => inputRef.current?.click()
  const open = useCallback((id: string) => (id ? openBooklet(id) : navigate('booklets')), [openBooklet, navigate])
  const hasBooklets = state === 'ok' && details.length > 0

  return (
    <div
      className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-8"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        setPendingUpload(e.dataTransfer.files?.[0])
        navigate('create-upload')
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          setPendingUpload(e.target.files?.[0])
          navigate('create-upload')
        }}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">
            {greeting()}
            {name ? `، ${name}` : ''}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {hasBooklets
              ? 'كراسات قيد التسعير أو بانتظار قرار: تغطية البنود والعروض المستلمة.'
              : 'ارفع كراسة وسنقرأ البنود ونقترح لكل بند موردين مناسبين.'}
          </p>
        </div>
        <NewRequestButton onPickFile={pickFile} onStart={() => navigate('create-upload')} />
      </div>

      {dragging && (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-[#123F3A] bg-[#f0faf7] py-10 text-center text-sm font-bold text-[#123F3A]">
          أفلت الكراسة هنا لنبدأ القراءة
        </div>
      )}

      {state === 'loading' ? (
        <div className="text-center py-20 text-sm text-neutral-500">جارٍ تحميل الكراسات…</div>
      ) : state === 'error' ? (
        <div className="text-center py-16 bg-white border border-neutral-100 rounded-2xl">
          <div className="font-semibold text-[#0D1F1D] mb-1">تعذّر تحميل الكراسات</div>
          <p className="text-sm text-neutral-500 mb-4">هذا فشل في القراءة، وليس دليلًا على عدم وجود عروض.</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="px-4 py-2 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
            أعد المحاولة
          </button>
        </div>
      ) : details.length === 0 ? (
        <>
          <button
            type="button"
            onClick={pickFile}
            className="w-full rounded-2xl border-2 border-dashed border-neutral-200 bg-white hover:border-[#123F3A]/40 hover:bg-[#f0faf7]/50 transition-all py-16 px-8 flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
              <UploadIcon className="w-8 h-8 text-[#123F3A]" />
            </div>
            <div className="text-xl font-bold text-[#0D1F1D] mb-2">ارفع أول كراسة</div>
            <p className="text-neutral-500 text-sm text-center max-w-sm">
              ملف PDF لجدول الكميات. نقرأ البنود خلال دقائق، ونختار لكل بند عشرة موردين، وترسل لهم بضغطة.
            </p>
          </button>
          <InboxHint inbox={inbox} onOpen={() => navigate('inbox')} onRequests={() => navigate('rfq-list')} />
        </>
      ) : (
        <>
          <StatStrip
            totals={totals}
            inbox={inbox}
            now={now}
            onInbox={() => navigate('inbox')}
            onBooklet={open}
          />

          {booklets.length === 0 ? (
            <div className="rounded-2xl border border-neutral-100 bg-white py-10 text-center text-sm text-neutral-500">
              لا كراسات بانتظار متابعة — تمت ترسيتها أو إلغاؤها.
              <button onClick={() => navigate('booklets')} className="mt-3 flex items-center gap-1 mx-auto text-[#123F3A] font-semibold">
                <FileIcon className="w-4 h-4" /> كل الكراسات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#0D1F1D] flex items-center gap-2">
                    <FileIcon className="w-4 h-4 text-[#123F3A]" />
                    الكراسات قيد المتابعة
                    <span className="text-xs font-semibold text-neutral-400">({booklets.length})</span>
                  </h2>
                  <button
                    onClick={() => navigate('booklets')}
                    className="text-sm text-[#123F3A] font-semibold hover:underline flex items-center gap-1"
                  >
                    كل الكراسات <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
                {booklets.map((b) => (
                  <BookletCard key={b.id || b.reference} card={b} now={now} onOpen={() => open(b.id)} />
                ))}
              </div>
              <aside className="order-1 lg:order-2 space-y-4">
                <AttentionPanel items={attention} now={now} onOpen={open} />
                {priceCuts.length > 0 && <PriceCutsPanel cuts={priceCuts} now={now} onOpen={open} />}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Top strip ────────────────────────────────────────────────────────────

function StatStrip({
  totals,
  inbox,
  now,
  onInbox,
  onBooklet,
}: {
  totals: ReturnType<typeof buildHomeOverview>['totals']
  inbox: Inbox
  now: number
  onInbox: () => void
  onBooklet: (id: string) => void
}) {
  const nearest = totals.nearestDeadline
  const nearSoon = nearest != null && nearest.at - now <= DEADLINE_SOON_MS
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-6">
      <Stat value={totals.activeBooklets} label="كراسات قيد المتابعة" />
      <Stat value={totals.linesTotal} label="بنود" />
      <Stat
        value={`${totals.coveragePercent}%`}
        label="بنود لها عرض"
        sub={`${totals.linesWithQuotes} من ${totals.linesTotal}`}
        tone={totals.linesWithQuotes ? 'green' : undefined}
      />
      <Stat
        value={totals.linesWithoutQuotes}
        label="بنود بدون عروض"
        sub={totals.linesTotal === 0 ? 'لا توجد بنود ضمن النطاق' : totals.linesWithoutQuotes ? 'تحتاج متابعة' : 'كل البنود مغطاة'}
        tone={totals.linesWithoutQuotes ? 'amber' : undefined}
      />
      <Stat value={totals.quotesLast24h} label="عروض آخر 24 ساعة" tone={totals.quotesLast24h ? 'green' : undefined} />
      <Stat
        value={inbox.needsReply ?? '—'}
        label="محادثات تنتظر ردك"
        sub={inbox.unread ? `${inbox.unread} غير مقروءة` : undefined}
        tone={inbox.needsReply ? 'blue' : undefined}
        onClick={onInbox}
      />
      <Stat
        value={nearest ? countdownLabel(nearest.at, now).replace('متبقٍ ', '') : '—'}
        label="أقرب إغلاق للعروض"
        sub={nearest ? nearest.reference : 'لا موعد محدد'}
        tone={nearSoon ? 'red' : undefined}
        small
        onClick={nearest ? () => onBooklet(nearest.bookletId) : undefined}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  )
}

function Stat({
  value,
  label,
  sub,
  tone,
  small,
  onClick,
  className = '',
}: {
  value: number | string
  label: string
  sub?: string
  tone?: 'green' | 'amber' | 'blue' | 'red'
  small?: boolean
  onClick?: () => void
  className?: string
}) {
  const box = {
    green: 'bg-[#f0faf7] border-[#123F3A]/15',
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-[#eef4fb] border-[#2F6CB5]/20',
    red: 'bg-red-50 border-red-200',
  }
  const text = { green: 'text-[#1a7a45]', amber: 'text-amber-700', blue: 'text-[#2F6CB5]', red: 'text-red-600' }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`rounded-2xl border px-3 py-3 text-right ${tone ? box[tone] : 'bg-white border-neutral-100'} ${
        onClick ? 'hover:shadow-sm transition-shadow' : ''
      } ${className}`}
    >
      <div
        className={`${small ? 'text-lg' : 'text-2xl'} font-black tabular-nums leading-tight ${tone ? text[tone] : 'text-[#0D1F1D]'}`}
      >
        {value}
      </div>
      <div className="text-xs font-bold text-[#0D1F1D] mt-1">{label}</div>
      {sub && (
        <div className="text-[11px] text-neutral-500 mt-0.5 truncate" dir="auto">
          {sub}
        </div>
      )}
    </Tag>
  )
}

// ── Booklet card ─────────────────────────────────────────────────────────

function CoverageBar({ buckets, total }: { buckets: CoverageBuckets; total: number }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-neutral-100" role="img" aria-label="تغطية البنود بالعروض">
        {buckets.many > 0 && <div className="bg-[#1a7a45]" style={{ width: `${pct(buckets.many)}%` }} />}
        {buckets.few > 0 && <div className="bg-[#7cc79a]" style={{ width: `${pct(buckets.few)}%` }} />}
        {buckets.none > 0 && <div className="bg-amber-400" style={{ width: `${pct(buckets.none)}%` }} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-neutral-600">
        <Legend color="bg-[#1a7a45]" label={`3 عروض فأكثر: ${buckets.many}`} />
        <Legend color="bg-[#7cc79a]" label={`عرض أو عرضان: ${buckets.few}`} />
        <Legend color="bg-amber-400" label={`بدون عروض: ${buckets.none}`} strong={buckets.none > 0} />
      </div>
    </div>
  )
}

function Legend({ color, label, strong }: { color: string; label: string; strong?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${strong ? 'font-bold text-amber-800' : ''}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}

function BookletCard({ card, now, onOpen }: { card: HomeBooklet; now: number; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const soon = card.deadlineAt != null && !card.deadlinePassed && card.deadlineAt - now <= DEADLINE_SOON_MS
  const lines = visibleLines(card.lines, expanded)
  const hidden = card.lines.length - lines.length
  return (
    <section className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
              <span dir="ltr" className="font-mono font-bold text-[#123F3A] bg-[#f0faf7] px-2 py-0.5 rounded-md">
                {card.reference}
              </span>
              <span className="px-2 py-0.5 rounded-full font-semibold bg-neutral-100 text-neutral-600">
                {card.waves} {card.waves === 1 ? 'دفعة' : card.waves === 2 ? 'دفعتان' : 'دفعات'}
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${
                  card.deadlinePassed
                    ? 'bg-neutral-100 text-neutral-500'
                    : soon
                      ? 'bg-red-50 text-red-700'
                      : card.deadlineAt != null
                        ? 'bg-[#eef4fb] text-[#2F6CB5]'
                        : 'bg-neutral-50 text-neutral-400'
                }`}
                title={card.deadlineLabel || undefined}
              >
                <ClockIcon className="w-3 h-3" />
                {card.awaitingDecision ? 'أُغلق الاستلام — راجع العروض لاتخاذ القرار' : card.deadlineAt != null ? countdownLabel(card.deadlineAt, now) : 'لم يُحدَّد موعد الإغلاق'}
              </span>
            </div>
            <h3 className="font-black text-[#0D1F1D] leading-snug">{card.title || card.reference}</h3>
          </div>
          <button
            onClick={onOpen}
            className="shrink-0 hidden sm:flex items-center gap-1 px-3 py-1.5 border border-neutral-200 text-[#123F3A] font-bold rounded-lg text-xs hover:bg-neutral-50"
          >
            المقارنة الكاملة <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-semibold text-[#0D1F1D]">
              {card.linesWithQuotes} من {card.linesTotal} بنود لها عرض
            </span>
            {card.quotesLast24h > 0 && (
              <span className="text-[#1a7a45] font-semibold">+{card.quotesLast24h} عروض خلال 24 ساعة</span>
            )}
          </div>
          <CoverageBar buckets={card.buckets} total={card.linesTotal} />
        </div>
      </div>

      {card.lines.length === 0 ? (
        <div className="px-4 py-4 text-xs text-neutral-500 border-t border-neutral-50">لم تصل بنود هذه الكراسة من الخادم.</div>
      ) : (
        <div className="border-t border-neutral-100">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_90px_minmax(0,210px)] gap-3 px-4 py-2 text-[11px] font-bold text-neutral-400 bg-neutral-50/60">
            <span>البند</span>
            <span>الكمية</span>
            <span>العروض</span>
            <span>الأقل سعرًا للوحدة</span>
          </div>
          <ul className="divide-y divide-neutral-50">
            {lines.map((line) => (
              <LineRow key={line.key} line={line} />
            ))}
          </ul>
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full py-2.5 text-xs font-bold text-[#123F3A] hover:bg-neutral-50 border-t border-neutral-50"
            >
              عرض كل البنود ({card.lines.length})
            </button>
          )}
        </div>
      )}
      <button
        onClick={onOpen}
        className="sm:hidden w-full py-3 text-sm font-bold text-[#123F3A] border-t border-neutral-100 flex items-center justify-center gap-1"
      >
        المقارنة الكاملة <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
      </button>
    </section>
  )
}

function LineRow({ line }: { line: HomeLine }) {
  const none = line.offers === 0
  return (
    <li
      className={`px-4 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_110px_90px_minmax(0,210px)] gap-x-3 gap-y-1 items-center text-sm ${
        none ? 'bg-amber-50/50' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="font-semibold text-[#0D1F1D] sm:truncate" title={line.bookletName || line.name}>
          {line.position != null && <span className="text-neutral-400 tabular-nums me-1">{line.position}.</span>}
          {line.name}
        </div>
        {line.bookletName && <div className="text-[11px] text-neutral-400 truncate">{line.bookletName}</div>}
      </div>
      <div className="text-xs text-neutral-500 tabular-nums text-left sm:text-right">{formatQuantity(line.quantity, line.uom)}</div>
      <div>
        {none ? (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">بدون عروض</span>
        ) : (
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
              line.offers >= 3 ? 'bg-[#e3f4ea] text-[#1a7a45]' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            {offersWord(line.offers)}
          </span>
        )}
      </div>
      <div className="min-w-0 text-left sm:text-right">
        {line.best ? (
          <>
            <div className="flex flex-wrap items-center gap-1 sm:justify-start justify-end">
              <span className="font-bold text-[#1a7a45] tabular-nums whitespace-nowrap">{unitPriceLabel(line.best.unitPrice, line.best.currency)}</span>
              {line.best.cutPercent != null && <CutChip percent={line.best.cutPercent} />}
              <span
                className={`text-[10px] font-semibold px-1.5 py-px rounded whitespace-nowrap ${
                  line.best.vat === 'unknown' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {vatLabel(line.best.vat)}
              </span>
            </div>
            <div className="text-[11px] text-neutral-500 truncate">
              {line.best.supplierName}
              {line.best.needsReview && <span className="text-amber-700 font-semibold"> · يحتاج مراجعة</span>}
              {line.best.fromChat && <span className="text-[#2F6CB5] font-semibold" title="سعر سجّلته فرق من رسالة المورد"> · من المحادثة</span>}
            </div>
          </>
        ) : none ? (
          <span className="text-xs text-neutral-400">—</span>
        ) : (
          <span className="text-xs text-neutral-400">لا يوجد سعر وحدة مسجّل بالريال</span>
        )}
      </div>
    </li>
  )
}

// ── Needs attention ──────────────────────────────────────────────────────

function CutChip({ percent }: { percent: number }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] font-bold px-1.5 py-px rounded bg-[#e3f4ea] text-[#1a7a45] tabular-nums" title="خفّض المورد سعره في نسخة أحدث من عرضه">
      خفّض <bdi dir="ltr">{formatPercent(percent)}</bdi>
    </span>
  )
}

function formatPercent(p: number): string {
  return `${p.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

function agoLabel(at: number | null, now: number): string | null {
  if (at == null) return null
  const h = Math.floor((now - at) / 3_600_000)
  if (h < 1) return 'قبل أقل من ساعة'
  if (h < 24) return `قبل ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ${h <= 10 ? 'ساعات' : 'ساعة'}`}`
  const d = Math.floor(h / 24)
  return `قبل ${d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} ${d <= 10 ? 'أيام' : 'يومًا'}`}`
}

const MONEY = (n: number, currency: string) =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency.toUpperCase() === 'SAR' ? 'ريال' : currency}`

/** «موردون خفّضوا أسعارهم»: newest first. Rendered only when there is one. */
function PriceCutsPanel({ cuts, now, onOpen }: { cuts: PriceCut[]; now: number; onOpen: (id: string) => void }) {
  return (
    <section className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
      <h2 className="px-4 pt-4 pb-2 text-base font-bold text-[#0D1F1D]">
        تغيرات أسعار الموردين
        <span className="text-xs font-semibold text-neutral-400 ms-1">({cuts.length})</span>
      </h2>
      <ul className="divide-y divide-neutral-50">
        {cuts.map((c) => {
          const sameVat = c.oldVat === c.newVat
          return (
            <li key={`${c.bookletId}-${c.lineKey}-${c.supplierId}`}>
              <button onClick={() => onOpen(c.bookletId)} className="w-full text-right px-4 py-3 hover:bg-neutral-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#0D1F1D] truncate">{c.supplierName}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {c.lineName} · <Ref value={c.reference} />
                    </div>
                  </div>
                  {c.needsConfirmation ? <span className="text-xs font-bold text-amber-800">تغير كبير — يحتاج تأكيد</span> : <CutChip percent={c.percent} />}
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm tabular-nums">
                  <span className="text-neutral-400 line-through">{unitPriceLabel(c.oldPrice, c.currency)}</span>
                  {!sameVat && <span className="text-[10px] text-neutral-400">{vatLabel(c.oldVat)}</span>}
                  <span className="text-neutral-400">←</span>
                  <span className="font-bold text-[#1a7a45]">{unitPriceLabel(c.newPrice, c.currency)}</span>
                  <span className="text-[10px] text-neutral-400">{vatLabel(c.newVat)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                  {c.lineAmount != null && (
                    <span>
                      فرق بالقيمة <span className="font-bold text-[#0D1F1D] tabular-nums">{MONEY(c.lineAmount, c.currency)}</span> على{' '}
                      {formatQuantity(c.quantity, c.uom)}
                    </span>
                  )}
                  {c.needsConfirmation && <span className="text-amber-800">قد يكون تصحيح سعر أو وحدة؛ لا يُحسب كتوفير قبل التأكيد.</span>}
                  {c.cheapestNow ? (
                    <span className="px-1.5 py-px rounded bg-[#1a7a45] text-white font-bold">صار الأرخص</span>
                  ) : (
                    <span className="px-1.5 py-px rounded bg-neutral-100 text-neutral-600 font-semibold">ليس الأرخص بعد</span>
                  )}
                  {c.fromChat && <span className="text-[#2F6CB5] font-semibold">من المحادثة</span>}
                  {agoLabel(c.at, now) && <span className="text-neutral-400">{agoLabel(c.at, now)}</span>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AttentionPanel({ items, now, onOpen }: { items: AttentionItem[]; now: number; onOpen: (id: string) => void }) {
  return (
    <section className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
      <h2 className="px-4 pt-4 pb-2 text-base font-bold text-[#0D1F1D]">
        يحتاج انتباهك
        {items.length > 0 && <span className="text-xs font-semibold text-neutral-400 ms-1">({items.length})</span>}
      </h2>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-neutral-500">لا توجد تنبيهات متابعة ضمن هذا النطاق. راجع حالة الكراسات والعروض قبل اتخاذ القرار.</p>
      ) : (
        <ul className="divide-y divide-neutral-50">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.bookletId}-${i}`}>
              <button onClick={() => onOpen(item.bookletId)} className="w-full text-right px-4 py-3 hover:bg-neutral-50 flex gap-3">
                <AttentionDot kind={item.kind} />
                <div className="min-w-0 text-sm">
                  <AttentionText item={item} now={now} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AttentionDot({ kind }: { kind: AttentionItem['kind'] }) {
  const cls = {
    deadline: 'bg-red-50 text-red-600',
    no_quotes: 'bg-amber-50 text-amber-700',
    from_chat: 'bg-[#eef4fb] text-[#2F6CB5]',
  }[kind]
  const Icon = kind === 'from_chat' ? ChatIcon : kind === 'no_quotes' ? FileIcon : ClockIcon
  return (
    <span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${cls}`}>
      <Icon className="w-4 h-4" />
    </span>
  )
}

function Ref({ value }: { value: string }) {
  return (
    <span dir="ltr" className="font-mono text-[11px] font-bold text-[#123F3A]">
      {value}
    </span>
  )
}

function AttentionText({ item, now }: { item: AttentionItem; now: number }) {
  switch (item.kind) {
    case 'deadline':
      return (
        <>
          <div className="font-bold text-red-700">يغلق استقبال العروض: {countdownLabel(item.at, now)}</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            <Ref value={item.reference} /> · <span dir="auto">{item.label}</span>
          </div>
        </>
      )
    case 'no_quotes':
      return (
        <>
          <div className="font-bold text-[#0D1F1D]">
            {linesWord(item.count)} بدون عروض <span className="font-normal text-neutral-400">في</span> <Ref value={item.reference} />
          </div>
          <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.lines.join('، ')}</div>
        </>
      )
    case 'from_chat':
      return (
        <>
          <div className="font-bold text-[#0D1F1D]">سعر سجّلته فرق من المحادثة</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {item.supplierName} · {linesWord(item.lines)} · <Ref value={item.reference} /> — راجعه قبل الاعتماد
          </div>
        </>
      )
  }
}

function InboxHint({ inbox, onOpen, onRequests }: { inbox: Inbox; onOpen: () => void; onRequests: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
      {inbox.needsReply ? (
        <button onClick={onOpen} className="flex items-center gap-1 text-[#2F6CB5] font-semibold">
          <ChatIcon className="w-4 h-4" /> {inbox.needsReply} محادثات تنتظر ردك
        </button>
      ) : null}
      <button onClick={onRequests} className="flex items-center gap-1 text-[#123F3A] font-semibold">
        <FileIcon className="w-4 h-4" /> الطلبات
      </button>
    </div>
  )
}

export default HomeView
