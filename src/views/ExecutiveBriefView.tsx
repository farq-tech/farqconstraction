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
  topSpreadLines,
  type BriefLine,
  type BriefProject,
  type ExecutiveBrief,
} from '../lib/executiveBrief'

/**
 * «العرض التنفيذي» — every line suppliers priced, compared, as a presentation a
 * CEO can be walked through. It reads the same live records as the reports and
 * the request file; nothing on it is typed in or estimated. Full screen, one
 * idea per slide, each slide revealing itself when it arrives.
 */

/** Calm, distinguishable tones — one per supplier, the same on every slide. */
const SUPPLIER_TONES = ['#123F3A', '#B08D57', '#4B6584', '#6B7B3A', '#9C6B5E', '#2F7F74', '#7D7461', '#5B5F97', '#A07A2C', '#3E5C50']

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
/** «بند واحد» · «بندان» · «5 بنود» · «12 بندًا» — Arabic counting, not «2 بندًا». */
function bands(n: number): string {
  if (n === 1) return 'بند واحد'
  if (n === 2) return 'بندان'
  if (n >= 3 && n <= 10) return `${fmt(n)} بنود`
  return `${fmt(n)} بندًا`
}
function cur(code: string): string {
  return code === 'SAR' || !code ? 'ريال' : code
}

/* ── motion primitives ─────────────────────────────────────────────────── */

/** True once the element has been on screen; it stays true (a reveal plays once). */
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

/** A number that counts up to its value when its slide arrives. */
function CountUp({ value, digits = 0, run, duration = 1600 }: { value: number; digits?: number; run: boolean; duration?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!run) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setShown(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      setShown(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, value, duration])
  return <span className="tabular-nums">{fmt(shown, digits)}</span>
}

