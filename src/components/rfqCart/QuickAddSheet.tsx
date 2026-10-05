/**
 * The small sheet after choosing a product: how many, in what unit, the unit a
 * shop may sell in (box/carton with its count), the spec-card fields suppliers
 * ask back about, and a note. Then the line goes into «طلبك».
 */
import { useState } from 'react'
import { SALE_UNITS, validLink, type SaleUnit } from '../../lib/specCard'
import { ANY_BRAND_TEXT, type AddMode, type ProductCard, type QuickSheet } from '../../lib/rfqCart'

const input =
  'w-full border border-neutral-200 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[#123F3A] bg-white'
const LINE_UNITS = ['عدد', 'حبة', 'طقم', 'جهاز', 'متر', 'م²', 'م³', 'لفة', 'كرتون', 'علبة', 'كيس', 'طن', 'لتر']

export default function QuickAddSheet({
  card,
  mode,
  initial,
  onCancel,
  onConfirm,
}: {
  card: ProductCard
  mode: AddMode
  initial: QuickSheet
  onCancel: () => void
  onConfirm: (sheet: QuickSheet) => void
}) {
  const [sheet, setSheet] = useState<QuickSheet>(initial)
  const [more, setMore] = useState(false)
  const set = (patch: Partial<QuickSheet>) => setSheet((prev) => ({ ...prev, ...patch }))
  const unitOn = (unit: SaleUnit) => sheet.saleUnits.find((u) => u.unit === unit)
  const toggleUnit = (unit: SaleUnit) =>
    set({ saleUnits: unitOn(unit) ? sheet.saleUnits.filter((u) => u.unit !== unit) : [...sheet.saleUnits, { unit }] })
  const setPack = (unit: SaleUnit, pack: string) =>
    set({
      saleUnits: sheet.saleUnits.map((u) =>
        u.unit === unit ? { unit, ...(Number(pack) >= 1 ? { pack_size: Math.floor(Number(pack)) } : {}) } : u,
      ),
    })
  const qtyOk = Number(String(sheet.qty).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))) > 0
  const photoBad = Boolean(sheet.photoUrl.trim()) && !validLink(sheet.photoUrl)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="أضف البند للطلب"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-neutral-500 mb-1">
          {mode === 'product' ? 'أضف هذا المنتج' : 'استخدم مواصفاته فقط'}
        </div>
        <div className="text-base font-bold text-[#0D1F1D] leading-snug">{card.line_name_ar || card.name}</div>
        <div className="text-xs text-neutral-500 mt-1">
          {mode === 'product'
            ? [card.brand, card.model].filter(Boolean).join(' · ') || card.name
            : ANY_BRAND_TEXT}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">الكمية</span>
            <input
              className={input}
              inputMode="decimal"
              value={sheet.qty}
              onChange={(e) => set({ qty: e.target.value })}
              aria-invalid={!qtyOk}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">الوحدة</span>
            <input className={input} list="quick-add-units" value={sheet.unit} onChange={(e) => set({ unit: e.target.value })} />
            <datalist id="quick-add-units">
              {LINE_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-neutral-600 mb-1.5">يقبل المورد البيع بـ</div>
          <div className="flex flex-wrap gap-1.5">
            {SALE_UNITS.map((u) => {
              const on = unitOn(u.value)
              return (
                <span key={u.value} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleUnit(u.value)}
                    aria-pressed={Boolean(on)}
                    className={`text-xs rounded-full px-2.5 py-1 border ${
                      on ? 'border-[#123F3A] bg-[#f0faf7] text-[#123F3A] font-bold' : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    {u.label}
                  </button>
                  {on && u.pack && (
                    <input
                      className="w-16 border border-neutral-200 rounded-lg px-1.5 py-0.5 text-xs"
                      inputMode="numeric"
                      placeholder="العدد"
                      aria-label={`عدد الحبات في ${u.label}`}
                      value={on.pack_size ?? ''}
                      onChange={(e) => setPack(u.value, e.target.value)}
                    />
                  )}
                </span>
              )
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          {mode === 'product' ? (
            <label className="block">
              <span className="text-xs font-semibold text-neutral-600">العلامة التجارية</span>
              <input className={input} value={sheet.brand} onChange={(e) => set({ brand: e.target.value })} />
            </label>
          ) : (
            <div className="rounded-lg bg-[#f0faf7] px-3 py-2 text-xs text-[#123F3A] font-semibold">{ANY_BRAND_TEXT}</div>
          )}
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="text-xs font-bold text-[#123F3A] text-right hover:underline"
          >
            {more ? 'إخفاء المواصفات الإضافية' : 'مواصفات إضافية (المقاس، الخامة، الاعتماد، صورة)'}
          </button>
          {more && (
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['dimensions', 'المقاس'],
                  ['thickness', 'السماكة'],
                  ['length', 'الطول'],
                  ['material', 'الخامة'],
                  ['finish', 'التشطيب / اللون'],
                  ['standard', 'الاعتماد / المواصفة'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold text-neutral-600">{label}</span>
                  <input className={input} value={sheet[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<QuickSheet>)} />
                </label>
              ))}
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-neutral-600">رابط صورة للبند</span>
                <input
                  className={input}
                  dir="ltr"
                  value={sheet.photoUrl}
                  onChange={(e) => set({ photoUrl: e.target.value })}
                  aria-invalid={photoBad}
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">ملاحظات</span>
            <textarea
              className={`${input} min-h-[64px]`}
              value={sheet.notes}
              maxLength={300}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            disabled={!qtyOk || photoBad}
            onClick={() => onConfirm(sheet)}
            className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40"
          >
            أضف للطلب
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl text-sm"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
