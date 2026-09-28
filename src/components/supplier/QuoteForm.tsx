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

type LineDraft = { unitPrice: string; available: boolean; notes: string }

type Line = PublicSupplierInvite['lines'][number]

function lineName(line: Line): string {
  // The real item first: `name_ar` is a catalog label and is null for a line the catalog never matched.
  return line.market_name_ar || line.original_name || line.name_ar || line.name_en || line.line_key || 'بند'
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
}: {
  token: string
  invite: PublicSupplierInvite
  deadline: string | null
  now: number
  banner?: ReactNode
  onSubmitted: () => void
  /** Null when there is no chat (token-only portal, or after «ليس حسابي»). */
  onInquire: ((line: LineRef) => void) | null
}) {
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() => {
    const next: Record<string, LineDraft> = {}
    // Opt-in: unchecked until the supplier says they can supply it — or, when
    // he already quoted, what he quoted (he sees it, and updates it while open).
    const mine = new Map((invite.my_quote?.lines || []).map((l) => [String(l.line_id), l]))
    for (const line of invite.lines || []) {
      const q = mine.get(String(line.id))
      const price = q?.unit_price == null || q.unit_price === '' ? '' : String(q.unit_price)
      next[line.id] = q ? { unitPrice: price, available: q.available ?? price !== '', notes: q.notes || '' } : { unitPrice: '', available: false, notes: '' }
    }
    return next
  })
  const [personName, setPersonName] = useState(invite.supplier.contact_name || '')
  const [personEmail, setPersonEmail] = useState(invite.supplier.email || '')
  // Both were once sent as `true` on the supplier's behalf with nothing on screen:
  // a quote went in as tax-inclusive under a declaration nobody had seen.
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean | null>(invite.my_quote?.prices_include_tax ?? null)
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const closed = Boolean(invite.submission_closed_at)
  const company = String(invite.buyer?.company_name || 'المشتري')
  const countdown = deadlineChip(deadline, now, closed)

  const update = (id: string, patch: Partial<LineDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || { unitPrice: '', available: false, notes: '' }), ...patch } }))

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await submitPublicSupplierQuote(token, {
        declaration_accepted: declarationAccepted,
        authorized_person: { name: personName.trim(), email: personEmail.trim() },
        currency: 'SAR',
        prices_include_tax: pricesIncludeTax === true,
        tax_rate: 0.15,
        lines: (invite.lines || []).map((line) => ({
          line_id: line.id,
          quantity: line.quantity,
          available: drafts[line.id]?.available === true,
          unit_price: drafts[line.id]?.unitPrice || '',
          base_price: drafts[line.id]?.unitPrice || null,
          notes: drafts[line.id]?.notes || '',
        })),
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
            أُغلق استلام العروض — العرض للقراءة فقط.
          </div>
        )}
        {invite.my_quote && (
          <div className="mt-3 text-xs text-[#123F3A] bg-[#f0faf7] rounded-xl px-3 py-2">
            عرضك المسجّل{invite.my_quote.submitted_at ? ` بتاريخ ${formatDateTimeAr(invite.my_quote.submitted_at)}` : ''} ظاهر أدناه
            {closed ? '.' : ' — يمكنك تعديله وإرساله من جديد.'}
          </div>
        )}
      </div>

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
              {line.original_name || line.name_ar || line.name_en || line.line_key}
            </div>
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
          <label className="text-[11px] text-neutral-500 mb-1 block" htmlFor={`price-${line.id}`}>
            سعر الوحدة
          </label>
          <input
            id={`price-${line.id}`}
            inputMode="decimal"
            disabled={closed || drafts[line.id]?.available !== true}
            value={drafts[line.id]?.unitPrice || ''}
            onChange={(e) => update(line.id, { unitPrice: e.target.value })}
            className="w-40 max-w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A] disabled:bg-neutral-50 disabled:text-neutral-400"
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

export default QuoteForm
