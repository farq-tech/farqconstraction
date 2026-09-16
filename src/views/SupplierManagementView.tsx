import { useEffect, useState, useCallback } from 'react'
import type { NavProps, SupplierEntry } from '../types'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import {
  listSupplierImportBatches,
  revertSupplierImportBatch,
  type SupplierImportBatch,
} from '../api/constructionClient'
import SupplierImportModal from '../components/SupplierImportModal'
import { SearchIcon, PlusIcon, UploadIcon, XIcon } from '../icons'

const PAGE_SIZE = 200

function batchTitle(batch: SupplierImportBatch): string {
  return batch.label || batch.filename || `دفعة ${batch.id.slice(0, 8)}`
}

function batchDate(batch: SupplierImportBatch): string {
  if (!batch.created_at) return ''
  const ts = Date.parse(batch.created_at)
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function SupplierManagementView({ navigate, setSelectedSupplierId }: NavProps) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', city: '', phone: '', email: '', category: '', notes: '' })
  const [suppliers, setSuppliers] = useState<SupplierEntry[]>([])
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 280)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setOffset(0)
    setSuppliers([])
  }, [debounced])

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const result = await listConstructionSuppliers({
          query: debounced || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        })
        setTotal(result.total)
        setSource(result.source)
        setSuppliers((prev) => (append ? [...prev, ...result.suppliers] : result.suppliers))
        setOffset(nextOffset)
      } catch (err) {
        if (!append) {
          setSuppliers([])
          setTotal(0)
        }
        setError(err instanceof Error ? err.message : 'تعذر تحميل الموردين')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debounced],
  )

  useEffect(() => {
    void loadPage(0, false)
  }, [loadPage])

  const handleAdd = () => {
    if (!form.name.trim()) return
    setShowModal(false)
    setForm({ name: '', city: '', phone: '', email: '', category: '', notes: '' })
    setToast('إضافة مورد حقيقي غير مفعّلة في وضع بدون تسجيل دخول (يتطلب واجهة كتابة على Railway لاحقاً).')
    setTimeout(() => setToast(null), 4500)
  }

  const openSupplier = (id: string) => {
    setSelectedSupplierId?.(id)
    navigate('supplier-detail')
  }

  const hasMore = suppliers.length < total

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الموردون</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {loading
              ? 'جاري التحميل من Farq API…'
              : `${total.toLocaleString('ar-SA')} مورد في كتالوج فرق`}
          </p>
          {source && !loading && !error && (
            <p className="text-[11px] text-neutral-400 mt-1">
              المصدر: Farq API · /api/construction/catalog · معروض {suppliers.length.toLocaleString('ar-SA')}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          إضافة مورد
        </button>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الفئة أو المدينة…"
          className="w-full border border-neutral-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
        />
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
          <div className="font-bold mb-1">تعذر الاتصال ببيانات الموردين الحقيقية</div>
          <div className="text-red-700/90">{error}</div>
          <div className="text-xs mt-2 text-red-600/80">
            شغّل Farq API محلياً (أو عيّن VITE_API_PROXY_TARGET)، ضع CONSTRUCTION_DB_URL في api/.env، وللوضع بدون تسجيل دخول أضف CONSTRUCTION_DEMO_MODE=1 ثم أعد تشغيل الـ API — ليس Vite.
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <button
              key={s.id}
              onClick={() => openSupplier(s.id)}
              className="w-full bg-white border border-neutral-100 rounded-2xl px-5 py-4 hover:border-[#123F3A]/30 hover:shadow-sm transition-all text-right"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#123F3A] font-black text-base">{s.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-black text-[#0D1F1D] text-sm">{s.name}</span>
                    {s.qualificationStatus === 'VERIFIED_DIRECTORY' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-bold">
                        موثّق
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400 truncate">
                    {s.city} · {s.category}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold text-[#0D1F1D]">
                    {s.hasEmail ? 'بريد' : '—'}
                    {s.hasWhatsapp ? ' · واتساب' : ''}
                  </div>
                  <div className="text-[10px] text-neutral-400">{s.lastSeen}</div>
                </div>
              </div>
            </button>
          ))}

          {suppliers.length === 0 && (
            <div className="text-center py-16">
              <div className="text-neutral-500 font-semibold text-sm">لا يوجد موردون مطابقون</div>
            </div>
          )}

          {hasMore && (
            <button
              disabled={loadingMore}
              onClick={() => void loadPage(offset + PAGE_SIZE, true)}
              className="w-full py-3.5 border border-neutral-200 text-[#123F3A] font-bold rounded-xl hover:bg-[#f0faf7] transition-colors text-sm disabled:opacity-50"
            >
              {loadingMore
                ? 'جاري التحميل…'
                : `تحميل المزيد (${suppliers.length.toLocaleString('ar-SA')} من ${total.toLocaleString('ar-SA')})`}
            </button>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-black text-[#0D1F1D]">إضافة مورد جديد</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
                <XIcon className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-neutral-500 leading-relaxed">
                الحفظ المباشر في الإنتاج يتم عبر Railway API{' '}
                <span dir="ltr">POST /api/construction/suppliers/import</span> بعد مصادقة المشتري.
              </p>
              {(
                [
                  ['name', 'اسم الشركة *', 'text', 'rtl'],
                  ['city', 'المدينة', 'text', 'rtl'],
                  ['phone', 'رقم الجوال', 'tel', 'ltr'],
                  ['email', 'البريد الإلكتروني', 'email', 'ltr'],
                  ['category', 'الفئة / التخصص', 'text', 'rtl'],
                ] as [keyof typeof form, string, string, string][]
              ).map(([key, label, type, dir]) => (
                <div key={key}>
                  <label className="text-xs font-bold text-neutral-600 mb-1.5 block">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    dir={dir}
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1.5 block">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleAdd}
                disabled={!form.name.trim()}
                className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                متابعة لاحقًا
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#123F3A] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg animate-fade-up z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
