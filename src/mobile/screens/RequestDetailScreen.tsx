import { supplierDisplayName } from '../../lib/presentationQuality'
import { quoteCompleteness } from '../../lib/quoteCompleteness'
import { useState, useEffect } from 'react'
import {
  formatArDate,
  formatInviteDeliveryStatus,
  formatInviteResponseStatus,
  formatRfqReference,
  formatRfqTitle,
  getConstructionComparison,
  getConstructionRfq,
  type ConstructionComparison,
  type ConstructionRfq,
} from '../../api/constructionClient'
import RfqDraftEditModal from '../../components/RfqDraftEditModal'
import RfqRevisionModal from '../../components/RfqRevisionModal'
import DiscountRequestDialog from '../../components/DiscountRequestDialog'
import { requestCreatorLabel } from '../../lib/rfqIdentity'
import { isReadOnlyBuild } from '../../api/readOnlyMode'
import type { Nav } from '../MobileApp'
import { Avatar, Card, ErrorNote, Group, Pill, Progress, Row, Screen, SectionTitle, Skeleton, Stat, num, sar, useLoad } from '../ui'
import { requestState } from './RequestsScreen'

type Offer = {
  inviteId?: string
  quoteVersionId?: string
  supplierId: string
  name: string
  total: number | null
  priced: number
  requested: number
  complete: boolean
  readiness: ReturnType<typeof quoteCompleteness>
  currency: string
  taxBasis: boolean | null
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
        inviteId: r.offer?.inviteId,
        quoteVersionId: r.offer?.quoteVersionId,
        supplierId: id,
        name: supplierDisplayName(r.supplier?.name_ar, r.supplier?.name_en),
        total: total == null ? null : num(total),
        priced: sum?.coverage.priced ?? 0,
        requested: sum?.coverage.requested ?? c.quote_matrix?.requested_line_count ?? 0,
        complete: Boolean(sum?.coverage.complete) && quoteCompleteness(r.offer).status==='COMPLETE' && (sum?.coverage.priced ?? 0)>=(c.rfq.current_version?.payload?.lines?.length || Infinity),
        readiness: quoteCompleteness(r.offer), currency: r.offer.currency || '', taxBasis: r.offer.prices_include_tax ?? null,
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
  const comparison = useLoad<ConstructionComparison | null>(() => getConstructionComparison(id).catch(() => null), [id])
  const [allLines, setAllLines] = useState(false)
  const [editing, setEditing] = useState(false)
  const [discount, setDiscount] = useState<Offer | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(()=>{const refresh=(event:Event)=>{if((event as CustomEvent).detail?.rfqId===id){void rfq.reload();void comparison.reload()}};window.addEventListener('ahmad-rfq-updated',refresh);return()=>window.removeEventListener('ahmad-rfq-updated',refresh)},[id,rfq.reload,comparison.reload])

  const r = rfq.data
  const offers = offersOf(comparison.data)
  const lines = (r?.current_version?.payload?.lines || []) as Array<Record<string, unknown>>
  const delivery = r?.current_version?.payload?.delivery
  const title = r ? formatRfqTitle({ id: r.id, delivery, engineering_department: r.engineering_department, buyer: r.current_version?.payload?.buyer }) : 'الطلب'
  const st = r ? requestState({ status: r.status, award_id: r.award?.id, response_count: r.response_count, supplier_count: r.supplier_count }) : null
  const eligible = offers.filter(o=>o.complete && o.total!=null && o.currency==='SAR' && o.taxBasis!==null)
  const best = new Set(eligible.map(o=>o.taxBasis)).size===1 && eligible.filter(o=>o.total===eligible[0]?.total).length===1 ? eligible[0] : undefined

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
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-100">
              <Stat label="بند" value={lines.length || '—'} />
              <Stat label="مورد" value={r.supplier_count} />
              <Stat label="عرض" value={r.response_count} tone={r.response_count ? 'good' : undefined} />
            </div>
            <div className="mt-4 space-y-1.5 text-[13px] text-neutral-500">
              <div>منشئ الطلب: <span className="text-[#0D1F1D] font-semibold">{requestCreatorLabel(r.creator)}</span></div>
              {delivery?.city && <div>المدينة: <span className="text-[#0D1F1D] font-semibold">{delivery.city}</span></div>}
              {delivery?.required_date && <div>التوريد المطلوب: <span className="text-[#0D1F1D] font-semibold">{formatArDate(delivery.required_date)}</span></div>}
              <div>تاريخ الطلب: <span className="text-[#0D1F1D] font-semibold">{formatArDate(r.created_at)}</span></div>
            </div>
          </Card>

          {notice && <p role="status" className="mt-3 text-sm text-[#1a7a45]">{notice}</p>}
          {!isReadOnlyBuild && !r.award && !['CANCELLED', 'CLOSED'].includes(r.status) && <button onClick={() => setEditing(true)} className="mt-3 w-full py-3 rounded-xl border border-[#123F3A] font-bold text-[#123F3A]">تعديل الطلب</button>}
          {editing && (r.status === 'DRAFT_NOT_SENT' ? <RfqDraftEditModal rfq={r} onClose={() => setEditing(false)} onSaved={() => { setNotice('حُفظت التعديلات دون إرسال للموردين.'); void rfq.reload() }} /> : <RfqRevisionModal rfqId={r.id} onClose={() => setEditing(false)} onSent={() => { setEditing(false); void rfq.reload(); void comparison.reload() }} />)}
          {discount?.inviteId && discount.quoteVersionId && <DiscountRequestDialog inviteId={discount.inviteId} quoteVersionId={discount.quoteVersionId} supplierName={discount.name} onClose={() => setDiscount(null)} />}
          {r.award && (
            <Card className="p-4 mt-3 border border-[#CFF5DC]">
              <div className="text-[13px] font-bold text-[#1a7a45]">تمت الترسية</div>
              <div className="text-[20px] font-black mt-1">{r.award.approved_total ? sar(r.award.approved_total) : '—'}</div>
              {r.award.selection_reason && <p className="text-[13px] text-neutral-500 mt-1 leading-relaxed">{r.award.selection_reason}</p>}
            </Card>
          )}

          <SectionTitle>العروض {offers.length ? `(${offers.length})` : ''}</SectionTitle>
          {comparison.loading && !comparison.data ? (
            <Skeleton rows={2} height={80} />
          ) : offers.length === 0 ? (
            <Card className="p-5 text-center text-[14px] text-neutral-500">لم يصل أي عرض بعد.</Card>
          ) : (
            <div className="space-y-3">
              {offers.map((o) => {
                const isBest = best && o.supplierId === best.supplierId
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
                        {isBest && <div className="text-[11px] font-bold text-[#1a7a45]">الأقل سعرًا</div>}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-amber-800">{o.readiness.status==='COMPLETE'?'مكتمل المعلومات':o.readiness.status==='PARTIAL'?'عرض جزئي':'يحتاج استكمال'}{o.readiness.missing.length>0 && <p>{o.readiness.missing.join('، ')}</p>}</div>
                    {o.quoteVersionId && <button onClick={()=>{window.dispatchEvent(new CustomEvent('ahmad-page-context',{detail:{rfqId:id,quoteVersionId:o.quoteVersionId,supplierId:o.supplierId}}));window.dispatchEvent(new Event('ahmad-open'))}} className="mt-3 w-full py-2 rounded-xl border text-sm">راجع هذا العرض مع أحمد</button>}
                    {!isReadOnlyBuild && !r.award && o.inviteId && o.quoteVersionId && <button onClick={() => setDiscount(o)} className="mt-3 w-full py-2.5 rounded-xl border border-[#123F3A]/30 font-bold text-[#123F3A]">اطلب تخفيض العرض</button>}
                    {o.requested > 0 && (
                      <div className="mt-3">
                        <div className="text-[12px] text-neutral-500 mb-1">
                          سعّر {o.priced} من {o.requested} بند{o.complete ? ' · عرض كامل' : ''}
                        </div>
                        <Progress percent={(o.priced / o.requested) * 100} />
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          <SectionTitle>الموردون المحددون ({r.invitations.length})</SectionTitle>
          <Group>
            {r.invitations.map((inv) => {
              const name = supplierDisplayName(inv.supplier?.name_ar, inv.supplier?.name_en)
              const resp = String(inv.response_status || '').toUpperCase()
              const tone = resp === 'QUOTED' || resp === 'RESPONDED' ? 'good' : resp === 'DECLINED' || resp === 'EXPIRED' ? 'bad' : 'neutral'
              return (
                <Row
                  key={inv.id}
                  leading={<Avatar name={name} size={36} />}
                  title={name}
                  subtitle={[inv.supplier?.city, formatInviteDeliveryStatus(inv.delivery_status)].filter(Boolean).join(' · ')}
                  trailing={<Pill tone={tone}>{formatInviteResponseStatus(inv.response_status, inv.delivery_status)}</Pill>}
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
                    <div className="flex-1 min-w-0 text-[14px] leading-snug">{lineName(l)}{l.item_note ? <p className="mt-1 text-xs text-neutral-500 whitespace-pre-line">{String(l.item_note)}</p> : null}{l.spec_card && typeof l.spec_card === 'object' ? <p className="mt-1 text-xs text-neutral-500">{Object.entries(l.spec_card).filter(([key]) => ['dimensions','thickness','material','finish'].includes(key)).map(([,v]) => String(v)).filter(Boolean).join(' · ')}</p> : null}</div>
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
    </Screen>
  )
}
