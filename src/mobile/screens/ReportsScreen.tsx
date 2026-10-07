import { supplierCountForDisplay } from '../../lib/supplierCountVisibility'
import { useActualSupplierCounts } from '../../components/priceReview/useActualSupplierCounts'
import { useMemo, useState } from 'react'
import {
  formatArDate,
  getConstructionReportLines,
  getConstructionReports,
  type ConstructionReportLine,
  type ConstructionReportProject,
  type ConstructionReports,
  type ConstructionReportSupplier,
} from '../../api/constructionClient'
import type { Nav } from '../MobileApp'
import { Card, Chips, ErrorNote, Group, Pill, Progress, Screen, SectionTitle, Sheet, Skeleton, Stat, duration, num, sar, useLoad } from '../ui'

const PERIODS: Array<[number | null, string]> = [
  [7, '7 أيام'],
  [30, '30 يومًا'],
  [90, 'هذا الربع'],
  [365, 'هذه السنة'],
  [null, 'كل الفترات'],
]
const BUCKETS: Array<[string, string]> = [
  ['H1', 'أقل من ساعة'],
  ['H4', '1 إلى 4 ساعات'],
  ['H12', '4 إلى 12 ساعة'],
  ['H24', '12 إلى 24 ساعة'],
  ['D3', '1 إلى 3 أيام'],
  ['D3P', 'أكثر من 3 أيام'],
  ['NONE', 'لم يرد'],
]
const CATEGORY_AR: Record<string, string> = {
  electrical: 'كهرباء', plumbing: 'سباكة', hvac: 'تكييف', 'cables-and-wires': 'كابلات وأسلاك',
  'steel-iron': 'حديد', 'precast-concrete': 'خرسانة سابقة الصب', concrete: 'خرسانة', sand: 'رمل',
  'doors-and-windows': 'أبواب ونوافذ', 'osb-boards': 'ألواح خشب', paints: 'دهانات', 'floors-and-walls': 'أرضيات وجدران',
  'ceramic-and-porcelain': 'سيراميك وبورسلين', insulation: 'عزل', facade: 'واجهات', finishing: 'تشطيبات',
  'building-material': 'مواد بناء', lighting: 'إنارة', 'sanitary-ware': 'أدوات صحية', product: 'مواد متنوعة',
  'custom-procurement': 'بنود خاصة', 'hand-tools': 'عدد وأدوات', pipes: 'مواسير', siteworks: 'أعمال موقع',
}
function categoryLabel(raw: string): string {
  const key = String(raw || '').toLowerCase()
  if (CATEGORY_AR[key]) return CATEGORY_AR[key]
  if (/^(direct|boq|custom)[-:]/i.test(key)) return 'بنود من الكراسة'
  return raw || 'غير مصنّف'
}
function projectTitle(p: ConstructionReportProject): string {
  return (p.site_address || '').trim() || p.city || 'طلب تسعير'
}
function projectState(p: ConstructionReportProject): { label: string; tone: 'good' | 'brand' | 'warn' | 'bad' } {
  const coverage = p.lines ? p.priced_lines / p.lines : 0
  if (p.award_at) return { label: 'تمت الترسية', tone: 'good' }
  if (!p.reached) return { label: 'لم يُرسل', tone: 'warn' }
  if (!p.replied) return { label: 'بلا ردود', tone: 'bad' }
  if (coverage >= 0.9 && p.strong_lines >= p.lines * 0.5) return { label: 'ممتاز', tone: 'good' }
  if (coverage >= 0.6) return { label: 'جيد', tone: 'brand' }
  return { label: 'يحتاج متابعة', tone: 'warn' }
}

type SortKey = 'replied' | 'median' | 'quotes' | 'wins'

