import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { NavProps } from '../types'
import FarqWordmark from '../components/FarqWordmark'
import { companyBrand, type CompanyBrand } from '../lib/companyBranding'
import {
  ConstructionApiError,
  formatArDate,
  getConstructionComparison,
  getConstructionMe,
  getConstructionReports,
  type ConstructionReports,
} from '../api/constructionClient'
import {
  briefLinesFromComparison,
  buildExecutiveBrief,
  type BriefLine,
  type BriefProject,
  type ExecutiveBrief,
} from '../lib/executiveBrief'
import { briefShareUrl, briefTokenFromHash, decodeBrief, encodeBrief, type SharedBrief } from '../lib/briefShare'

/**
 * «العرض التنفيذي» — the short version for management: each item, the prices
 * suppliers gave for it, side by side. It reads the same live records as the
 * reports and the request file; nothing on it is typed in or estimated, and a
 * price wildly off its peers is left out rather than compared.
 */

/** ITF Huwiya Arabic — Farq's own typeface. */
const FONT: CSSProperties = { fontFamily: "'ITF Huwiya Arabic', 'Cairo', system-ui, sans-serif" }

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
function cur(code: string): string {
  return code === 'SAR' || !code ? 'ريال' : code
}
/** «سعر واحد» · «سعران» · «5 أسعار» · «12 سعرًا». */
function count(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  return `${fmt(n)} ${n >= 3 && n <= 10 ? few : many}`
}

/* ── motion ──────────────────────────────────────────────────────────── */

/** True once the element has been on screen; a reveal plays once. */
function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true)
        io.disconnect()
      }
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [inView, threshold])
  return [ref, inView] as const
}

function d(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties
}

function R({ delay = 0, className = '', children }: { delay?: number; className?: string; children: ReactNode }) {
  return <div className={`brief-reveal ${className}`} style={d(delay)}>{children}</div>
}

function CountUp({ value, run }: { value: number; run: boolean }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!run) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1600)
      setShown(value * (1 - Math.pow(1 - t, 4)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, value])
  return <span className="tabular-nums">{fmt(shown)}</span>
}

