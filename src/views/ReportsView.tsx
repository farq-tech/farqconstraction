import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatRfqReference,
  getConstructionReportLines,
  getConstructionReports,
  type ConstructionReportLine,
  type ConstructionReportProject,
  type ConstructionReports,
  type ConstructionReportSupplier,
} from '../api/constructionClient'

/**
 * Procurement intelligence. Every number on this page is counted from a record
 * the system wrote when the thing happened, and every important number opens
 * the rows behind it. What cannot be measured from those records says so
 * instead of being estimated.
 */
const PERIODS: Array<[string, number | null]> = [['اليوم', 1], ['7 أيام', 7], ['30 يومًا', 30], ['هذا الربع', 90], ['هذه السنة', 365], ['كل الفترات', null]]
const CHANNEL_AR: Record<string, string> = { EMAIL: 'البريد', WHATSAPP: 'واتساب', HARAJ: 'حراج' }
const BUCKET_AR: Record<string, string> = { H1: 'أقل من ساعة', H4: '1–4 ساعات', H12: '4–12 ساعة', H24: '12–24 ساعة', D3: '1–3 أيام', D3P: 'أكثر من 3 أيام', NONE: 'لم يرد' }
const BUCKET_ORDER = ['H1', 'H4', 'H12', 'H24', 'D3', 'D3P', 'NONE']
const STATUS_AR: Record<string, string> = { SENT: 'بانتظار العروض', PARTIALLY_SENT: 'أُرسل جزئيًا', CLOSED: 'مغلق', DRAFT_NOT_SENT: 'لم يُرسل', DISPATCHING: 'جارٍ الإرسال', CANCELLED: 'ملغى' }

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
function money(value: unknown): string {
  const n = num(value)
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ريال`
}
/** «ساعة و23 دقيقة» — from hours as the server measured them; «—» when nothing was measured. */
function duration(hours?: string | number | null): string {
  const h = Number(hours)
  if (!Number.isFinite(h) || h < 0) return '—'
  const minutes = Math.round(h * 60)
  if (minutes < 60) return `${minutes} دقيقة`
  const days = Math.floor(minutes / 1440)
  const rest = minutes - days * 1440
  const hh = Math.floor(rest / 60)
  const mm = rest % 60
  const part = (v: number, one: string, two: string, many: string) => (v === 1 ? one : v === 2 ? two : `${v} ${many}`)
  if (days) return `${part(days, 'يوم', 'يومان', 'أيام')}${hh ? ` و${part(hh, 'ساعة', 'ساعتان', 'ساعات')}` : ''}`
  return `${part(hh, 'ساعة', 'ساعتان', 'ساعات')}${mm ? ` و${mm} دقيقة` : ''}`
}
function projectTitle(p: ConstructionReportProject): string {
  return (p.site_address || '').trim() || p.city || 'طلب تسعير'
}
/** A project's state, from its own numbers — never from a colour or a guess. */
function projectState(p: ConstructionReportProject): { label: string; cls: string; why: string } {
  const coverage = p.lines ? p.priced_lines / p.lines : 0
  if (p.award_at) return { label: 'تمت الترسية', cls: 'bg-[#CFF5DC] text-[#1a7a45]', why: 'اعتُمد عرض' }
  if (!p.reached) return { label: 'لم يُرسل بعد', cls: 'bg-amber-50 text-amber-700', why: 'لم يصل الطلب لأي مورد' }
  if (!p.replied) return { label: 'بلا ردود', cls: 'bg-red-50 text-red-700', why: 'وصل الطلب ولم يرد أحد' }
  if (coverage >= 0.9 && p.strong_lines >= p.lines * 0.5) return { label: 'ممتاز', cls: 'bg-[#CFF5DC] text-[#1a7a45]', why: 'تغطية 90%+ ونصف البنود بثلاثة عروض فأكثر' }
  if (coverage >= 0.6) return { label: 'يسير جيدًا', cls: 'bg-[#e0efec] text-[#123F3A]', why: 'تغطية 60% فأكثر' }
  return { label: 'يحتاج متابعة', cls: 'bg-amber-50 text-amber-700', why: 'تغطية أقل من 60%' }
}

function Kpi({ value, label, hint, onClick }: { value: string | number; label: string; hint?: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-2xl font-black text-[#0D1F1D] tabular-nums">{value}</div>
      <div className="text-xs font-semibold text-neutral-600 mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-neutral-400 mt-0.5">{hint}</div>}
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="bg-white border border-neutral-100 rounded-2xl px-4 py-3 text-right hover:border-[#123F3A]/40 transition-colors">{inner}</button>
  ) : (
    <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-3">{inner}</div>
  )
}

function Bar({ value, total, label, count, onClick }: { value: number; total: number; label: string; count: string; onClick?: () => void }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <button onClick={onClick} disabled={!onClick} className="w-full text-right group">
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="font-semibold text-[#0D1F1D] group-hover:underline">{label}</span>
        <span className="text-neutral-500 tabular-nums">{count}{total ? ` · ${percent}%` : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${percent}%` }} />
      </div>
    </button>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-black text-[#0D1F1D]">{title}</h2>
        {note && <span className="text-[11px] text-neutral-400">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export function ReportsView({ navigate }: NavProps) {
  const { openRfq } = useProcurement()
  const [days, setDays] = useState<number | null>(null)
  const [rfqId, setRfqId] = useState<string | null>(null)
  const [data, setData] = useState<ConstructionReports | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<{ title: string; lines: ConstructionReportLine[] } | null>(null)
  const [sortKey, setSortKey] = useState<'replied' | 'median' | 'quotes' | 'wins' | 'rfqs'>('replied')

  useEffect(() => {
    let alive = true
    setData(null)
    getConstructionReports({ days, rfqId })
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'تعذّر تحميل التقارير.'))
    return () => {
      alive = false
    }
  }, [days, rfqId])

  const openLines = async (filter: 'no_offer' | 'single_offer' | 'priced', title: string) => {
    try {
      const result = await getConstructionReportLines(filter, rfqId)
      setDrill({ title, lines: result.lines })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر فتح التفاصيل.')
    }
  }

  const suppliers = useMemo(() => {
    const rows = [...(data?.suppliers || [])]
    const value = (s: ConstructionReportSupplier) =>
      sortKey === 'median' ? (s.median_reply_hours == null ? Number.POSITIVE_INFINITY : num(s.median_reply_hours))
        : sortKey === 'quotes' ? -num(s.quotes) : sortKey === 'wins' ? -num(s.wins) : sortKey === 'rfqs' ? -num(s.rfqs) : -num(s.replied)
    return rows.sort((a, b) => value(a) - value(b))
  }, [data, sortKey])

  if (error && !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-16 text-center">
        <h1 className="text-xl font-black text-[#0D1F1D] mb-2">تعذّر تحميل التقارير</h1>
        <p className="text-sm text-neutral-500">{error}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10 animate-pulse" aria-busy="true">
        <div className="h-8 w-44 bg-neutral-100 rounded-xl mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-20 bg-neutral-100 rounded-2xl" />)}</div>
      </div>
    )
  }

  const t = data.totals
  const a = data.attention
  const scoped = rfqId ? data.projects.find((p) => p.id === rfqId) : null
  const attentionCards: Array<[number, string, () => void]> = [
    [a.lines_no_offer_48h, 'بنود بلا أي عرض منذ 48 ساعة', () => void openLines('no_offer', 'بنود بلا أي عرض')],
    [a.lines_single_offer, 'بنود بعرض واحد فقط — بلا مقارنة', () => void openLines('single_offer', 'بنود بعرض واحد فقط')],
    [a.rfqs_closing_today, 'طلبات تغلق اليوم', () => navigate('rfq-list')],
    [a.suppliers_silent, 'موردون لم يردّوا بعد', () => document.getElementById('suppliers-table')?.scrollIntoView({ behavior: 'smooth' })],
    [a.quotes_last_24h, 'عروض جديدة خلال 24 ساعة', () => navigate('rfq-list')],
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">تقارير المحفظة</h1>
          <p className="text-sm text-neutral-500 mt-1">كل رقم هنا مأخوذ من سجل النظام وقت حدوثه، وكل رقم مهم تقدر تضغطه وتشوف مصدره.</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-[#123F3A] text-white text-sm font-bold print:hidden">تقرير للإدارة (طباعة / PDF)</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5 print:hidden">
        {PERIODS.map(([label, value]) => (
          <button key={label} onClick={() => setDays(value)} aria-pressed={days === value}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${days === value ? 'bg-[#123F3A] text-white border-[#123F3A]' : 'bg-white text-neutral-600 border-neutral-200 hover:border-[#123F3A]/40'}`}>
            {label}
          </button>
        ))}
        <select value={rfqId || 'ALL'} onChange={(e) => setRfqId(e.target.value === 'ALL' ? null : e.target.value)}
          className="ms-auto rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-[#0D1F1D]">
          <option value="ALL">كل المشاريع</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{projectTitle(p)}</option>)}
        </select>
      </div>

      {attentionCards.some(([n]) => n > 0) && (
        <Section title="يحتاج انتباهك" note="قواعد واضحة من بياناتك، لا تقديرات">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionCards.filter(([n]) => n > 0).map(([n, label, onClick]) => (
              <button key={label} onClick={onClick} className="bg-white border border-amber-200 rounded-2xl px-4 py-3 text-right hover:border-amber-400 transition-colors">
                <div className="text-2xl font-black text-amber-700 tabular-nums">{n}</div>
                <div className="text-xs font-semibold text-[#0D1F1D] mt-0.5">{label}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="المحفظة">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi value={scoped ? 1 : t.projects} label="مشاريع" />
          <Kpi value={t.lines} label="بنود مطلوبة" />
          <Kpi value={t.priced_lines} label="بنود مسعّرة" hint={t.coverage_percent != null ? `${t.coverage_percent}% تغطية` : undefined} onClick={() => void openLines('priced', 'بنود وصلها سعر')} />
          <Kpi value={t.lines - t.priced_lines} label="بنود بلا سعر" onClick={() => void openLines('no_offer', 'بنود بلا أي عرض')} />
          <Kpi value={t.line_offers_total} label="أسعار مستلمة على البنود" hint={t.avg_offers_per_line != null ? `${t.avg_offers_per_line} عرض لكل بند` : undefined} />
          <Kpi value={t.reached} label="موردون وصلهم الطلب" hint={`${t.opened} فتحوا الرابط`} />
          <Kpi value={t.replied} label="موردون ردّوا" hint={t.reply_rate != null ? `${t.reply_rate}% ممن وصلهم` : undefined} />
          <Kpi value={t.suppliers_participating} label="موردون شاركوا فعليًا" />
        </div>
      </Section>

      <Section title="المشاريع" note="اضغط المشروع لفتح ملفه">
        <div className="overflow-x-auto bg-white border border-neutral-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs text-neutral-500">
                {['المشروع', 'البنود', 'المسعّر', 'التغطية', 'أسعار مستلمة', 'عروض/بند', 'الموردون', 'ردّوا', 'وسيط الرد', 'فرق السعر', 'الحالة'].map((h) => (
                  <th key={h} className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.projects.map((p) => {
                const state = projectState(p)
                const coverage = p.lines ? Math.round((p.priced_lines / p.lines) * 100) : 0
                return (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2.5">
                      <button onClick={() => openRfq(p.id, 'rfq-detail')} className="font-semibold text-[#0D1F1D] text-start hover:underline">{projectTitle(p)}</button>
                      <div className="text-[11px] text-neutral-400" dir="ltr">{formatRfqReference(p.id, p.engineering_department || null)} · {formatArDate(p.created_at)}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{p.lines}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.priced_lines}</td>
                    <td className="px-3 py-2.5 tabular-nums">{coverage}%</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.line_offers_total}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.lines ? Math.round((p.line_offers_total / p.lines) * 100) / 100 : '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.reached}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.replied}</td>
                    <td className="px-3 py-2.5 text-xs">{duration(p.median_reply_hours)}</td>
                    <td className="px-3 py-2.5 text-xs">{num(p.spread_value) ? money(p.spread_value) : '—'}</td>
                    <td className="px-3 py-2.5"><span title={state.why} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${state.cls}`}>{state.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="مسار المشتريات" note="أين تتسرّب البنود">
        <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 space-y-3">
          <Bar label="إجمالي البنود" value={data.funnel.lines} total={data.funnel.lines} count={`${data.funnel.lines}`} />
          <Bar label="وصلها سعر واحد على الأقل" value={data.funnel.one_offer} total={data.funnel.lines} count={`${data.funnel.one_offer}`} onClick={() => void openLines('priced', 'بنود وصلها سعر')} />
          <Bar label="وصلها سعران فأكثر (مقارنة حقيقية)" value={data.funnel.two_offers} total={data.funnel.lines} count={`${data.funnel.two_offers}`} />
          <Bar label="وصلها ثلاثة أسعار فأكثر" value={data.funnel.three_offers} total={data.funnel.lines} count={`${data.funnel.three_offers}`} />
          <div className="pt-2 text-xs text-neutral-500 border-t border-neutral-100">
            الموردون: أُرسل إلى {t.reached} · فتح الرابط {t.opened} · ردّ {t.replied} · قدّم عرضًا {t.quoted} · مشاريع مُرسّاة {data.funnel.awarded_projects}
          </div>
        </div>
      </Section>

      <Section title="قوة المنافسة" note="عدد الأسعار على كل بند">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {['0', '1', '2', '3', '4+'].map((b) => {
            const row = data.competition.find((c) => c.bucket === b)
            const count = row ? row.lines : 0
            return (
              <button key={b} onClick={() => b === '0' ? void openLines('no_offer', 'بنود بلا أي عرض') : b === '1' ? void openLines('single_offer', 'بنود بعرض واحد فقط') : undefined}
                className={`bg-white border rounded-2xl px-4 py-3 text-right ${b === '0' || b === '1' ? 'border-amber-200 hover:border-amber-400' : 'border-neutral-100'}`}>
                <div className="text-xl font-black text-[#0D1F1D] tabular-nums">{count}</div>
                <div className="text-[11px] text-neutral-600 mt-0.5">{b === '0' ? 'بلا عروض' : b === '4+' ? '4 عروض فأكثر' : `${b} ${b === '1' ? 'عرض' : 'عروض'}`}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="التوفير" note={data.savings.note}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Kpi value={num(data.savings.potential) ? money(data.savings.potential) : 'غير متاح بعد'} label="فرق السعر المتاح" hint="بين أقل وأعلى عرض على البنود التي وصلها عرضان فأكثر" />
          <Kpi value={data.savings.potential_percent != null ? `${data.savings.potential_percent}%` : 'غير متاح بعد'} label="نسبة فرق السعر" />
          <Kpi value={data.savings.awarded_projects ? money(data.savings.realized) : 'غير متاح بعد'} label="توفير محقق" hint={data.savings.awarded_projects ? `من ${data.savings.awarded_projects} مشروع مُرسّى` : 'يظهر بعد أول ترسية'} />
        </div>
      </Section>

      <Section title="سرعة استجابة الموردين" note="الوسيط لا المتوسط، لأن ردًّا متأخرًا جدًا يشوّه المتوسط">
        <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 space-y-3">
          {BUCKET_ORDER.map((b) => {
            const row = data.response_buckets.find((x) => x.bucket === b)
            const count = row ? row.suppliers : 0
            const total = data.response_buckets.reduce((n, x) => n + x.suppliers, 0)
            return <Bar key={b} label={BUCKET_AR[b]} value={count} total={total} count={`${count} مورد`} />
          })}
        </div>
      </Section>

      <Section title="أداء الموردين" note="رتّب بالعمود الذي يهمّك">
        <div id="suppliers-table" className="overflow-x-auto bg-white border border-neutral-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs text-neutral-500">
                <th className="text-right font-semibold px-3 py-2.5 min-w-[190px]">المورد</th>
                <th className="text-right font-semibold px-3 py-2.5">القناة</th>
                {([['rfqs', 'طلبات'], ['replied', 'ردّ'], ['median', 'وسيط الرد'], ['quotes', 'عروض'], ['wins', 'ترسيات']] as const).map(([key, label]) => (
                  <th key={key} className="text-right font-semibold px-3 py-2.5">
                    <button onClick={() => setSortKey(key)} className={`hover:underline ${sortKey === key ? 'text-[#123F3A] font-black' : ''}`}>{label}</button>
                  </th>
                ))}
                <th className="text-right font-semibold px-3 py-2.5">نسبة الرد</th>
                <th className="text-right font-semibold px-3 py-2.5">آخر نشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2.5 font-semibold text-[#0D1F1D]">{s.name_ar || s.name_en || 'مورد'}{s.city ? <span className="text-[11px] font-normal text-neutral-400"> · {s.city}</span> : null}</td>
                  <td className="px-3 py-2.5 text-xs text-neutral-600">{CHANNEL_AR[String(s.channel)] || s.channel || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.rfqs}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.replied}</td>
                  <td className="px-3 py-2.5 text-xs">{duration(s.median_reply_hours)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.quotes}{s.partial_quotes ? <span className="text-[11px] text-amber-700"> ({s.partial_quotes} جزئي)</span> : null}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.wins}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.rfqs ? `${Math.round((s.replied / s.rfqs) * 100)}%` : '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-neutral-500">{s.last_activity ? formatArDate(s.last_activity) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="الفئات" note="أين المنافسة قوية وأين ضعيفة">
        <div className="overflow-x-auto bg-white border border-neutral-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs text-neutral-500">
                {['الفئة', 'البنود', 'المسعّر', 'التغطية', 'عروض/بند', 'بعرض واحد', 'فرق السعر'].map((h) => <th key={h} className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.categories.map((c) => (
                <tr key={c.category} className="hover:bg-neutral-50">
                  <td className="px-3 py-2.5 font-semibold text-[#0D1F1D]">{c.category}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.lines}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.priced_lines}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.lines ? `${Math.round((c.priced_lines / c.lines) * 100)}%` : '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.avg_offers_per_line ?? '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.single_offer_lines}</td>
                  <td className="px-3 py-2.5 text-xs">{num(c.spread_value) ? money(c.spread_value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="text-[11px] text-neutral-400">
        حُدّث {formatArDate(data.generated_at)}. «من رفع الكراسة إلى أول عرض» غير متاح للطلبات القديمة: ربط الكراسة بالطلب بدأ تسجيله اليوم، ويظهر للطلبات الجديدة.
      </p>

      {drill && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden" role="dialog" aria-modal="true">
          <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-black text-[#0D1F1D]">{drill.title} — {drill.lines.length}</h2>
              <button onClick={() => setDrill(null)} className="text-sm font-semibold text-neutral-500">إغلاق</button>
            </div>
            {drill.lines.length === 0 ? (
              <p className="text-sm text-neutral-500 py-6 text-center">لا بنود في هذه الحالة.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-xs text-neutral-500">
                    {['#', 'البند', 'المشروع', 'الكمية', 'عروض', 'وصلهم', 'ردّوا', ''].map((h, i) => <th key={i} className="text-right font-semibold px-2 py-2">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {drill.lines.map((l) => (
                    <tr key={l.line_id}>
                      <td className="px-2 py-2 text-neutral-400 tabular-nums">{l.line_number}</td>
                      <td className="px-2 py-2 font-semibold text-[#0D1F1D]">{l.item_name}</td>
                      <td className="px-2 py-2 text-xs text-neutral-500">{l.site_address || '—'}</td>
                      <td className="px-2 py-2 tabular-nums">{l.quantity}</td>
                      <td className="px-2 py-2 tabular-nums">{l.offers}</td>
                      <td className="px-2 py-2 tabular-nums">{l.reached}</td>
                      <td className="px-2 py-2 tabular-nums">{l.replied}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => { setDrill(null); openRfq(l.rfq_id, 'rfq-detail') }} className="text-xs font-bold text-[#123F3A] hover:underline">افتح الطلب</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsView
