import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelConstructionDispatch,
  countHarajSupplierIds,
  createConstructionRfq,
  fetchConstructionWhatsAppPricing,
  getConstructionDispatch,
  invitePreferredChannel,
  matchConstructionBoqCatalog,
  parseConstructionBoqPdf,
  startConstructionDispatch,
  getConstructionRfq,
  type BoqReadProgress,
} from '../../api/constructionClient'
import { listConstructionSuppliers, resolveRfqSupplierIds } from '../../api/constructionSuppliers'
import { farqSession } from '../../api/farqSession'
import { autoPickConfident, buildPickContext } from '../../lib/autoPick'
import { loadCompanyProfile } from '../../lib/companyProfile'
import { matchSuppliersForItems, rowsToLines, sanitizeBoqLines, type ParsedLine } from '../../lib/parseBoq'
import { buildRfqLinesFromItems, buildRfqPackagesFromSelection, dominantEngineeringDepartment } from '../../lib/rfqPackages'
import { cleanLineName, parseQty, readQty } from '../../lib/sendGuards'
import type { BOQItem, Supplier, SupplierEntry } from '../../types'
import type { Nav } from '../MobileApp'
import { deleteDraft, getDraft, saveDraft } from '../purchaseRequests'
import { Avatar, Card, Chips, PrimaryButton, SectionTitle, Sheet } from '../ui'

type Step = 'items' | 'suppliers' | 'details' | 'sending' | 'done'
const UNITS = ['حبة', 'م²', 'م³', 'م.ط', 'طن', 'كجم', 'كيس', 'لتر', 'لفة', 'مقطوعية']
const DEPARTMENTS: Array<[string, string]> = [
  ['CIVIL', 'مدني'],
  ['ARCHITECTURAL', 'معماري'],
  ['ELECTRICAL', 'كهرباء'],
  ['MECHANICAL', 'ميكانيكا'],
]

function isoIn(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function toSupplier(s: SupplierEntry): Supplier {
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    evidence: 'اختيارك',
    channel: s.hasEmail ? 'بريد' : s.hasWhatsapp ? 'واتساب' : 'محادثة',
  }
}

