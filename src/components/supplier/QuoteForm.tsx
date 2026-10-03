/**
 * «العرض» — the quote form the portal has always had, unchanged in what it
 * checks: nothing is available until ticked, a name and an email for the
 * person authorised to price, a tax basis the supplier chose himself, and the
 * declaration he read. Submitted on the invitation's token route.
 *
 * New around it (frames 1a / F2): the countdown chip under the title and
 * «استفسار عن هذا البند» on every line, which opens the chat with the line
 * attached. The market name («الاسم الدارج بالسوق») stays large with the
 * booklet's own text under it.
 */
import { useState, type ReactNode } from 'react'
import { submitPublicSupplierQuote, type PublicSupplierInvite } from '../../api/constructionClient'
import { deadlineChip, formatDateTimeAr, linesAr, type LineRef } from '../../lib/supplierPortal'
import { ChatIcon, Chip, ClockIcon, PrimaryButton } from './PortalChrome'
import { SALE_UNITS, SALE_UNIT_NOTE, perUnitFromSaleUnit, type SaleUnit } from '../../lib/specCard'
import {
  EMPTY_BRAND_DRAFT,
  brandDraftFromLine,
  brandFieldsFromDraft,
  datasheetHint,
  draftHasBrand,
  requestedBrandHint,
  type BrandDraft,
} from '../../lib/brandEquivalence'

/**
 * `saleUnit` empty: the price is per the requested unit, as before. Set: the
 * supplier prices the unit he sells in («علبة» of `packSize`), and the API
 * converts it to a per-unit price, keeping his unit and count.
 */
type LineDraft = { unitPrice: string; available: boolean; notes: string; saleUnit?: SaleUnit | ''; packSize?: string }

type Line = PublicSupplierInvite['lines'][number]

function lineName(line: Line): string {
  // The real item first: `name_ar` is a catalog label and is null for a line the catalog never matched.
  return line.market_name_ar || line.supplier_name_ar || line.original_name || line.name_ar || line.name_en || line.line_key || 'بند'
}

export function lineRefFor(line: Line, index: number): LineRef {
  return {
    number: line.line_number || index + 1,
    name: lineName(line),
    quantity: line.quantity,
    uom: line.uom,
  }
}

export function QuoteForm({
  token,
  invite,
  deadline,
  now,
  banner,
  onSubmitted,
  onInquire,
  superseded = false,
}: {
  token: string
  invite: PublicSupplierInvite
  deadline: string | null
  now: number
  banner?: ReactNode
  onSubmitted: () => void
  /** Null when there is no chat (token-only portal, or after «ليس حسابي»). */
  onInquire: ((line: LineRef) => void) | null
  /** A link of an older version of the request: read-only, the API refuses a quote on it. */
  superseded?: boolean
}) {
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() => {
    const next: Record<string, LineDraft> = {}
    // Opt-in: unchecked until the supplier says they can supply it — or, when
    // he already quoted, what he quoted (he sees it, and updates it while open).
    const mine = new Map((invite.my_quote?.lines || []).map((l) => [String(l.line_id), l]))
    for (const line of invite.lines || []) {
      const q = mine.get(String(line.id))
      const price = q?.unit_price == null || q.unit_price === '' ? '' : String(q.unit_price)
      const bySaleUnit = q?.sale_unit && q.sale_unit_price != null
      next[line.id] = q
        ? {
            unitPrice: bySaleUnit ? String(q.sale_unit_price) : price,
            available: q.available ?? price !== '',
            notes: q.notes || '',
            saleUnit: bySaleUnit ? (q.sale_unit as SaleUnit) : '',
            packSize: bySaleUnit && q.pack_size ? String(q.pack_size) : '',
          }
        : { unitPrice: '', available: false, notes: '', saleUnit: '', packSize: '' }
    }
    return next
  })
  // «الماركة والمنشأ» — optional per line, pre-filled from his current quote.
  const [brands, setBrands] = useState<Record<string, BrandDraft>>(() => {
    const mine = new Map((invite.my_quote?.lines || []).map((l) => [String(l.line_id), l]))
    const next: Record<string, BrandDraft> = {}
    for (const line of invite.lines || []) next[line.id] = brandDraftFromLine(mine.get(String(line.id)) as Record<string, unknown> | undefined)
    return next
  })
  const [brandOpen, setBrandOpen] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {}
    for (const [id, draft] of Object.entries(brands)) if (draftHasBrand(draft)) next[id] = true
    return next
  })
  const updateBrand = (id: string, patch: Partial<BrandDraft>) =>
    setBrands((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_BRAND_DRAFT), ...patch } }))
  const [personName, setPersonName] = useState(invite.supplier.contact_name || '')
  const [personEmail, setPersonEmail] = useState(invite.supplier.email || '')
  // Both were once sent as `true` on the supplier's behalf with nothing on screen:
  // a quote went in as tax-inclusive under a declaration nobody had seen.
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean | null>(invite.my_quote?.prices_include_tax ?? null)
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const closed = Boolean(invite.submission_closed_at) || superseded
  const site = invite.site_supply || {}
  const siteFacts = (
    [
      ['المدينة', site.city],
      ['الحي', site.district],
      ['الخريطة', site.map_url && /^https?:\/\//.test(site.map_url) ? site.map_url : null],
      ['التوصيل', site.delivery_mode_ar],
      ['تكلفة التوصيل', site.shipping_ar],
      ['الدفع', site.payment_ar],
      ['نوع الطلب', site.request_type_ar],
    ] as Array<[string, string | null | undefined]>
  ).filter((entry): entry is [string, string] => Boolean(entry[1]))
  const company = String(invite.buyer?.company_name || 'المشتري')
  const countdown = deadlineChip(deadline, now, closed)

  const update = (id: string, patch: Partial<LineDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || { unitPrice: '', available: false, notes: '' }), ...patch } }))

  const missingPack = (invite.lines || []).some((line) => {
    const d = drafts[line.id]
    return d?.available === true && d.saleUnit && d.saleUnit !== 'PIECE' && !(Number.isInteger(Number(d.packSize)) && Number(d.packSize) >= 1)
  })

  const submit = async () => {
    if (missingPack) {
      setError('اكتب العدد في كل علبة أو كرتون اخترته.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitPublicSupplierQuote(token, {
        declaration_accepted: declarationAccepted,
        authorized_person: { name: personName.trim(), email: personEmail.trim() },
        currency: 'SAR',
        prices_include_tax: pricesIncludeTax === true,
        tax_rate: 0.15,
        lines: (invite.lines || []).map((line) => {
          const d = drafts[line.id]
          const available = d?.available === true
          // Optional: only what he filled, and only on a line he supplies.
          const brand = available ? brandFieldsFromDraft(brands[line.id]) : {}
          // Priced per box/carton: the server converts, and keeps what he wrote.
          if (available && d?.saleUnit) {
            return {
              line_id: line.id,
              quantity: line.quantity,
              available,
              sale_unit: d.saleUnit,
              pack_size: d.saleUnit === 'PIECE' ? 1 : Number(d.packSize),
              sale_unit_price: d.unitPrice,
              notes: d.notes || '',
              ...brand,
            }
          }
          return {
            line_id: line.id,
            quantity: line.quantity,
            available,
            unit_price: d?.unitPrice || '',
            base_price: d?.unitPrice || null,
            notes: d?.notes || '',
            ...brand,
          }
        }),
      })
      setDone(true)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إرسال العرض')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="bg-white border border-neutral-100 rounded-2xl p-8 text-center">
        <div className="text-2xl font-black text-[#0D1F1D] mb-2">استلمنا عرضك</div>
        <p className="text-sm text-neutral-500">وصل عرضك إلى {company}. تقدر تتابع حالته من «حالة العرض».</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {banner}
      <div>
        <h1 className="text-[24px] font-black text-[#0D1F1D] leading-snug">
          {invite.supplier.name_ar || invite.supplier.name_en}
        </h1>
        {countdown && (
          <div className="mt-2">
            <Chip tone={countdown.tone} icon={<ClockIcon className="w-3.5 h-3.5" />}>
              {countdown.text}
            </Chip>
          </div>
        )}
        <p className="text-[13px] text-neutral-500 leading-relaxed mt-2">
          طلب من {company} · {linesAr(invite.lines.length)}
          {deadline ? ` · التقديم حتى ${formatDateTimeAr(deadline)}` : ''}
        </p>
        {closed && (
          <div className="mt-3 text-xs text-neutral-600 bg-neutral-100 rounded-xl px-3 py-2">
            {superseded ? 'نسخة سابقة من الطلب — للقراءة فقط.' : 'أُغلق استلام العروض — العرض للقراءة فقط.'}
          </div>
        )}
        {invite.my_quote && (
          <div className="mt-3 text-xs text-[#123F3A] bg-[#f0faf7] rounded-xl px-3 py-2">
            عرضك المسجّل{invite.my_quote.submitted_at ? ` بتاريخ ${formatDateTimeAr(invite.my_quote.submitted_at)}` : ''} ظاهر أدناه
            {closed ? '.' : ' — يمكنك تعديله وإرساله من جديد.'}
          </div>
        )}
      </div>

      {siteFacts.length > 0 && (
        <div className="bg-white border border-neutral-100 rounded-2xl p-4">
          <div className="text-sm font-black text-[#0D1F1D] mb-2">الموقع والتوريد</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {siteFacts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-neutral-500">{label}</dt>
                <dd className="text-[#0D1F1D] font-semibold break-words">
                  {label === 'الخريطة' ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="text-[#123F3A] underline">
                      افتح الموقع على الخريطة
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="text-[12px] text-[#123F3A] bg-[#f0faf7] rounded-xl px-3 py-2">{invite.sale_unit_note || SALE_UNIT_NOTE}.</div>

      {invite.lines.map((line, index) => (
        <div key={line.id} className="bg-white border border-neutral-100 rounded-2xl p-4">
          {line.market_name_ar ? (
            <>
              {/* The name the market uses, large; the booklet's own text under it, unchanged. */}
              <div className="font-black text-[#0D1F1D] text-base leading-snug break-words">{line.market_name_ar}</div>
              <div className="text-xs text-neutral-500 mt-0.5 mb-1 leading-relaxed break-words">
                كما في الكراسة: {line.booklet_name_ar || line.original_name || line.name_ar || line.name_en || line.line_key}
              </div>
            </>
          ) : (
            <div className="font-bold text-[#0D1F1D] text-sm mb-1 break-words">
              {line.supplier_name_ar || line.original_name || line.name_ar || line.name_en || line.line_key}
            </div>
          )}
          {line.spec_text_ar && (
            <div className="text-[12px] text-[#123F3A] bg-[#f7fbfa] rounded-lg px-2.5 py-1.5 mb-1 leading-relaxed break-words">
              {line.spec_text_ar}
            </div>
          )}
          {line.spec_card?.reference_photo_url && /^https?:\/\//.test(line.spec_card.reference_photo_url) && (
            <a
              href={line.spec_card.reference_photo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[12px] font-bold text-[#123F3A] underline mb-1"
            >
              صورة مرجعية للبند
            </a>
          )}
          <div className="text-xs text-neutral-500 mb-3">
            {line.quantity} {line.uom}
            {line.item_note ? ` · ${line.item_note}` : ''}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600 mb-3">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#123F3A]"
              disabled={closed}
              checked={drafts[line.id]?.available === true}
              onChange={(e) => update(line.id, { available: e.target.checked })}
            />
            متوفر — سأورّده
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`price-${line.id}`}>
                {drafts[line.id]?.saleUnit ? 'السعر للوحدة اللي تبيع فيها' : `سعر ${line.uom || 'الوحدة'}`}
              </label>
              <input
                id={`price-${line.id}`}
                inputMode="decimal"
                disabled={closed || drafts[line.id]?.available !== true}
                value={drafts[line.id]?.unitPrice || ''}
                onChange={(e) => update(line.id, { unitPrice: e.target.value })}
                className="w-32 max-w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A] disabled:bg-neutral-50 disabled:text-neutral-400"
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`unit-${line.id}`}>
                أبيع بـ
              </label>
              <select
                id={`unit-${line.id}`}
                disabled={closed || drafts[line.id]?.available !== true}
                value={drafts[line.id]?.saleUnit || ''}
                onChange={(e) => update(line.id, { saleUnit: e.target.value as SaleUnit | '' })}
                className="border border-neutral-200 rounded-xl px-2 py-2 text-sm bg-white disabled:bg-neutral-50 disabled:text-neutral-400"
              >
                <option value="">{line.uom || 'نفس الوحدة المطلوبة'}</option>
                {SALE_UNITS.filter((u) => u.pack).map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            {drafts[line.id]?.saleUnit && (
              <div>
                <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`pack-${line.id}`}>
                  كم {line.uom || 'حبة'} فيها؟
                </label>
                <input
                  id={`pack-${line.id}`}
                  inputMode="numeric"
                  disabled={closed}
                  value={drafts[line.id]?.packSize || ''}
                  onChange={(e) => update(line.id, { packSize: e.target.value })}
                  className="w-20 border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A]"
                />
              </div>
            )}
          </div>
          {(() => {
            const d = drafts[line.id]
            if (!d?.saleUnit || !d.unitPrice) return null
            const per = perUnitFromSaleUnit(Number(d.unitPrice), Number(d.packSize))
            return (
              <div className="text-[11px] text-neutral-500 mt-1">
                {per == null ? 'اكتب العدد في الوحدة.' : `يعادل ${per} ر.س لكل ${line.uom || 'حبة'}`}
              </div>
            )
          })()}
          {requestedBrandHint(line.requested_brand, line.allows_equivalent) && (
            <div className="text-[12px] text-neutral-600 mt-2">{requestedBrandHint(line.requested_brand, line.allows_equivalent)}</div>
          )}
          <BrandFields
            id={line.id}
            draft={brands[line.id] || EMPTY_BRAND_DRAFT}
            open={brandOpen[line.id] === true}
            disabled={closed || drafts[line.id]?.available !== true}
            onToggle={() => setBrandOpen((prev) => ({ ...prev, [line.id]: !prev[line.id] }))}
            onChange={(patch) => updateBrand(line.id, patch)}
          />
          {onInquire && (
            <button
              type="button"
              onClick={() => onInquire(lineRefFor(line, index))}
              className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-[#123F3A]"
            >
              <ChatIcon className="w-3.5 h-3.5" />
              استفسار عن هذا البند
            </button>
          )}
        </div>
      ))}

      <div className="bg-white border border-neutral-100 rounded-2xl p-4 space-y-3">
        <div className="text-sm font-bold text-[#0D1F1D]">المفوّض بالتسعير</div>
        <input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder="الاسم"
          autoComplete="name"
          className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
        />
        <input
          value={personEmail}
          onChange={(e) => setPersonEmail(e.target.value)}
          placeholder="البريد"
          type="email"
          dir="ltr"
          autoComplete="email"
          className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A] text-right"
        />
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}

      {!closed && (
        <div className="space-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div>
            <div className="text-xs font-bold text-[#0D1F1D] mb-1.5">الأسعار التي أدخلتها</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tax-basis" className="accent-[#123F3A]" checked={pricesIncludeTax === true} onChange={() => setPricesIncludeTax(true)} />
                شاملة ضريبة القيمة المضافة 15%
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tax-basis" className="accent-[#123F3A]" checked={pricesIncludeTax === false} onChange={() => setPricesIncludeTax(false)} />
                غير شاملة الضريبة
              </label>
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-neutral-700 leading-relaxed cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[#123F3A]" checked={declarationAccepted} onChange={(e) => setDeclarationAccepted(e.target.checked)} />
            أقرّ بأنني مخوّل بتقديم هذا العرض عن المنشأة، وأن الأسعار والتوفّر المذكورة صحيحة وملزمة خلال مدة صلاحية العرض.
          </label>
        </div>
      )}

      {!closed && (
        <PrimaryButton
          disabled={submitting || !personName.trim() || !personEmail.trim() || pricesIncludeTax === null || !declarationAccepted}
          onClick={submit}
        >
          {submitting ? 'جارٍ الإرسال…' : 'إرسال العرض'}
        </PrimaryButton>
      )}
    </div>
  )
}

/** «الماركة والمنشأ (اختياري)» — collapsed by default; nothing here is required. */
function BrandFields({
  id,
  draft,
  open,
  disabled,
  onToggle,
  onChange,
}: {
  id: string
  draft: BrandDraft
  open: boolean
  disabled: boolean
  onToggle: () => void
  onChange: (patch: Partial<BrandDraft>) => void
}) {
  const hint = datasheetHint(draft.datasheetFile)
  const input =
    'w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A] disabled:bg-neutral-50 disabled:text-neutral-400'
  return (
    <div className="mt-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="text-[12px] font-bold text-[#123F3A]">
        {open ? '− الماركة والمنشأ (اختياري)' : '+ الماركة والمنشأ (اختياري)'}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`brand-${id}`}>
              الماركة
            </label>
            <input
              id={`brand-${id}`}
              maxLength={80}
              disabled={disabled}
              value={draft.offeredBrand}
              onChange={(e) => onChange({ offeredBrand: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`origin-${id}`}>
              بلد المنشأ
            </label>
            <input
              id={`origin-${id}`}
              maxLength={60}
              disabled={disabled}
              value={draft.originCountry}
              onChange={(e) => onChange({ originCountry: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`cert-${id}`}>
              الشهادة
            </label>
            <input
              id={`cert-${id}`}
              maxLength={120}
              disabled={disabled}
              placeholder="مثل SASO أو UL 797"
              value={draft.certification}
              onChange={(e) => onChange({ certification: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`sheet-${id}`}>
              رابط ورقة البيانات
            </label>
            <input
              id={`sheet-${id}`}
              dir="ltr"
              inputMode="url"
              maxLength={300}
              disabled={disabled}
              placeholder="https://"
              value={draft.datasheetFile}
              onChange={(e) => onChange({ datasheetFile: e.target.value })}
              className={`${input} text-right`}
            />
            {hint && <div className="text-[11px] text-amber-700 mt-1">{hint}</div>}
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] text-neutral-500 mb-1">بديل مكافئ؟</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(
                [
                  [null, 'لم أحدد'],
                  [false, 'نفس الماركة المطلوبة'],
                  [true, 'نعم، بديل مكافئ'],
                ] as Array<[boolean | null, string]>
              ).map(([value, label]) => (
                <label key={String(value)} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`equivalent-${id}`}
                    className="accent-[#123F3A]"
                    disabled={disabled}
                    checked={draft.isEquivalent === value}
                    onChange={() => onChange({ isEquivalent: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QuoteForm
