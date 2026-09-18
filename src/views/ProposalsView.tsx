import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavProps, BOQItem, Supplier } from '../types'
import {
  getBoqItems,
  getSession,
  setParsedBoq,
  getSelections,
  resetWorkingSession,
  setSelections,
  subscribeSession,
} from '../store/session'
import { resolveBoqCardFields } from '../lib/parseBoq'
import { familyLabelAr, intentLabelAr } from '../lib/intentLabels'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { recordConstructionSupplierFeedback, type SupplierFeedbackItem } from '../api/constructionClient'
import { SearchIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from '../icons'
import { SendModal } from './SendModal'
import { useProcurement } from '../procurementContext'

type Filter = 'all' | 'ready' | 'needs'

const EVIDENCE_STYLE: Record<string, string> = {
  'دليل مباشر': 'bg-[#CFF5DC] text-[#1a7a45]',
  'نشاط متطابق': 'bg-[#e0efec] text-[#123F3A]',
  'دليل منتج': 'bg-blue-50 text-blue-700',
  'من الكتالوج': 'bg-neutral-100 text-neutral-600',
  'على مستوى النشاط': 'bg-neutral-100 text-neutral-500',
  'اختيارك': 'bg-amber-50 text-amber-700',
  'تسمية آلية': 'bg-purple-50 text-purple-700',
  'خريطة فرق': 'bg-teal-50 text-teal-700',
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
  onRejectSupplier: (supplier: Supplier) => void
  /** Removes this line from the request. The parent offers an undo. */
  onDelete: () => void
}

const SUGGESTION_TONE = {
  teal: { box: 'border-teal-100 bg-teal-50/60', title: 'text-teal-800', note: 'text-teal-700/80', row: 'border-teal-100' },
  grey: { box: 'border-neutral-200 bg-neutral-50', title: 'text-neutral-700', note: 'text-neutral-500', row: 'border-neutral-200' },
  purple: { box: 'border-purple-100 bg-purple-50/60', title: 'text-purple-800', note: 'text-purple-700/80', row: 'border-purple-100' },
} as const

/**
 * A named-but-unconfirmed material with suppliers from Farq's intent map.
 * Always a suggestion: nothing here is selected until the buyer presses «أضف».
 */
function SuggestionBox({
  tone,
  title,
  note,
  emptyText,
  suppliers,
  evidence,
  selectedIds,
  onPick,
  onReject,
}: {
  tone: keyof typeof SUGGESTION_TONE
  title: string
  note: string
  emptyText: string
  suppliers: Supplier[]
  evidence: Supplier['evidence']
  selectedIds: string[]
  /** Tick or untick. The list never collapses: the buyer picks as many as he likes. */
  onPick: (supplier: Supplier) => void
  /** «غير مناسب»: gone from this material's suggestions from now on. */
  onReject: (supplier: Supplier) => void
}) {
  const t = SUGGESTION_TONE[tone]
  const picked = suppliers.filter((s) => selectedIds.includes(s.id)).length
  return (
    <div className={`mb-3 rounded-xl border px-4 py-3 ${t.box}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`text-xs font-bold ${t.title}`}>{title}</div>
        {suppliers.length > 0 && (
          <span className="flex-shrink-0 text-[11px] font-bold text-[#123F3A]">{picked} مختار من {suppliers.length}</span>
        )}
      </div>
      <div className={`text-[11px] mt-1 ${t.note}`}>{note}</div>
      {suppliers.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {suppliers.map((s) => {
            const checked = selectedIds.includes(s.id)
            return (
              <div
                key={`${evidence}-${s.id}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-white border ${checked ? 'border-[#123F3A]/40' : t.row}`}
              >
                <label className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onPick({
                        ...s,
                        // An activity-level row keeps its own weaker grade: the box
                        // it happens to sit in must not promote it.
                        evidence: s.learned ? 'اختيارك' : s.evidence === 'على مستوى النشاط' ? s.evidence : evidence,
                      })
                    }
                    className="accent-[#123F3A] w-4 h-4 flex-shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#0D1F1D] truncate">{s.name}</span>
                    <span className="block text-xs text-neutral-400">
                      {s.city}
                      {s.learned && <span className="text-amber-700 font-semibold"> · اخترته سابقًا</span>}
                      {s.evidence === 'على مستوى النشاط' && (
                        <span className="text-neutral-500 font-semibold" title="نشاطه المسجّل أوسع من هذه المادة: يُعرض كاحتمال، لا كترشيح">
                          {' '}· مورد محتمل
                        </span>
                      )}
                    </span>
                  </span>
                </label>
                <span className="text-xs flex-shrink-0">{CHANNEL_ICON[s.channel]}</span>
                <button
                  type="button"
                  onClick={() => onReject(s)}
                  title="لا يناسب هذه المادة: لن يُقترح لها مرة أخرى"
                  className="flex-shrink-0 text-[11px] font-semibold text-neutral-400 hover:text-red-600"
                >
                  غير مناسب
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-neutral-500 mt-2">{emptyText}</div>
      )}
    </div>
  )
}

function BOQCard({
  item,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onAddSupplier,
  onRejectSupplier,
  onDelete,
}: BOQCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [hits, setHits] = useState<CatalogHit[]>([])
  const [hitTotal, setHitTotal] = useState(0)
  const [searchingCatalog, setSearchingCatalog] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const allIds = item.suppliers.map((s) => s.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))
  const { name, qty, unit, spec } = resolveBoqCardFields(item)
  const isSearching = item.status === 'searching'
  // A line with no suppliers is one of two different facts and they must not
  // read alike: either the line resolved to a material and nothing in the
  // catalogue is a confirmed supplier for it, or the line never resolved to a
  // material at all — in which case we never looked for a supplier and saying
  // «no supplier» would be a claim we did not earn. `farqSpecId` is set only
  // when the API resolved the line, so it is what separates the two.
  const unresolved = isSearching && !item.farqSpecId
  const alreadyIds = useMemo(() => new Set(item.suppliers.map((s) => s.id)), [item.suppliers])
  // Suppliers dismissed on this card. They also leave the lists for good, server side.
  const [locallyHidden, setHiddenIds] = useState<Set<string>>(new Set())
  const hiddenIds = useMemo(
    () => new Set([...locallyHidden, ...(item.rejectedSupplierIds || [])]),
    [locallyHidden, item.rejectedSupplierIds],
  )
  const boxedIds = useMemo(
    () =>
      new Set(
        [
          ...(item.learnedSuggestion?.suppliers || []),
          ...(item.mapSuggestion?.suppliers || []),
          ...(!item.mapSuggestion ? item.aiSuggestion?.suppliers || [] : []),
          ...(!item.mapSuggestion && !item.aiSuggestion ? item.familySuggestion?.suppliers || [] : []),
        ].map((x) => x.id),
      ),
    [item.learnedSuggestion, item.mapSuggestion, item.aiSuggestion, item.familySuggestion],
  )
  // Below the boxes: only suppliers that are not already listed in one.
  const listed = item.suppliers.filter((x) => !boxedIds.has(x.id) && !hiddenIds.has(x.id))
  const visible = showAll ? listed : listed.slice(0, 4)
  const pick = (supplier: Supplier) => (alreadyIds.has(supplier.id) ? onToggle(supplier.id) : onAddSupplier(supplier))
  const reject = (supplier: Supplier) => {
    setHiddenIds((prev) => new Set(prev).add(supplier.id))
    onRejectSupplier(supplier)
  }

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
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-semibold">
                {item.workOnly
                  ? 'عمل بلا توريد'
                  : unresolved
                  ? item.mapSuggestion
                    ? 'مادة معروفة — من خريطة فرق'
                    : item.aiSuggestion
                      ? 'سمّاها الذكاء الاصطناعي — للمراجعة'
                      : 'مادة غير محدّدة'
                  : 'بلا مورد مؤكد'}
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
              ? item.workOnly
                ? 'عمل موقع لا مادة تُشترى — لا يُطلب من مورد'
                : unresolved
                ? item.mapSuggestion
                  ? item.mapSuggestion.supplierCount > 0
                    ? `${item.mapSuggestion.supplierCount} موردًا في خريطة فرق — للمراجعة`
                    : 'مادة معروفة بلا مورد في خريطة فرق'
                  : item.aiSuggestion
                  ? item.aiSuggestion.supplierCount > 0
                    ? `${item.aiSuggestion.supplierCount} موردًا مقترحًا عبر التسمية الآلية`
                    : 'سُمّيت آليًا ولا مورد لها في خريطة فرق'
                  : 'لم نتعرّف على هذه المادة'
                : 'لا يوجد مورد مؤكد — 0 مورد'
              : `وجد فرق ${item.supplierCount} موردًا`}
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span
              className={`w-2 h-2 rounded-full ${isSearching ? 'bg-neutral-300' : 'bg-[#123F3A]'}`}
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

          {item.learnedSuggestion && item.learnedSuggestion.suppliers.length > 0 && (
            <SuggestionBox
              tone="teal"
              title="موردون اخترتهم لهذا البند في كراسة سابقة"
              note="تذكّرهم فرق من اختياراتك. لم يُحدَّد أحد: اختر من تريد."
              emptyText=""
              suppliers={item.learnedSuggestion.suppliers.filter((x) => !hiddenIds.has(x.id))}
              evidence="اختيارك"
              selectedIds={selectedIds}
              onPick={pick}
              onReject={reject}
            />
          )}
          {item.mapSuggestion && (
            <SuggestionBox
              tone="teal"
              title={`المادة: «${intentLabelAr(item.mapSuggestion.intent)}»`}
              note="موردون من خريطة فرق لهذه المادة. اختر أي عدد، واضغط «غير مناسب» على من لا يناسب: فرق يتعلّم من الاثنين."
              emptyText="المادة معروفة، ولا يحمل دليل فرق موردًا لها بعد."
              suppliers={item.mapSuggestion.suppliers.filter((x) => !hiddenIds.has(x.id))}
              evidence="خريطة فرق"
              selectedIds={selectedIds}
              onPick={pick}
              onReject={reject}
            />
          )}
          {!item.mapSuggestion && !item.aiSuggestion && item.familySuggestion && (
            <SuggestionBox
              tone="grey"
              title={`غير مؤكد — على مستوى النشاط: «${familyLabelAr(item.familySuggestion.family)}»`}
              note="لم نجد هذه المادة بعينها في قائمة فرق. هؤلاء موردو النشاط الأقرب لها، وقد لا يبيعونها: راجعهم قبل الاختيار، واضغط «غير مناسب» على من لا يناسب."
              emptyText="لا يحمل دليل فرق موردًا لهذا النشاط بعد."
              suppliers={item.familySuggestion.suppliers.filter((x) => !hiddenIds.has(x.id))}
              evidence="على مستوى النشاط"
              selectedIds={selectedIds}
              onPick={pick}
              onReject={reject}
            />
          )}
          {!item.mapSuggestion && item.aiSuggestion && (
            <SuggestionBox
              tone="purple"
              title={`اقتراح آلي: قد تكون المادة «${intentLabelAr(item.aiSuggestion.intent)}»`}
              note="سمّى الذكاء الاصطناعي المادة، والموردون من خريطة فرق لهذه التسمية. اختر أي عدد، واضغط «غير مناسب» على من لا يناسب."
              emptyText="لا يحمل دليل فرق موردًا لهذه التسمية بعد."
              suppliers={item.aiSuggestion.suppliers.filter((x) => !hiddenIds.has(x.id))}
              evidence="تسمية آلية"
              selectedIds={selectedIds}
              onPick={pick}
              onReject={reject}
            />
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

          {listed.length > 4 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-semibold text-[#123F3A] hover:underline"
            >
              {showAll ? 'عرض أقل' : `عرض الكل (${listed.length})`}
            </button>
          )}

          <div className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setShowSearch((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-[#123F3A]"
              >
                <PlusIcon className="w-3.5 h-3.5" /> البحث في دليل الموردين
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-red-600"
              >
                <XIcon className="w-3.5 h-3.5" /> حذف البند
              </button>
            </div>
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

          {/* Only where nothing at all was found. Under a card that lists map
              suppliers this note said «لم نبحث له عن موردين», and under a
              work-only card it told the buyer to go and find a supplier. */}
          {isSearching && !item.workOnly && !item.mapSuggestion && !item.aiSuggestion && !item.familySuggestion && !item.learnedSuggestion && (
            <div className="mt-3 text-xs text-neutral-500 bg-neutral-50 rounded-xl px-3 py-2.5">
              {unresolved
                ? 'لم نربط هذا البند بمادة معروفة، فلم نبحث له عن موردين. ابحث في دليل الموردين يدويًا أو راجع نص البند في الكراسة.'
                : 'لا يوجد مورد مؤكد لهذه المادة في الكتالوج. لا بحث جارٍ الآن — أضف موردًا من دليل الموردين إن كنت تعرف واحدًا.'}
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

  const [selected, setSelected] = useState<Record<number, string[]>>(() => ({ ...getSelections() }))

  // The buyer's ticks travel with the booklet, so a refresh restores them.
  useEffect(() => {
    setSelections(selected)
  }, [selected])

  /*
   * THE SYSTEM CHOOSES, THE BUYER CONFIRMS.
   *
   * The owner's order: «اهم شي يختارهم لي … الهدف لا يوجد بند بدون مورد». Until
   * now nothing arrived ticked, because a ranking mistake once put eight tile
   * suppliers on a squat-toilet line one click from a real email. The answer to
   * that is an ORDER of evidence, not an empty screen:
   *
   *   1. suppliers he chose for this same line in an earlier booklet
   *   2. suppliers named for the material itself
   *   3. suppliers of the catalogue item it matched
   *   4. suppliers the model named the material for
   *   5. only then suppliers of the activity, marked «مورد محتمل»
   *
   * Up to five per line, never one he rejected, and never sent without the
   * send screen listing every recipient first. An automatic pick is NOT fed to
   * learning: the system does not learn from its own guesses.
   */
  const AUTO_PICK = 5
  const autoDone = useRef<Set<number>>(new Set(Object.keys(getSelections()).map(Number)))
  const [autoSummary, setAutoSummary] = useState<{ suppliers: number; lines: number; empty: number } | null>(null)

  useEffect(() => {
    const fresh = items.filter((item) => !item.workOnly && !autoDone.current.has(item.id))
    if (!fresh.length) return
    const picks: Record<number, Supplier[]> = {}
    for (const item of fresh) {
      autoDone.current.add(item.id)
      const rejected = new Set(item.rejectedSupplierIds || [])
      const named = (item.mapSuggestion?.suppliers || []).filter((s) => s.evidence !== 'على مستوى النشاط')
      const activity = (item.mapSuggestion?.suppliers || []).filter((s) => s.evidence === 'على مستوى النشاط')
      const ordered = [
        ...(item.learnedSuggestion?.suppliers || []),
        ...named,
        ...item.suppliers,
        ...(item.aiSuggestion?.suppliers || []),
        ...activity,
        ...(item.familySuggestion?.suppliers || []),
      ]
      const chosen: Supplier[] = []
      const seen = new Set<string>()
      for (const s of ordered) {
        if (!s?.id || seen.has(s.id) || rejected.has(s.id)) continue
        seen.add(s.id)
        chosen.push(s)
        if (chosen.length >= AUTO_PICK) break
      }
      if (chosen.length) picks[item.id] = chosen
    }
    const pickedIds = Object.keys(picks).map(Number)
    if (pickedIds.length) {
      // A supplier chosen from a suggestion box joins the line's own list, the
      // same way a buyer's tick does, so the send screen can name him.
      persistItems(
        items.map((item) => {
          const add = picks[item.id]
          if (!add) return item
          const have = new Set(item.suppliers.map((s) => s.id))
          const suppliers = [...item.suppliers, ...add.filter((s) => !have.has(s.id))]
          return { ...item, suppliers, supplierCount: suppliers.length, status: 'ready' as const }
        }),
      )
      setSelected((prev) => {
        const next = { ...prev }
        for (const id of pickedIds) if (!(next[id] || []).length) next[id] = picks[id].map((s) => s.id)
        return next
      })
    }
    const all = items.filter((i) => !i.workOnly)
    const lines = pickedIds.length
    const suppliers = new Set(Object.values(picks).flat().map((s) => s.id)).size
    setAutoSummary((prev) => ({
      suppliers: (prev?.suppliers || 0) + suppliers,
      lines: (prev?.lines || 0) + lines,
      empty: all.filter((i) => !picks[i.id] && !(selected[i.id] || []).length && !i.suppliers.length).length,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Every tick, untick and «غير مناسب» is a verdict the API replays on the next
  // booklet. Sent in small batches; a failed batch is retried with the next one,
  // and the buyer is told once if learning is not being saved.
  const learnQueue = useRef<SupplierFeedbackItem[]>([])
  const learnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [learnError, setLearnError] = useState<string | null>(null)
  const [learnedCount, setLearnedCount] = useState(0)
  const flushLearning = useCallback(() => {
    learnTimer.current = null
    const batch = learnQueue.current.splice(0, 400)
    if (!batch.length) return
    recordConstructionSupplierFeedback(batch)
      .then((res) => {
        setLearnError(null)
        setLearnedCount((n) => n + (res?.recorded ?? batch.length))
      })
      .catch((err) => {
        learnQueue.current.unshift(...batch)
        setLearnError(err instanceof Error ? err.message : 'تعذّر حفظ اختياراتك للتعلّم')
      })
  }, [])
  const learn = useCallback(
    (item: BOQItem | undefined, supplierIds: string[], verdict: SupplierFeedbackItem['verdict']) => {
      if (!item || !supplierIds.length) return
      const subjects: Array<Pick<SupplierFeedbackItem, 'subject_kind' | 'subject_key'>> = []
      if (item.farqSpecId) subjects.push({ subject_kind: 'SPEC', subject_key: item.farqSpecId })
      const intent = item.mapSuggestion?.intent || item.aiSuggestion?.intent
      if (intent) subjects.push({ subject_kind: 'INTENT', subject_key: intent })
      if (item.name.trim().length >= 3) subjects.push({ subject_kind: 'LINE_TEXT', subject_key: item.name })
      for (const supplier_id of supplierIds)
        for (const subject of subjects) learnQueue.current.push({ ...subject, supplier_id, verdict, line_text: item.name.slice(0, 300) })
      if (learnTimer.current) clearTimeout(learnTimer.current)
      learnTimer.current = setTimeout(flushLearning, 900)
    },
    [flushLearning],
  )
  useEffect(() => () => {
    if (learnTimer.current) clearTimeout(learnTimer.current)
    flushLearning()
  }, [flushLearning])

  // Deleting a line is the buyer's call and must be reversible: the line goes
  // at once, and «تراجع» puts it back where it was with its ticks.
  const [deleted, setDeleted] = useState<{ item: BOQItem; index: number; picks: string[] } | null>(null)
  const deletedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deleteItem = (itemId: number) => {
    const index = items.findIndex((i) => i.id === itemId)
    if (index < 0) return
    setDeleted({ item: items[index]!, index, picks: selected[itemId] || [] })
    persistItems(items.filter((i) => i.id !== itemId))
    setSelected((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    if (deletedTimer.current) clearTimeout(deletedTimer.current)
    deletedTimer.current = setTimeout(() => setDeleted(null), 12000)
  }
  const undoDelete = () => {
    if (!deleted) return
    const next = [...items]
    next.splice(Math.min(deleted.index, next.length), 0, deleted.item)
    persistItems(next)
    setSelected((prev) => ({ ...prev, [deleted.item.id]: deleted.picks }))
    setDeleted(null)
    if (deletedTimer.current) clearTimeout(deletedTimer.current)
  }

  // «اختياراتي تسمع بالمنتجات التي تشابهها»: a verdict on one line is a verdict
  // on the material, so it is applied at once to every other line of this
  // booklet that is the SAME material — the same named intent, or the same
  // catalogue item. Never a looser likeness than that. The bar at the bottom
  // says how many lines it reached, so nothing is ticked behind his back.
  const materialKeyOf = (item: BOQItem | undefined): string | null => {
    if (!item) return null
    const intent = item.mapSuggestion?.intent || item.aiSuggestion?.intent
    if (intent) return `intent:${intent}`
    if (item.farqSpecId) return `spec:${item.farqSpecId}`
    return null
  }
  const [echo, setEcho] = useState<string | null>(null)
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const announce = (text: string) => {
    setEcho(text)
    if (echoTimer.current) clearTimeout(echoTimer.current)
    echoTimer.current = setTimeout(() => setEcho(null), 7000)
  }
  /** Ids of this line and of every other line that is the same material. */
  const sameMaterialIds = (itemId: number): number[] => {
    const key = materialKeyOf(items.find((i) => i.id === itemId))
    if (!key) return [itemId]
    return items.filter((i) => i.id === itemId || (!i.workOnly && materialKeyOf(i) === key)).map((i) => i.id)
  }

  const rejectSupplier = (itemId: number, supplier: Supplier) => {
    const item = items.find((i) => i.id === itemId)
    learn(item, [supplier.id], 'REJECTED')
    const ids = new Set(sameMaterialIds(itemId))
    persistItems(
      items.map((it) => {
        if (!ids.has(it.id)) return it
        const suppliers = it.suppliers.filter((x) => x.id !== supplier.id)
        return {
          ...it,
          suppliers,
          supplierCount: suppliers.length,
          status: suppliers.length ? it.status : ('searching' as const),
          rejectedSupplierIds: [...new Set([...(it.rejectedSupplierIds || []), supplier.id])],
        }
      }),
    )
    setSelected((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = (next[id] || []).filter((x) => x !== supplier.id)
      return next
    })
    if (ids.size > 1) announce(`أُزيل «${supplier.name.slice(0, 30)}» من ${ids.size} بنود للمادة نفسها.`)
  }

  const addSupplierToItem = (itemId: number, supplier: Supplier) => {
    const ids = new Set(sameMaterialIds(itemId))
    persistItems(
      items.map((item) => {
        if (!ids.has(item.id)) return item
        if (item.suppliers.some((s) => s.id === supplier.id)) return item
        const suppliers = [...item.suppliers, supplier]
        return {
          ...item,
          suppliers,
          supplierCount: suppliers.length,
          status: 'ready' as const,
          // The buyer naming a supplier outranks the reader's «عمل بلا توريد».
          workOnly: undefined,
        }
      }),
    )
    setSelected((prev) => {
      const next = { ...prev }
      for (const id of ids) if (!(next[id] || []).includes(supplier.id)) next[id] = [...(next[id] || []), supplier.id]
      return next
    })
    learn(items.find((i) => i.id === itemId), [supplier.id], 'CHOSEN')
    if (ids.size > 1) announce(`اخترت «${supplier.name.slice(0, 30)}» لـ ${ids.size} بنود للمادة نفسها.`)
  }

  const toggle = (itemId: number, supplierId: string) => {
    const turningOff = (selected[itemId] || []).includes(supplierId)
    learn(items.find((i) => i.id === itemId), [supplierId], turningOff ? 'CLEARED' : 'CHOSEN')
    // Only lines that already list this supplier follow; a line is never given a
    // supplier here that its own card does not show.
    const ids = sameMaterialIds(itemId).filter((id) => id === itemId || items.find((i) => i.id === id)?.suppliers.some((s) => s.id === supplierId))
    setSelected((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        const cur = next[id] || []
        next[id] = turningOff ? cur.filter((x) => x !== supplierId) : cur.includes(supplierId) ? cur : [...cur, supplierId]
      }
      return next
    })
    if (ids.length > 1) announce(turningOff ? `أُلغي الاختيار في ${ids.length} بنود للمادة نفسها.` : `طُبّق الاختيار على ${ids.length} بنود للمادة نفسها.`)
  }

  const selectAll = (itemId: number) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    learn(item, item.suppliers.map((s) => s.id), 'CHOSEN')
    const chosen = item.suppliers.map((s) => s.id)
    const ids = sameMaterialIds(itemId)
    setSelected((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        const listed = new Set((items.find((i) => i.id === id)?.suppliers || []).map((s) => s.id))
        next[id] = id === itemId ? chosen : [...new Set([...(next[id] || []), ...chosen.filter((x) => listed.has(x))])]
      }
      return next
    })
    if (ids.length > 1) announce(`طُبّق الاختيار على ${ids.length} بنود للمادة نفسها.`)
  }

  const clearAll = (itemId: number) => {
    learn(items.find((i) => i.id === itemId), selected[itemId] || [], 'CLEARED')
    const cleared = new Set(selected[itemId] || [])
    const ids = sameMaterialIds(itemId)
    setSelected((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = id === itemId ? [] : (next[id] || []).filter((x) => !cleared.has(x))
      return next
    })
    if (ids.length > 1) announce(`أُلغي الاختيار في ${ids.length} بنود للمادة نفسها.`)
  }

  const readyItems = items.filter((i) => i.status === 'ready')
  const searchingItems = items.filter((i) => i.status === 'searching')

  const filtered = items.filter((item) => {
    if (filter === 'ready' && item.status !== 'ready') return false
    if (filter === 'needs' && item.status !== 'searching') return false
    if (query && !resolveBoqCardFields(item).name.includes(query)) return false
    return true
  })

  // Two different numbers, and the owner read the first as the second: the
  // DISTINCT suppliers (one RFQ each, covering all their lines) and the
  // line-by-supplier PICKS (1,514 lines x 5 is ~7,500 picks from ~300
  // suppliers, because one supplier of a material serves every line of it).
  const totalSelected = useMemo(
    () => new Set(Object.values(selected).flat()).size,
    [selected],
  )
  const totalPicks = useMemo(
    () => Object.values(selected).reduce((sum, ids) => sum + ids.length, 0),
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
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#0D1F1D] mb-1">الموردون المقترحون</h1>
            <p className="text-neutral-500 text-sm">
              {projectName ? `${projectName} · ` : ''}
              قرأ فرق {items.length} بندًا واقترح موردين من كتالوج Farq الحي.
            </p>
          </div>
          {/*
            The only thing that throws the work away. Everything else — a
            refresh, a locked phone, a stray back gesture — brings the booklet
            back exactly as it was.
          */}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('سيُحذف ما قرأناه من الكراسة واختياراتك للموردين. هل تريد البدء من جديد؟')) return
              resetWorkingSession()
              navigate('home')
            }}
            className="flex-shrink-0 text-xs font-bold text-neutral-500 border border-neutral-200 rounded-lg px-3 py-2 hover:text-red-700 hover:border-red-200"
            title="يمسح الكراسة واختياراتك ويبدأ من الصفر"
          >
            ابدأ من جديد
          </button>
        </div>

        {/*
          The first thing the buyer reads after a booklet: how many suppliers
          were chosen for him, for how many lines, and how many lines are still
          empty — the number the owner judges the whole system by.
        */}
        {(() => {
          const lines = items.filter((i) => !i.workOnly)
          const covered = lines.filter((i) => (selected[i.id] || []).length > 0).length
          const chosen = new Set(lines.flatMap((i) => selected[i.id] || [])).size
          const picks = lines.reduce((sum, i) => sum + (selected[i.id] || []).length, 0)
          const empty = lines.length - covered
          return (
            <div
              className={`mb-6 rounded-2xl border px-5 py-4 ${empty === 0 ? 'bg-[#F3FBF6] border-[#CFF5DC]' : 'bg-amber-50 border-amber-200'}`}
              dir="rtl"
            >
              <div className="text-base font-black text-[#0D1F1D]">
                اخترنا لك {chosen} موردًا مختلفًا لـ {covered} من {lines.length} بندًا
              </div>
              <div className="text-xs text-neutral-700 mt-1">
                مجموع الاختيارات {picks.toLocaleString('en-US')}: المورد الواحد يُختار لكل بنود مادته، فيصله طلب عرض واحد يشملها كلها.
              </div>
              <div className="text-xs text-neutral-600 mt-1 leading-relaxed">
                {empty === 0
                  ? 'كل بند له موردون مختارون. راجعهم قبل الإرسال: من عليه «مورد محتمل» اختير لنشاطه لا لمادته.'
                  : `${empty} بندًا لم نجد لها موردًا في دليلنا. البقية اخترنا لكل بند حتى ${AUTO_PICK} موردين، ومن عليه «مورد محتمل» اختير لنشاطه لا لمادته.`}
                {autoSummary && autoSummary.lines > 0 ? ' الاختيار تلقائي ولا يُحسب من اختياراتك التي يتعلّم منها النظام.' : ''}
              </div>
            </div>
          )
        })()}

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
            <div className="w-2 h-2 rounded-full bg-amber-400" />
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
              onRejectSupplier={(supplier) => rejectSupplier(item.id, supplier)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      </div>

      {echo && !deleted && (
        <div className="fixed bottom-24 left-0 right-0 lg:right-64 z-30 flex justify-center px-4 pointer-events-none">
          <div className="rounded-2xl bg-[#123F3A] text-white text-sm px-4 py-3 shadow-lg max-w-full truncate">{echo}</div>
        </div>
      )}

      {deleted && (
        <div className="fixed bottom-24 left-0 right-0 lg:right-64 z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl bg-[#0D1F1D] text-white text-sm px-4 py-3 shadow-lg max-w-full">
            <span className="truncate">حُذف البند «{deleted.item.name.slice(0, 40)}»</span>
            <button type="button" onClick={undoDelete} className="flex-shrink-0 font-bold text-[#9ce8c6] hover:underline">
              تراجع
            </button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 lg:right-64 bg-white border-t border-neutral-100 px-4 py-4 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {/* «جاهزة» used to mean «has suggestions», which read as «ready to
              send» while suppliers were pre-ticked. With nothing selected by
              default the two must be told apart. */}
          <div className="text-sm text-neutral-500">
            <span className="font-bold text-[#0D1F1D]">
              {items.filter((i) => !i.workOnly && (selected[i.id] || []).length > 0).length}
            </span>{' '}
            بندًا لها موردون مختارون ·{' '}
            {totalSelected === 0 ? (
              <span className="font-bold text-[#0D1F1D]">لا مورد مختار بعد</span>
            ) : (
              <>
                <span className="font-bold text-[#0D1F1D]">{totalSelected}</span> موردًا مختلفًا ·{' '}
                <span className="font-bold text-[#0D1F1D]">{totalPicks.toLocaleString('en-US')}</span> اختيارًا
              </>
            )}
            {learnError ? (
              <div className="text-[11px] text-amber-700 mt-0.5">اختياراتك لم تُحفظ للتعلّم بعد: {learnError}</div>
            ) : learnedCount > 0 ? (
              <div className="text-[11px] text-[#1a7a45] mt-0.5">حفظ فرق اختياراتك وسيبدأ بها في الكراسة القادمة.</div>
            ) : null}
          </div>
          <button
            disabled={totalSelected === 0}
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
