import { useEffect, useState } from 'react'
import { getConstructionReports, listBuyerRfqs, formatRfqTitle } from '../../api/constructionClient'
import { useFarqSession } from '../../api/useFarqSession'
import { loadMaterialPrices, type MaterialPriceIndex } from '../../lib/materialPrices'
import type { Nav } from '../MobileApp'
import { Card, ErrorNote, Pill, SectionTitle, Skeleton, Stat, ago, sar, useLoad } from '../ui'
import { requestState } from './RequestsScreen'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'صباح الخير' : 'مساء الخير'
}

export default function HomeScreen({ nav }: { nav: Nav }) {
  const session = useFarqSession()
  const name = session.user?.displayName?.trim().split(/\s+/)[0] || ''
  const overview = useLoad(() => listBuyerRfqs(), [])
  const reports = useLoad(() => getConstructionReports({ days: 30 }), [])
  const [prices, setPrices] = useState<MaterialPriceIndex | null>(null)
  useEffect(() => {
    loadMaterialPrices().then(setPrices).catch(() => {})
  }, [])

  const s = overview.data?.summary
  const a = reports.data?.attention
  const attention: Array<[number, string, () => void]> = a
    ? [
        [a.quotes_last_24h, 'عروض جديدة خلال 24 ساعة', () => nav.switchTab('requests')],
        [a.rfqs_closing_today, 'طلبات تُغلق اليوم', () => nav.switchTab('requests')],
        [a.lines_no_offer_48h, 'بنود بلا أي عرض منذ يومين', () => nav.switchTab('more', { kind: 'reports' })],
        [a.lines_single_offer, 'بنود بعرض واحد فقط', () => nav.switchTab('more', { kind: 'reports' })],
      ]
    : []
  const shown = attention.filter(([n]) => n > 0)
  const latest = (overview.data?.rfqs || []).slice(0, 3)

  return (
    <div className="min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="bg-[#123F3A] text-white rounded-b-[32px] px-5 pb-6 m-safe-top">
        <div className="h-12 flex items-center justify-between">
          <img src="/brand/farq-wordmark.png" alt="فرق" className="h-6 w-auto brightness-0 invert" />
          <span className="text-[12px] font-semibold text-white/60 tracking-wider">بناء</span>
        </div>
        <div className="mt-3 text-[15px] text-white/70">{greeting()}{name ? `، ${name}` : ''}</div>
        <div className="text-[26px] font-black leading-tight mt-0.5">ملخّص مشترياتك</div>
        <button
          onClick={() => nav.push({ kind: 'new' })}
          className="mt-5 w-full h-14 rounded-2xl bg-[#CFF5DC] text-[#123F3A] font-black text-[17px] flex items-center justify-center gap-2 m-press"
        >
          <span className="text-[22px] leading-none">+</span> طلب تسعير جديد
        </button>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            [s?.sent_count, 'طلبات مُرسلة'],
            [s?.response_count, 'عروض مستلمة'],
            [s?.awaiting_supplier_count, 'بانتظار الموردين'],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-2xl bg-white/10 px-3 py-3">
              <div className="text-[22px] font-black tabular-nums">{v ?? '—'}</div>
              <div className="text-[11px] text-white/70 mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 m-fade">
        {overview.error && <ErrorNote message={overview.error} onRetry={overview.reload} />}

        {shown.length > 0 && (
          <>
            <SectionTitle>يحتاج انتباهك</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {shown.map(([n, label, go]) => (
                <Card key={label} onClick={go} className="p-4">
                  <div className="text-[26px] font-black text-[#C2410C] tabular-nums leading-none">{n}</div>
                  <div className="text-[13px] font-semibold text-[#0D1F1D] mt-2 leading-snug">{label}</div>
                </Card>
              ))}
            </div>
          </>
        )}

        <SectionTitle action={<button onClick={() => nav.switchTab('requests')} className="text-[13px] font-bold text-[#123F3A]">عرض الكل</button>}>
          آخر الطلبات
        </SectionTitle>
        {overview.loading && !overview.data ? (
          <Skeleton rows={3} height={92} />
        ) : latest.length === 0 ? (
          <Card className="p-5 text-center text-[14px] text-neutral-500">لا طلبات بعد.</Card>
        ) : (
          <div className="space-y-3">
            {latest.map((r) => {
              const st = requestState(r)
              return (
                <Card key={r.id} onClick={() => nav.switchTab('requests', { kind: 'request', id: r.id })} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-bold text-[15px] leading-snug line-clamp-2">{formatRfqTitle(r)}</div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-[13px] text-neutral-500">
                    <span><b className="text-[#0D1F1D] tabular-nums">{r.response_count}</b> عرض</span>
                    <span><b className="text-[#0D1F1D] tabular-nums">{r.supplier_count}</b> مورد</span>
                    <span className="ms-auto text-[12px]">{ago(r.created_at)}</span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {overview.data?.finance?.received_base_quote_total ? (
          <>
            <SectionTitle>قيمة العروض المستلمة</SectionTitle>
            <Card className="p-4 grid grid-cols-2 gap-3">
              <Stat label="إجمالي العروض" value={sar(overview.data.finance.received_base_quote_total)} />
              <Stat label="المُلتزم به" value={overview.data.finance.committed_total ? sar(overview.data.finance.committed_total) : '—'} />
            </Card>
          </>
        ) : null}

        <SectionTitle action={<button onClick={() => nav.switchTab('more', { kind: 'prices' })} className="text-[13px] font-bold text-[#123F3A]">كل الأسعار</button>}>
          أسعار المواد
        </SectionTitle>
        <Card onClick={() => nav.switchTab('more', { kind: 'prices' })} className="p-0 overflow-hidden">
          <div className="divide-y divide-neutral-100">
            {(prices?.materials || []).slice(0, 4).map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{m.name_ar}</div>
                  <div className="text-[11px] text-neutral-400">{m.unit_ar}</div>
                </div>
                <div className="text-left">
                  <div className="text-[14px] font-black tabular-nums">{sar(m.price)}</div>
                  {m.monthly_change_pct != null && (
                    <div className={`text-[11px] font-bold tabular-nums ${m.monthly_change_pct > 0 ? 'text-[#C2410C]' : m.monthly_change_pct < 0 ? 'text-[#1a7a45]' : 'text-neutral-400'}`}>
                      {m.monthly_change_pct > 0 ? '▲' : m.monthly_change_pct < 0 ? '▼' : ''} {Math.abs(m.monthly_change_pct).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!prices && <div className="px-4 py-4 text-[13px] text-neutral-400">نجلب الأسعار…</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
