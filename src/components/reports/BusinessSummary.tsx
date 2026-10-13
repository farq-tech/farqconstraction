import type { ConstructionReports } from '../../api/constructionClient'
import { formatArDate } from '../../api/constructionClient'

export function ReportModeSwitch({ mode, onChange }: { mode: 'business' | 'operations'; onChange: (mode: 'business' | 'operations') => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1 my-4 print:hidden" aria-label="عرض التقارير">
      {([['business', 'ملخص الأعمال'], ['operations', 'متابعة التشغيل']] as const).map(([value, label]) => (
        <button key={value} aria-pressed={mode === value} onClick={() => onChange(value)} className={`rounded-xl px-3 py-3 text-sm font-bold transition-colors ${mode === value ? 'bg-[#123F3A] text-white shadow-sm' : 'text-neutral-500'}`}>{label}</button>
      ))}
    </div>
  )
}

export default function BusinessSummary({ data, period, onOpenRequests }: { data: ConstructionReports; period: string; onOpenRequests: () => void }) {
  const t = data.totals
  const count = (value: number) => value.toLocaleString('en-US')
  const potential = Number(data.savings.potential)
  return (
    <div dir="rtl" className="space-y-5">
      <section className="rounded-3xl bg-[#123F3A] p-6 text-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
          <span>نشاط المشتريات وفرص الدفع</span>
          <span className="rounded-full border border-white/20 px-3 py-1">{period}</span>
        </div>
        <h2 className="mt-6 text-2xl sm:text-3xl font-black leading-snug">من طلب المشروع<br />إلى فرصة الدفع</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/75">طلبات وعروض أسعار فعلية تجمع احتياج المشاريع بالموردين، تمهيدًا لربط الترسية بالدفع.</p>
        <div className="mt-6 border-t border-white/15 pt-5">
          <div className="text-5xl font-black tabular-nums text-[#CFF5DC]">{count(t.suppliers_participating)}</div>
          <div className="mt-2 text-sm font-bold">موردون شاركوا بأسعار</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="نشاط التسعير">
        {[[t.projects, 'مشاريع في المنصة'], [t.line_offers_total, 'أسعار مستلمة على البنود'], [t.priced_lines, 'بنود وصلها سعر'], [data.funnel.two_offers, 'بنود قابلة لمقارنة الأسعار']].map(([value, label]) => (
          <div key={String(label)} className="rounded-2xl border border-neutral-100 bg-white p-4">
            <div className="text-3xl font-black text-[#123F3A] tabular-nums">{count(Number(value))}</div>
            <div className="mt-2 text-xs font-semibold text-neutral-500">{label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#bde8ce] bg-[#effaf3] p-5">
        <h3 className="text-sm font-bold text-[#123F3A]">فرصة خفض التكلفة</h3>
        <div className="mt-2 text-3xl sm:text-4xl font-black text-[#1a7a45] tabular-nums">{Number.isFinite(potential) && potential > 0 ? `${count(Math.round(potential))} ر.س` : 'بانتظار عروض قابلة للمقارنة'}</div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">فرق أقل وأعلى عرض على البنود التي وصلها عرضان فأكثر. فرصة تقديرية من مقارنة الأسعار، وليست توفيرًا محققًا أو قيمة مدفوعات.</p>
      </section>

      <section className="rounded-2xl border border-neutral-100 bg-white p-5">
        <h3 className="font-black text-[#123F3A]">رحلة المشتريات</h3>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
          {['طلب شراء', 'عروض أسعار', 'مقارنة', 'ترسية', 'دفع للمورد'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-neutral-300">←</span>}
              <span className={`rounded-xl px-3 py-2 ${i === 4 ? 'border border-dashed border-[#123F3A]/40 text-[#123F3A]' : 'bg-neutral-100 text-neutral-600'}`}>{step}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-neutral-500">الدفع للمورد خطوة الشراكة المقترحة. هذا التقرير يعرض نشاط التسعير، ولا يثبت تنفيذ مشتريات أو مدفوعات.</p>
        <button onClick={onOpenRequests} className="mt-4 rounded-xl bg-[#123F3A] px-4 py-3 text-sm font-bold text-white print:hidden">استعراض الطلبات والعروض ←</button>
      </section>
      <p className="text-center text-xs text-neutral-400">الفترة: {period} · حُدّث {formatArDate(data.generated_at)} · الأرقام من سجلات النظام</p>
    </div>
  )
}