function Slide({ tone = 'light', fit = true, className = '', children, render }: {
  tone?: 'light' | 'dark'
  /** One screen tall; `false` lets a long comparison run past it. */
  fit?: boolean
  className?: string
  children?: ReactNode
  render?: (inView: boolean) => ReactNode
}) {
  const [ref, inView] = useInView<HTMLElement>(0.25)
  const toneCls = tone === 'dark' ? 'bg-[#0B2A26] text-white' : 'bg-[#FAFAF8] text-[#0D1F1D]'
  return (
    <section
      ref={ref}
      data-in={inView ? 'true' : 'false'}
      data-brief-slide
      className={`relative snap-start overflow-hidden ${fit ? 'min-h-svh flex flex-col justify-center' : ''} ${toneCls} px-5 sm:px-10 lg:px-20 py-20 print:min-h-0 print:break-after-page ${className}`}
    >
      {render ? render(inView) : children}
    </section>
  )
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 text-xs font-bold tracking-wide ${dark ? 'text-[#CFF5DC]/80' : 'text-[#1a5c54]'}`}>
      <span className={`h-px w-10 ${dark ? 'bg-[#CFF5DC]/50' : 'bg-[#1a5c54]/40'}`} />
      {children}
    </div>
  )
}

/** The cover's backdrop: a site plan drawing itself, then drifting slowly. */
function Blueprint() {
  const lines = [
    'M0 120 H1400', 'M0 260 H1400', 'M0 400 H1400', 'M0 540 H1400', 'M0 680 H1400',
    'M180 0 V800', 'M420 0 V800', 'M660 0 V800', 'M900 0 V800', 'M1140 0 V800',
  ]
  return (
    <svg aria-hidden className="absolute inset-0 w-[calc(100%+80px)] h-full brief-drift" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
      {lines.map((p, i) => (
        <path key={p} d={p} pathLength={1} className="brief-draw" style={d(i * 90)} stroke="#CFF5DC" strokeOpacity="0.08" strokeWidth="1" fill="none" />
      ))}
      <path d="M420 260 H900 V540 H420 Z" pathLength={1} className="brief-draw" style={d(700)} stroke="#CFF5DC" strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
      <path d="M660 260 V540 M420 400 H900" pathLength={1} className="brief-draw" style={d(1100)} stroke="#CFF5DC" strokeOpacity="0.18" strokeWidth="1" fill="none" />
      <path d="M900 540 L1140 680 M420 260 L180 120" pathLength={1} className="brief-draw" style={d(1400)} stroke="#CFF5DC" strokeOpacity="0.14" strokeWidth="1" strokeDasharray="4 6" fill="none" />
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

/* ── the comparison row: every offer on one line, placed on its price range ── */

function LineRow({ line, index, toneOf }: { line: BriefLine; index: number; toneOf: (id: string) => string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15)
  const min = line.lowest.unitPrice
  const max = line.highest.unitPrice
  const pos = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 50)
  const unit = cur(line.currency)
  return (
    <div ref={ref} data-in={inView ? 'true' : 'false'} className="brief-reveal bg-white rounded-2xl border border-[#123F3A]/8 px-4 sm:px-6 py-4 shadow-[0_1px_0_rgba(18,63,58,0.04)] break-inside-avoid">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold text-[#123F3A]/40 tabular-nums" dir="ltr">{String(index + 1).padStart(2, '0')}</span>
        <h3 className="font-bold text-[15px] text-[#0D1F1D] flex-1 min-w-[12rem] leading-relaxed">{line.name}</h3>
        <span className="text-xs text-neutral-500 tabular-nums">{fmt(line.quantity, 2)} {line.uom}</span>
        {line.offers.length > 1 ? (
          <span className="text-xs font-bold text-[#1a5c54] bg-[#CFF5DC]/60 rounded-full px-2.5 py-0.5 tabular-nums">
            فرق {line.spreadPercent}% · {fmt(line.spreadValue)} {unit}
          </span>
        ) : (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">عرض واحد — بلا مقارنة</span>
        )}
        {line.mixedTaxBasis && (
          <span title="بعض العروض تشمل الضريبة وبعضها لا، أو لم يذكرها المورد" className="text-[11px] font-semibold text-amber-800 bg-amber-100/70 rounded-full px-2 py-0.5">أساس الضريبة مختلف</span>
        )}
      </div>

      {line.offers.length > 1 && (
        <div className="relative mt-5 mb-2 mx-2 h-6" aria-hidden>
          <div className="absolute top-1/2 inset-x-0 h-px bg-[#123F3A]/10" />
          <div className="absolute top-1/2 inset-x-0 h-[3px] -translate-y-px rounded-full bg-gradient-to-l from-[#CFF5DC] via-[#E8E1D3] to-[#E9C9B8] brief-grow" style={d(150)} />
          {line.offers.map((o, i) => (
            <span
              key={o.supplierId}
              title={`${o.supplierName}: ${fmt(o.unitPrice, 2)} ${unit}`}
              className="absolute top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full ring-2 ring-white transition-[right,opacity] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                right: inView ? `${pos(o.unitPrice)}%` : '0%',
                opacity: inView ? 1 : 0,
                transitionDelay: `${250 + i * 90}ms`,
                width: i === 0 ? 16 : 11,
                height: i === 0 ? 16 : 11,
                background: toneOf(o.supplierId),
                boxShadow: i === 0 ? '0 0 0 5px rgba(207,245,220,0.9)' : undefined,
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {line.offers.map((o, i) => (
          <div
            key={o.supplierId}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ${i === 0 && line.offers.length > 1 ? 'bg-[#CFF5DC] text-[#0B2A26]' : 'bg-[#F4F2EC] text-[#0D1F1D]'}`}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: toneOf(o.supplierId) }} />
            <span className="font-semibold truncate max-w-[14rem]">{o.supplierName}</span>
            <span className="font-black tabular-nums">{fmt(o.unitPrice, 2)}</span>
            <span className="text-[10px] opacity-60">{unit}/{line.uom || 'وحدة'}</span>
            {i === 0 && line.offers.length > 1 && <span className="text-[10px] font-bold">الأقل</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── the view ─────────────────────────────────────────────────────────── */

type Load =
  | { phase: 'loading'; done: number; total: number }
  | { phase: 'error'; message: string; signIn: boolean }
  | { phase: 'ready'; reports: ConstructionReports; brief: ExecutiveBrief; failed: number }

function projectTitle(p: ConstructionReports['projects'][number]): string {
  return (p.site_address || '').trim() || p.city || 'طلب تسعير'
}

export function ExecutiveBriefView({ navigate }: NavProps) {
  const [brand, setBrand] = useState<CompanyBrand | null>(null)
  const [load, setLoad] = useState<Load>({ phase: 'loading', done: 0, total: 0 })
  const [reload, setReload] = useState(0)
  const [progress, setProgress] = useState(0)
  const scroller = useRef<HTMLDivElement | null>(null)

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
      setLoad({ phase: 'ready', reports, brief: buildExecutiveBrief(projects), failed })
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

  // Keyboard: a presenter's clicker sends PageDown/PageUp or the arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = scroller.current
      if (!el) return
      if (e.key === 'Escape') return navigate('reports')
      const forward = ['ArrowDown', 'PageDown', 'ArrowLeft', ' '].includes(e.key)
      const back = ['ArrowUp', 'PageUp', 'ArrowRight'].includes(e.key)
      if (!forward && !back) return
      e.preventDefault()
      const slides = [...el.querySelectorAll<HTMLElement>('[data-brief-slide]')]
      const top = el.scrollTop
      const target = forward
        ? slides.find((s) => s.offsetTop > top + 8)
        : [...slides].reverse().find((s) => s.offsetTop < top - 8)
      if (target) el.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const supplierTone = useMemo(() => {
    const map = new Map<string, string>()
    if (load.phase === 'ready') load.brief.suppliers.forEach((s, i) => map.set(s.id, SUPPLIER_TONES[i % SUPPLIER_TONES.length]))
    return (id: string) => map.get(id) || '#8A9A55'
  }, [load])

  const today = formatArDate(new Date().toISOString())
  const company = brand?.nameAr || 'الإدارة التنفيذية'

  const chrome = (
    <div className="fixed top-0 inset-x-0 z-40 print:hidden">
      <div className="h-[2px] bg-[#CFF5DC] origin-right" style={{ transform: `scaleX(${progress})` }} />
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <button onClick={() => navigate('reports')} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#0B2A26]/80 text-white backdrop-blur hover:bg-[#0B2A26] transition-colors">
          ← العودة للتقارير
        </button>
        {load.phase === 'ready' && (
          <button onClick={() => window.print()} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#0B2A26]/80 text-white backdrop-blur hover:bg-[#0B2A26] transition-colors">
            حفظ PDF
          </button>
        )}
      </div>
    </div>
  )

  if (load.phase !== 'ready') {
    const pct = load.phase === 'loading' && load.total ? load.done / load.total : 0
    return (
      <div dir="rtl" className="fixed inset-0 bg-[#0B2A26] text-white flex flex-col items-center justify-center px-6 text-center">
        {chrome}
        <FarqWordmark className="h-10 bg-[#CFF5DC] mb-8 animate-pulse-dot" />
        {load.phase === 'loading' ? (
          <>
            <div className="text-sm text-white/70">
              {load.total ? `نجمع عروض الموردين — ${load.done} من ${load.total} مشروع` : 'نقرأ سجلات المشتريات…'}
            </div>
            <div className="mt-4 h-[3px] w-56 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#CFF5DC] transition-[width] duration-500" style={{ width: `${Math.max(6, pct * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-white/85 max-w-md">{load.message}</p>
            <button
              onClick={() => (load.signIn ? navigate('login') : setReload((n) => n + 1))}
              className="mt-6 px-5 py-2 rounded-full bg-[#CFF5DC] text-[#0B2A26] text-sm font-black"
            >
              {load.signIn ? 'تسجيل الدخول' : 'أعد المحاولة'}
            </button>
          </>
        )}
      </div>
    )
  }

  const { reports, brief, failed } = load
  const t = reports.totals
  const coverage = t.lines ? t.priced_lines / t.lines : 0
  const unit = cur(brief.currency)
  const top = topSpreadLines(brief, 6)
  const manyProjects = brief.projects.length > 1
  const topMax = Math.max(1, ...top.map((l) => l.highest.unitPrice * l.quantity))
  const top3Share = brief.spreadTotal ? Math.round((top.slice(0, 3).reduce((s, l) => s + l.spreadValue, 0) / brief.spreadTotal) * 100) : 0
  const leader = brief.suppliers.find((s) => s.wins > 0) || null
  const single = brief.lines.filter((l) => l.offers.length === 1).length
  const mixed = brief.lines.filter((l) => l.mixedTaxBasis).length
  const maxWins = Math.max(1, ...brief.suppliers.map((s) => s.wins))
  const funnel: Array<[string, number]> = [
    ['بنود مطلوبة', reports.funnel.lines],
    ['وصلها سعر واحد على الأقل', reports.funnel.one_offer],
    ['سعران فأكثر — مقارنة حقيقية', reports.funnel.two_offers],
    ['ثلاثة أسعار فأكثر', reports.funnel.three_offers],
  ]

  return (
    <div
      dir="rtl"
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget
        setProgress(el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0)
      }}
      className="fixed inset-0 overflow-y-auto snap-y snap-proximity scroll-smooth bg-[#FAFAF8] print:static print:overflow-visible"
    >
      {chrome}

      {/* 1 — cover */}
      <Slide tone="dark" render={() => (
        <>
          <Blueprint />
          <div className="relative max-w-5xl">
            <R delay={200} className="flex items-center gap-5 mb-14">
              <FarqWordmark className="h-9 sm:h-11 bg-[#CFF5DC]" />
              {brand && (
                <>
                  <span className="h-10 w-px bg-white/20" />
                  <span className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-1.5 shadow-[0_0_0_6px_rgba(207,245,220,0.08)]">
                    <img src={brand.logo} alt={brand.nameAr} className="h-full w-full object-contain" />
                  </span>
                </>
              )}
            </R>
            <R delay={450}><Eyebrow dark>تقرير تنفيذي · {today}</Eyebrow></R>
            <R delay={650}>
              <h1 className="mt-5 text-4xl sm:text-6xl lg:text-7xl font-black leading-[1.15] tracking-tight">
                مقارنة عروض الموردين
                <span className="block text-[#CFF5DC]">بندًا بندًا</span>
              </h1>
            </R>
            <R delay={900}>
              <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/70 leading-relaxed">
                معدّ للرئيس التنفيذي — {company}. كل سعر هنا قدّمه مورد فعلًا عبر منصة فرق، ومقارَن بغيره على نفس البند والكمية.
              </p>
            </R>
            <R delay={1150} className="mt-12 flex flex-wrap gap-8 text-white/80">
              {[[brief.pricedLines, 'بنود مسعّرة'], [brief.pricesReceived, 'أسعار مستلمة'], [brief.suppliers.length, 'موردون']].map(([n, l]) => (
                <div key={String(l)}>
                  <div className="text-3xl font-black text-white tabular-nums">{fmt(Number(n))}</div>
                  <div className="text-xs mt-1">{l}</div>
                </div>
              ))}
            </R>
          </div>
          <R delay={1600} className="absolute bottom-8 inset-x-0 text-center text-[11px] text-white/40">مرّر للأسفل أو استخدم الأسهم ↓</R>
        </>
      )} />

      {/* 2 — the headline numbers */}
      <Slide render={(inView) => (
        <div className="max-w-6xl w-full mx-auto">
          <R><Eyebrow>الخلاصة</Eyebrow></R>
          <R delay={150}><h2 className="mt-4 text-3xl sm:text-5xl font-black leading-tight">ما الذي تقوله العروض؟</h2></R>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
            <R delay={300} className="rounded-3xl bg-[#0B2A26] text-white p-8 sm:p-10 relative overflow-hidden">
              <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#CFF5DC]/10 blur-2xl brief-glow" />
              <div className="relative">
                <div className="text-sm text-white/60">الفارق بين أعلى وأقل عرض على البنود المقارَنة</div>
                <div className="mt-3 text-5xl sm:text-6xl font-black text-[#CFF5DC]">
                  <CountUp value={brief.spreadTotal} run={inView} /> <span className="text-2xl text-white/70">{unit}</span>
                </div>
                <p className="mt-4 text-sm text-white/70 leading-relaxed max-w-md">
                  قيمة ما يحفظه اختيار أقل سعر بدل أعلاه على {bands(brief.comparedLines)} وصلها أكثر من عرض. قبل الضريبة والتوصيل.
                </p>
                <div className="mt-6 pt-5 border-t border-white/10 text-sm text-white/80">
                  لو اعتُمد الأقل في كل بند مسعّر: <span className="font-black text-white tabular-nums">{fmt(brief.lowestBasket)} {unit}</span>
                </div>
              </div>
            </R>
            <div className="grid grid-cols-2 gap-4">
              {([
                [brief.pricedLines, 'بنود مسعّرة'],
                [brief.pricesReceived, 'أسعار مستلمة'],
                [brief.suppliers.length, 'موردون شاركوا'],
                [num(reports.savings.realized), `وفر محقّق بالترسية (${unit})`],
              ] as Array<[number, string]>).map(([n, l], i) => (
                <R key={l} delay={450 + i * 120} className="rounded-3xl bg-white border border-[#123F3A]/8 p-6 flex flex-col justify-end">
                  <div className="text-3xl sm:text-4xl font-black text-[#123F3A]"><CountUp value={n} run={inView} /></div>
                  <div className="mt-1 text-xs font-semibold text-neutral-500">{l}</div>
                </R>
              ))}
            </div>
          </div>
        </div>
      )} />

      {/* 3 — the funnel */}
      <Slide render={(inView) => (
        <div className="max-w-6xl w-full mx-auto grid md:grid-cols-[1fr_1.4fr] gap-12 items-center">
          <div>
            <R><Eyebrow>التغطية</Eyebrow></R>
            <R delay={150}><h2 className="mt-4 text-3xl sm:text-5xl font-black leading-tight">كم بندًا وصله سعر؟</h2></R>
            <R delay={300} className="mt-10 relative h-48 w-48">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#123F3A" strokeOpacity="0.08" strokeWidth="6" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="#123F3A" strokeWidth="6" strokeLinecap="round" pathLength={1}
                  strokeDasharray={`${coverage} 1`} strokeDashoffset={inView ? 0 : coverage}
                  style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1) 400ms' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-black text-[#123F3A]"><CountUp value={coverage * 100} run={inView} />%</div>
                <div className="text-xs text-neutral-500">تغطية البنود</div>
              </div>
            </R>
          </div>
          <div className="space-y-6">
            {funnel.map(([label, value], i) => {
              const pct = funnel[0][1] ? value / funnel[0][1] : 0
              return (
                <R key={label} delay={350 + i * 150}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-bold">{label}</span>
                    <span className="tabular-nums text-sm text-neutral-500"><span className="text-xl font-black text-[#123F3A]">{fmt(value)}</span> · {Math.round(pct * 100)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-[#123F3A]/6 overflow-hidden">
                    <div className="h-full rounded-full brief-grow" style={{ width: `${Math.max(pct * 100, 1)}%`, background: ['#CDD5AE', '#8A9A55', '#1a5c54', '#123F3A'][i], ...d(500 + i * 180) }} />
                  </div>
                </R>
              )
            })}
          </div>
        </div>
      )} />

      {/* 4 — where the money is */}
      {top.length > 0 && (
        <Slide render={() => (
          <div className="max-w-6xl w-full mx-auto">
            <R><Eyebrow>أين يكمن الفرق</Eyebrow></R>
            <R delay={150}>
              <h2 className="mt-4 text-3xl sm:text-5xl font-black leading-tight">البنود التي يصنع فيها الاختيار فرقًا</h2>
            </R>
            <R delay={250}><p className="mt-3 text-neutral-500">قيمة البند بأعلى عرض مقابل أقل عرض، على الكمية المطلوبة.</p></R>
            <div className="mt-8 space-y-4">
              {top.map((l, i) => {
                const hi = l.highest.unitPrice * l.quantity
                const lo = l.lowest.unitPrice * l.quantity
                return (
                  <R key={l.rfqId + l.lineId} delay={350 + i * 110}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                      <span className="font-bold text-sm sm:text-base truncate max-w-[70%]">{l.name}</span>
                      <span className="text-sm font-black text-[#1a5c54] tabular-nums">{fmt(l.spreadValue)} {unit}</span>
                    </div>
                    <div className="relative h-7 rounded-lg bg-[#123F3A]/[0.04] overflow-hidden">
                      <div className="absolute inset-y-0 right-0 rounded-lg bg-[#E9C9B8] brief-grow" style={{ width: `${(hi / topMax) * 100}%`, ...d(450 + i * 110) }} />
                      <div className="absolute inset-y-0 right-0 rounded-lg bg-[#123F3A] brief-grow" style={{ width: `${(lo / topMax) * 100}%`, ...d(650 + i * 110) }} />
                      <div className="absolute inset-y-0 right-3 flex items-center text-[11px] font-bold text-white/90 tabular-nums">{fmt(lo)}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      {manyProjects && <>{l.projectTitle} · </>}الأقل: {l.lowest.supplierName} · الأعلى: {l.highest.supplierName} ({fmt(hi)} {unit})
                    </div>
                  </R>
                )
              })}
            </div>
            <R delay={1300} className="mt-8 flex gap-5 text-xs text-neutral-500">
              <span className="flex items-center gap-2"><span className="h-2.5 w-5 rounded bg-[#123F3A]" /> بأقل عرض</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-5 rounded bg-[#E9C9B8]" /> بأعلى عرض</span>
            </R>
          </div>
        )} />
      )}

      {/* 5 — the suppliers */}
      <Slide render={() => (
        <div className="max-w-6xl w-full mx-auto">
          <R><Eyebrow>الموردون</Eyebrow></R>
          <R delay={150}><h2 className="mt-4 text-3xl sm:text-5xl font-black leading-tight">من قدّم الأقل، وفي كم بند؟</h2></R>
          <R delay={250}><p className="mt-3 text-neutral-500">«الأقل» تُحتسب فقط حين يتفوّق المورد وحده على عرض آخر على نفس البند.</p></R>
          <div className="mt-10 grid gap-3">
            {brief.suppliers.slice(0, 10).map((s, i) => (
              <R key={s.id} delay={350 + i * 90} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(10rem,16rem)_1fr_auto] items-center gap-4 bg-white rounded-2xl border border-[#123F3A]/8 px-5 py-3.5">
                <span className="h-3 w-3 rounded-full" style={{ background: supplierTone(s.id) }} />
                <span className="font-bold truncate">{s.name}</span>
                <div className="hidden sm:block h-2 rounded-full bg-[#123F3A]/6 overflow-hidden">
                  <div className="h-full rounded-full brief-grow" style={{ width: `${(s.wins / maxWins) * 100}%`, background: supplierTone(s.id), ...d(500 + i * 90) }} />
                </div>
                <span className="text-sm text-neutral-500 tabular-nums whitespace-nowrap">
                  <span className="text-lg font-black text-[#123F3A]">{s.wins}</span> الأقل · {s.priced} مسعّر
                </span>
              </R>
            ))}
          </div>
        </div>
      )} />

      {/* 6 — the full comparison, one project at a time */}
      {brief.projects.map((p, pi) => (
        <Slide key={p.rfqId} fit={false} className="py-24" render={() => (
          <div className="max-w-6xl w-full mx-auto">
            <R><Eyebrow>المقارنة الكاملة · {pi + 1} من {brief.projects.length}</Eyebrow></R>
            <R delay={150}>
              <h2 className="mt-4 text-2xl sm:text-4xl font-black leading-tight">{p.title}</h2>
            </R>
            <R delay={250} className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white border border-[#123F3A]/10 px-3 py-1">{p.lines.length} بند مسعّر</span>
              <span className="rounded-full bg-white border border-[#123F3A]/10 px-3 py-1">{p.lines.filter((l) => l.offers.length > 1).length} بند مقارَن</span>
              <span className="rounded-full bg-[#CFF5DC] px-3 py-1 font-bold text-[#0B2A26]">
                فرق {fmt(p.lines.reduce((s, l) => s + l.spreadValue, 0))} {unit}
              </span>
            </R>
            <div className="mt-8 grid gap-3">
              {p.lines.map((l, i) => <LineRow key={l.lineId} line={l} index={i} toneOf={supplierTone} />)}
            </div>
          </div>
        )} />
      ))}

      {/* 7 — what to do with it */}
      <Slide tone="dark" render={() => (
        <>
          <Blueprint />
          <div className="relative max-w-5xl w-full mx-auto">
            <R><Eyebrow dark>التوصية</Eyebrow></R>
            <R delay={150}><h2 className="mt-4 text-3xl sm:text-5xl font-black leading-tight">ما نوصي به</h2></R>
            <div className="mt-12 grid gap-5">
              {[
                top.length > 0 && `ركّز التفاوض على ${top.length >= 3 ? 'أعلى ثلاثة بنود' : top.length === 2 ? 'أعلى بندين' : 'البند الأعلى'} فرقًا: ${top.length >= 3 ? 'تمثّل' : 'يمثّل'} ${top3Share}% من فارق الأسعار كله.`,
                leader && `${leader.name} قدّم الأقل في ${leader.wins} من أصل ${bands(brief.comparedLines)} مقارَنة — مرشّح أول لحزمة البنود التي يتفوّق فيها.`,
                single > 0 && `${bands(single)} ${single > 2 ? 'وصلها' : single === 2 ? 'وصلهما' : 'وصله'} عرض واحد فقط — توسيع دائرة الموردين يفتح مقارنة ووفرًا لم يُقَس بعد.`,
                mixed > 0 && `${bands(mixed)} بأساس ضريبة غير موحّد بين العروض — ${mixed > 1 ? 'تُراجَع' : 'يُراجَع'} قبل الترسية.`,
              ].filter(Boolean).slice(0, 4).map((text, i) => (
                <R key={i} delay={350 + i * 200} className="flex gap-5 items-start border-t border-white/10 pt-5">
                  <span className="text-3xl font-black text-[#CFF5DC] tabular-nums leading-none">{i + 1}</span>
                  <p className="text-lg sm:text-xl text-white/85 leading-relaxed">{text}</p>
                </R>
              ))}
            </div>
            <R delay={1300} className="mt-16 flex flex-wrap items-center justify-between gap-4 text-xs text-white/50">
              <span className="flex items-center gap-3">
                <FarqWordmark className="h-5 bg-[#CFF5DC]/80" />
                أُعدّ آليًا من سجلات منصة فرق · {today}
              </span>
              {failed > 0 && <span className="text-amber-200/80">تعذّر تحميل {failed} مشروع؛ لم يُحتسب في الأرقام.</span>}
            </R>
          </div>
        </>
      )} />
    </div>
  )
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
