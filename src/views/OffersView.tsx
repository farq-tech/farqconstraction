import type { NavProps } from '../types'

const OFFERS = [
  {
    supplier: 'الخزف السعودي',
    items: 12, total: 12,
    amount: '184,500',
    delivery: '14 يوم',
    shipping: 'مشمول',
    status: 'complete' as const,
  },
  {
    supplier: 'سيكا السعودية',
    items: 4, total: 4,
    amount: '142,300',
    delivery: '21 يوم',
    shipping: 'مشمول',
    status: 'complete' as const,
  },
  {
    supplier: 'كابلات الرياض',
    items: 3, total: 4,
    amount: '87,200',
    delivery: '10 أيام',
    shipping: 'غير مشمول',
    status: 'partial' as const,
  },
  {
    supplier: 'حديد سابك',
    items: 0, total: 3,
    amount: '—',
    delivery: '—',
    shipping: '—',
    status: 'pending' as const,
  },
  {
    supplier: 'فيليبس العربية',
    items: 0, total: 6,
    amount: '—',
    delivery: '—',
    shipping: '—',
    status: 'pending' as const,
  },
]

const STATUS_CONF = {
  complete: { label: 'مكتمل', className: 'bg-[#CFF5DC] text-[#1a7a45]' },
  partial: { label: 'عرض جزئي', className: 'bg-amber-50 text-amber-700' },
  pending: { label: 'بانتظار الرد', className: 'bg-neutral-100 text-neutral-500' },
}

export function OffersView({ navigate }: NavProps) {
  const completed = OFFERS.filter(o => o.status === 'complete')

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">العروض</h1>
          <p className="text-neutral-500 text-sm">تجديد مبنى إداري — الرياض · RFQ-2024-089</p>
        </div>
        {completed.length >= 2 && (
          <button
            onClick={() => navigate('comparison')}
            className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            مقارنة العروض
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="bg-white border border-neutral-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-[#123F3A]">7</span>
          <span className="text-sm text-neutral-500">عروض مكتملة</span>
        </div>
        <div className="bg-amber-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-amber-700">3</span>
          <span className="text-sm text-amber-600">جزئية</span>
        </div>
        <div className="bg-neutral-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-xl font-black text-neutral-500">5</span>
          <span className="text-sm text-neutral-500">بانتظار</span>
        </div>
      </div>

      {/* Offers list */}
      <div className="space-y-4">
        {OFFERS.map(offer => {
          const cfg = STATUS_CONF[offer.status]
          const canCompare = offer.status !== 'pending'
          return (
            <div
              key={offer.supplier}
              className="bg-white border border-neutral-100 rounded-2xl overflow-hidden"
            >
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.className}`}>
                      {cfg.label}
                    </span>
                    {offer.status === 'partial' && (
                      <span className="text-xs text-neutral-400">{offer.items} من {offer.total} بنود</span>
                    )}
                  </div>
                  <div className="text-lg font-black text-[#0D1F1D]">{offer.supplier}</div>

                  {canCompare && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <div className="text-xs text-neutral-400">الإجمالي</div>
                        <div className="text-sm font-bold text-[#0D1F1D]">{offer.amount} ر.س</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-400">مدة التوريد</div>
                        <div className="text-sm font-bold text-[#0D1F1D]">{offer.delivery}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-400">الشحن</div>
                        <div className="text-sm font-bold text-[#0D1F1D]">{offer.shipping}</div>
                      </div>
                    </div>
                  )}

                  {offer.status === 'pending' && (
                    <div className="text-sm text-neutral-400 mt-2">لم يصل عرض بعد.</div>
                  )}
                </div>

                {canCompare && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate('offer-detail')}
                      className="text-xs px-3 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg font-semibold hover:bg-neutral-50 transition-colors"
                    >
                      عرض
                    </button>
                    <button
                      onClick={() => navigate('comparison')}
                      className="text-xs px-3 py-1.5 border border-[#123F3A]/30 text-[#123F3A] rounded-lg font-semibold hover:bg-[#f0faf7] transition-colors"
                    >
                      مقارنة
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {completed.length >= 2 && (
        <div className="mt-6">
          <button
            onClick={() => navigate('comparison')}
            className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            مقارنة العروض المكتملة
          </button>
        </div>
      )}
    </div>
  )
}
