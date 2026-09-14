import { useState, useRef } from 'react'
import type { NavProps } from '../types'
import { UploadIcon, CheckIcon, XIcon } from '../icons'

const SUPPLIER_ITEMS = [
  { id: 1, name: 'بورسلان أرضيات', qty: '5,600', unit: 'م²', spec: '60×60 سم' },
  { id: 2, name: 'سيراميك حوائط', qty: '976', unit: 'م²', spec: '30×60 سم' },
  { id: 3, name: 'مغسلة أرضيات خزفية', qty: '120', unit: 'عدد', spec: 'معيار سعودي' },
]

interface LineEntry {
  unitPrice: string
  tax: string
  delivery: string
  available: 'yes' | 'order'
  notes: string
}

type PortalPhase = 'entry' | 'manual' | 'upload-zone' | 'uploading' | 'submitted' | 'edit' | 'readonly' | 'closed'

function ReadonlyRow({ item, entry }: { item: typeof SUPPLIER_ITEMS[0]; entry: LineEntry }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-50 flex items-center justify-between">
        <div>
          <div className="text-sm font-black text-[#0D1F1D]">{item.name}</div>
          <div className="text-xs text-neutral-500">{item.qty} {item.unit}{item.spec ? ` · ${item.spec}` : ''}</div>
        </div>
        {entry.unitPrice ? (
          <div className="text-sm font-black text-[#123F3A]">{entry.unitPrice} ر.س</div>
        ) : (
          <span className="text-xs text-neutral-400">لم يُسعَّر</span>
        )}
      </div>
      {entry.unitPrice && (
        <div className="px-5 py-3 flex gap-4 text-xs text-neutral-500">
          <span>التسليم: <span className="font-semibold text-[#0D1F1D]">{entry.delivery || '—'}</span></span>
          <span>الضريبة: <span className="font-semibold text-[#0D1F1D]">{entry.tax || '15'}%</span></span>
          <span>التوافر: <span className="font-semibold text-[#0D1F1D]">{entry.available === 'yes' ? 'متوفر' : 'حسب الطلب'}</span></span>
        </div>
      )}
    </div>
  )
}

