/**
 * «الموقع والتوريد» — the request-level facts suppliers asked for before they
 * would price: the district and map pin (a block price depends on distance),
 * delivery or pickup and who pays for it, payment terms, and supply only or
 * with installation. Optional fields; only a malformed link or incomplete
 * credit terms block sending (siteSupplyProblems).
 */
import {
  DELIVERY_MODES,
  PAYMENT_TERMS,
  SHIPPING_OPTIONS,
  siteSupplyProblems,
  type DeliveryMode,
  type PaymentTermsCode,
  type Shipping,
  type SiteSupply,
} from '../lib/specCard'

const field =
  'w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A] bg-white'

export default function SiteSupplySection({
  city,
  value,
  onChange,
  requestType,
  onRequestType,
}: {
  city: string
  value: SiteSupply
  onChange: (next: SiteSupply) => void
  requestType: 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL'
  onRequestType: (next: 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL') => void
}) {
  const set = (patch: Partial<SiteSupply>) => onChange({ ...value, ...patch })
  const problems = siteSupplyProblems(value)
  return (
    <div className="mb-4 rounded-2xl border border-neutral-100 bg-white px-4 py-4 space-y-3">
      <div>
        <div className="text-sm font-black text-[#0D1F1D]">الموقع والتوريد</div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          يظهر للمورد في الإيميل والرسالة والرابط. المورد يسأل عنها قبل ما يسعّر.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">
          المدينة
          <input className={`${field} bg-neutral-50`} value={city || 'الرياض'} readOnly aria-readonly />
        </label>
        <label className="text-xs text-neutral-500">
          الحي
          <input className={field} value={value.district} placeholder="مثال: حي النرجس" onChange={(e) => set({ district: e.target.value })} />
        </label>
      </div>
      <label className="text-xs text-neutral-500 block">
        رابط الموقع على الخريطة
        <input
          className={field}
          dir="ltr"
          value={value.mapUrl}
          placeholder="https://maps.app.goo.gl/…"
          onChange={(e) => set({ mapUrl: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">
          التوصيل
          <select className={field} value={value.deliveryMode} onChange={(e) => set({ deliveryMode: e.target.value as DeliveryMode | '' })}>
            <option value="">— اختر —</option>
            {DELIVERY_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          تكلفة التوصيل
          <select className={field} value={value.shipping} onChange={(e) => set({ shipping: e.target.value as Shipping | '' })}>
            <option value="">— اختر —</option>
            {SHIPPING_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">
          الدفع
          <select className={field} value={value.paymentCode} onChange={(e) => set({ paymentCode: e.target.value as PaymentTermsCode | '' })}>
            <option value="">— اختر —</option>
            {PAYMENT_TERMS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        {value.paymentCode === 'CREDIT' ? (
          <label className="text-xs text-neutral-500">
            أيام الآجل
            <input className={field} inputMode="numeric" value={value.creditDays} placeholder="30" onChange={(e) => set({ creditDays: e.target.value })} />
          </label>
        ) : (
          <label className="text-xs text-neutral-500">
            نوع الطلب
            <select className={field} value={requestType} onChange={(e) => onRequestType(e.target.value as 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL')}>
              <option value="SUPPLY_ONLY">توريد فقط</option>
              <option value="SUPPLY_AND_INSTALL">توريد وتركيب</option>
            </select>
          </label>
        )}
      </div>
      {value.paymentCode === 'CREDIT' && (
        <label className="text-xs text-neutral-500 block">
          نوع الطلب
          <select className={field} value={requestType} onChange={(e) => onRequestType(e.target.value as 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL')}>
            <option value="SUPPLY_ONLY">توريد فقط</option>
            <option value="SUPPLY_AND_INSTALL">توريد وتركيب</option>
          </select>
        </label>
      )}
      {value.paymentCode && (
        <label className="text-xs text-neutral-500 block">
          ملاحظة على الدفع {value.paymentCode === 'OTHER' ? '(مطلوبة)' : '(اختيارية)'}
          <input className={field} value={value.paymentNote} placeholder="مثال: الدفع بعد استلام كامل الكمية" onChange={(e) => set({ paymentNote: e.target.value })} />
        </label>
      )}
      {problems.length > 0 && (
        <ul className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 list-disc pr-5">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