export default function ReportsScreen({ nav }: { nav: Nav }) {
  const canViewActualCounts = useActualSupplierCounts()
  const [days, setDays] = useState<number | null>(30)
  const { data, error, loading, reload } = useLoad<ConstructionReports>(() => getConstructionReports({ days }), [days])
  const [drill, setDrill] = useState<{ title: string; lines: ConstructionReportLine[] | null } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('replied')
  const [allSuppliers, setAllSuppliers] = useState(false)
  const [allProjects, setAllProjects] = useState(false)

  async function openLines(filter: 'no_offer' | 'single_offer' | 'priced', title: string) {
    setDrill({ title, lines: null })
    try {
      const r = await getConstructionReportLines(filter, null)
      setDrill({ title, lines: r.lines })
    } catch {
      setDrill({ title, lines: [] })
    }
  }

  const suppliers = useMemo(() => {
    const rows = [...(data?.suppliers || [])]
    const v = (s: ConstructionReportSupplier) =>
      sortKey === 'median' ? (s.median_reply_hours == null ? Infinity : num(s.median_reply_hours)) : sortKey === 'quotes' ? -num(s.quotes) : sortKey === 'wins' ? -num(s.wins) : -num(s.replied)
    return rows.sort((a, b) => v(a) - v(b))
  }, [data, sortKey])

  const t = data?.totals
  const a = data?.attention
  const coverage = t?.coverage_percent ?? (t && t.lines ? Math.round((t.priced_lines / t.lines) * 100) : 0)
  const attention: Array<[number, string, () => void]> = a
    ? [
        [a.lines_no_offer_48h, 'بنود بلا أي عرض منذ يومين', () => void openLines('no_offer', 'بنود بلا أي عرض')],
        [a.lines_single_offer, 'بنود بعرض واحد فقط', () => void openLines('single_offer', 'بنود بعرض واحد فقط')],
        [a.rfqs_closing_today, 'طلبات تُغلق اليوم', () => nav.switchTab('requests')],
        [a.quotes_last_24h, 'عروض جديدة خلال 24 ساعة', () => nav.switchTab('requests')],
        [a.suppliers_silent, 'موردون لم يردّوا بعد', () => document.getElementById('m-suppliers')?.scrollIntoView({ behavior: 'smooth' })],
      ]
    : []
  const shownAttention = attention.filter(([n]) => n > 0)
  const bucketTotal = (data?.response_buckets || []).reduce((n, x) => n + x.suppliers, 0)

  return (
    <Screen title="التقارير" onBack={nav.back} large>
      <Chips<number | null> options={PERIODS} value={days} onChange={setDays} />
      {error && <ErrorNote message={error} onRetry={reload} />}

      {loading && !data ? (
        <div className="mt-4">
          <Skeleton rows={5} height={110} />
        </div>
      ) : data && t ? (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* The one number that answers «are we covered?» */}
          <div className="rounded-2xl p-5 mt-4 bg-[#123F3A] text-white">
            <div className="text-[13px] text-white/70">تغطية البنود بالأسعار</div>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-[44px] font-black leading-none tabular-nums">{coverage}%</span>
              <span className="text-[14px] text-white/70 pb-1.5">
                {t.priced_lines} من {t.lines} بند
              </span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-[#9BE3B4]" style={{ width: `${Math.min(100, coverage)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-white">
              <div>
                <div className="text-[18px] font-black tabular-nums">{t.avg_offers_per_line ?? '—'}</div>
                <div className="text-[11px] text-white/65">عرض لكل بند</div>
              </div>
              <div>
                <div className="text-[18px] font-black tabular-nums">{t.reply_rate != null ? `${t.reply_rate}%` : '—'}</div>
                <div className="text-[11px] text-white/65">نسبة رد الموردين</div>
              </div>
              <div>
                <div className="text-[18px] font-black tabular-nums">{t.projects}</div>
                <div className="text-[11px] text-white/65">مشروع</div>
              </div>
            </div>
          </div>

          {shownAttention.length > 0 && (
            <>
              <SectionTitle>يحتاج انتباهك</SectionTitle>
              <Group>
                {shownAttention.map(([n, label, go]) => (
                  <button key={label} onClick={go} className="w-full flex items-center gap-3 px-4 py-3.5 text-right active:bg-neutral-100">
                    <span className="min-w-[44px] h-9 px-2 rounded-xl bg-amber-50 text-amber-700 font-black text-[17px] tabular-nums flex items-center justify-center">{n}</span>
                    <span className="flex-1 text-[15px] font-semibold">{label}</span>
                    <span className="text-neutral-300 text-[22px] leading-none">‹</span>
                  </button>
                ))}
              </Group>
            </>
          )}

          <SectionTitle>الأرقام الأساسية</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4" onClick={() => void openLines('priced', 'بنود وصلها سعر')}>
              <Stat label="أسعار مستلمة على البنود" value={t.line_offers_total.toLocaleString('en-US')} />
            </Card>
            <Card className="p-4" onClick={() => void openLines('no_offer', 'بنود بلا أي عرض')}>
              <Stat label="بنود بلا سعر" value={(t.lines - t.priced_lines).toLocaleString('en-US')} tone={t.lines - t.priced_lines ? 'warn' : undefined} />
            </Card>
            <Card className="p-4">
              <Stat label="موردون وصلهم الطلب" value={t.reached} />
              <div className="text-[11px] text-neutral-400 mt-1">{t.opened} فتحوا الرابط</div>
            </Card>
            <Card className="p-4">
              <Stat label="موردون ردّوا" value={t.replied} tone="good" />
              <div className="text-[11px] text-neutral-400 mt-1">{t.suppliers_participating} شاركوا بأسعار</div>
            </Card>
          </div>

          <SectionTitle>التوفير</SectionTitle>
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[12px] text-neutral-500">فرق السعر المتاح</div>
                <div className="text-[24px] font-black text-[#1a7a45] tabular-nums">{num(data.savings.potential) ? sar(data.savings.potential) : '—'}</div>
              </div>
              {data.savings.potential_percent != null && <Pill tone="good">{data.savings.potential_percent}%</Pill>}
            </div>
            <p className="text-[12px] text-neutral-500 mt-1 leading-relaxed">الفرق بين أقل وأعلى عرض على البنود التي وصلها عرضان فأكثر.</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-between text-[14px]">
              <span className="text-neutral-500">توفير محقق</span>
              <span className="font-bold">{data.savings.awarded_projects ? sar(data.savings.realized) : 'يظهر بعد أول ترسية'}</span>
            </div>
          </Card>

          <SectionTitle>مسار البنود</SectionTitle>
          <Card className="p-4 space-y-3">
            {(
              [
                ['وصلها سعر واحد على الأقل', data.funnel.one_offer],
                ['سعران فأكثر (مقارنة حقيقية)', data.funnel.two_offers],
                ['ثلاثة أسعار فأكثر', data.funnel.three_offers],
              ] as Array<[string, number]>
            ).map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="font-semibold">{label}</span>
                  <span className="text-neutral-500 tabular-nums">{v} بند</span>
                </div>
                <Progress percent={data.funnel.lines ? (v / data.funnel.lines) * 100 : 0} />
              </div>
            ))}
          </Card>

          <SectionTitle>المشاريع ({data.projects.length})</SectionTitle>
          <div className="space-y-3">
            {(allProjects ? data.projects : data.projects.slice(0, 4)).map((p) => {
              const st = projectState(p)
              const cov = p.lines ? Math.round((p.priced_lines / p.lines) * 100) : 0
              return (
                <Card key={p.id} className="p-4" onClick={() => nav.switchTab('requests', { kind: 'request', id: p.id })}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[15px] leading-snug line-clamp-2">{projectTitle(p)}</div>
                      <div className="text-[12px] text-neutral-400 mt-0.5">{formatArDate(p.created_at)}</div>
                    </div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="mt-3">
                    <div className="text-[12px] text-neutral-500 mb-1">
                      {p.priced_lines} من {p.lines} بند مسعّر
                    </div>
                    <Progress percent={cov} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-neutral-100">
                    <Stat label="أسعار" value={p.line_offers_total} />
                    <Stat label="ردّوا" value={`${p.replied}/${supplierCountForDisplay(p.reached, canViewActualCounts)}`} />
                    <Stat label="وسيط الرد" value={p.replied ? duration(p.median_reply_hours) : '—'} />
                  </div>
                </Card>
              )
            })}
          </div>
          {data.projects.length > 4 && (
            <button onClick={() => setAllProjects((v) => !v)} className="w-full mt-2 h-10 text-[14px] font-bold text-[#123F3A]">
              {allProjects ? 'عرض أقل' : `عرض كل المشاريع (${data.projects.length})`}
            </button>
          )}

          <div id="m-suppliers" />
          <SectionTitle>أداء الموردين</SectionTitle>
          <Chips<SortKey>
            options={[
              ['replied', 'الأكثر ردًا'],
              ['median', 'الأسرع'],
              ['quotes', 'الأكثر عروضًا'],
              ['wins', 'الأكثر ترسية'],
            ]}
            value={sortKey}
            onChange={setSortKey}
          />
          <div className="mt-3">
            <Group>
              {(allSuppliers ? suppliers : suppliers.slice(0, 6)).map((s, i) => (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-[13px] font-black text-neutral-300 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[15px] truncate">{s.name_ar || s.name_en || 'مورد'}</div>
                      <div className="text-[12px] text-neutral-400">{s.city || '—'}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[15px] font-black tabular-nums">{s.rfqs ? `${Math.round((s.replied / s.rfqs) * 100)}%` : '—'}</div>
                      <div className="text-[11px] text-neutral-400">نسبة الرد</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 ps-9">
                    <Stat label="وسيط الرد" value={s.replied ? duration(s.median_reply_hours) : '—'} />
                    <Stat label="عروض" value={s.quotes} />
                    <Stat label="ترسيات" value={s.wins} tone={s.wins ? 'good' : undefined} />
                  </div>
                </div>
              ))}
            </Group>
          </div>
          {suppliers.length > 6 && (
            <button onClick={() => setAllSuppliers((v) => !v)} className="w-full mt-2 h-10 text-[14px] font-bold text-[#123F3A]">
              {allSuppliers ? 'عرض أقل' : `عرض كل الموردين (${suppliers.length})`}
            </button>
          )}

          <SectionTitle>سرعة استجابة الموردين</SectionTitle>
          <Card className="p-4 space-y-3">
            {BUCKETS.map(([key, label]) => {
              const count = data.response_buckets.find((b) => b.bucket === key)?.suppliers ?? 0
              return (
                <div key={key}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="font-semibold">{label}</span>
                    <span className="text-neutral-500 tabular-nums">{count} مورد</span>
                  </div>
                  <Progress percent={bucketTotal ? (count / bucketTotal) * 100 : 0} />
                </div>
              )
            })}
          </Card>

          {data.categories.length > 0 && (
            <>
              <SectionTitle>الفئات</SectionTitle>
              <Group>
                {data.categories.map((c) => {
                  const cov = c.lines ? Math.round((c.priced_lines / c.lines) * 100) : 0
                  return (
                    <div key={c.category} className="px-4 py-3">
                      <div className="flex justify-between gap-3 mb-1.5">
                        <span className="font-bold text-[15px]">{categoryLabel(c.category)}</span>
                        <span className="text-[12px] text-neutral-500 tabular-nums">
                          {c.priced_lines}/{c.lines} بند
                          {c.single_offer_lines ? <span className="text-amber-700"> · {c.single_offer_lines} بعرض واحد</span> : null}
                        </span>
                      </div>
                      <Progress percent={cov} />
                    </div>
                  )
                })}
              </Group>
            </>
          )}

          <p className="text-center text-[12px] text-neutral-400 mt-6">حُدّث {formatArDate(data.generated_at)}</p>
        </div>
      ) : null}

      <Sheet open={Boolean(drill)} onClose={() => setDrill(null)} title={drill ? `${drill.title}${drill.lines ? ` (${drill.lines.length})` : ''}` : ''}>
        {drill?.lines == null ? (
          <Skeleton rows={4} height={56} />
        ) : drill.lines.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-neutral-500">لا بنود في هذه الحالة.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {drill.lines.map((l) => (
              <button
                key={l.line_id}
                onClick={() => {
                  setDrill(null)
                  nav.switchTab('requests', { kind: 'request', id: l.rfq_id })
                }}
                className="w-full py-3 text-right flex items-start gap-3"
              >
                <span className="w-7 text-[12px] text-neutral-400 tabular-nums pt-0.5">{l.line_number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold leading-snug">{l.item_name}</div>
                  <div className="text-[12px] text-neutral-500 mt-0.5">
                    {l.site_address || '—'} · الكمية {num(l.quantity).toLocaleString('en-US')} · {l.offers} عرض
                  </div>
                </div>
                <span className="text-neutral-300 text-[22px] leading-none">‹</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
