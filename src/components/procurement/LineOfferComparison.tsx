import { useMemo, useState } from 'react'
import type { ConstructionComparison } from '../../api/constructionClient'
import { awardBlockReason } from '../../lib/awardFlow'
import { CELL_LABEL, formatMoney, matrixTotals, sortLinesBySupplier, taxLabel } from '../../lib/requestFile'
import { analyzeComparisonLine, isComparablePrice, priceDifference, type ComparisonCell, type LineAnalysis } from '../../lib/lineOfferComparison'

type Props = { comparison: ConstructionComparison; compact?: boolean; onReviewOffer?: (offer: ConstructionComparison['supplier_responses'][number]) => void }
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

function Price({ cell, analysis, basis }: { cell?: ComparisonCell; analysis: LineAnalysis; basis: 'unit' | 'total' }) {
  if (!cell || !isComparablePrice(cell)) return <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">{cell?.status === 'PRICED' ? 'السعر يحتاج مراجعة' : CELL_LABEL[cell?.status || 'NOT_QUOTED'] || 'لم يسعّر'}<div className="mt-1 text-[10px] text-neutral-400">لا يدخل في تحديد الأقل</div></div>
  const currency = cell.currency?.trim().toUpperCase() || 'عملة غير محددة'
  const lowest = analysis.lowestSupplierIds.includes(cell.supplier_id)
  const difference = priceDifference(cell, analysis, basis)
  return (
    <div className={`rounded-xl border px-3 py-3 ${lowest ? 'border-[#9bd8b1] bg-[#e7f7ec]' : 'border-neutral-100 bg-white'}`}>
      <div className={`text-[10px] font-bold mb-1 ${lowest ? 'text-[#17663c]' : 'text-neutral-400'}`}>{lowest ? analysis.lowestSupplierIds.length > 1 ? 'الأقل · سعر متساوٍ' : 'أقل سعر' : basis === 'unit' ? 'سعر الوحدة' : 'إجمالي البند'}</div>
      <div className={`font-black text-lg whitespace-nowrap tabular-nums ${lowest ? 'text-[#17663c]' : 'text-[#0D1F1D]'}`}><bdi>{number(Number(basis === 'unit' ? cell.unit_price : cell.line_total))}</bdi> <span className="text-[10px] font-semibold">{currency === 'SAR' ? 'ر.س' : currency}</span></div>
      {difference && difference.amount > 0 ? <div className="mt-1 text-[11px] font-semibold text-neutral-500">أعلى بـ <bdi>{number(difference.amount)}</bdi> {currency === 'SAR' ? 'ر.س' : currency}{difference.percent != null && <span> · <bdi>{number(difference.percent)}%</bdi></span>}</div> : <div className="mt-1 text-[11px] text-neutral-500">{formatMoney(basis === 'unit' ? cell.line_total : cell.unit_price, currency)} {basis === 'unit' ? 'إجمالي البند' : 'للوحدة'}</div>}
      <div className="mt-1.5 text-[10px] text-neutral-400">{taxLabel(cell.prices_include_tax)}</div>
    </div>
  )
}

