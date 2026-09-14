import type { NavProps } from '../types'

const LINES = [
  { name: 'بورسلان أرضيات', qty: '5,600', unit: 'م²', unitPrice: '32.50', total: '182,000', delivery: '14 يوم', avail: 'متوفر' },
  { name: 'سيراميك حوائط', qty: '976', unit: 'م²', unitPrice: '18.00', total: '17,568', delivery: '14 يوم', avail: 'متوفر' },
  { name: 'بلاط مداخل', qty: '320', unit: 'م²', unitPrice: '45.00', total: '14,400', delivery: '21 يوم', avail: 'حسب الطلب' },
]

const UNPRICED = [
  { name: 'مواسير صرف PVC', qty: '450', unit: 'م ط' },
  { name: 'محابس بوابة', qty: '24', unit: 'عدد' },
]

export function OfferDetailView({ navigate }: NavProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        <button onClick={() => navigate('offers')} className="text-neutral-400 hover:text-neutral-600 transition-colors">العروض</button>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-600 font-semibold">الخزف السعودي</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">عرض جزئي</span>
            <span className="text-xs text-neutral-400">FARQ-SUP-2024-0221</span>
          </div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الخزف السعودي</h1>
          <p className="text-neutral-500 text-sm mt-1">الرياض · استُلم 14 سبتمبر 2026 · 11:40</p>
        </div>
        <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-3 text-center">
          <div className="text-2xl font-black text-[#123F3A]">213,968</div>
          <div className="text-xs text-neutral-500 mt-0.5">ر.س إجمالي (شامل ضريبة)</div>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-neutral-100 rounded-2xl mb-6 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-neutral-100">
          {[
            { label: 'البنود المسعّرة', value: '3 من 5' },
            { label: 'مدة التوريد', value: '21 يوم' },
            { label: 'الشحن', value: 'مشمول' },
            { label: 'الضمان', value: '12 شهر' },
          ].map(s => (
            <div key={s.label} className="px-4 py-4 text-center">
              <div className="text-sm font-black text-[#0D1F1D]">{s.value}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Priced lines */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#0D1F1D] mb-3">البنود المسعّرة</h2>
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="text-right px-4 py-3 text-xs font-bold text-neutral-500">البند</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-neutral-500">الكمية</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-neutral-500">سعر الوحدة</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-neutral-500">الإجمالي</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-neutral-500">التسليم</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-neutral-500">التوافر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {LINES.map(line => (
                  <tr key={line.name} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-semibold text-[#0D1F1D]">{line.name}</td>
                    <td className="px-4 py-3 text-center text-neutral-600">{line.qty} {line.unit}</td>
                    <td className="px-4 py-3 text-center font-bold text-[#0D1F1D]">{line.unitPrice} ر.س</td>
                    <td className="px-4 py-3 text-center font-black text-[#123F3A]">{line.total}</td>
                    <td className="px-4 py-3 text-center text-neutral-500 text-xs">{line.delivery}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        line.avail === 'متوفر' ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
                      }`}>{line.avail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Unpriced lines */}
      {UNPRICED.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#0D1F1D] mb-3">بنود لم تُسعَّر</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <span className="text-xs font-bold text-amber-700">لم يقدم المورد سعرًا لهذه البنود</span>
            </div>
            <div className="divide-y divide-amber-100">
              {UNPRICED.map(u => (
                <div key={u.name} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0D1F1D]">{u.name}</span>
                  <span className="text-xs text-neutral-500">{u.qty} {u.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attachments */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#0D1F1D] mb-3">المرفقات</h2>
        <div className="space-y-2">
          {['عرض_الأسعار_الخزف_السعودي.pdf', 'بروفورما_خزف_2026.xlsx'].map(f => (
            <div key={f} className="bg-white border border-neutral-100 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <span className="text-red-500 text-[10px] font-bold">{f.endsWith('.pdf') ? 'PDF' : 'XLS'}</span>
              </div>
              <span className="text-sm font-semibold text-[#0D1F1D] flex-1 truncate">{f}</span>
              <button className="text-xs text-[#123F3A] font-semibold hover:underline">تنزيل</button>
            </div>
          ))}
        </div>
      </div>

      {/* Partial review banner */}
      <div className="bg-[#f0faf7] border border-[#123F3A]/20 rounded-2xl px-5 py-4 mb-6">
        <div className="text-sm font-bold text-[#123F3A] mb-1">عرض جزئي — تحتاج مراجعة</div>
        <div className="text-xs text-neutral-600">البنود الـ 2 غير المسعّرة قد تحتاج تواصلًا مباشرًا مع المورد أو البحث عن مورد بديل لها.</div>
      </div>

      {/* CTAs */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('comparison')}
          className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          مقارنة مع باقي العروض
        </button>
        <button
          onClick={() => navigate('offers')}
          className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
        >
          العودة لقائمة العروض
        </button>
      </div>
    </div>
  )
}
