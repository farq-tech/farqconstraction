import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import {
  getPublicSupplierInvite,
  submitPublicSupplierQuote,
  type PublicSupplierInvite,
} from '../api/constructionClient'

type LineDraft = {
  unitPrice: string
  available: boolean
  notes: string
}

export function SupplierPortalView({ navigate }: NavProps) {
  const token = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('token') || ''
    } catch {
      return ''
    }
  }, [])
  const [invite, setInvite] = useState<PublicSupplierInvite | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({})
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  // Both were sent as `true` on the supplier's behalf with nothing on screen:
  // a quote went in as tax-inclusive under a declaration nobody had seen.
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean | null>(null)
  const [declarationAccepted, setDeclarationAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getPublicSupplierInvite(token)
      .then((data) => {
        if (cancelled) return
        setInvite(data)
        const next: Record<string, LineDraft> = {}
        for (const line of data.lines || []) {
          // Opt-in: unchecked until the supplier says they can supply it.
          next[line.id] = { unitPrice: '', available: false, notes: '' }
        }
        setDrafts(next)
        setPersonName(data.supplier.contact_name || '')
        setPersonEmail(data.supplier.email || '')
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'رابط الدعوة غير صالح أو منتهٍ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const submit = async () => {
    if (!token || !invite) return
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إرسال العرض')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
      <header className="bg-[#123F3A] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#CFF5DC] flex items-center justify-center">
            <span className="text-[#123F3A] font-black text-sm">ف</span>
          </div>
          <div>
            <div className="text-white font-bold">بوابة المورد</div>
            <div className="text-white/40 text-xs">فرق تسعير</div>
          </div>
        </div>
        <button onClick={() => navigate('home')} className="text-white/60 text-xs hover:text-white">
          واجهة المشتري
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!token && (
          <div className="bg-white border border-neutral-100 rounded-2xl p-6 text-center">
            <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">بوابة الموردين</h1>
            <p className="text-sm text-neutral-500 leading-relaxed mb-4">
              تحتاج رابط دعوة صالح من Farq: افتح
              <code className="mx-1 text-xs bg-neutral-100 px-1.5 py-0.5 rounded">/?view=supplier&token=…</code>
              أو نفس المسار مع معلمة <code className="text-xs">token</code>.
            </p>
            <p className="text-xs text-neutral-400 mb-6">
              الرمز يُنشأ عند إرسال دعوة RFQ ولا يُخزَّن كنص واضح في قاعدة البيانات (hash فقط).
            </p>
            <button
              onClick={() => navigate('home')}
              className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
            >
              العودة
            </button>
          </div>
        )}

        {token && loading && (
          <div className="text-center py-16 text-neutral-400 font-semibold">جاري تحميل الدعوة…</div>
        )}

        {token && error && !invite && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <div className="font-bold text-red-700 mb-2">تعذر فتح الدعوة</div>
            <div className="text-sm text-red-600 mb-4">{error}</div>
            <button onClick={() => navigate('home')} className="text-sm font-semibold text-[#123F3A]">
              العودة
            </button>
          </div>
        )}

        {invite && done && (
          <div className="bg-white border border-neutral-100 rounded-2xl p-8 text-center">
            <div className="text-2xl font-black text-[#0D1F1D] mb-2">تم إرسال العرض</div>
            <p className="text-sm text-neutral-500">سُجّل العرض في construction.supplier_quotes عبر Farq API.</p>
          </div>
        )}

        {invite && !done && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">
                {invite.supplier.name_ar || invite.supplier.name_en}
              </h1>
              <p className="text-sm text-neutral-500">
                طلب من {String(invite.buyer?.company_name || 'المشتري')} ·{' '}
                {invite.lines.length} بند · الحالة {invite.response_status}
              </p>
              {invite.submission_closed_at && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                  أُغلق استلام العروض — العرض للقراءة فقط.
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {invite.lines.map((line) => (
                <div key={line.id} className="bg-white border border-neutral-100 rounded-2xl p-4">
                  <div className="font-bold text-[#0D1F1D] text-sm mb-1">
                    {/* The real item first: `name_ar` is a catalog label and is
                        null for a line the catalog never matched. */}
                    {line.original_name || line.name_ar || line.name_en || line.line_key}
                  </div>
                  <div className="text-xs text-neutral-500 mb-3">
                    {line.quantity} {line.uom}
                    {line.item_note ? ` · ${line.item_note}` : ''}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-end col-span-2 sm:col-span-1">
                      <label className="flex items-center gap-2 text-sm text-neutral-600">
                        <input
                          type="checkbox"
                          disabled={Boolean(invite.submission_closed_at)}
                          checked={drafts[line.id]?.available === true}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [line.id]: {
                                ...(prev[line.id] || { unitPrice: '', notes: '' }),
                                available: e.target.checked,
                              },
                            }))
                          }
                        />
                        متوفر — سأورّده
                      </label>
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-500 mb-1 block">سعر الوحدة</label>
                      <input
                        disabled={
                          Boolean(invite.submission_closed_at) ||
                          drafts[line.id]?.available !== true
                        }
                        value={drafts[line.id]?.unitPrice || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [line.id]: {
                              ...(prev[line.id] || { available: false, notes: '' }),
                              unitPrice: e.target.value,
                            },
                          }))
                        }
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A] disabled:bg-neutral-50 disabled:text-neutral-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-neutral-100 rounded-2xl p-4 mb-4 space-y-3">
              <div className="text-sm font-bold text-[#0D1F1D]">المفوّض بالتسعير</div>
              <input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="الاسم"
                className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
              />
              <input
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value)}
                placeholder="البريد"
                className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
              />
            </div>

            {error && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            {!invite.submission_closed_at && (
              <div className="mb-4 space-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div>
                  <div className="text-xs font-bold text-[#0D1F1D] mb-1.5">الأسعار التي أدخلتها</div>
                  <div className="flex gap-4 text-sm">
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

            {!invite.submission_closed_at && (
              <button
                disabled={submitting || !personName.trim() || !personEmail.trim() || pricesIncludeTax === null || !declarationAccepted}
                onClick={submit}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40"
              >
                {submitting ? 'جارٍ الإرسال…' : 'إرسال العرض'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SupplierPortalView
