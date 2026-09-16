import { useEffect, useMemo, useState } from 'react'
import type { NavProps, BOQItem, Supplier } from '../types'
import {
  getBoqItems,
  getSession,
  setParsedBoq,
  subscribeSession,
} from '../store/session'
import { resolveBoqCardFields } from '../lib/parseBoq'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { SearchIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from '../icons'
import { SendModal } from './SendModal'
import { useProcurement } from '../procurementContext'

type Filter = 'all' | 'ready' | 'needs'

const EVIDENCE_STYLE: Record<string, string> = {
  'دليل مباشر': 'bg-[#CFF5DC] text-[#1a7a45]',
  'نشاط متطابق': 'bg-[#e0efec] text-[#123F3A]',
  'دليل منتج': 'bg-blue-50 text-blue-700',
  'اختيارك': 'bg-amber-50 text-amber-700',
}

const CHANNEL_ICON: Record<string, string> = {
  'بريد': '✉',
  'واتساب': '🟢',
  'حراج': '🏷',
}

interface CatalogHit {
  id: string
  name: string
  city: string
  hasEmail: boolean
  hasWhatsapp: boolean
  hasHaraj?: boolean
}

interface BOQCardProps {
  item: BOQItem
  selectedIds: string[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  onAddSupplier: (supplier: Supplier) => void
}

function BOQCard({
  item,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onAddSupplier,
}: BOQCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [hits, setHits] = useState<CatalogHit[]>([])
  const [hitTotal, setHitTotal] = useState(0)
  const [searchingCatalog, setSearchingCatalog] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const visible = showAll ? item.suppliers : item.suppliers.slice(0, 4)
  const allIds = item.suppliers.map((s) => s.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))
  const { name, qty, unit, spec } = resolveBoqCardFields(item)
  const isSearching = item.status === 'searching'
  const alreadyIds = useMemo(() => new Set(item.suppliers.map((s) => s.id)), [item.suppliers])

  useEffect(() => {
    if (!showSearch) return
    const q = search.trim()
    if (q.length < 2) {
      setHits([])
      setHitTotal(0)
      setSearchError(null)
      setSearchingCatalog(false)
      return
    }
    let cancelled = false
    setSearchingCatalog(true)
    setSearchError(null)
    const timer = window.setTimeout(() => {
      void listConstructionSuppliers({
        query: q,
        limit: 40,
        offset: 0,
        contactableOnly: true,
      })
        .then((result) => {
          if (cancelled) return
          setHits(
            result.suppliers
              .map((s) => ({
                id: s.id,
                name: s.name,
                city: s.city,
                hasEmail: Boolean(s.hasEmail),
                hasWhatsapp: Boolean(s.hasWhatsapp),
                hasHaraj: Boolean(s.hasHaraj),
              })),
          )
          setHitTotal(result.total)
          setSearchingCatalog(false)
        })
        .catch((err) => {
          if (cancelled) return
          setHits([])
          setHitTotal(0)
          setSearchError(err instanceof Error ? err.message : 'تعذر البحث في الدليل')
          setSearchingCatalog(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [search, showSearch])

  const addFromCatalog = (hit: CatalogHit) => {
    if (alreadyIds.has(hit.id)) {
      onToggle(hit.id)
      return
    }
    onAddSupplier({
      id: hit.id,
      name: hit.name,
      city: hit.city,
      evidence: 'اختيارك',
      channel: hit.hasEmail ? 'بريد' : hit.hasHaraj ? 'حراج' : 'واتساب',
    })
    setSearch('')
    setHits([])
    setHitTotal(0)
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
      <button
        className="w-full flex items-start gap-4 px-5 pt-5 pb-4 text-right"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-neutral-400">{item.id}</span>
            {isSearching && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                فرق يبحث عنها
              </span>
            )}
          </div>
          <div className="text-lg font-black text-[#0D1F1D]">{name}</div>
          <div className="text-sm text-neutral-500 mt-0.5">
            <span className="font-bold text-[#0D1F1D]">{qty}</span> {unit}
            {spec && <span className="text-neutral-400"> · {spec}</span>}
          </div>
        </div>
        <div className="text-left flex-shrink-0">
          <div className="text-xs text-neutral-500 mb-1">
            {isSearching
              ? `وجدنا موردًا واحدًا حتى الآن`
              : `وجد فرق ${item.supplierCount} موردًا`}
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span
              className={`w-2 h-2 rounded-full ${isSearching ? 'bg-amber-400 animate-pulse-dot' : 'bg-[#123F3A]'}`}
            />
            {expanded ? (
              <ChevronUpIcon className="w-4 h-4 text-neutral-400" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-neutral-400" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-neutral-50 pt-4">
          {!isSearching && (
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => (allSelected ? onClearAll() : onSelectAll())}
                className="text-xs font-semibold text-[#123F3A] hover:underline"
              >
                {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
              <span className="text-xs text-neutral-400">
                {selectedIds.filter((id) => allIds.includes(id)).length} من{' '}
                {item.suppliers.length} محدد
              </span>
            </div>
          )}

          <div className="space-y-2">
            {visible.map((s) => {
              const checked = selectedIds.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    checked
                      ? 'border-[#123F3A]/30 bg-[#f0faf7]'
                      : 'border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(s.id)}
                    className="accent-[#123F3A]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0D1F1D] truncate">
                      {s.name}
                    </div>
                    <div className="text-xs text-neutral-400">{s.city}</div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${EVIDENCE_STYLE[s.evidence]}`}
                  >
                    {s.evidence}
                  </span>
                  <span className="text-xs">{CHANNEL_ICON[s.channel]}</span>
                </label>
              )
            })}
          </div>

          {item.suppliers.length > 4 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-semibold text-[#123F3A] hover:underline"
            >
              {showAll ? 'عرض أقل' : `عرض الكل (${item.suppliers.length})`}
            </button>
          )}

          <div className="mt-3">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-[#123F3A]"
            >
              <PlusIcon className="w-3.5 h-3.5" /> البحث في دليل الموردين
            </button>
            {showSearch && (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث بالاسم في كل الدليل…"
                    className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#123F3A]"
                    autoFocus
                  />
                  {search && (
                    <button
                      onClick={() => {
                        setSearch('')
                        setHits([])
                        setHitTotal(0)
                      }}
                      className="px-3 py-2 text-neutral-400 hover:text-neutral-600"
                      aria-label="مسح"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-neutral-100 divide-y divide-neutral-50">
                  {searchingCatalog && (
                    <div className="px-3 py-2 text-xs text-neutral-400">جارٍ البحث…</div>
                  )}
                  {searchError && (
                    <div className="px-3 py-2 text-xs text-red-600">{searchError}</div>
                  )}
                  {!searchingCatalog &&
                    !searchError &&
                    search.trim().length >= 2 &&
                    hits.length === 0 && (
                      <div className="px-3 py-2 text-xs text-neutral-400">
                        لا نتائج لـ «{search.trim()}» في الدليل القابل للتواصل.
                      </div>
                    )}
                  {hits.map((hit) => {
                    const already = alreadyIds.has(hit.id)
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => addFromCatalog(hit)}
                        className="w-full text-right px-3 py-2.5 hover:bg-[#f0faf7] transition-colors"
                      >
                        <div className="text-sm font-semibold text-[#0D1F1D] truncate">
                          {hit.name}
                        </div>
                        <div className="text-xs text-neutral-400 flex items-center gap-2">
                          <span>{hit.city}</span>
                          {already && (
                            <span className="text-[#123F3A] font-semibold">مضاف</span>
                          )}
                          {!already && (
                            <span className="text-[#123F3A]">إضافة للبند</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {hitTotal > hits.length && (
                  <div className="mt-1 text-[11px] text-neutral-400">
                    يُعرض {hits.length} من أصل {hitTotal} مطابقة — ضيّق البحث إن لزم.
                  </div>
                )}
              </div>
            )}
          </div>

          {isSearching && (
            <div className="mt-3 text-xs text-neutral-400 bg-neutral-50 rounded-xl px-3 py-2.5">
              فرق يواصل البحث عن موردين لهذا البند عبر الكتالوج الحي.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProposalsView({ navigate }: NavProps) {
  const { openRfq } = useProcurement()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [items, setItems] = useState<BOQItem[]>(() => getBoqItems())
  const [projectName, setProjectName] = useState(() => getSession().projectName)

  useEffect(
    () =>
      subscribeSession(() => {
        setItems(getBoqItems())
        setProjectName(getSession().projectName)
      }),
    [],
  )

  const [selected, setSelected] = useState<Record<number, string[]>>({})

  useEffect(() => {
    setSelected((prev) => {
      const next: Record<number, string[]> = { ...prev }
      for (const item of items) {
        if (!next[item.id]) next[item.id] = item.suppliers.map((s) => s.id)
      }
      return next
    })
  }, [items])

  const persistItems = (nextItems: BOQItem[]) => {
    setItems(nextItems)
    const session = getSession()
    if (!session.documentId) return
    setParsedBoq({
      fileName: session.fileName || 'كراسة',
      projectName: session.projectName || projectName,
      items: nextItems,
      documentId: session.documentId,
    })
  }

  const addSupplierToItem = (itemId: number, supplier: Supplier) => {
    persistItems(
      items.map((item) => {
        if (item.id !== itemId) return item
        if (item.suppliers.some((s) => s.id === supplier.id)) return item
        const suppliers = [...item.suppliers, supplier]
        return {
          ...item,
          suppliers,
          supplierCount: suppliers.length,
          status: 'ready' as const,
        }
      }),
    )
    setSelected((prev) => {
      const cur = prev[itemId] || []
      if (cur.includes(supplier.id)) return prev
      return { ...prev, [itemId]: [...cur, supplier.id] }
    })
  }

  const toggle = (itemId: number, supplierId: string) => {
    setSelected((prev) => {
      const cur = prev[itemId] || []
      return {
        ...prev,
        [itemId]: cur.includes(supplierId)
          ? cur.filter((id) => id !== supplierId)
          : [...cur, supplierId],
      }
    })
  }

  const selectAll = (itemId: number) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    setSelected((prev) => ({ ...prev, [itemId]: item.suppliers.map((s) => s.id) }))
  }

  const clearAll = (itemId: number) => {
    setSelected((prev) => ({ ...prev, [itemId]: [] }))
  }

  const readyItems = items.filter((i) => i.status === 'ready')
  const searchingItems = items.filter((i) => i.status === 'searching')

  const filtered = items.filter((item) => {
    if (filter === 'ready' && item.status !== 'ready') return false
    if (filter === 'needs' && item.status !== 'searching') return false
    if (query && !resolveBoqCardFields(item).name.includes(query)) return false
    return true
  })

  const totalSelected = useMemo(
    () => new Set(Object.values(selected).flat()).size,
    [selected],
  )

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-16 text-center">
        <div className="text-neutral-600 font-semibold mb-2">لا بنود بعد</div>
        <p className="text-sm text-neutral-400 mb-6">
          ارفع كراسة أولًا ليقرأها فرق ويقترح موردين من الكتالوج الحي.
        </p>
        <button
          onClick={() => navigate('create-upload')}
          className="px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
        >
          رفع كراسة
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 pb-36">
        <div className="mb-6">
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">الموردون المقترحون</h1>
          <p className="text-neutral-500 text-sm">
            {projectName ? `${projectName} · ` : ''}
            قرأ فرق {items.length} بندًا واقترح موردين من كتالوج Farq الحي.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white border border-neutral-100 rounded-xl px-4 py-2.5">
            <span className="text-lg font-black text-[#0D1F1D]">{items.length}</span>
            <span className="text-sm text-neutral-500">بندًا</span>
          </div>
          <div className="flex items-center gap-2 bg-[#CFF5DC] rounded-xl px-4 py-2.5">
            <span className="text-lg font-black text-[#123F3A]">{readyItems.length}</span>
            <span className="text-sm text-[#123F3A]">جاهزة للإرسال</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-dot" />
            <span className="text-lg font-black text-amber-700">{searchingItems.length}</span>
            <span className="text-sm text-amber-700">يحتاج موردين</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex rounded-xl border border-neutral-200 overflow-hidden bg-white">
            {(
              [
                ['all', 'الكل'],
                ['ready', 'جاهز'],
                ['needs', 'يحتاج موردين'],
              ] as [Filter, string][]
            ).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  filter === val
                    ? 'bg-[#123F3A] text-white'
                    : 'text-neutral-500 hover:text-[#123F3A]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex-1 flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-4">
            <SearchIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في البنود…"
              className="flex-1 py-2.5 text-sm outline-none bg-transparent"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filtered.map((item) => (
            <BOQCard
              key={item.id}
              item={item}
              selectedIds={selected[item.id] || []}
              onToggle={(id) => toggle(item.id, id)}
              onSelectAll={() => selectAll(item.id)}
              onClearAll={() => clearAll(item.id)}
              onAddSupplier={(supplier) => addSupplierToItem(item.id, supplier)}
            />
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 lg:right-64 bg-white border-t border-neutral-100 px-4 py-4 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            <span className="font-bold text-[#0D1F1D]">{readyItems.length}</span> بندًا جاهزة ·{' '}
            <span className="font-bold text-[#0D1F1D]">{totalSelected}</span> موردًا محددًا
          </div>
          <button
            disabled={readyItems.length === 0}
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40"
          >
            إرسال طلب التسعير
          </button>
        </div>
      </div>

      {showModal && (
        <SendModal
          items={items}
          selectedByItem={selected}
          projectName={projectName}
          searchingItems={searchingItems.length}
          onClose={() => setShowModal(false)}
          onSent={(rfqId) => {
            setShowModal(false)
            openRfq(rfqId, 'offers')
          }}
          onFailed={() => setShowModal(false)}
        />
      )}
    </>
  )
}
