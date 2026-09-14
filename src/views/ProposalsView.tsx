import { useState } from 'react'
import type { NavProps, BOQItem } from '../types'
import { BOQ_ITEMS } from '../data'
import { SearchIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon, CheckIcon } from '../icons'
import { SendModal } from './SendModal'

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
}

interface BOQCardProps {
  item: BOQItem
  selectedIds: number[]
  onToggle: (id: number) => void
  onSelectAll: () => void
  onClearAll: () => void
}

function BOQCard({ item, selectedIds, onToggle, onSelectAll, onClearAll }: BOQCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [manualSuppliers, setManualSuppliers] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

  const visible = showAll ? item.suppliers : item.suppliers.slice(0, 4)
  const allIds = item.suppliers.map(s => s.id)
  const allSelected = allIds.every(id => selectedIds.includes(id))

  const handleAddManual = () => {
    if (search.trim()) {
      setManualSuppliers(prev => [...prev, search.trim()])
      setSearch('')
    }
  }

  const isSearching = item.status === 'searching'

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-start gap-4 px-5 pt-5 pb-4 text-right"
        onClick={() => setExpanded(e => !e)}
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
          <div className="text-lg font-black text-[#0D1F1D]">{item.name}</div>
          <div className="text-sm text-neutral-500 mt-0.5">
            <span className="font-bold text-[#0D1F1D]">{item.qty}</span> {item.unit}
            {item.spec && <span className="text-neutral-400"> · {item.spec}</span>}
          </div>
        </div>
        <div className="text-left flex-shrink-0">
          <div className="text-xs text-neutral-500 mb-1">
            {isSearching
              ? `وجدنا موردًا واحدًا حتى الآن`
              : `وجد فرق ${item.supplierCount} موردًا`
            }
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span className={`w-2 h-2 rounded-full ${isSearching ? 'bg-amber-400 animate-pulse-dot' : 'bg-[#123F3A]'}`} />
            {expanded ? <ChevronUpIcon className="w-4 h-4 text-neutral-400" /> : <ChevronDownIcon className="w-4 h-4 text-neutral-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-neutral-50 pt-4">
          {/* Controls */}
          {!isSearching && (
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => allSelected ? onClearAll() : onSelectAll()}
                className="text-xs font-semibold text-[#123F3A] hover:underline"
              >
                {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
              <span className="text-xs text-neutral-400">
                {selectedIds.filter(id => allIds.includes(id)).length} من {item.suppliers.length} محدد
              </span>
            </div>
          )}

          {/* Suppliers */}
          <div className="space-y-2 mb-3">
            {visible.map(supplier => {
              const sel = selectedIds.includes(supplier.id)
              return (
                <button
                  key={supplier.id}
                  onClick={() => onToggle(supplier.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-right ${
                    sel
                      ? 'border-[#123F3A]/30 bg-[#f0faf7]'
                      : 'border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                    sel ? 'bg-[#123F3A]' : 'border-2 border-neutral-200'
                  }`}>
                    {sel && <CheckIcon className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0D1F1D]">{supplier.name}</div>
                    <div className="text-xs text-neutral-400">{supplier.city}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVIDENCE_STYLE[supplier.evidence]}`}>
                      {supplier.evidence}
                    </span>
                    <span className="text-sm">{CHANNEL_ICON[supplier.channel]}</span>
                  </div>
                </button>
              )
            })}

            {/* Manual suppliers */}
            {manualSuppliers.map((name, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-amber-100 bg-amber-50 text-right">
                <div className="w-5 h-5 rounded bg-[#123F3A] flex items-center justify-center flex-shrink-0">
                  <CheckIcon className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#0D1F1D]">{name}</div>
                  <div className="text-xs text-neutral-400">أضفته أنت</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">اختيارك</span>
              </div>
            ))}
          </div>

          {/* Show more */}
          {item.suppliers.length > 4 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-[#123F3A] font-semibold hover:underline mb-3"
            >
              عرض جميع الموردين ({item.supplierCount})
            </button>
          )}

          {/* Supplier search */}
          {!showSearch ? (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-[#123F3A] transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              إضافة مورد لهذا البند
            </button>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden mt-2">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <SearchIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                  placeholder="ابحث عن مورد لهذا البند…"
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-neutral-400"
                  autoFocus
                />
                <button onClick={() => setShowSearch(false)}>
                  <XIcon className="w-4 h-4 text-neutral-400" />
                </button>
              </div>
              {search.trim() && (
                <div className="border-t border-neutral-100 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#0D1F1D]">{search}</div>
                    <div className="text-xs text-neutral-400">سيُضاف بعلامة "اختيارك"</div>
                  </div>
                  <button
                    onClick={handleAddManual}
                    className="text-xs px-3 py-1.5 bg-[#123F3A] text-white rounded-lg font-semibold"
                  >
                    + أضفه لهذا البند
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Searching state */}
          {isSearching && (
            <div className="mt-3 text-xs text-neutral-400 bg-neutral-50 rounded-xl px-3 py-2.5">
              فرق يواصل البحث عن موردين لهذا البند. يمكنك إضافة مورد يدويًا أو ترك الأمر لفرق.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProposalsView({ navigate }: NavProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(false)

  const [selected, setSelected] = useState<Record<number, number[]>>(() => {
    const init: Record<number, number[]> = {}
    BOQ_ITEMS.forEach(item => {
      init[item.id] = item.suppliers.map(s => s.id)
    })
    return init
  })

  const toggle = (itemId: number, supplierId: number) => {
    setSelected(prev => {
      const cur = prev[itemId] || []
      return {
        ...prev,
        [itemId]: cur.includes(supplierId)
          ? cur.filter(id => id !== supplierId)
          : [...cur, supplierId],
      }
    })
  }

  const selectAll = (itemId: number) => {
    const item = BOQ_ITEMS.find(i => i.id === itemId)
    if (!item) return
    setSelected(prev => ({ ...prev, [itemId]: item.suppliers.map(s => s.id) }))
  }

  const clearAll = (itemId: number) => {
    setSelected(prev => ({ ...prev, [itemId]: [] }))
  }

  const readyItems = BOQ_ITEMS.filter(i => i.status === 'ready')
  const searchingItems = BOQ_ITEMS.filter(i => i.status === 'searching')

  const filtered = BOQ_ITEMS.filter(item => {
    if (filter === 'ready' && item.status !== 'ready') return false
    if (filter === 'needs' && item.status !== 'searching') return false
    if (query && !item.name.includes(query)) return false
    return true
  })

  const totalSelected = Object.values(selected).flat().length

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 pb-36">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">الموردون المقترحون</h1>
          <p className="text-neutral-500 text-sm">
            قرأ فرق 65 بندًا واقترح الموردين المناسبين لكل بند.
          </p>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white border border-neutral-100 rounded-xl px-4 py-2.5">
            <span className="text-lg font-black text-[#0D1F1D]">65</span>
            <span className="text-sm text-neutral-500">بندًا</span>
          </div>
          <div className="flex items-center gap-2 bg-[#CFF5DC] rounded-xl px-4 py-2.5">
            <span className="text-lg font-black text-[#123F3A]">{readyItems.length}</span>
            <span className="text-sm text-[#123F3A]">جاهزة للإرسال</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-dot" />
            <span className="text-lg font-black text-amber-700">{searchingItems.length}</span>
            <span className="text-sm text-amber-700">يبحث فرق عنها</span>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex rounded-xl border border-neutral-200 overflow-hidden bg-white">
            {([['all', 'الكل'], ['ready', 'جاهز'], ['needs', 'يحتاج موردين']] as [Filter, string][]).map(([val, lbl]) => (
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
              onChange={e => setQuery(e.target.value)}
              placeholder="ابحث في البنود…"
              className="flex-1 py-2.5 text-sm bg-transparent outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>

        {/* BOQ cards */}
        <div className="space-y-4">
          {filtered.map(item => (
            <BOQCard
              key={item.id}
              item={item}
              selectedIds={selected[item.id] || []}
              onToggle={id => toggle(item.id, id)}
              onSelectAll={() => selectAll(item.id)}
              onClearAll={() => clearAll(item.id)}
            />
          ))}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 right-0 left-0 lg:right-60 bg-white border-t border-neutral-100 px-4 lg:px-8 py-4 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            <span className="font-bold text-[#0D1F1D]">{readyItems.length} بندًا</span> جاهزة
            <span className="mx-2">·</span>
            <span className="font-bold text-[#0D1F1D]">{totalSelected} موردًا</span> محددًا
            {searchingItems.length > 0 && (
              <div className="text-xs text-neutral-400 mt-0.5">
                {searchingItems.length} بنود سيواصل فرق البحث عنها ولن تُرسل الآن.
              </div>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm whitespace-nowrap flex-shrink-0"
          >
            إرسال طلب التسعير
          </button>
        </div>
      </div>

      {showModal && (
        <SendModal
          readyItems={readyItems.length}
          totalSuppliers={totalSelected}
          searchingItems={searchingItems.length}
          onSend={() => { setShowModal(false); navigate('sent') }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
