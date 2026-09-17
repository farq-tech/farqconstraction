import { useEffect, useState } from 'react'
import type { NavProps, SupplierEntry } from '../types'
import { getConstructionSupplier } from '../api/constructionSuppliers'

export function SupplierDetailView({ navigate, selectedSupplierId }: NavProps) {
  const [supplier, setSupplier] = useState<SupplierEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedSupplierId) {
      setLoading(false)
      setError('لم يتم اختيار مورد')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getConstructionSupplier(selectedSupplierId)
      .then((row) => {
        if (!cancelled) setSupplier(row)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setSupplier(null)
          setError(err.message || 'تعذر تحميل المورد')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSupplierId])

  const categories = String(supplier?.activity || supplier?.category || '')
    .split(/[,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8)

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-5 text-xs">
        <button onClick={() => navigate('supplier-management')} className="text-neutral-400 hover:text-neutral-600 transition-colors">
          الموردون
        </button>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-600 font-semibold truncate">
          {supplier?.name || (loading ? '…' : 'تفاصيل المورد')}
        </span>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="h-16 rounded-2xl bg-neutral-100 animate-pulse" />
          <div className="h-40 rounded-2xl bg-neutral-100 animate-pulse" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
          <div className="font-bold mb-1">تعذر عرض المورد</div>
          <div>{error}</div>
          <button
            onClick={() => navigate('supplier-management')}
            className="mt-3 text-[#123F3A] font-bold"
          >
            العودة للقائمة
          </button>
        </div>
      )}

      {!loading && !error && supplier && (
        <>
          <div className="flex items-start gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
              <span className="text-[#123F3A] font-black text-2xl">{supplier.name[0]}</span>
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">{supplier.name}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
                <span>{supplier.city}</span>
                <span>·</span>
                <span>{supplier.category}</span>
                {supplier.qualificationStatus && (
                  <>
                    <span>·</span>
                    <span>{supplier.qualificationStatus === 'VERIFIED_DIRECTORY' ? 'موثّق' : supplier.qualificationStatus}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-bold text-[#0D1F1D] mb-4">معلومات التواصل</h2>
            <div className="space-y-3">
              {[
                { label: 'الجوال / واتساب', value: supplier.phone || 'غير متوفر', dir: 'ltr' },
                { label: 'البريد الإلكتروني', value: supplier.email || 'غير متوفر', dir: 'ltr' },
                {
                  label: 'القنوات',
                  value: [
                    supplier.hasEmail ? 'بريد إلكتروني' : null,
                    supplier.hasWhatsapp ? 'واتساب' : null,
                  ].filter(Boolean).join(' · ') || 'غير محددة',
                },
              ].map(c => (
                <div key={c.label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-neutral-500 font-semibold">{c.label}</span>
                  <span className="text-sm font-semibold text-[#0D1F1D] text-left" dir={c.dir || 'rtl'}>{c.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-neutral-100 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-bold text-[#0D1F1D] mb-3">الفئات والتخصصات</h2>
            <div className="flex flex-wrap gap-2">
              {(categories.length ? categories : [supplier.category]).map(c => (
                <span key={c} className="px-3 py-1.5 bg-[#f0faf7] text-[#123F3A] text-xs font-semibold rounded-full">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              onClick={() => navigate('create-upload')}
              className="py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
            >
              رفع كراسة جديدة
            </button>
            <button
              onClick={() => navigate('supplier-management')}
              className="py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
            >
              العودة للقائمة
            </button>
          </div>
        </>
      )}
    </div>
  )
}
