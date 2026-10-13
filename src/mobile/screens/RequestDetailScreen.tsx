import { useState } from 'react'
import LineOfferComparison from '../../components/procurement/LineOfferComparison'
import AwardDialog from '../../components/procurement/AwardDialog'
import StepDialog from '../../components/procurement/StepDialog'
import { awardBlockReason, type AwardOffer } from '../../lib/awardFlow'
import { matrixTotals, quoteCoverage, quoteDeadline, taxLabel } from '../../lib/requestFile'
import {
  formatArDate,
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqReference,
  formatRfqTitle,
  getConstructionMe,
  getConstructionComparison,
  getConstructionRfq,
  type ConstructionComparison,
  type ConstructionRfq,
} from '../../api/constructionClient'
import type { Nav } from '../MobileApp'
import { Avatar, Card, ErrorNote, Group, Pill, Progress, Row, Screen, SectionTitle, Skeleton, Stat, num, sar, useLoad } from '../ui'
import { requestState } from './RequestsScreen'

type Offer = {
  supplierId: string
  row: AwardOffer
  name: string
  total: number | null
  priced: number
  requested: number
  complete: boolean
  submittedAt?: string
}

function offersOf(c: ConstructionComparison | null): Offer[] {
  if (!c) return []
  const summaries = new Map((c.quote_matrix?.supplier_summaries || []).map((s) => [s.supplier_id, s]))
  return (c.supplier_responses || [])
    .map((r) => {
      const id = String(r.supplier?.id || '')
      const sum = summaries.get(id)
      const total = sum?.totals?.total ?? r.offer?.totals?.total ?? null
      return {
        supplierId: id,
        row: r,
        name: r.supplier?.name_ar || r.supplier?.name_en || 'مورد',
        total: total == null || !Number.isFinite(Number(total)) ? null : Number(total),
        priced: sum?.coverage.priced ?? 0,
        requested: c.quote_matrix?.requested_line_count ?? sum?.coverage.requested ?? 0,
        complete: Boolean(sum && sum.coverage.priced >= (c.quote_matrix?.requested_line_count ?? sum.coverage.requested)),
        submittedAt: r.offer?.submittedAt,
      }
    })
    .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
}

function lineName(l: Record<string, unknown>): string {
  return String(l.name_ar || l.description_ar || l.description || l.item_name || l.name || 'بند')
}

