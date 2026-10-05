// Synthetic local fixture. Every API/provider request is mocked or rejected.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import SupplierPriceMemory from '../src/components/procurement/SupplierPriceMemory'
import SupplierPriceValidity from '../src/components/procurement/SupplierPriceValidity'
const prices = [15, 14.75, 16].map((unit_price, index) => ({
  supplier_id: `test-supplier-${index}`,
  supplier_name: `المورد ${['أ', 'ب', 'ج'][index]} — اختبار`,
  unit_price,
  currency: 'SAR',
  prices_include_tax: true,
  delivery_basis: 'EX_WAREHOUSE',
  quoted_at: '2026-09-23T17:17:00.000Z',
  valid_until: '2026-11-07T17:17:00.000Z',
  auto_offer_eligible: true,
}))
window.fetch = async (input, init) => {
  const path = new URL(String(input), 'http://localhost').pathname
  if (init?.method && init.method !== 'GET')
    throw new Error('All writes and supplier sends are blocked in this fixture')
  let data
  if (path.endsWith('/prewarm/capabilities'))
    data = { enabled: true, can_release: false, price_memory_enabled: true }
  else if (path.endsWith('/price-memory'))
    data = {
      enabled: true,
      lines: [
        {
          line_id: 'test-line',
          name: 'EMT Pipe 1 inch',
          uom: 'حبة',
          prices: [
            ...prices,
            {
              ...prices[0],
              quoted_at: '2026-08-16T17:17:00.000Z',
              valid_until: '2026-09-30T17:17:00.000Z',
              unit_price: 17,
              auto_offer_eligible: false,
            },
          ],
        },
      ],
    }
  else throw new Error('Real network blocked')
  return new Response(
    JSON.stringify({ data, meta: { source: 'LOCAL_SYNTHETIC_TEST' } }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
createRoot(document.getElementById('root')!).render(
  <main dir="rtl" className="mx-auto max-w-3xl p-6 space-y-5 text-[#0D1F1D]">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      معاينة محلية ببيانات اختبار · جميع الاتصالات والإرسال الخارجي محظورة
    </div>
    <header>
      <div className="text-sm text-[#123F3A]">فرق للبناء</div>
      <h1 className="text-2xl font-black">
        عروض جاهزة من أسعار الموردين المعتمدة
      </h1>
      <p className="mt-2 text-neutral-500">
        حساب العميل B · ماسورة EMT مقاس 1 بوصة · 800 حبة · استلام من المستودع
      </p>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      {prices.map((p) => (
        <article
          key={p.supplier_id}
          className="rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <h2 className="font-bold">{p.supplier_name}</h2>
          <div className="mt-3 text-2xl font-black tabular-nums">
            {(p.unit_price * 800).toLocaleString('ar-SA')} ر.س
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            {p.unit_price} ريال / حبة · شامل الضريبة
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            أكد المورد السعر: 23 سبتمبر · 8:17 م
          </p>
          <SupplierPriceValidity validUntil={p.valid_until} />
        </article>
      ))}
    </div>
    <SupplierPriceMemory rfqId="local-test-rfq" />
  </main>,
)