function LineCard({ item, entry, onChange }: {
  item: typeof SUPPLIER_ITEMS[0]
  entry: LineEntry
  onChange: (field: keyof LineEntry, value: string) => void
}) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-50">
        <div className="text-sm font-black text-[#0D1F1D]">{item.name}</div>
        <div className="text-sm text-neutral-500 mt-0.5">
          <span className="font-bold text-[#0D1F1D]">{item.qty}</span> {item.unit}
          {item.spec && <span className="text-neutral-400"> · {item.spec}</span>}
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-neutral-500 mb-1 block">سعر الوحدة (ر.س)</label>
            <input
              type="number"
              value={entry.unitPrice}
              onChange={e => onChange('unitPrice', e.target.value)}
              placeholder="0.00"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A] font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-500 mb-1 block">الضريبة %</label>
            <input
              type="number"
              value={entry.tax}
              onChange={e => onChange('tax', e.target.value)}
              placeholder="15"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-500 mb-1 block">مدة التوريد</label>
          <input
            type="text"
            value={entry.delivery}
            onChange={e => onChange('delivery', e.target.value)}
            placeholder="مثال: 14 يوم"
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-500 mb-1 block">التوافر</label>
          <div className="flex gap-2">
            {(['yes', 'order'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => onChange('available', opt)}
                className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  entry.available === opt
                    ? 'border-[#123F3A] bg-[#f0faf7] text-[#123F3A]'
                    : 'border-neutral-200 text-neutral-500'
                }`}
              >
                {opt === 'yes' ? 'متوفر' : 'حسب الطلب'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-500 mb-1 block">ملاحظات</label>
          <input
            type="text"
            value={entry.notes}
            onChange={e => onChange('notes', e.target.value)}
            placeholder="أي ملاحظات على هذا البند…"
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
          />
        </div>
      </div>
    </div>
  )
}

const defaultEntries = () => {
  const init: Record<number, LineEntry> = {}
  SUPPLIER_ITEMS.forEach(i => {
    init[i.id] = { unitPrice: '', tax: '15', delivery: '', available: 'yes', notes: '' }
  })
  return init
}

export function SupplierPortalView({ navigate }: NavProps) {
  const [phase, setPhase] = useState<PortalPhase>('entry')
  const [entries, setEntries] = useState<Record<number, LineEntry>>(defaultEntries)
  const [shipping, setShipping] = useState('')
  const [validity, setValidity] = useState('30 يوم')
  const [payment, setPayment] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const updateEntry = (itemId: number, field: keyof LineEntry, value: string) => {
    setEntries(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))
  }

  const startUpload = (name: string) => {
    setUploadFileName(name)
    setPhase('uploading')
    setUploadProgress(0)
    const iv = setInterval(() => {
      setUploadProgress(p => {
        if (p >= 100) { clearInterval(iv); return 100 }
        return p + Math.floor(Math.random() * 8) + 4
      })
    }, 150)
    setTimeout(() => {
      clearInterval(iv)
      setUploadProgress(100)
      setTimeout(() => setPhase('submitted'), 600)
    }, 3200)
  }

  const Header = () => (
    <header className="bg-[#123F3A] px-4 lg:px-8 py-4 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#CFF5DC] flex items-center justify-center">
            <span className="text-[#123F3A] font-black text-sm">ف</span>
          </div>
          <span className="text-white font-bold">فرق للبناء</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs">بوابة الموردين</span>
          <button
            onClick={() => navigate('login')}
            className="text-white/40 text-xs hover:text-white/70 transition-colors"
          >
            دخول الشركة ←
          </button>
        </div>
      </div>
    </header>
  )

  const RFQBanner = ({ closed = false }: { closed?: boolean }) => (
    <div className={`border rounded-2xl p-5 mb-6 ${closed ? 'bg-neutral-50 border-neutral-200' : 'bg-white border-neutral-100'}`}>
      {closed && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600 font-bold">مغلق</span>
        </div>
      )}
      <div className="text-xs font-bold text-[#123F3A] uppercase mb-1">طلب تسعير</div>
      <div className="text-xl font-black text-[#0D1F1D] mb-3">مشروع تجديد مبنى إداري — الرياض</div>
      <div className="flex items-center gap-4 text-sm text-neutral-500 flex-wrap">
        <span>الموعد النهائي: <span className={`font-bold ${closed ? 'text-neutral-500 line-through' : 'text-[#0D1F1D]'}`}>16 سبتمبر 2026</span></span>
        <span>{SUPPLIER_ITEMS.length} بنود مخصصة لك</span>
      </div>
    </div>
  )

  /* ── Entry: choose mode ── */
  if (phase === 'entry') {
    return (
      <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
        <Header />
        <div className="max-w-lg mx-auto px-4 lg:px-8 py-12">
          <RFQBanner />
          <h2 className="text-xl font-black text-[#0D1F1D] mb-2">كيف تريد تقديم عرضك؟</h2>
          <p className="text-neutral-500 text-sm mb-6">اختر الطريقة الأنسب لك</p>
          <div className="space-y-3">
            <button
              onClick={() => setPhase('manual')}
              className="w-full bg-white border-2 border-neutral-100 hover:border-[#123F3A] rounded-2xl px-5 py-5 text-right transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </div>
                <div>
                  <div className="font-black text-[#0D1F1D] text-sm mb-0.5">إدخال يدوي</div>
                  <div className="text-xs text-neutral-500">أدخل أسعارك بنداً بنداً مباشرة في النموذج</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setPhase('upload-zone')}
              className="w-full bg-white border-2 border-neutral-100 hover:border-[#123F3A] rounded-2xl px-5 py-5 text-right transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
                  <UploadIcon className="w-5 h-5 text-[#123F3A]" />
                </div>
                <div>
                  <div className="font-black text-[#0D1F1D] text-sm mb-0.5">رفع ملف العرض</div>
                  <div className="text-xs text-neutral-500">ارفع PDF أو Excel بعرض الأسعار الخاص بك</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Upload zone ── */
  if (phase === 'upload-zone') {
    return (
      <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
        <Header />
        <div className="max-w-lg mx-auto px-4 lg:px-8 py-8">
          <button onClick={() => setPhase('entry')} className="text-xs text-neutral-400 hover:text-neutral-600 mb-5 flex items-center gap-1 transition-colors">
            ← رجوع
          </button>
          <RFQBanner />
          <h2 className="text-xl font-black text-[#0D1F1D] mb-5">ارفع ملف العرض</h2>
          <div
            className="border-2 border-dashed border-neutral-200 rounded-2xl bg-white hover:border-[#123F3A]/40 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) startUpload(f.name) }}
            />
            <div className="flex flex-col items-center py-16 px-6">
              <div className="w-14 h-14 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-4">
                <UploadIcon className="w-7 h-7 text-[#123F3A]" />
              </div>
              <div className="text-base font-bold text-[#0D1F1D] mb-1">اسحب أو اضغط لاختيار الملف</div>
              <p className="text-neutral-400 text-xs mb-4 text-center">ملفات PDF أو Excel مقبولة · حجم أقصى 20 MB</p>
              <div className="flex gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">PDF</span>
                <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">Excel</span>
              </div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <button onClick={() => startUpload('عرض_الخزف_السعودي_2026.pdf')} className="text-xs text-[#123F3A] font-semibold hover:underline">
              جرب رفع تجريبي
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Uploading ── */
  if (phase === 'uploading') {
    return (
      <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
        <Header />
        <div className="max-w-lg mx-auto px-4 lg:px-8 py-12 flex flex-col items-center text-center">
          <div className="bg-white border border-neutral-100 rounded-2xl p-8 w-full">
            <div className="text-sm font-semibold text-[#0D1F1D] mb-4 truncate">{uploadFileName}</div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-[#123F3A] rounded-full transition-all duration-200"
                style={{ width: `${Math.min(uploadProgress, 100)}%` }}
              />
            </div>
            <div className="text-xs text-neutral-400">{uploadProgress < 100 ? `جاري الرفع… ${uploadProgress}%` : 'تمت المعالجة ✓'}</div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Submitted ── */
  if (phase === 'submitted') {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col" dir="rtl">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#CFF5DC] flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[#123F3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">تم استلام عرضك</h1>
            <p className="text-neutral-500 text-sm mb-6">شكرًا. سيتم مراجعة العرض من قِبل فريق المشتريات.</p>
            <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-4 mb-3 text-right">
              <div className="text-xs text-neutral-400 mb-0.5">رقم المرجع</div>
              <div className="font-black text-[#0D1F1D]">FARQ-SUP-2024-0449</div>
            </div>
            <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-4 mb-6 text-right">
              <div className="text-xs text-neutral-400 mb-0.5">آخر موعد للتعديل</div>
              <div className="font-bold text-[#0D1F1D]">16 سبتمبر 2026 · 11:59 مساءً</div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setPhase('edit')}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
              >
                تعديل العرض
              </button>
              <button
                onClick={() => setPhase('readonly')}
                className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                عرض العرض المُرسَل
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Closed (deadline passed) ── */
  if (phase === 'closed') {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col" dir="rtl">
        <Header />
        <div className="max-w-lg mx-auto px-4 lg:px-8 py-8">
          <RFQBanner closed />
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-5 mb-6 text-center">
            <div className="text-sm font-bold text-neutral-600 mb-1">انتهى موعد تقديم العروض</div>
            <div className="text-xs text-neutral-500">لم يعد بإمكانك تعديل أو إرسال العروض لهذا الطلب.</div>
          </div>
          <div className="space-y-4">
            {SUPPLIER_ITEMS.map(item => (
              <ReadonlyRow key={item.id} item={item} entry={entries[item.id]} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Read-only view ── */
  if (phase === 'readonly') {
    return (
      <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
        <Header />
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 pb-28">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setPhase('submitted')} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">← رجوع</button>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-bold">تم الإرسال</span>
          </div>
          <RFQBanner />
          <h2 className="text-lg font-black text-[#0D1F1D] mb-4">عرضك المُرسَل</h2>
          <div className="space-y-3 mb-6">
            {SUPPLIER_ITEMS.map(item => (
              <ReadonlyRow key={item.id} item={item} entry={entries[item.id]} />
            ))}
          </div>
          <div className="bg-white border border-neutral-100 rounded-2xl p-5">
            <div className="text-sm font-bold text-[#0D1F1D] mb-3">معلومات إضافية</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">تكلفة التوصيل</span><span className="font-semibold">{shipping || '—'}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">صلاحية العرض</span><span className="font-semibold">{validity}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">شروط الدفع</span><span className="font-semibold">{payment || '—'}</span></div>
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 right-0 left-0 bg-white border-t border-neutral-100 px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setPhase('edit')}
              className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
            >
              تعديل العرض
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Manual entry / Edit ── */
  return (
    <div className="min-h-screen bg-[#FAFAF8]" dir="rtl">
      <Header />
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 pb-32">
        {phase === 'edit' && (
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setPhase('submitted')} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">← رجوع</button>
            <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">وضع التعديل</span>
          </div>
        )}

        <RFQBanner />

        <div className="space-y-4 mb-6">
          {SUPPLIER_ITEMS.map(item => (
            <LineCard
              key={item.id}
              item={item}
              entry={entries[item.id]}
              onChange={(field, value) => updateEntry(item.id, field, value)}
            />
          ))}
        </div>

        <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-6">
          <div className="text-sm font-bold text-[#0D1F1D] mb-4">معلومات إضافية</div>
          <div className="space-y-3">
            {([
              ['تكلفة التوصيل (ر.س)', shipping, setShipping, '0 إذا مشمول'],
              ['مدة صلاحية العرض', validity, setValidity, '30 يوم'],
              ['شروط الدفع', payment, setPayment, '30 يوم من الاستلام'],
            ] as [string, string, React.Dispatch<React.SetStateAction<string>>, string][]).map(([label, val, setter, ph]) => (
              <div key={label}>
                <label className="text-xs font-semibold text-neutral-500 mb-1 block">{label}</label>
                <input
                  type="text"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  placeholder={ph}
                  className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setPhase('closed')}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            معاينة حالة الطلب المغلق
          </button>
        </div>
      </div>

      <div className="fixed bottom-0 right-0 left-0 bg-white border-t border-neutral-100 px-4 lg:px-8 py-4 z-40">
        <div className="max-w-2xl mx-auto flex gap-3">
          {phase === 'edit' && (
            <button
              onClick={() => setPhase('submitted')}
              className="px-5 py-3.5 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
            >
              إلغاء
            </button>
          )}
          <button
            onClick={() => setPhase('submitted')}
            className="flex-1 py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            {phase === 'edit' ? 'حفظ التعديلات' : 'إرسال العرض'}
          </button>
        </div>
      </div>
    </div>
  )
}