export default function RequestDetailScreen({ id, nav }: { id: string; nav: Nav }) {
  const rfq = useLoad<ConstructionRfq>(() => getConstructionRfq(id), [id])
  const comparison = useLoad<ConstructionComparison | null>(() => getConstructionComparison(id), [id])
  const [awarding, setAwarding] = useState<AwardOffer | null>(null)
  const me = useLoad(getConstructionMe, [])
  const [stepping, setStepping] = useState<'close' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [allLines, setAllLines] = useState(false)

  const r = rfq.data
  const offers = offersOf(comparison.data)
  const lines = (r?.current_version?.payload?.lines || []) as Array<Record<string, unknown>>
  const delivery = r?.current_version?.payload?.delivery
  const title = r ? formatRfqTitle({ id: r.id, delivery, engineering_department: r.engineering_department, buyer: r.current_version?.payload?.buyer }) : 'الطلب'
  const activeAward = r?.award && r.award.status !== 'CANCELLED' ? r.award : null
  const st = r ? requestState({ status: r.status, award_id: activeAward?.id, response_count: r.response_count, supplier_count: r.supplier_count }) : null
  const totals = matrixTotals(comparison.data?.quote_matrix)
  const payload = r?.current_version?.payload as { quote_deadline?: string; quote_deadline_time?: string } | undefined
  const deadline = quoteDeadline(payload?.quote_deadline, payload?.quote_deadline_time)
  const canClose = r && !activeAward && !r.submission_closed_at && ['SENT', 'PARTIALLY_SENT'].includes(r.status)

  return (
    <Screen title={title} onBack={nav.back}>
      {rfq.error && <ErrorNote message={rfq.error} onRetry={rfq.reload} />}
      {!r ? (
        <div className="pt-4">
          <Skeleton rows={4} height={110} />
        </div>
      ) : (
        <>
          <Card className="p-4 mt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black text-[19px] leading-snug">{title}</div>
                <div className="text-[12px] text-neutral-400 mt-1" dir="ltr" style={{ textAlign: 'right' }}>
                  {formatRfqReference(r.id, r.engineering_department as { key?: string } | null)}
                </div>
              </div>
              {st && <Pill tone={st.tone}>{st.label}</Pill>}
            </div>
            <details className="mt-3"><summary className="text-xs font-bold text-[#123F3A] cursor-pointer">تفاصيل الطلب والموردين</summary>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-neutral-100">
              <Stat label="بند" value={lines.length || '—'} />
              <Stat label="مورد" value={r.supplier_count} />
              <Stat label="عرض" value={r.response_count} tone={r.response_count ? 'good' : undefined} />
            </div>
            <div className="mt-4 space-y-1.5 text-[13px] text-neutral-500">
              {delivery?.city && <div>المدينة: <span className="text-[#0D1F1D] font-semibold">{delivery.city}</span></div>}
              {delivery?.required_date && <div>التوريد المطلوب: <span className="text-[#0D1F1D] font-semibold">{formatArDate(delivery.required_date)}</span></div>}
              <div>تاريخ الطلب: <span className="text-[#0D1F1D] font-semibold">{formatArDate(r.created_at)}</span></div>
            </div>
            </details>
          </Card>

          {comparison.data?.quote_matrix?.lines.length ? <div className="mt-5"><LineOfferComparison key={id} comparison={comparison.data} compact onReviewOffer={!activeAward && r.status !== 'CANCELLED' ? (row) => setAwarding(row) : undefined} /></div> : null}
          <Card className="p-4 mt-3">
            <div className="text-[13px] font-bold text-[#123F3A]">العروض ← المقارنة ← مراجعة القرار ← الترسية</div>
            <p className="text-[12px] text-neutral-500 mt-2 leading-relaxed">راجع البنود والأسعار والضريبة ومدة التوريد، ثم اختر المورد وسجّل سبب الاختيار والمشروع قبل التأكيد.</p>
            {canClose && <button onClick={() => setStepping('close')} className="mt-3 w-full py-3 rounded-xl border border-neutral-200 text-sm font-bold">إغلاق استلام العروض</button>}
          </Card>
          {notice && <div role="status" className="mt-3 rounded-xl bg-[#CFF5DC] p-4 text-sm text-[#123F3A]">{notice}</div>}
          {activeAward && (
            <Card className="p-4 mt-3 border border-[#CFF5DC]">
              <div className="text-[13px] font-bold text-[#1a7a45]">تمت الترسية</div>
              <div className="text-[20px] font-black mt-1">{activeAward.approved_total != null ? sar(activeAward.approved_total) : '—'}</div>
              {activeAward.project_name && <div className="text-[13px] mt-2">المشروع: {activeAward.project_name}</div>}
              {activeAward.selection_reason && <p className="text-[13px] text-neutral-500 mt-1 leading-relaxed">{activeAward.selection_reason}</p>}
            </Card>
          )}

          <div className="flex items-center justify-between"><SectionTitle>العروض {offers.length ? `(${offers.length})` : ''}</SectionTitle><button disabled={comparison.loading || rfq.loading} onClick={() => { rfq.reload(); comparison.reload() }} className="text-xs font-bold text-[#123F3A] disabled:opacity-40">تحديث العروض</button></div>
          {comparison.error && <ErrorNote message="تعذر تحميل العروض. أعد المحاولة." onRetry={comparison.reload} />}
          {comparison.loading && !comparison.data ? (
            <Skeleton rows={2} height={80} />
          ) : offers.length === 0 ? (
            <Card className="p-5 text-center text-[14px] text-neutral-500">{comparison.error ? 'العروض غير متاحة حاليًا.' : 'لم يصل أي عرض بعد.'}</Card>
          ) : (
            <div className="space-y-3">
              {offers.map((o) => {
                const isBest = totals.lowest === o.supplierId
                const block = awardBlockReason(r, o.row)
                return (
                  <Card key={o.supplierId || o.name} className={`p-4 ${isBest ? 'ring-2 ring-[#1a7a45]/40' : ''}`}>
                    <div className="flex items-center gap-3">
                      <Avatar name={o.name} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[15px] truncate">{o.name}</div>
                        <div className="text-[12px] text-neutral-400">{o.submittedAt ? formatArDate(o.submittedAt) : ''}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-[17px] font-black tabular-nums">{o.total != null ? sar(o.total) : '—'}</div>
                        {isBest && <div className="text-[11px] font-bold text-[#1a7a45]">أقل إجمالي بنود لعرض كامل</div>}
                      </div>
                    </div>
                    <div className="mt-2 text-[12px] text-neutral-500">{taxLabel(o.row.offer.prices_include_tax)}</div>
                    {o.requested > 0 && (
                      <div className="mt-3">
                        <div className="text-[12px] text-neutral-500 mb-1">
                          سعّر {o.priced} من {o.requested} بند{o.complete ? ' · عرض كامل' : ''}
                        </div>
                        <Progress percent={(o.priced / o.requested) * 100} />
                      </div>
                    )}
                    {!activeAward && r.status !== 'CANCELLED' && <><button disabled={Boolean(block)} onClick={() => setAwarding(o.row)} className="mt-3 w-full py-3 rounded-xl bg-[#123F3A] text-white text-sm font-bold disabled:opacity-40">مراجعة العرض والترسية</button>{block && <p className="mt-2 text-xs text-amber-700">{block}</p>}</>}
                  </Card>
                )
              })}
            </div>
          )}

          <SectionTitle>الموردون المدعوون ({r.invitations.length})</SectionTitle>
          <Group>
            {r.invitations.map((inv) => {
              const name = inv.supplier?.name_ar || inv.supplier?.name_en || 'مورد'
              const resp = String(inv.response_status || '').toUpperCase()
              const tone = resp === 'QUOTED' || resp === 'RESPONDED' ? 'good' : resp === 'DECLINED' || resp === 'EXPIRED' ? 'bad' : 'neutral'
              return (
                <Row
                  key={inv.id}
                  leading={<Avatar name={name} size={36} />}
                  title={name}
                  subtitle={[inv.supplier?.city, formatInviteDeliveryStatus(inv.delivery_status)].filter(Boolean).join(' · ')}
                  trailing={<Pill tone={tone}>{formatInviteResponseStatus(inv.response_status)}</Pill>}
                  chevron={false}
                />
              )
            })}
          </Group>

          {lines.length > 0 && (
            <>
              <SectionTitle>البنود ({lines.length})</SectionTitle>
              <Group>
                {(allLines ? lines : lines.slice(0, 6)).map((l, i) => (
                  <div key={String(l.id || i)} className="px-4 py-3 flex items-start gap-3">
                    <span className="shrink-0 w-6 text-[12px] text-neutral-400 tabular-nums pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0 text-[14px] leading-snug">{lineName(l)}</div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">
                      {num(l.quantity).toLocaleString('en-US')} <span className="text-neutral-400 font-normal">{String(l.uom || '')}</span>
                    </span>
                  </div>
                ))}
                {lines.length > 6 && (
                  <button onClick={() => setAllLines((v) => !v)} className="w-full py-3 text-[14px] font-bold text-[#123F3A]">
                    {allLines ? 'عرض أقل' : `عرض كل البنود (${lines.length})`}
                  </button>
                )}
              </Group>
            </>
          )}
        </>
      )}
      {r && stepping && <StepDialog openEnvelopes={String(me.data?.role).toUpperCase() === 'ADMIN'} step={stepping} rfq={r} deadlinePassed={Boolean(deadline?.passed)} quoted={r.response_count} onClose={() => setStepping(null)} onDone={() => { setStepping(null); rfq.reload(); comparison.reload() }} />}
      {r && comparison.data && awarding && <AwardDialog rfq={r} comparison={comparison.data} offer={awarding} coverage={quoteCoverage(comparison.data.quote_matrix?.supplier_summaries?.find((sum) => sum.supplier_id === awarding.supplier.id), comparison.data.quote_matrix?.requested_line_count)} onClose={() => setAwarding(null)} onDone={() => { setNotice(`تم تسجيل الترسية على ${awarding.supplier.name_ar || awarding.supplier.name_en || 'المورد'}. لم يتم تنفيذ دفع.`); setAwarding(null); rfq.reload(); comparison.reload() }} />}
    </Screen>
  )
}
