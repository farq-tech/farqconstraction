import { useState } from 'react'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { addConstructionRfqSuppliers, getRfqSupplierPlan } from '../api/constructionClient'
import { extraPlanSuppliers } from '../lib/extraPlanSuppliers'
import {
  channelClass,
  channelLabel,
  channelSummary,
  isPlanServiceOff,
  kindLabel,
  type PlanSupplier,
  type SupplierPlan,
} from '../lib/supplierPlan'

/**
 * «مطابقة الموردين على مستوى الطلب» — the v2 supplier plan for this request.
 *
 * An add-on: the parent renders this only when the account has the
 * `supplier_match_v2` service. Read-only — it explains who matches and how
 * they are reached; adding them to the request is still the buyer's action.
 * Nothing is fetched until the section is opened.
 */
const PREVIEW = 8

function SupplierRow({ s }: { s: PlanSupplier }) {
  const kind = kindLabel(s.kind)
  return (
    <div className="flex flex-wrap items-start gap-2 py-2 border-b border-neutral-100 last:border-0">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-semibold text-[#0D1F1D]">
          {s.name_ar}
          {s.invited && <span className="mr-2 text-[11px] font-semibold text-neutral-500">(مدعو)</span>}
        </div>
        <div className="mt-0.5 text-xs text-neutral-500">{s.why_ar}</div>
        {s.mobile_hint_ar && <div className="mt-0.5 text-[11px] text-rose-600">{s.mobile_hint_ar}</div>}
        {s.blocked_reason_ar && <div className="mt-0.5 text-[11px] text-rose-600">{s.blocked_reason_ar}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.outcome_ar && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{s.outcome_ar}</span>}
        {kind && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{kind}</span>}
        {s.tier === 'MEDIUM' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-50 text-neutral-500">دليل متوسط</span>}
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${channelClass(s.channel)}`}>{channelLabel(s)}</span>
        {s.city && <span className="text-[11px] text-neutral-400">{s.city}</span>}
      </div>
    </div>
  )
}

function Lane({ title, subtitle, suppliers, needs, blocked }: {
  title: string
  subtitle?: string
  suppliers: PlanSupplier[]
  needs: PlanSupplier[]
  blocked: PlanSupplier[]
}) {
  const [all, setAll] = useState(false)
  const [side, setSide] = useState(false)
  const shown = all ? suppliers : suppliers.slice(0, PREVIEW)
  return (
    <div className="bg-white border border-neutral-100 rounded-xl px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold text-sm text-[#0D1F1D]">{title}</div>
        <div className="text-xs text-neutral-500">
          {suppliers.length} يصلهم الطلب
          {needs.length > 0 && ` · ${needs.length} يحتاج رقم جوال`}
          {blocked.length > 0 && ` · ${blocked.length} محجوب`}
        </div>
      </div>
      {subtitle && <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>}
      <div className="mt-2">
        {shown.length === 0 ? <div className="text-xs text-neutral-400 py-2">لا مورد بدليل كافٍ في مدينة الطلب.</div> : shown.map((s) => <SupplierRow key={s.id} s={s} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
        {suppliers.length > PREVIEW && (
          <button className="text-[#123F3A]" onClick={() => setAll(!all)}>{all ? 'عرض أقل' : `عرض الكل (${suppliers.length})`}</button>
        )}
        {(needs.length > 0 || blocked.length > 0) && (
          <button className="text-neutral-500" onClick={() => setSide(!side)}>{side ? 'إخفاء غير المتاحين' : 'غير المتاحين للإرسال'}</button>
        )}
      </div>
      {side && (
        <div className="mt-2 border-t border-dashed border-neutral-200 pt-2">
          {needs.map((s) => <SupplierRow key={`n-${s.id}`} s={s} />)}
          {blocked.map((s) => <SupplierRow key={`b-${s.id}`} s={s} />)}
        </div>
      )}
    </div>
  )
}

export default function SupplierPlanPanel({ rfqId }: { rfqId: string }) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<SupplierPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addedNote, setAddedNote] = useState('')
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<Array<{id:string;name:string;city:string}>>([])
  async function findSuppliers() {
    setError(null)
    try {
      const result = await listConstructionSuppliers({query:search.trim(),limit:20,offset:0,contactableOnly:true})
      setHits(result.suppliers.map(s=>({id:s.id,name:s.name,city:s.city})))
    } catch { setError('تعذر البحث في الدليل') }
  }
  async function addFound(id:string) {
    if (!plan || adding) return
    setAdding(true)
    setError(null)
    try {
      const result = await addConstructionRfqSuppliers(rfqId,[{external_key:id,line_keys:plan.lines.map(l=>l.key)}])
      setAddedNote(result.invites.some(i=>i.status==='CREATED') ? 'أضيف المورد إلى الطلب دون إرسال.' : 'المورد موجود في الطلب.')
      setHits(h=>h.filter(s=>s.id!==id))
      setPlan(await getRfqSupplierPlan(rfqId))
    } catch { setError('تعذر إضافة المورد') } finally { setAdding(false) }
  }
  const extras = plan ? extraPlanSuppliers(plan) : []

  async function addAll() {
    setAdding(true)
    setError(null)
    let added = 0
    try {
      for (let start = 0; start < extras.length; start += 100) {
        const result = await addConstructionRfqSuppliers(rfqId, extras.slice(start, start + 100))
        added += result.invites.filter(i => i.status === 'CREATED').length
      }
      setAddedNote(`أُضيف ${added} موردين لنفس الطلب. لم يُرسل لهم بعد؛ راجع الإرسال من قائمة الموردين.`)
      setPlan(await getRfqSupplierPlan(rfqId))
    } catch {
      setError(`تعذر إكمال الإضافة. أُضيف ${added} موردين قبل التوقف؛ أعد فتح المطابقة قبل المحاولة.`)
      setPlan(await getRfqSupplierPlan(rfqId).catch(() => null))
    } finally { setAdding(false) }
  }

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || plan || loading) return
    setLoading(true)
    setError(null)
    try {
      setPlan(await getRfqSupplierPlan(rfqId))
    } catch (err) {
      if (isPlanServiceOff(err)) setHidden(true)
      else setError('تعذّر تحميل مطابقة الموردين. حاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  if (hidden) return null
  return (
    <div className="mt-4 space-y-2">
      <button
        onClick={toggle}
        className="w-full text-right bg-[#123F3A]/5 border border-[#123F3A]/20 rounded-xl px-4 py-3 font-bold text-sm text-[#123F3A]"
      >
        {open ? '▾' : '▸'} مطابقة الموردين على مستوى الطلب
      </button>
      {open && loading && <div className="text-xs text-neutral-500 px-1">جارٍ قراءة الطلب والبحث في الدليل…</div>}
      {open && error && <div className="text-xs text-rose-600 px-1">{error}</div>}
      {open && addedNote && <p role="status" className="text-sm text-[#123F3A]">{addedNote}</p>}
      {open && plan && <div className="rounded-xl border p-3 space-y-2">
        <p className="text-sm">إضافة مورد متخصص من الدليل بعد مراجعة نشاطه — دون إرسال</p>
        <input aria-label="بحث مورد إضافي" value={search} onChange={e=>setSearch(e.target.value)} className="border rounded p-2" />
        <button disabled={search.trim().length<2 || adding} onClick={()=>void findSuppliers()}>بحث</button>
        {hits.map(s=><div key={s.id} className="flex justify-between"><span>{s.name} · {s.city}</span><button disabled={adding} onClick={()=>void addFound(s.id)}>إضافة إلى الطلب</button></div>)}
      </div>}
      {open && extras.length > 0 && <button disabled={adding} onClick={() => void addAll()} className="rounded-xl bg-[#123F3A] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
        {adding ? 'جارٍ إضافة الموردين…' : `إضافة جميع الموردين الإضافيين بدليل قوي (${extras.length}) — دون إرسال`}
      </button>}
      {open && plan && (
        <div className="space-y-2">
          <div className="bg-white border border-neutral-100 rounded-xl px-4 py-3 text-sm">
            <div className="font-bold text-[#0D1F1D]">
              {plan.request.scope_ar}
              {plan.request.packages.length > 0 && ` — ${plan.request.packages.map((p) => p.label_ar).join('، ')}`}
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {plan.request.city ? `مدينة الطلب: ${plan.request.city}${plan.request.district ? ` (${plan.request.district})` : ''}` : 'لا مدينة محددة للطلب'}
              {' · '}
              {plan.totals.sendable} مورد يصلهم الطلب
              {plan.totals.by_channel && ` (${channelSummary(plan.totals.by_channel)})`}
              {plan.totals.blocked > 0 && ` · ${plan.totals.blocked} محجوب بالصلاحيات`}
            </div>
            {plan.selection.length > 0 && (
              <div className="text-xs text-neutral-500 mt-1">الاختيار المقترح للإرسال: {plan.selection.length} مورد (يمكن توسيعه من القوائم أدناه).</div>
            )}
          </div>
          {plan.contractors.map((c) => (
            <Lane
              key={c.package}
              title={`مقاولون ومصانع — ${c.label_ar}`}
              subtitle="يسعّرون الأعمال كاملة (توريد وتركيب)."
              suppliers={c.suppliers}
              needs={c.needs_mobile}
              blocked={c.blocked}
            />
          ))}
          {plan.lines.filter((l) => !l.unclassified).map((l) => (
            <Lane
              key={l.key}
              title={`${l.trade_label_ar || ''} — ${l.name}`}
              suppliers={l.suppliers}
              needs={l.needs_mobile}
              blocked={l.blocked}
            />
          ))}
          {plan.lines.some((l) => l.unclassified) && (
            <div className="text-xs text-neutral-500 px-1">
              بنود لم يُحدَّد تخصصها: {plan.lines.filter((l) => l.unclassified).map((l) => l.name).join('، ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