export default function LineOfferComparison({ comparison, compact = false, onReviewOffer }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'comparable' | 'review'>('all')
  const [basis, setBasis] = useState<'unit' | 'total'>('total')
  const [sort, setSort] = useState('original')
  const [layout, setLayout] = useState<'table' | 'cards'>('table')
  const lines = comparison.quote_matrix?.lines || []
  const rows = useMemo(() => lines.map((line, index) => ({ line, index, analysis: analyzeComparisonLine(line) })), [lines])
  const comparableCount = rows.filter((row) => row.analysis.comparable).length
  const suppliers = useMemo(() => {
    const byId = new Map(comparison.supplier_responses.filter((row) => row.supplier.id).map((row) => [String(row.supplier.id), row]))
    for (const line of lines) for (const cell of line.offers) if (!byId.has(cell.supplier_id)) byId.set(cell.supplier_id, { supplier: { id: cell.supplier_id, name_ar: 'مورد بدون اسم' }, offer: {} })
    return [...byId.values()]
  }, [comparison.supplier_responses, lines])
  const nameOf = (id: string) => { const supplier = suppliers.find((row) => row.supplier.id === id)?.supplier; return supplier?.name_ar || supplier?.name_en || 'مورد بدون اسم' }
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const result = rows.filter(({ line, analysis }) => (!needle || `${line.name_ar} ${line.name_en || ''}`.toLowerCase().includes(needle)) && (filter === 'all' || (filter === 'comparable' ? analysis.comparable : !analysis.comparable)))
    if (sort.startsWith('supplier|')) {
      const [, supplierId, dir] = sort.split('|')
      const byId = new Map(result.map((row) => [row.line.id, row]))
      return sortLinesBySupplier(result.map((row) => row.line), { supplierId: decodeURIComponent(supplierId), dir: dir === 'desc' ? 'desc' : 'asc' }).map((line) => byId.get(line.id)!)
    }
    if (sort === 'gap') result.sort((a, b) => Number(b.analysis.comparable) - Number(a.analysis.comparable) || (b.analysis.gapPercent ?? -1) - (a.analysis.gapPercent ?? -1) || a.index - b.index)
    return result
  }, [rows, query, filter, sort])
  const totals = matrixTotals(comparison.quote_matrix ? { ...comparison.quote_matrix, lines: lines.map((line) => ({ ...line, offers: line.offers.map((cell) => isComparablePrice(cell) && cell.currency?.trim() && cell.quantity != null && Math.abs(Number(cell.quantity) - line.quantity) < 0.000001 ? cell : { ...cell, status: 'UNPRICED' }) })) } : null)
  const showTable = !compact && layout === 'table'
  const reviewButton = (row: typeof suppliers[number]) => onReviewOffer && row.offer.quoteVersionId ? <button disabled={Boolean(awardBlockReason(comparison.rfq, row))} title={awardBlockReason(comparison.rfq, row) || undefined} aria-label={`مراجعة ترسية عرض ${nameOf(String(row.supplier.id))}`} onClick={() => onReviewOffer(row)} className="mt-2 block text-[11px] font-bold text-[#123F3A] underline underline-offset-4 disabled:opacity-40">مراجعة الترسية</button> : null
  const heading = (line: typeof lines[number], index: number, analysis: LineAnalysis) => <>
    <div className="flex items-start gap-2"><span className="text-[11px] font-bold text-neutral-400 pt-0.5 shrink-0">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><div className="text-sm font-bold leading-relaxed text-[#0D1F1D]">{line.name_ar}</div><div className="text-[11px] text-neutral-400 mt-1">الكمية: <bdi>{number(line.quantity)}</bdi> {line.uom}</div></div></div>
    {analysis.comparable ? <div className="text-[11px] text-[#17663c] mt-3 font-semibold">الأقل: {analysis.lowestSupplierIds.map(nameOf).join('، ')}{analysis.gap != null && analysis.gap > 0 && <div className="mt-1 text-neutral-400 font-normal">فرق أعلى وأقل عرض: {formatMoney(analysis.gap, analysis.priced[0]?.currency)}</div>}</div> : <div className="text-[11px] leading-relaxed text-amber-700 mt-3">{analysis.reason}</div>}
  </>
  return (
    <section className="space-y-4" dir="rtl" aria-label="مقارنة أسعار البنود">
      <div className={`rounded-2xl bg-[#123F3A] text-white md:flex md:items-center md:justify-between md:gap-6 ${compact ? 'px-4 py-4' : 'px-5 py-5'}`}>
        <div>
        {!compact && <div className="text-[10px] tracking-wide text-[#aee7c0] font-bold mb-1">قرار أوضح · بندًا بندًا</div>}
        <h2 className="text-xl font-black">أقل سعر، في أول نظرة</h2>
        <p className="text-xs leading-relaxed text-white/65 mt-2">{compact ? 'الأخضر للأقل؛ فرق السعر ظاهر في بقية العروض.' : 'الأخضر يحدد أقل سعر قابل للمقارنة. فرق السعر يظهر مباشرة في بقية العروض.'}</p>
        </div>
        <div className={`flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 text-xs md:border-t-0 md:border-r md:pr-6 md:shrink-0 ${compact ? 'mt-3 pt-3 md:mt-0 md:pt-0' : 'mt-4 pt-4 md:mt-0 md:pt-0'}`}><span><strong className="text-lg tabular-nums text-[#CFF5DC]">{comparableCount}</strong> بند قابل للمقارنة</span><span><strong className="text-lg tabular-nums">{lines.length}</strong> بند في الطلب</span><span><strong className="text-lg tabular-nums">{suppliers.length}</strong> مورد</span></div>
      </div>
      <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <input aria-label="بحث في بنود المقارنة" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن بند…" className="min-w-0 flex-1 rounded-xl bg-[#f5f6f3] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#123F3A]/30" />
          <select aria-label="ترتيب بنود المقارنة" value={sort} onChange={(e) => setSort(e.target.value)} className="w-[148px] max-w-full rounded-xl border border-neutral-100 bg-white px-2 py-2 text-xs font-semibold text-neutral-600"><option value="original">ترتيب الطلب</option><option value="gap">أكبر فرق نسبي أولًا</option>{suppliers.map((row) => <option key={row.supplier.id} value={`supplier|${encodeURIComponent(String(row.supplier.id))}|asc`}>إجماليات {nameOf(String(row.supplier.id))} — الأقل أولًا</option>)}</select>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-1">{([['all', `الكل (${rows.length})`], ['comparable', `قابلة للمقارنة (${comparableCount})`], ['review', `تحتاج مراجعة (${rows.length - comparableCount})`]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-[11px] font-bold ${filter === value ? 'bg-[#e0efec] text-[#123F3A]' : 'text-neutral-500 hover:bg-neutral-50'}`}>{label}</button>)}</div>
          <div className="flex rounded-xl bg-neutral-100 p-1">{([['total', 'إجمالي البند'], ['unit', 'سعر الوحدة']] as const).map(([value, label]) => <button key={value} aria-pressed={basis === value} onClick={() => setBasis(value)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${basis === value ? 'bg-white text-[#123F3A] shadow-sm' : 'text-neutral-400'}`}>{label}</button>)}</div>
        </div>
        {!compact && <div className="hidden md:flex justify-between items-center border-t border-neutral-100 pt-3 text-[11px] text-neutral-400"><span>مرّر أفقيًا لمشاهدة جميع الموردين؛ يبقى اسم البند ظاهرًا.</span><div className="flex gap-1">{([['table', 'جدول المقارنة'], ['cards', 'بطاقات البنود']] as const).map(([value, label]) => <button key={value} aria-pressed={layout === value} onClick={() => setLayout(value)} className={`px-3 py-1.5 rounded-lg font-bold ${layout === value ? 'bg-[#123F3A] text-white' : 'bg-neutral-50 text-neutral-500'}`}>{label}</button>)}</div></div>}
      </div>
      <div role="status" className="text-[11px] text-neutral-400 px-1">عرض {visible.length} من {lines.length} بند · {basis === 'total' ? 'الأسعار المعروضة لإجمالي كمية البند' : 'الأسعار المعروضة للوحدة'}</div>
      {visible.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-500">لا توجد بنود تطابق البحث أو التصفية.<button onClick={() => { setQuery(''); setFilter('all') }} className="block mx-auto mt-3 font-bold text-[#123F3A]">عرض كل البنود</button></div> : <>
        {showTable && <div className="hidden md:block max-h-[70vh] overflow-auto rounded-2xl border border-neutral-200 bg-white"><table className="w-full text-right border-separate border-spacing-0"><caption className="sr-only">أسعار الموردين لكل بند، وأقل سعر والفروق حسب أساس الضريبة والعملة</caption><thead className="sticky top-0 z-20"><tr><th scope="col" className="sticky right-0 z-30 min-w-[240px] max-w-[300px] bg-[#f0f4f1] p-4 text-xs font-bold text-[#123F3A] border-b border-neutral-200">البند والكمية</th>{suppliers.map((row) => <th key={row.supplier.id} scope="col" className="min-w-[190px] bg-[#f0f4f1] p-4 text-xs text-[#123F3A] font-bold border-b border-neutral-200"><button className="text-right hover:underline" title="ترتيب البنود حسب إجمالي هذا المورد" onClick={() => { const key = `supplier|${encodeURIComponent(String(row.supplier.id))}`; setSort(sort === `${key}|asc` ? `${key}|desc` : sort === `${key}|desc` ? 'original' : `${key}|asc`) }}>{nameOf(String(row.supplier.id))}</button>{reviewButton(row)}</th>)}</tr></thead><tbody>{visible.map(({ line, index, analysis }) => <tr key={line.id}><th scope="row" className="sticky right-0 z-10 min-w-[240px] max-w-[300px] bg-white p-4 align-top font-normal border-b border-neutral-100 shadow-[-5px_0_8px_-6px_rgba(0,0,0,0.18)]">{heading(line, index, analysis)}</th>{suppliers.map((row) => <td key={row.supplier.id} className="p-3 align-top border-b border-neutral-100"><Price cell={line.offers.find((cell) => cell.supplier_id === row.supplier.id)} analysis={analysis} basis={basis} /></td>)}</tr>)}</tbody></table></div>}
        <div className={`space-y-3 ${showTable ? 'md:hidden' : ''}`}>{visible.map(({ line, index, analysis }) => {
          const ordered = [...suppliers].sort((a, b) => {
            const ac = line.offers.find((cell) => cell.supplier_id === a.supplier.id), bc = line.offers.find((cell) => cell.supplier_id === b.supplier.id)
            if (isComparablePrice(ac) !== isComparablePrice(bc)) return isComparablePrice(ac) ? -1 : 1
            return analysis.comparable && ac && bc ? Number(ac.line_total) - Number(bc.line_total) : 0
          })
          return <article key={line.id} className="rounded-2xl border border-neutral-100 bg-white p-4">{heading(line, index, analysis)}<div className="mt-4 space-y-2">{ordered.map((row) => <div key={row.supplier.id} className="grid grid-cols-[minmax(0,1fr)_minmax(140px,1fr)] gap-3 items-center"><div className="text-xs font-semibold text-neutral-700 leading-relaxed break-words">{nameOf(String(row.supplier.id))}</div><Price cell={line.offers.find((cell) => cell.supplier_id === row.supplier.id)} analysis={analysis} basis={basis} /></div>)}</div></article>
        })}</div>
      </>}
      <details className="rounded-2xl border border-neutral-200 bg-white overflow-hidden"><summary className="cursor-pointer px-4 py-4 font-bold text-sm text-[#123F3A]">إجماليات الموردين وتغطية البنود</summary><p className="px-4 pb-3 text-[11px] leading-relaxed text-neutral-500">مجموع أسعار البنود بحسب أساس الضريبة لكل مورد، دون رسوم التوصيل والتنزيل. الإجمالي الجزئي لا يُقارن بالعرض الكامل. هذه الإجماليات تشمل جميع بنود الطلب حتى عند تصفية القائمة.</p><div className="grid sm:grid-cols-2 gap-3 px-4 pb-4">{suppliers.map((row) => { const total = totals.totals.find((value) => value.supplier_id === row.supplier.id); const currencies = new Set(lines.flatMap((line) => line.offers.filter((cell) => cell.supplier_id === row.supplier.id && isComparablePrice(cell)).map((cell) => cell.currency))); return <div key={row.supplier.id} className={`rounded-xl border p-4 ${totals.lowest === row.supplier.id ? 'border-[#9bd8b1] bg-[#e7f7ec]' : 'border-neutral-100'}`}><div className="text-xs font-bold text-[#123F3A]">{nameOf(String(row.supplier.id))}</div><div className="text-xl font-black tabular-nums mt-2">{currencies.size > 1 ? 'عملات مختلفة' : total?.priced ? formatMoney(total.total, total.currency) : 'لا يوجد إجمالي مسعّر'}</div><div className="mt-2 text-[11px] text-neutral-500">{total ? `${total.priced} من ${total.requested} بند · ${total.complete ? 'تغطية كاملة' : 'عرض جزئي'}` : 'التغطية غير متاحة'}</div>{totals.lowest === row.supplier.id && <div className="mt-2 text-[11px] font-bold text-[#17663c]">أقل إجمالي بنود لعرض كامل قابل للمقارنة</div>}{reviewButton(row)}</div> })}</div></details>
      <p className="text-[11px] leading-relaxed text-neutral-400">تحديد الأقل يشترط سعرين صالحين على الأقل بنفس العملة وشمول الضريبة. اللون الأخضر للمقارنة؛ اختيار المورد والترسية قرار مستقل.</p>
    </section>
  )
}
