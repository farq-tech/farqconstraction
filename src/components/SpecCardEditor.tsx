/**
 * «بطاقة المواصفة» — a compact, collapsed-by-default card under a booklet line.
 * Closed, it shows what is filled in one line (or an invitation to fill it).
 * Open, it asks what suppliers asked back in real threads: brand, standard,
 * size/thickness/length, material, the unit they may sell in, and a photo link.
 * Nothing here is required; an empty card sends nothing.
 */
import { useState } from 'react'
import {
  SALE_UNITS,
  cleanSpecCard,
  specCardSummary,
  validLink,
  type SaleUnit,
  type SpecCard,
} from '../lib/specCard'

const input =
  'w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#123F3A] bg-white'

export default function SpecCardEditor({
  value,
  onCommit,
  disabled = false,
}: {
  value: SpecCard | undefined
  onCommit: (next: SpecCard | undefined) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SpecCard>(() => value || {})
  const summary = specCardSummary(value)
  const set = (patch: Partial<SpecCard>) => setDraft((prev) => ({ ...prev, ...patch }))
  const units = draft.sale_units || []
  const unitOn = (unit: SaleUnit) => units.find((u) => u.unit === unit)
  const toggleUnit = (unit: SaleUnit) =>
    set({ sale_units: unitOn(unit) ? units.filter((u) => u.unit !== unit) : [...units, { unit }] })
  const setPack = (unit: SaleUnit, pack: string) =>
    set({
      sale_units: units.map((u) =>
        u.unit === unit ? { unit, ...(Number(pack) >= 1 ? { pack_size: Math.floor(Number(pack)) } : {}) } : u,
      ),
    })
  const photoBad = Boolean(draft.reference_photo_url?.trim()) && !validLink(draft.reference_photo_url)

  const save = () => {
    onCommit(cleanSpecCard(draft))
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="px-5 pb-3 -mt-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft(value || {})
            setOpen(true)
          }}
          className="w-full text-right rounded-xl border border-dashed border-neutral-200 px-3 py-2 text-[12px] hover:border-[#123F3A] disabled:opacity-60"
        >
          <span className="font-bold text-[#123F3A]">بطاقة المواصفة</span>
          <span className="text-neutral-500">
            {' '}
            — {summary || 'الماركة، المقاس، وحدة البيع، صورة… (اختياري، يقلّل أسئلة الموردين)'}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="mx-5 mb-3 rounded-xl border border-[#123F3A]/20 bg-[#f7fbfa] p-3 space-y-2.5">
      <div className="text-[13px] font-black text-[#0D1F1D]">بطاقة المواصفة</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-[11px] text-neutral-500">
          الماركة
          <input className={input} value={draft.brand || ''} placeholder="مثال: بناسونيك" onChange={(e) => set({ brand: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          المواصفة أو الاعتماد
          <input className={input} value={draft.standard || ''} placeholder="مثال: UL أو ITCC أو SASO" onChange={(e) => set({ standard: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          الدرجة / النوع
          <input className={input} value={draft.grade || ''} placeholder="أصلي أو تجاري، B1 أو B2" onChange={(e) => set({ grade: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          المقاس
          <input className={input} value={draft.dimensions || ''} placeholder="مثال: 1 بوصة، 750 مل" onChange={(e) => set({ dimensions: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          السماكة
          <input className={input} value={draft.thickness || ''} placeholder="مثال: 0.6 مم" onChange={(e) => set({ thickness: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          الطول
          <input className={input} value={draft.length || ''} placeholder="مثال: 3 م" onChange={(e) => set({ length: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          الخامة
          <input className={input} value={draft.material || ''} placeholder="مثال: حديد مجلفن" onChange={(e) => set({ material: e.target.value })} />
        </label>
        <label className="text-[11px] text-neutral-500">
          التشطيب
          <input className={input} value={draft.finish || ''} placeholder="مثال: أبيض مطفي" onChange={(e) => set({ finish: e.target.value })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-neutral-700">
        <input
          type="checkbox"
          className="accent-[#123F3A]"
          checked={draft.any_approved_brand === true}
          onChange={(e) => set({ any_approved_brand: e.target.checked })}
        />
        نقبل أي ماركة معتمدة
      </label>
      <div>
        <div className="text-[11px] text-neutral-500 mb-1">وحدة البيع المقبولة (مع العدد في الوحدة)</div>
        <div className="flex flex-wrap gap-1.5">
          {SALE_UNITS.map((u) => {
            const on = unitOn(u.value)
            return (
              <span key={u.value} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleUnit(u.value)}
                  className={`rounded-full px-2.5 py-1 text-[12px] border ${on ? 'bg-[#123F3A] text-white border-[#123F3A]' : 'bg-white text-neutral-600 border-neutral-200'}`}
                >
                  {u.label}
                </button>
                {on && u.pack && (
                  <input
                    inputMode="numeric"
                    aria-label={`العدد في ${u.label}`}
                    placeholder="العدد"
                    value={on.pack_size ?? ''}
                    onChange={(e) => setPack(u.value, e.target.value)}
                    className="w-16 border border-neutral-200 rounded-lg px-2 py-1 text-[12px]"
                  />
                )}
              </span>
            )
          })}
        </div>
      </div>
      <label className="text-[11px] text-neutral-500 block">
        رابط صورة مرجعية
        <input
          className={input}
          dir="ltr"
          value={draft.reference_photo_url || ''}
          placeholder="https://…"
          onChange={(e) => set({ reference_photo_url: e.target.value })}
        />
        {photoBad && <span className="text-red-700">الرابط غير صحيح — لن يُرسل.</span>}
      </label>
      <label className="text-[11px] text-neutral-500 block">
        ملاحظة للمورد
        <input className={input} value={draft.notes || ''} placeholder="مثال: نحتاج المسدس مع الفوم" onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-neutral-500 px-3 py-1.5">
          إلغاء
        </button>
        <button type="button" onClick={save} className="text-[12px] font-bold text-white bg-[#123F3A] rounded-lg px-3 py-1.5">
          حفظ البطاقة
        </button>
      </div>
    </div>
  )
}
