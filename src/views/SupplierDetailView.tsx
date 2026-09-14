import type { NavProps } from '../types'

const INTERACTIONS = [
  { rfq: 'RFQ-2024-089', project: 'تجديد مبنى إداري', date: '14 سبتمبر 2026', status: 'مكتمل', amount: '213,968 ر.س' },
  { rfq: 'RFQ-2024-061', project: 'برج الأعمال — الخبر', date: '1 سبتمبر 2026', status: 'بانتظار', amount: '—' },
  { rfq: 'RFQ-2024-030', project: 'مشروع الواحة', date: '5 أغسطس 2026', status: 'مكتمل', amount: '98,400 ر.س' },
]

export function SupplierDetailView({ navigate }: NavProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        <button onClick={() => navigate('supplier-management')} className="text-neutral-400 hover:text-neutral-600 transition-colors">
          الموردون
        </button>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-600 font-semibold">الخزف السعودي</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
          <span className="text-[#123F3A] font-black text-2xl">خ</span>
        </div>
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">الخزف السعودي</h1>
          <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
            <span>الرياض</span>
            <span>·</span>
            <span>بورسلان وسيراميك</span>
            <span>·</span>
            <span>14 تعاملًا</span>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-bold text-[#0D1F1D] mb-4">معلومات التواصل</h2>
        <div className="space-y-3">
          {[
            { label: 'الجوال', value: '0112345001', dir: 'ltr' },
            { label: 'البريد الإلكتروني', value: 'sales@saudi-ceramic.com.sa', dir: 'ltr' },
            { label: 'القنوات', value: 'بريد إلكتروني · واتساب' },
          ].map(c => (
            <div key={c.label} className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-semibold">{c.label}</span>
              <span className="text-sm font-semibold text-[#0D1F1D]" dir={c.dir || 'rtl'}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-bold text-[#0D1F1D] mb-3">الفئات والتخصصات</h2>
        <div className="flex flex-wrap gap-2">
          {['بورسلان أرضيات', 'سيراميك حوائط', 'بلاط مداخل', 'واجهات زجاجية'].map(c => (
            <span key={c} className="px-3 py-1.5 bg-[#f0faf7] text-[#123F3A] text-xs font-semibold rounded-full">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Past interactions */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-bold text-[#0D1F1D] mb-4">التعاملات السابقة</h2>
        <div className="space-y-3">
          {INTERACTIONS.map(i => (
            <div key={i.rfq} className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#0D1F1D] truncate">{i.project}</div>
                <div className="text-xs text-neutral-400">{i.rfq} · {i.date}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-bold text-[#0D1F1D]">{i.amount}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  i.status === 'مكتمل' ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-neutral-100 text-neutral-500'
                }`}>{i.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <button
          onClick={() => navigate('create-upload')}
          className="py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          استخدم في طلب جديد
        </button>
        <button className="py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm">
          تعديل بيانات التواصل
        </button>
      </div>
      <button className="w-full py-2.5 text-neutral-400 text-sm font-semibold hover:text-red-500 transition-colors">
        أرشفة المورد
      </button>
    </div>
  )
}