/** The cover's backdrop: a site plan drawing itself, then drifting slowly. */
function Blueprint() {
  const lines = ['M0 120 H1400', 'M0 260 H1400', 'M0 400 H1400', 'M0 540 H1400', 'M0 680 H1400', 'M180 0 V800', 'M420 0 V800', 'M660 0 V800', 'M900 0 V800', 'M1140 0 V800']
  return (
    <svg aria-hidden className="absolute inset-0 w-[calc(100%+80px)] h-full brief-drift" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
      {lines.map((p, i) => (
        <path key={p} d={p} pathLength={1} className="brief-draw" style={d(i * 90)} stroke="#CFF5DC" strokeOpacity="0.08" strokeWidth="1" fill="none" />
      ))}
      <path d="M420 260 H900 V540 H420 Z" pathLength={1} className="brief-draw" style={d(700)} stroke="#CFF5DC" strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
      <path d="M660 260 V540 M420 400 H900" pathLength={1} className="brief-draw" style={d(1100)} stroke="#CFF5DC" strokeOpacity="0.18" strokeWidth="1" fill="none" />
      <circle cx="660" cy="400" r="160" className="brief-glow" fill="url(#brief-halo)" />
      <defs>
        <radialGradient id="brief-halo">
          <stop offset="0%" stopColor="#CFF5DC" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#CFF5DC" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/* ── one item: every supplier's price as a bar, the lowest first ─────── */

function ItemCard({ line }: { line: BriefLine }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2)
  const unit = cur(line.currency)
  const max = line.highest.unitPrice
  const compared = line.offers.length > 1
  return (
    <div ref={ref} data-in={inView ? 'true' : 'false'} className="break-inside-avoid">
    <div className="brief-reveal h-full bg-white rounded-3xl border border-[#123F3A]/8 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-[16px] leading-relaxed text-[#0D1F1D]">{line.name}</h3>
          <div className="text-xs text-neutral-400 mt-0.5 tabular-nums">{fmt(line.quantity, 2)} {line.uom}</div>
        </div>
        {compared ? (
          <div className="shrink-0 text-left">
            <div className="text-[11px] text-neutral-400">الوفر بالأقل</div>
            <div className="text-lg font-extrabold text-[#1a5c54] tabular-nums leading-tight">{fmt(line.spreadValue)} <span className="text-xs">{unit}</span></div>
            <div className="text-[11px] font-bold text-[#1a5c54]/70 tabular-nums">{line.spreadPercent}%</div>
          </div>
        ) : (
          <span className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">عرض واحد</span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {line.offers.map((o, i) => {
          const best = i === 0 && compared
          const worst = compared && i === line.offers.length - 1
          return (
            <div key={o.supplierId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`truncate ${best ? 'font-extrabold text-[#0B2A26]' : 'text-neutral-600'}`}>
                  {o.supplierName}
                  {best && <span className="ms-2 text-[10px] font-bold bg-[#CFF5DC] text-[#0B2A26] rounded-full px-2 py-0.5 align-middle">الأقل</span>}
                </span>
                <span className={`tabular-nums whitespace-nowrap ${best ? 'font-extrabold text-[#0B2A26]' : 'font-bold text-neutral-700'}`}>
                  {fmt(o.unitPrice, 2)} <span className="text-[10px] font-normal text-neutral-400">{unit}/{line.uom || 'وحدة'}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-[#123F3A]/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full brief-grow"
                  style={{ width: `${Math.max(4, (o.unitPrice / max) * 100)}%`, background: best ? '#123F3A' : worst ? '#E3BFAE' : '#B9C7C0', ...d(200 + i * 140) }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {line.mixedTaxBasis && <div className="mt-3 text-[11px] text-amber-700">تنبيه: العروض لا تتفق في شمول الضريبة.</div>}
    </div>
    </div>
  )
}

/** The cover: whose brief this is, and the three numbers that sum it up. */
function Cover({ brand, today, brief, unit }: { brand: CompanyBrand | null; today: string; brief: ExecutiveBrief; unit: string }) {
  const [ref, inView] = useInView<HTMLElement>(0.2)
  return (
  <section ref={ref} data-in={inView ? 'true' : 'false'} className="relative min-h-svh flex flex-col justify-center overflow-hidden bg-[#0B2A26] text-white px-5 sm:px-10 lg:px-20 py-20 print:min-h-0 print:break-after-page">
    <Blueprint />
    <div className="relative max-w-5xl">
      <R delay={200} className="flex items-center gap-5 mb-12">
        <FarqWordmark className="h-9 sm:h-11 bg-[#CFF5DC]" />
        {brand && (
          <>
            <span className="h-10 w-px bg-white/20" />
            <span className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-1.5">
              <img src={brand.logo} alt={brand.nameAr} className="h-full w-full object-contain" />
            </span>
          </>
        )}
      </R>
      <R delay={450}><div className="text-xs font-bold text-[#CFF5DC]/80">{brand?.nameAr || 'مقارنة الأسعار'} · {today}</div></R>
      <R delay={650}>
        <h1 className="mt-4 text-4xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.25]">
          كم سعّر الموردون
          <span className="block text-[#CFF5DC]">كل بند؟</span>
        </h1>
      </R>
      <R delay={950} className="mt-12 grid grid-cols-3 gap-6 max-w-2xl">
        {([[brief.pricedLines, 'بند مسعّر'], [brief.suppliers.length, 'مورد'], [brief.spreadTotal, `${unit} وفر بالأقل`]] as Array<[number, string]>).map(([n, l]) => (
          <div key={l}>
            <div className="text-3xl sm:text-5xl font-extrabold text-white"><CountUp value={n} run={inView} /></div>
            <div className="text-xs sm:text-sm mt-1 text-white/60">{l}</div>
          </div>
        ))}
      </R>
    </div>
    <R delay={1600} className="absolute bottom-8 inset-x-0 text-center text-[11px] text-white/40">↓ مرّر للمقارنة</R>
  </section>
  )
}

/* ── the view ─────────────────────────────────────────────────────────── */

type Load =
  | { phase: 'loading'; done: number; total: number }
  | { phase: 'error'; message: string; signIn: boolean }
  | { phase: 'ready'; brief: ExecutiveBrief; failed: number }

function projectTitle(p: ConstructionReports['projects'][number]): string {
  return (p.site_address || '').trim() || p.city || 'طلب تسعير'
}

export function ExecutiveBriefView({ navigate }: NavProps) {
  const [brand, setBrand] = useState<CompanyBrand | null>(null)
  const [load, setLoad] = useState<Load>({ phase: 'loading', done: 0, total: 0 })
  const [reload, setReload] = useState(0)
  const [shared, setShared] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle')
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getConstructionMe().then((me) => alive && setBrand(companyBrand(me.scope_owner_user_id))).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    setLoad({ phase: 'loading', done: 0, total: 0 })
    ;(async () => {
      const reports = await getConstructionReports({})
      const names = new Map(reports.suppliers.map((s) => [s.id, String(s.name_ar || s.name_en || '').trim()]))
      const targets = reports.projects.filter((p) => p.priced_lines > 0)
      if (!alive) return
      setLoad({ phase: 'loading', done: 0, total: targets.length })
      const projects: BriefProject[] = new Array(targets.length)
      let failed = 0
      let done = 0
      let next = 0
      // Two at a time: fast enough for a portfolio, gentle on the API's rate limit.
      const worker = async () => {
        while (alive && next < targets.length) {
          const i = next++
          const p = targets[i]
          try {
            const comparison = await getConstructionComparison(p.id)
            projects[i] = { rfqId: p.id, title: projectTitle(p), lines: briefLinesFromComparison(comparison, projectTitle(p), names) }
          } catch {
            failed += 1
            projects[i] = { rfqId: p.id, title: projectTitle(p), lines: [] }
          }
          done += 1
          if (alive) setLoad({ phase: 'loading', done, total: targets.length })
        }
      }
      await Promise.all([worker(), worker()])
      if (!alive) return
      setLoad({ phase: 'ready', brief: buildExecutiveBrief(projects), failed })
    })().catch((e) => {
      if (!alive) return
      const signIn = e instanceof ConstructionApiError && (e.status === 401 || e.status === 403)
      setLoad({
        phase: 'error',
        signIn,
        message: signIn ? 'سجّل الدخول بحساب شركتك ليُبنى العرض من بياناتها.' : e instanceof ConstructionApiError ? e.message : 'تعذّر بناء العرض من البيانات. أعد المحاولة بعد قليل.',
      })
    })
    return () => {
      alive = false
    }
  }, [reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('reports')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const back = <button onClick={() => navigate('reports')} className={CHIP}>← العودة للتقارير</button>

  if (load.phase !== 'ready') {
    const pct = load.phase === 'loading' && load.total ? load.done / load.total : 0
    return (
      <BriefScreen actions={back}>
        {load.phase === 'loading' ? (
          <>
            <div className="text-sm text-white/70">{load.total ? `نجمع الأسعار — ${load.done} من ${load.total}` : 'نقرأ عروض الموردين…'}</div>
            <div className="mt-4 h-[3px] w-56 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#CFF5DC] transition-[width] duration-500" style={{ width: `${Math.max(6, pct * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-white/85 max-w-md">{load.message}</p>
            <button onClick={() => (load.signIn ? navigate('login') : setReload((n) => n + 1))} className="mt-6 px-5 py-2 rounded-full bg-[#CFF5DC] text-[#0B2A26] text-sm font-extrabold">
              {load.signIn ? 'تسجيل الدخول' : 'أعد المحاولة'}
            </button>
          </>
        )}
      </BriefScreen>
    )
  }

  const { brief, failed } = load
  // The public link: the comparison travels inside it, so it opens for anyone.
  const share = async () => {
    if (!window.confirm('الرابط العام يفتح هذه المقارنة لأي شخص يصله — بأسعار الموردين وأسمائهم — بدون تسجيل دخول. أنشئه؟')) return
    setShared('working')
    let url: string | null = null
    try {
      url = briefShareUrl(window.location.origin, await encodeBrief(brief, brand, new Date().toISOString()))
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared(url ? 'failed' : 'idle')
    }
  }

  return (
    <BriefPage
      brief={brief}
      brand={brand}
      takenAt={new Date().toISOString()}
      note={failed > 0 ? `تعذّر تحميل ${failed} مشروع.` : null}
      start={back}
      end={
        <>
          <button onClick={() => void share()} disabled={shared === 'working'} className={`${CHIP} !bg-[#CFF5DC] !text-[#0B2A26]`}>
            {shared === 'copied' ? 'نُسخ الرابط ✓' : shared === 'working' ? 'يُجهَّز…' : 'رابط عام'}
          </button>
          <button onClick={() => window.print()} className={CHIP}>حفظ PDF</button>
        </>
      }
      banner={shared === 'failed' && shareUrl ? (
        <div className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-xl rounded-2xl bg-[#0B2A26] text-white p-3 text-xs shadow-xl print:hidden">
          <div className="mb-1.5 text-white/70">لم يُنسخ تلقائيًا — انسخ الرابط من هنا:</div>
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} dir="ltr" className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-[11px]" />
        </div>
      ) : null}
    />
  )
}

/* ── the public page: the same comparison, opened from its link ────────── */

/** `?view=brief-share#d=…` — no session, no API: everything is in the link. */
export function SharedBriefView() {
  const [state, setState] = useState<{ ok: true; data: SharedBrief } | { ok: false } | null>(null)
  useEffect(() => {
    const token = briefTokenFromHash(window.location.hash)
    if (!token) {
      setState({ ok: false })
      return
    }
    decodeBrief(token).then((data) => setState({ ok: true, data })).catch(() => setState({ ok: false }))
  }, [])

  if (!state) return <BriefScreen><div className="text-sm text-white/70">نفتح المقارنة…</div></BriefScreen>
  if (!state.ok) {
    return (
      <BriefScreen>
        <p className="text-base text-white/85 max-w-md">هذا الرابط غير مكتمل أو تالف. اطلب من مُرسله نسخه كاملًا.</p>
      </BriefScreen>
    )
  }
  const { brief, brand, takenAt } = state.data
  return <BriefPage brief={brief} brand={brand} takenAt={takenAt} end={<button onClick={() => window.print()} className={CHIP}>حفظ PDF</button>} />
}

/* ── shared layout ────────────────────────────────────────────────────── */

const CHIP = 'text-xs font-bold px-3 py-1.5 rounded-full bg-[#0B2A26]/80 text-white backdrop-blur hover:bg-[#0B2A26] transition-colors disabled:opacity-60'

/** The dark full-screen state: loading, an error, a bad link. */
function BriefScreen({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <div dir="rtl" style={FONT} className="fixed inset-0 bg-[#0B2A26] text-white flex flex-col items-center justify-center px-6 text-center">
      {actions && <div className="fixed top-0 inset-x-0 flex justify-between px-4 sm:px-6 py-3">{actions}</div>}
      <FarqWordmark className="h-10 bg-[#CFF5DC] mb-8 animate-pulse-dot" />
      {children}
    </div>
  )
}

function BriefPage({ brief, brand, takenAt, start, end, note, banner }: {
  brief: ExecutiveBrief
  brand: CompanyBrand | null
  takenAt: string
  start?: ReactNode
  end?: ReactNode
  note?: string | null
  banner?: ReactNode
}) {
  const [progress, setProgress] = useState(0)
  // Items with a real comparison first, the biggest saving on top.
  const projects = useMemo(() => {
    const compared = (l: BriefLine) => (l.offers.length > 1 ? 1 : 0)
    return brief.projects.map((p) => ({ ...p, lines: [...p.lines].sort((a, b) => compared(b) - compared(a) || b.spreadValue - a.spreadValue) }))
  }, [brief])
  const today = formatArDate(takenAt || new Date().toISOString())
  const unit = cur(brief.currency)
  const setAside = [
    brief.excludedPrices ? count(brief.excludedPrices, 'سعر واحد', 'سعران', 'أسعار', 'سعرًا') : '',
    brief.excludedLines ? count(brief.excludedLines, 'بند واحد', 'بندان', 'بنود', 'بندًا') : '',
  ].filter(Boolean)

  return (
    <div
      dir="rtl"
      style={FONT}
      onScroll={(e) => {
        const el = e.currentTarget
        setProgress(el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0)
      }}
      className="fixed inset-0 overflow-y-auto scroll-smooth bg-[#FAFAF8] text-[#0D1F1D] print:static print:overflow-visible"
    >
      <div className="fixed top-0 inset-x-0 z-40 print:hidden">
        <div className="h-[2px] bg-[#CFF5DC] origin-right" style={{ transform: `scaleX(${progress})` }} />
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3">
          <div>{start}</div>
          <div className="flex gap-2">{end}</div>
        </div>
      </div>

      <Cover brand={brand} today={today} brief={brief} unit={unit} />

      {/* the items */}
      <main className="px-4 sm:px-10 lg:px-20 py-14 max-w-7xl mx-auto">
        {projects.map((p) => (
          <section key={p.rfqId} className="mb-14">
            {projects.length > 1 && (
              <h2 className="mb-5 text-xl sm:text-2xl font-extrabold text-[#123F3A] flex items-center gap-3">
                <span className="h-px w-8 bg-[#123F3A]/30" />
                {p.title}
              </h2>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {p.lines.map((l) => <ItemCard key={l.lineId} line={l} />)}
            </div>
          </section>
        ))}

        <footer className="pt-8 border-t border-[#123F3A]/10 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
          <span className="flex items-center gap-3">
            <FarqWordmark className="h-4 bg-[#123F3A]/60" />
            أسعار الوحدة كما قدّمها الموردون، قبل التوصيل · {today}
          </span>
          {setAside.length > 0 && <span>استُبعد من المقارنة {setAside.join(' و')} لبعده غير المنطقي عن باقي الأسعار (أكثر من ضعفين ونصف).</span>}
          {note && <span className="text-amber-700">{note}</span>}
        </footer>
      </main>
      {banner}
    </div>
  )
}