/** Every supplier the item knows about, de-duplicated, picked ones first. */
function candidatesFor(item: BOQItem): Supplier[] {
  const all = [
    ...(item.learnedSuggestion?.suppliers || []),
    ...(item.mapSuggestion?.suppliers || []),
    ...item.suppliers,
    ...(item.aiSuggestion?.suppliers || []),
    ...(item.familySuggestion?.suppliers || []),
  ]
  const seen = new Set<string>()
  return all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

export default function NewRequestScreen({ nav, draftId }: { nav: Nav; draftId?: string }) {
  // A draft from a photographed purchase request opens with its lines.
  const draft = useMemo(() => (draftId ? getDraft(draftId) : null), [draftId])
  const [step, setStep] = useState<Step>('items')
  const [lines, setLines] = useState<ParsedLine[]>(() =>
    (draft?.lines || []).map((l, i) => ({ id: i + 1, name: l.name, qty: l.qty, unit: l.unit, spec: l.spec })),
  )
  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState<BoqReadProgress | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef((draft?.lines.length || 0) + 1)
  const fileInput = useRef<HTMLInputElement>(null)

  // manual entry
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('حبة')

  // suppliers
  const [items, setItems] = useState<BOQItem[]>([])
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [known, setKnown] = useState<Record<string, Supplier>>({})
  const [picker, setPicker] = useState<BOQItem | null>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SupplierEntry[]>([])
  const [searching, setSearching] = useState(false)

  // details
  const profile = loadCompanyProfile()
  const [project, setProject] = useState(draft?.project || '')
  const [draftKey, setDraftKey] = useState<string | null>(draft?.id || null)

  // Every change to the items or the project name is kept in the draft on this phone.
  useEffect(() => {
    if (!draftKey && !lines.length) return
    const saved = saveDraft({
      id: draftKey || undefined,
      project,
      reference: draft?.reference || null,
      requester: draft?.requester || null,
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, spec: l.spec })),
    })
    if (!draftKey) setDraftKey(saved.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, project])
  const [city, setCity] = useState(profile.defaultDeliveryCity || 'الرياض')
  const [requiredDate, setRequiredDate] = useState(isoIn(profile.defaultDeadlineDays || 14))
  const [quoteDeadline, setQuoteDeadline] = useState(isoIn(5))
  const [requestType, setRequestType] = useState<'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL'>('SUPPLY_ONLY')
  const [department, setDepartment] = useState<string>('')

  // sending
  const [progress, setProgress] = useState<{ text: string; done: number; total: number }>({ text: '', done: 0, total: 0 })
  const [waAsk, setWaAsk] = useState<{ count: number; price: number; resolve: (yes: boolean) => void } | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ sent: number; failed: number; total: number } | null>(null)

  /* ---------- step 1: items ---------- */

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
      setError('ارفع الكراسة بصيغة PDF.')
      return
    }
    setFileName(file.name)
    setReading({ pagesDone: 0, pageCount: null, itemCount: 0, newNames: [] })
    try {
      const result = await parseConstructionBoqPdf(file, (p) => setReading(p))
      const read = sanitizeBoqLines(rowsToLines(result.rows || []))
      if (!read.length) throw new Error('لم نجد بنودًا في هذا الملف. تأكد أنه جدول كميات.')
      setLines((prev) => [...prev, ...read.map((l) => ({ ...l, id: nextId.current++ }))])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت قراءة الكراسة.')
      setFileName(null)
    } finally {
      setReading(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function addLine() {
    const n = cleanLineName(name)
    if (!n) return setError('اكتب اسم البند.')
    if (!readQty(qty)) return setError('اكتب كمية صحيحة أكبر من صفر.')
    setError(null)
    setLines((prev) => [...prev, { id: nextId.current++, name: n, qty: qty.trim(), unit }])
    setName('')
    setQty('')
  }

  async function toSuppliers() {
    const usable = lines.filter((l) => cleanLineName(l.name) && readQty(l.qty))
    if (!usable.length) return setError('أضف بندًا واحدًا على الأقل بكمية صحيحة.')
    setError(null)
    setBusy('نبحث عن موردين لكل بند…')
    try {
      const { items: matched } = await matchSuppliersForItems(usable)
      const ctx = buildPickContext(matched)
      const picks: Record<number, string[]> = {}
      const book: Record<string, Supplier> = {}
      const next = matched.map((item) => {
        for (const s of candidatesFor(item)) book[s.id] = s
        if (item.workOnly) return item
        const auto = autoPickConfident(item, ctx)
        picks[item.id] = auto.map((s) => s.id)
        for (const s of auto) book[s.id] = s
        return item
      })
      setItems(next)
      setSelected(picks)
      setKnown(book)
      setDepartment((d) => d || dominantEngineeringDepartment(next) || 'CIVIL')
      setStep('suppliers')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر البحث عن موردين.')
    } finally {
      setBusy(null)
    }
  }

  /* ---------- step 2: suppliers ---------- */

  function toggle(itemId: number, supplierId: string) {
    setSelected((prev) => {
      const cur = prev[itemId] || []
      return { ...prev, [itemId]: cur.includes(supplierId) ? cur.filter((x) => x !== supplierId) : [...cur, supplierId] }
    })
  }

  async function runSearch(q: string) {
    setSearch(q)
    if (q.trim().length < 2) return setResults([])
    setSearching(true)
    try {
      const r = await listConstructionSuppliers({ query: q.trim(), limit: 30, contactableOnly: true })
      setResults(r.suppliers)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const allPicked = useMemo(() => [...new Set(Object.values(selected).flat())], [selected])
  const readyItems = useMemo(() => items.filter((i) => !i.workOnly && (selected[i.id] || []).length > 0), [items, selected])

  /* ---------- step 3: send ---------- */

  const blockers: string[] = []
  if (step === 'details') {
    if (allPicked.length < 2) blockers.push('اختر موردين اثنين على الأقل.')
    if (!city.trim()) blockers.push('اكتب مدينة التسليم.')
    if (!quoteDeadline || !requiredDate || quoteDeadline >= requiredDate) blockers.push('آخر موعد للعروض يجب أن يسبق موعد التوريد.')
  }

  async function send() {
    if (blockers.length) return
    setStep('sending')
    setError(null)
    try {
      setProgress({ text: 'نجهّز البنود…', done: 0, total: 0 })
      const needSpec = readyItems.filter((i) => !i.farqSpecId)
      const matched = needSpec.length
        ? await matchConstructionBoqCatalog({
            lines: needSpec.map((i) => ({ line_key: i.lineKey || `line-${i.id}`, name_ar: i.name, quantity: parseQty(i.qty), uom: i.unit || undefined, spec: i.spec })),
          }).catch(() => null)
        : null
      const byKey = new Map((matched?.rows || []).map((r) => [r.line_key, r]))
      const rfqLines = buildRfqLinesFromItems(
        readyItems.map((i) => ({ ...i, name: cleanLineName(i.name) })),
        { specIdForLine: (k) => byKey.get(k)?.farq_spec_id, uomForLine: (k) => (byKey.get(k) as { uom?: string } | undefined)?.uom, parseQty },
      )
      if (!rfqLines.length) throw new Error('لا توجد بنود جاهزة للإرسال.')

      setProgress({ text: 'نتحقق من الموردين…', done: 0, total: 0 })
      const contactable = new Set(await resolveRfqSupplierIds(allPicked))
      if (contactable.size < 2) throw new Error('يلزم موردان على الأقل يمكن التواصل معهم.')
      const scoped: Record<number, string[]> = {}
      for (const i of readyItems) scoped[i.id] = (selected[i.id] || []).filter((id) => contactable.has(String(id)))
      const { packages: draft } = buildRfqPackagesFromSelection({ items: readyItems, selectedByItem: scoped, fallbackDepartment: department })
      const packages = draft.filter((p) => p.selected_supplier_ids.length > 0)
      const keys = new Set(packages.flatMap((p) => p.line_keys))
      const scopedLines = rfqLines.filter((l) => keys.has(String(l.line_key)))
      const supplierIds = [...new Set(packages.flatMap((p) => p.selected_supplier_ids))]
      if (supplierIds.length < 2 || !scopedLines.length) throw new Error('يلزم موردان على الأقل مربوطان ببنود الطلب.')

      setProgress({ text: `ننشئ الطلب لـ ${supplierIds.length} موردين…`, done: 0, total: supplierIds.length })
      const user = farqSession.getUser()
      const body: Record<string, unknown> = {
        manual_send: true,
        send_consent: false,
        engineering_department: department || 'CIVIL',
        selected_supplier_ids: supplierIds,
        delivery: {
          city: city.trim(),
          site_address: project.trim() ? `${project.trim()} — ${city.trim()}` : city.trim(),
          required_date: requiredDate,
          unloading_requirement: 'SUPPLIER_UNLOAD',
          delivery_required: true,
        },
        commercial_terms: { currency: 'SAR', payment_terms: 'BANK_TRANSFER' },
        quote_deadline: quoteDeadline,
        quote_deadline_time: '17:00',
        request_type: requestType,
        buyer: {
          company_name: profile.name,
          contact_name: user?.displayName?.trim() || user?.email?.trim() || profile.name,
          email: user?.email?.trim() || profile.email,
          phone: profile.phone,
          city: profile.city,
          ...(profile.legalName ? { legal_name: profile.legalName } : {}),
          ...(profile.crNumber ? { cr_number: profile.crNumber } : {}),
          ...(profile.vatNumber ? { vat_number: profile.vatNumber } : {}),
          ...(profile.nationalAddress ? { national_address: profile.nationalAddress } : {}),
        },
        lines: scopedLines,
        packages,
      }
      const haraj = countHarajSupplierIds(supplierIds)
      if (haraj > 0) body.haraj_limit = haraj
      const created = await createConstructionRfq(body, { timeoutMs: 90_000 })
      setCreatedId(created.id)
      if (draftKey) deleteDraft(draftKey)

      const detail = await getConstructionRfq(created.id)
      const invites = detail.invitations || []
      const waCount = invites.filter((i) => invitePreferredChannel(i) === 'WHATSAPP').length
      let waPaid = false
      if (waCount) {
        const pricing = await fetchConstructionWhatsAppPricing().catch(() => null)
        if (pricing?.enabled && pricing.price_sar) {
          waPaid = await new Promise<boolean>((resolve) => setWaAsk({ count: waCount, price: pricing.price_sar!, resolve }))
          setWaAsk(null)
        }
      }

      await startConstructionDispatch(created.id, { whatsappPaid: waPaid, includeHaraj: true })
      let total = invites.length
      for (let guard = 0; guard < 240; guard += 1) {
        await new Promise((r) => window.setTimeout(r, 2500))
        const job = await getConstructionDispatch(created.id).catch(() => null)
        if (!job) continue
        total = job.total || total
        setProgress({ text: `نرسل للموردين: ${job.processed || 0} من ${total}`, done: job.processed || 0, total })
        if (['DONE', 'FAILED', 'CANCELLED'].includes(String(job.state))) {
          setSummary({ sent: job.sent || 0, failed: job.failed || 0, total })
          break
        }
      }
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر إرسال الطلب.')
      setStep(createdId ? 'done' : 'details')
    }
  }

  /* ---------- UI ---------- */

  const stepIndex = step === 'items' ? 0 : step === 'suppliers' ? 1 : 2
  const header = (
    <header className="sticky top-0 z-30 bg-[#f2f3ef]/90 backdrop-blur-xl border-b border-black/[0.04] m-safe-top">
      <div className="h-12 px-2 flex items-center">
        <button
          onClick={() => (step === 'suppliers' ? setStep('items') : step === 'details' ? setStep('suppliers') : nav.back())}
          disabled={step === 'sending'}
          className="h-10 px-2 text-[#123F3A] font-semibold text-[16px] disabled:opacity-30"
        >
          {step === 'items' || step === 'done' ? 'إغلاق' : '› رجوع'}
        </button>
        <div className="flex-1 text-center font-bold text-[16px]">طلب تسعير جديد</div>
        <span className="w-16" />
      </div>
      {step !== 'done' && (
        <div className="flex gap-1.5 px-4 pb-2">
          {['البنود', 'الموردون', 'الإرسال'].map((l, i) => (
            <div key={l} className="flex-1">
              <div className={`h-1 rounded-full ${i <= stepIndex ? 'bg-[#123F3A]' : 'bg-black/10'}`} />
              <div className={`text-[11px] mt-1 text-center ${i <= stepIndex ? 'text-[#123F3A] font-bold' : 'text-neutral-400'}`}>{l}</div>
            </div>
          ))}
        </div>
      )}
    </header>
  )

  const errorBox = error && <div className="rounded-2xl bg-red-50 text-red-700 text-[14px] font-semibold px-4 py-3 mt-3">{error}</div>

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {header}
      <main className="flex-1 px-4 pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] m-fade">
        {step === 'items' && (
          <>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Card className="p-4" onClick={reading ? undefined : () => fileInput.current?.click()}>
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-[#123F3A] text-white flex items-center justify-center text-[22px]">⇪</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[16px]">{reading ? 'نقرأ الكراسة…' : 'ارفع كراسة الكميات'}</div>
                  <div className="text-[13px] text-neutral-500">
                    {reading
                      ? `${reading.itemCount} بند حتى الآن${reading.pageCount ? ` · صفحة ${reading.pagesDone} من ${reading.pageCount}` : ''}`
                      : fileName
                        ? `أُضيفت بنود «${fileName}»`
                        : 'ملف PDF من الجوال أو iCloud'}
                  </div>
                </div>
              </div>
              {reading && (
                <div className="mt-3 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-[#1a7a45] transition-all"
                    style={{ width: reading.pageCount ? `${Math.max(5, (reading.pagesDone / reading.pageCount) * 100)}%` : '30%' }}
                  />
                </div>
              )}
            </Card>

            <Card className="p-4 mt-3" onClick={reading ? undefined : () => nav.push({ kind: 'scan' })}>
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-[#e0efec] text-[#123F3A] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[16px]">صوّر طلب شراء</div>
                  <div className="text-[13px] text-neutral-500">من مشروع آخر، ورقيًا أو صورة أو PDF</div>
                </div>
              </div>
            </Card>

            <SectionTitle>أو اكتب البنود</SectionTitle>
            <Card className="p-4 space-y-2.5">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المادة، مثل: حديد تسليح 16 مم" className="w-full h-12 rounded-xl bg-black/[0.04] px-4 outline-none" />
              <div className="flex gap-2">
                <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="الكمية" className="w-28 h-12 rounded-xl bg-black/[0.04] px-4 outline-none tabular-nums" />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="flex-1 h-12 rounded-xl bg-black/[0.04] px-3 outline-none">
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <button onClick={addLine} className="w-full h-11 rounded-xl bg-[#e0efec] text-[#123F3A] font-bold">+ أضف البند</button>
            </Card>

            {errorBox}

            {lines.length > 0 && (
              <>
                <SectionTitle action={<button onClick={() => setLines([])} className="text-[13px] font-bold text-red-600">مسح الكل</button>}>
                  البنود ({lines.length})
                </SectionTitle>
                <div className="bg-white rounded-2xl divide-y divide-neutral-100 shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
                  {lines.map((l, i) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 text-[12px] text-neutral-400 tabular-nums">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold leading-snug line-clamp-2">{l.name}</div>
                        {!readQty(l.qty) && <div className="text-[12px] text-amber-700">الكمية غير مقروءة</div>}
                      </div>
                      <input
                        value={l.qty}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, qty: e.target.value } : x)))}
                        inputMode="decimal"
                        className="w-16 h-9 rounded-lg bg-black/[0.04] text-center text-[14px] tabular-nums outline-none"
                      />
                      <span className="w-10 text-[12px] text-neutral-500 truncate">{l.unit}</span>
                      <button onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))} className="w-8 h-8 text-neutral-300 text-[20px]" aria-label="حذف">×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 'suppliers' && (
          <>
            <div className="text-[14px] text-neutral-500 mb-3">
              اخترنا لك موردين لكل بند. اضغط على المورد لإلغائه، أو أضف غيره. المختارون: <b className="text-[#0D1F1D]">{allPicked.length}</b>
            </div>
            {errorBox}
            <div className="space-y-3">
              {items.map((item) => {
                const picked = selected[item.id] || []
                return (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-bold text-[15px] leading-snug line-clamp-2">{item.name}</div>
                      <span className="shrink-0 text-[13px] text-neutral-500 tabular-nums">{item.qty} {item.unit}</span>
                    </div>
                    {item.workOnly ? (
                      <div className="text-[13px] text-neutral-400 mt-2">أعمال بلا مواد — لا يُطلب لها مورد.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {picked.map((id) => (
                          <button key={id} onClick={() => toggle(item.id, id)} className="h-8 px-3 rounded-full bg-[#123F3A] text-white text-[13px] font-semibold max-w-full truncate">
                            ✓ {known[id]?.name || 'مورد'}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setPicker(item)
                            setSearch('')
                            setResults([])
                          }}
                          className="h-8 px-3 rounded-full bg-[#e0efec] text-[#123F3A] text-[13px] font-bold"
                        >
                          + أضف موردًا
                        </button>
                      </div>
                    )}
                    {!item.workOnly && picked.length === 0 && <div className="text-[12px] text-amber-700 mt-2">لم يُختر مورد — لن يُرسل هذا البند.</div>}
                  </Card>
                )
              })}
            </div>
          </>
        )}

        {step === 'details' && (
          <>
            <Card className="p-4 space-y-3">
              <label className="block">
                <span className="text-[13px] text-neutral-500">اسم المشروع (اختياري)</span>
                <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="مثل: فيلا حي الملقا" className="mt-1 w-full h-12 rounded-xl bg-black/[0.04] px-4 outline-none" />
              </label>
              <label className="block">
                <span className="text-[13px] text-neutral-500">مدينة التسليم</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full h-12 rounded-xl bg-black/[0.04] px-4 outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[13px] text-neutral-500">آخر موعد للعروض</span>
                  <input type="date" value={quoteDeadline} onChange={(e) => setQuoteDeadline(e.target.value)} className="mt-1 w-full h-12 rounded-xl bg-black/[0.04] px-3 outline-none" />
                </label>
                <label className="block">
                  <span className="text-[13px] text-neutral-500">موعد التوريد</span>
                  <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} className="mt-1 w-full h-12 rounded-xl bg-black/[0.04] px-3 outline-none" />
                </label>
              </div>
            </Card>

            <SectionTitle>نوع الطلب</SectionTitle>
            <Chips<'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL'>
              options={[
                ['SUPPLY_ONLY', 'توريد فقط'],
                ['SUPPLY_AND_INSTALL', 'توريد وتركيب'],
              ]}
              value={requestType}
              onChange={setRequestType}
            />
            <SectionTitle>القسم الهندسي</SectionTitle>
            <Chips<string> options={DEPARTMENTS} value={department} onChange={setDepartment} />

            <SectionTitle>الملخّص</SectionTitle>
            <Card className="p-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[22px] font-black tabular-nums">{readyItems.length}</div>
                <div className="text-[12px] text-neutral-500">بند سيُرسل</div>
              </div>
              <div>
                <div className="text-[22px] font-black tabular-nums">{allPicked.length}</div>
                <div className="text-[12px] text-neutral-500">مورد</div>
              </div>
            </Card>
            {blockers.length > 0 && <div className="rounded-2xl bg-amber-50 text-amber-800 text-[14px] px-4 py-3 mt-3">{blockers[0]}</div>}
            {errorBox}
          </>
        )}

        {step === 'sending' && (
          <div className="pt-16 text-center">
            <div className="mx-auto w-16 h-16 rounded-full border-4 border-[#e0efec] border-t-[#123F3A] animate-spin" />
            <div className="mt-6 font-bold text-[18px]">{progress.text || 'نرسل الطلب…'}</div>
            {progress.total > 0 && (
              <div className="mt-4 mx-auto max-w-[260px] h-2 rounded-full bg-black/10 overflow-hidden">
                <div className="h-full bg-[#1a7a45] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            )}
            <p className="mt-4 text-[13px] text-neutral-500">يستمر الإرسال على الخادم حتى لو أغلقت التطبيق.</p>
            {createdId && (
              <button onClick={() => void cancelConstructionDispatch(createdId)} className="mt-6 text-[14px] font-bold text-red-600">
                إيقاف الإرسال
              </button>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="pt-14 text-center">
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center text-[40px] ${error ? 'bg-amber-50' : 'bg-[#CFF5DC]'}`}>{error ? '!' : '✓'}</div>
            <div className="mt-5 font-black text-[22px]">{error ? 'أُنشئ الطلب مع ملاحظة' : 'أُرسل طلب التسعير'}</div>
            {summary && (
              <p className="mt-2 text-[15px] text-neutral-600">
                وصل إلى {summary.sent} من {summary.total} مورد{summary.failed ? ` · تعذّر ${summary.failed}` : ''}
              </p>
            )}
            {error && <p className="mt-2 text-[14px] text-amber-700 px-4">{error}</p>}
            <div className="mt-8 space-y-2 px-4">
              {createdId && (
                <PrimaryButton className="w-full" onClick={() => nav.switchTab('requests', { kind: 'request', id: createdId })}>
                  افتح الطلب
                </PrimaryButton>
              )}
              <button onClick={nav.back} className="w-full h-12 text-[15px] font-bold text-[#123F3A]">
                رجوع
              </button>
            </div>
          </div>
        )}
      </main>

      {(step === 'items' || step === 'suppliers' || step === 'details') && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-black/[0.06] px-4 pt-3 m-safe-bottom">
          <div className="pb-3">
            {step === 'items' && (
              <PrimaryButton className="w-full" disabled={!lines.length || Boolean(busy) || Boolean(reading)} onClick={() => void toSuppliers()}>
                {busy || `التالي: اختيار الموردين (${lines.length} بند)`}
              </PrimaryButton>
            )}
            {step === 'suppliers' && (
              <PrimaryButton className="w-full" disabled={allPicked.length < 2} onClick={() => setStep('details')}>
                {allPicked.length < 2 ? 'اختر موردين اثنين على الأقل' : `التالي: التفاصيل (${allPicked.length} مورد)`}
              </PrimaryButton>
            )}
            {step === 'details' && (
              <PrimaryButton className="w-full" disabled={blockers.length > 0} onClick={() => void send()}>
                أرسل الطلب للموردين
              </PrimaryButton>
            )}
          </div>
        </div>
      )}

      <Sheet open={Boolean(picker)} onClose={() => setPicker(null)} title="أضف موردًا">
        {picker && (
          <div>
            <div className="text-[13px] text-neutral-500 mb-2 line-clamp-1">للبند: {picker.name}</div>
            <input
              value={search}
              onChange={(e) => void runSearch(e.target.value)}
              placeholder="ابحث في دليل الموردين"
              autoFocus
              className="w-full h-11 rounded-xl bg-black/[0.05] px-4 outline-none"
            />
            <div className="mt-3 divide-y divide-neutral-100">
              {(search.trim().length >= 2 ? results.map(toSupplier) : candidatesFor(picker)).map((s) => {
                const on = (selected[picker.id] || []).includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setKnown((k) => ({ ...k, [s.id]: s }))
                      toggle(picker.id, s.id)
                    }}
                    className="w-full flex items-center gap-3 py-3 text-right"
                  >
                    <Avatar name={s.name} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px] truncate">{s.name}</div>
                      <div className="text-[12px] text-neutral-500">{[s.city, s.channel].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold ${on ? 'bg-[#123F3A] text-white' : 'bg-black/[0.06] text-transparent'}`}>✓</span>
                  </button>
                )
              })}
              {searching && <div className="py-4 text-center text-[13px] text-neutral-400">نبحث…</div>}
              {!searching && search.trim().length >= 2 && results.length === 0 && <div className="py-4 text-center text-[13px] text-neutral-400">لا نتائج.</div>}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={Boolean(waAsk)} onClose={() => waAsk?.resolve(false)} title="الإرسال عبر واتساب">
        {waAsk && (
          <div className="pb-2">
            <p className="text-[15px] leading-relaxed text-neutral-700">
              {waAsk.count} من الموردين يُراسَلون على واتساب. تكلفة الإرسال {waAsk.price} ر.س لكل رسالة، الإجمالي {(waAsk.count * waAsk.price).toFixed(2)} ر.س.
            </p>
            <div className="mt-5 space-y-2">
              <PrimaryButton className="w-full" onClick={() => waAsk.resolve(true)}>
                نعم، أرسل عبر واتساب
              </PrimaryButton>
              <button onClick={() => waAsk.resolve(false)} className="w-full h-12 font-bold text-[#123F3A]">
                لا، أرسل للبقية فقط
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
