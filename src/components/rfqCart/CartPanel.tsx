/**
 * «طلبك — N بنود»: every line of the request in one place — read from a
 * booklet, found by search, pasted as a link or typed — each editable and
 * removable until the request is sent. One button carries on into the same
 * supplier selection and send every request uses.
 */
import { useState } from 'react'
import type { BOQItem } from '../../types'
import { cartCountLabel, safeImageUrl, validCartQuantity } from '../../lib/rfqCart'
import { specCardSummary } from '../../lib/specCard'

const ORIGIN_LABEL: Record<NonNullable<BOQItem['origin']>, string> = {
  booklet: 'من الكراسة',
  search: 'من البحث',
  url: 'من رابط',
  manual: 'مكتوب يدويًا',
}

const SHOWN = 80
const input = 'w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-[#123F3A] bg-white'

function CartLine({
  item,
  onEdit,
  onRemove,
}: {
  item: BOQItem
  onEdit: (id: number, patch: Partial<Pick<BOQItem, 'name' | 'qty' | 'unit' | 'spec'>>) => void
  onRemove: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [quantityError, setQuantityError] = useState('')
  const [draft, setDraft] = useState({ name: item.name, qty: item.qty, unit: item.unit, spec: item.spec || '' })
  const image = safeImageUrl(item.productRef?.imageUrl)
  const card = specCardSummary(item.specCard)
  const matched = !item.needsMatch && (item.origin === undefined || item.origin === 'booklet' || item.supplierCount > 0)
  return (
    <div className="px-3 py-3 flex items-start gap-3 text-right" data-line={item.id}>
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-11 h-11 rounded-lg object-contain bg-neutral-50 border border-neutral-100 flex-shrink-0"
        />
      ) : (
        <span className="w-11 text-center text-xs font-bold text-neutral-400 pt-1 flex-shrink-0">{item.id}</span>
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input className={input} aria-label="اسم البند" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={input} aria-label="الكمية" inputMode="decimal" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
              <input className={input} aria-label="الوحدة" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            </div>
            <textarea
              className={`${input} min-h-[56px]`}
              aria-label="الوصف والمواصفات"
              value={draft.spec}
              onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!validCartQuantity(draft.qty)) {
                    setQuantityError('اكتب كمية أكبر من صفر؛ لم يتم حفظ التعديل.')
                    return
                  }
                  setQuantityError('')
                  onEdit(item.id, { name: draft.name, qty: draft.qty, unit: draft.unit, spec: draft.spec.trim() || undefined })
                  setEditing(false)
                }}
                className="text-xs font-bold bg-[#123F3A] text-white rounded-lg px-3 py-1.5"
              >
                حفظ
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs font-bold text-neutral-500 px-2">
                إلغاء
              </button>
            </div>
            {quantityError && <p role="alert" className="text-xs text-red-700">{quantityError}</p>}
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold text-[#0D1F1D] leading-snug">{item.name}</div>
            <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
              <span className="font-semibold text-[#0D1F1D]">
                {item.qty} {item.unit}
              </span>
              {item.spec ? ` · ${item.spec}` : ''}
            </div>
            {card && <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{card}</div>}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                {ORIGIN_LABEL[item.origin || 'booklet']}
              </span>
              {matched ? (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    item.supplierCount ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {item.supplierCount ? `${item.supplierCount} موردين` : 'بلا مورد'}
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0faf7] text-[#123F3A]">نطابق الموردين عند المتابعة</span>
              )}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            type="button"
            data-action="edit"
            onClick={() => {
              setDraft({ name: item.name, qty: item.qty, unit: item.unit, spec: item.spec || '' })
              setEditing(true)
            }}
            className="text-[11px] font-bold text-[#123F3A] border border-neutral-200 rounded-lg px-2 py-1"
          >
            تعديل
          </button>
          <button
            type="button"
            data-action="remove"
            onClick={() => onRemove(item.id)}
            className="text-[11px] font-bold text-neutral-500 border border-neutral-200 rounded-lg px-2 py-1 hover:text-red-700 hover:border-red-200"
          >
            حذف
          </button>
        </div>
      )}
    </div>
  )
}

export default function CartPanel({
  items,
  busy,
  error,
  onEdit,
  onRemove,
  onContinue,
  onAddMore,
  continueLabel = 'متابعة لاختيار الموردين',
}: {
  items: BOQItem[]
  busy: boolean
  error: string
  onEdit: (id: number, patch: Partial<Pick<BOQItem, 'name' | 'qty' | 'unit' | 'spec'>>) => void
  onRemove: (id: number) => void
  onContinue: () => void
  onAddMore?: () => void
  continueLabel?: string
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, SHOWN)
  return (
    <section className="rounded-2xl border border-[#CFF5DC] bg-white overflow-hidden mb-6" dir="rtl" aria-label="طلبك">
      <div className="px-4 py-3 bg-[#F3FBF6] flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-[#123F3A]">طلبك — {cartCountLabel(items.length)}</h2>
        {onAddMore && (
          <button type="button" onClick={onAddMore} className="text-xs font-bold text-[#123F3A] hover:underline">
            + أضف بندًا
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-neutral-500 text-center">
          طلبك فاضي. ارفع كراسة، أو ابحث عن منتج، أو اكتب البنود يدويًا.
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto divide-y divide-neutral-50">
          {shown.map((item) => (
            <CartLine key={item.id} item={item} onEdit={onEdit} onRemove={onRemove} />
          ))}
          {items.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-3 text-xs font-bold text-[#123F3A] text-center"
            >
              اعرض كل البنود ({items.length.toLocaleString('en-US')})
            </button>
          )}
        </div>
      )}
      {error && <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">{error}</div>}
      <div className="p-4">
        <button
          type="button"
          data-action="continue"
          disabled={!items.length || busy}
          onClick={onContinue}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40"
        >
          {busy ? 'نطابق الموردين للبنود الجديدة…' : continueLabel}
        </button>
      </div>
    </section>
  )
}
