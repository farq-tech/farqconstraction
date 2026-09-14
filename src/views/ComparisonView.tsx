import type { NavProps } from '../types'

const COMPARISON_ITEMS = [
  {
    item: 'بورسلان أرضيات',
    qty: '5,600 م²',
    offers: [
      { supplier: 'الخزف السعودي', unitPrice: '31.50', total: '176,400', delivery: '14 يوم', shipping: 'مشمول', best: false },
      { supplier: 'شركة البيت الحديث', unitPrice: '29.80', total: '166,880', delivery: '21 يوم', shipping: '+ 4,000', best: true },
      { supplier: 'مورد الخليج', unitPrice: '33.00', total: '184,800', delivery: '7 أيام', shipping: 'مشمول', best: false },
    ],
  },
  {
    item: 'سيراميك حوائط',
    qty: '976 م²',
    offers: [
      { supplier: 'الخزف السعودي', unitPrice: '24.00', total: '23,424', delivery: '14 يوم', shipping: 'مشمول', best: false },
      { supplier: 'سيراميك الجزيرة', unitPrice: '21.50', total: '20,984', delivery: '18 يوم', shipping: 'مشمول', best: true },
    ],
  },
]

export function ComparisonView({ navigate }: NavProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">مقارنة العروض</h1>
          <p className="text-neutral-500 text-sm">تجديد مبنى إداري — الرياض</p>
        </div>
        <button
          onClick={() => navigate('award')}
          className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          اختيار العرض
        </button>
      </div>

      <div className="space-y-6">
        {COMPARISON_ITEMS.map((row, ri) => (
          <div key={ri} className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-50">
              <div className="text-lg font-black text-[#0D1F1D]">{row.item}</div>
              <div className="text-sm text-neutral-500">{row.qty}</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-right">
                    <th className="px-5 py-3 text-xs font-semibold text-neutral-500">المورد</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500">سعر الوحدة</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500">الإجمالي</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500">مدة التوريد</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500">الشحن</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {row.offers.map((offer, oi) => (
                    <tr key={oi} className={offer.best ? 'bg-[#f0faf7]' : ''}>
                      <td className="px-5 py-4">
                        <div className="font-bold text-[#0D1F1D]">{offer.supplier}</div>
                      </td>
                      <td className="px-4 py-4 font-bold text-[#0D1F1D]">{offer.unitPrice} ر.س</td>
                      <td className="px-4 py-4 font-bold text-[#0D1F1D]">{offer.total} ر.س</td>
                      <td className="px-4 py-4 text-neutral-600">{offer.delivery}</td>
                      <td className="px-4 py-4 text-neutral-600">{offer.shipping}</td>
                      <td className="px-4 py-4">
                        {offer.best && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-semibold whitespace-nowrap">
                            الأقل تكلفة
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button
          onClick={() => navigate('award')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          اختيار العرض وترسية العقد
        </button>
      </div>
    </div>
  )
}
