import { useEffect, useState, useCallback } from 'react'
import type { NavProps, SupplierEntry } from '../types'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { apiUnreachableAdvice, isProductionBuild } from '../api/apiBase'
import {
  commitSupplierImport,
  constructionRateLimitSec,
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
  return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function SupplierManagementView({ navigate, setSelectedSupplierId }: NavProps) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [batches, setBatches] = useState<SupplierImportBatch[]>([])
  const [activeBatch, setActiveBatch] = useState<string | null>(null)
  const [reverting, setReverting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', city: '', phone: '', email: '', category: '', notes: '' })
  const [suppliers, setSuppliers] = useState<SupplierEntry[]>([])
  const [total, setTotal] = useState(0)
  /**
   * Whether `total` came from the API rather than being the initial 0.
   *
   * Without this the header asserts «٠ مورد في كتالوج فرق» on every failure,
   * which reads as "your catalogue is empty" when the truth is "we could not
   * read it". A directory of 11,727 suppliers reporting zero has already sent
   * the owner hunting for a configuration problem that did not exist.
   */
  const [totalKnown, setTotalKnown] = useState(false)
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Seconds the API is still refusing us, or null when the failure is real. */
  const [rateLimitSec, setRateLimitSec] = useState<number | null>(null)
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
      setRateLimitSec(null)
      try {
        const result = await listConstructionSuppliers({
          query: debounced || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
          importBatchId: activeBatch,
        })
        setTotal(result.total)
        setTotalKnown(true)
        setSource(result.source)
        setSuppliers((prev) => (append ? [...prev, ...result.suppliers] : result.suppliers))
        setOffset(nextOffset)
      } catch (err) {
        const wait = constructionRateLimitSec(err)
        setRateLimitSec(wait)
        // A rate limit is a speed cap on the next request; it says nothing
        // about the directory. Blanking the list here is what turns sixty
        // seconds of waiting into «٠ مورد» and a hunt for a broken database.
        if (!append && wait == null) {
          setSuppliers([])
          setTotal(0)
          setTotalKnown(false)
        }
        setError(err instanceof Error ? err.message : 'تعذر تحميل الموردين')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [debounced, activeBatch],
  )

  useEffect(() => {
    void loadPage(0, false)
  }, [loadPage])

  const loadBatches = useCallback(async () => {
    try {
      const { batches: found } = await listSupplierImportBatches()
      setBatches(found)
    } catch {
      // The upload history is an aid, not the directory. A buyer who cannot
      // read it should still see their suppliers — and should keep the chips
      // he already has, since dropping them on a rate limit makes the filter
      // disappear with no explanation for it.
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const revertBatch = useCallback(
    async (batch: SupplierImportBatch) => {
      const live = batch.live_supplier_count ?? batch.inserted_count ?? 0
      if (
        !window.confirm(
          `سيتم إلغاء تفعيل ${live} موردًا أضافتهم دفعة «${batchTitle(batch)}». الموردون الذين طوبقوا مع سجلات قائمة لن يتأثروا، وسجل الطلبات السابق يبقى كما هو. متابعة؟`,
        )
      ) {
        return
      }
      setReverting(true)
      try {
        const { deactivated_count } = await revertSupplierImportBatch(batch.id)
        setToast(`تم التراجع عن «${batchTitle(batch)}» — أُلغي تفعيل ${deactivated_count} موردًا.`)
        setActiveBatch(null)
        await loadBatches()
        await loadPage(0, false)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'تعذّر التراجع عن الدفعة.')
      } finally {
        setReverting(false)
        setTimeout(() => setToast(null), 6000)
      }
    },
    [loadBatches, loadPage],
  )

  /**
   * Saves one supplier through the same endpoint «رفع قائمة» uses, as a list of
   * one. The form used to collect six fields, save nothing, and blame «وضع بدون
   * تسجيل دخول» even for a signed-in buyer.
   */
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const handleAdd = async () => {
    const name = form.name.trim()
    if (!name || adding) return
    if (!form.email.trim() && !form.phone.trim()) {
      setAddError('أدخل بريدًا أو رقم واتساب: مورد بلا وسيلة تواصل لا يمكن مراسلته.')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const result = await commitSupplierImport(
        [{
          row_number: 1,
          name_ar: name,
          city: form.city.trim() || undefined,
          email: form.email.trim() || undefined,
          whatsapp: form.phone.trim() || undefined,
          supplied_items: [form.category.trim(), form.notes.trim()].filter(Boolean).join(' — ') || undefined,
        }],
        { label: `إضافة يدوية: ${name}` },
      )
      const row = result.rows?.[0]
      if (row?.outcome === 'REJECT') {
        setAddError(row.reasons?.map((r) => r.message_ar).join(' ') || 'رفض الخادم هذا المورد.')
        return
      }
      setShowModal(false)
      setForm({ name: '', city: '', phone: '', email: '', category: '', notes: '' })
      setToast(
        row?.outcome === 'MATCH'
          ? `هذا المورد موجود في الدليل باسم «${row.matched_supplier_name || name}» ولم يُكرَّر.`
          : `أُضيف «${name}» إلى دليل الموردين.`,
      )
      setTimeout(() => setToast(null), 4500)
      await loadPage(0, false)
      void loadBatches()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'تعذّرت إضافة المورد.')
    } finally {
      setAdding(false)
    }
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
          {/* Never state a count we did not read. «٠ مورد» is a claim about the
              catalogue; "we could not read it" is a claim about the request. */}
          <p className="text-neutral-500 text-sm mt-1">
            {loading
              ? 'جارٍ تحميل دليل الموردين…'
              : !totalKnown
                ? 'تعذّرت قراءة عدد الموردين'
                : `${total.toLocaleString('en-US')} مورد في كتالوج فرق${
                    error ? ' · آخر قراءة ناجحة' : ''
                  }`}
          </p>
          {source && !loading && !error && (
            <p className="text-[11px] text-neutral-400 mt-1">
              دليل موردي فرق · معروض {suppliers.length.toLocaleString('en-US')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-[#123F3A]/25 text-[#123F3A] font-bold rounded-xl hover:bg-[#f0faf7] transition-colors text-sm"
          >
            <UploadIcon className="w-4 h-4" />
            رفع قائمة
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            <PlusIcon className="w-4 h-4" />
            إضافة مورد
          </button>
        </div>
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

      {batches.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-neutral-500">القوائم المرفوعة:</span>
            <button
              onClick={() => setActiveBatch(null)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-bold transition-colors ${
                activeBatch === null
                  ? 'bg-[#123F3A] text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              الكل
            </button>
            {batches
              .filter((batch) => batch.status !== 'REVERTED')
              .map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => setActiveBatch(activeBatch === batch.id ? null : batch.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-bold transition-colors ${
                    activeBatch === batch.id
                      ? 'bg-[#123F3A] text-white'
                      : 'bg-[#f0faf7] text-[#123F3A] hover:bg-[#CFF5DC]'
                  }`}
                >
                  {batchTitle(batch)} · {(batch.live_supplier_count ?? 0).toLocaleString('en-US')}
                </button>
              ))}
          </div>

          {/* The three facts that make an upload reversible: which file, when, by whom. */}
          {activeBatch &&
            batches
              .filter((batch) => batch.id === activeBatch)
              .map((batch) => (
                <div
                  key={batch.id}
                  className="mt-3 rounded-2xl border border-[#CFF5DC] bg-[#f0faf7] px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="text-[11px] text-neutral-600 leading-relaxed">
                    <span className="font-black text-[#0D1F1D]">{batchTitle(batch)}</span>
                    {batch.filename ? ` · ${batch.filename}` : ''}
                    {batchDate(batch) ? ` · ${batchDate(batch)}` : ''}
                    {batch.created_by_label ? ` · بواسطة ${batch.created_by_label}` : ''}
                    <div className="mt-0.5">
                      أُضيف {(batch.inserted_count ?? 0).toLocaleString('en-US')} · طوبق{' '}
                      {(batch.matched_count ?? 0).toLocaleString('en-US')} · رُفض{' '}
                      {(batch.rejected_count ?? 0).toLocaleString('en-US')}
                    </div>
                  </div>
                  <button
                    onClick={() => void revertBatch(batch)}
                    disabled={reverting}
                    className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {reverting ? 'جارٍ التراجع…' : 'تراجع عن الدفعة'}
                  </button>
                </div>
              ))}
        </div>
      )}

      {error && (
        <div
          className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${
            rateLimitSec != null
              ? 'border-amber-100 bg-amber-50 text-amber-900'
              : 'border-red-100 bg-red-50 text-red-800'
          }`}
        >
          <div className="font-bold mb-1">
            {rateLimitSec != null ? 'تجاوزنا حد المحاولات' : 'تعذر الاتصال ببيانات الموردين الحقيقية'}
          </div>
          <div className={rateLimitSec != null ? 'text-amber-800/90' : 'text-red-700/90'}>{error}</div>
          {rateLimitSec != null ? (
            <div className="text-xs mt-2 text-amber-700/90 leading-relaxed">
              حدّ سرعة مؤقّت على كل مسارات /api/construction، وليس انقطاعًا في قاعدة البيانات ولا نقصًا في
              الإعدادات.{' '}
              {/* Only claim a fallback list when one is actually on screen —
                  otherwise this sentence is its own small untruth. */}
              {suppliers.length > 0
                ? 'القائمة المعروضة أعلاه هي آخر قراءة ناجحة.'
                : 'لم نقرأ الكتالوج بعد، فلا يوجد ما نعرضه — وهذا لا يعني أنه فارغ.'}
            </div>
          ) : (
            /* The flag checklist is a real diagnosis for a real outage. Printing
               it for a rate limit is what sends him chasing correct settings. */
            <div className="text-xs mt-2 text-red-600/80">
              {isProductionBuild()
                ? apiUnreachableAdvice()
                : 'تعذّر تحميل دليل الموردين الآن. أعد تحميل الصفحة بعد قليل، وإن استمر الأمر تواصل مع فرق.'}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Rows survive a failure that left us holding them. Hiding the directory
          behind the banner is the other half of «٠ مورد»: the count says empty
          and the empty screen agrees with it. */}
      {!loading && (!error || suppliers.length > 0) && (
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
                    {/* Names the upload, not just the fact of one — «مرفوع» alone
                        would not tell a bad list from a good one. */}
                    {s.importBatchId && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#EAF2FF] text-[#1d4ed8] font-bold"
                        title={`من قائمة مرفوعة: ${
                          batches.find((batch) => batch.id === s.importBatchId)
                            ? batchTitle(batches.find((batch) => batch.id === s.importBatchId)!)
                            : s.importBatchId
                        }`}
                      >
                        مرفوع
                        {batches.find((batch) => batch.id === s.importBatchId)
                          ? ` · ${batchTitle(batches.find((batch) => batch.id === s.importBatchId)!)}`
                          : ''}
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
                : `تحميل المزيد (${suppliers.length.toLocaleString('en-US')} من ${total.toLocaleString('en-US')})`}
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
                يُحفظ المورد في دليل الموردين مباشرة. إن كان موجودًا بالبريد أو الرقم نفسه فلن يُكرَّر.
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
            {addError && (
              <div className="mx-6 mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{addError}</div>
            )}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => void handleAdd()}
                disabled={!form.name.trim() || adding}
                className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adding ? 'جارٍ الحفظ…' : 'حفظ المورد'}
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

      {showImport && (
        <SupplierImportModal
          onClose={() => setShowImport(false)}
          onImported={(batch) => {
            void loadBatches()
            setActiveBatch(batch?.id || null)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#123F3A] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg animate-fade-up z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
