import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ConstructionInboxThread } from '../../api/constructionClient'
import { ChevronDownIcon, ClockIcon, InboxIcon, PlusIcon, SearchIcon, XIcon } from '../../icons'
import {
  ACCOUNT_LABEL,
  CHANNEL_LABEL,
  DATE_LABEL,
  MEANING_LABEL,
  OWNER_LABEL,
  QUOTE_LABEL,
  STATE_LABEL,
  activeFilterCount,
  applyFilters,
  emptyFilters,
  countCriterion,
  hasCriterion,
  suggestViewName,
  toggleCriterion,
  type AccountKey,
  type ActiveChip,
  type ChannelKey,
  type FilterContext,
  type FilterCriterion,
  type InboxFilters,
  type Labels,
  type MeaningKey,
  type OwnerKey,
  type QuoteKey,
  type SavedView,
  type StateKey,
} from '../../lib/inboxFilters'
import { meaningChipClass } from './Badges'

export type RequestOption = { rfqId: string; label: string; count: number | null }
export type BookletOption = { bookletId: string; label: string; count: number }

/* ------------------------------------------------------------------ pills */

function Pill({
  label,
  count,
  selected,
  onClick,
  disabled,
  title,
}: {
  label: ReactNode
  count?: number | null
  selected: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
        selected ? 'bg-farq text-white' : 'bg-white border border-neutral-200 text-[#0D1F1D] hover:border-farq/40'
      }`}
    >
      <span dir="auto">{label}</span>
      {count != null && (
        <span className={`text-[11px] font-semibold ${selected ? 'text-mint' : 'text-neutral-400'}`}>{count}</span>
      )}
    </button>
  )
}

function Group({ title, note, children, wide }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? 'sm:col-span-2' : ''}>
      <h3 className="text-xs font-bold text-neutral-500 mb-2">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note && <p className="text-[10px] text-neutral-400 leading-relaxed mt-1.5">{note}</p>}
    </section>
  )
}

/* ------------------------------------------------------------------ panel */

export type FilterPanelProps = {
  initial: InboxFilters
  /** Loaded rows of the current tab, before any client-side filter. */
  threads: readonly ConstructionInboxThread[]
  ctx: FilterContext
  labels: Labels
  requests: RequestOption[]
  booklets: BookletOption[]
  showAccount: boolean
  unknown: { channel: number; meaning: number; attachment: number; quote: number; owner: number; total: number }
  onApply: (filters: InboxFilters) => void
  onSave: (name: string, filters: InboxFilters) => void
  onClose: () => void
}

const CHANNELS: ChannelKey[] = ['platform', 'whatsapp', 'email', 'chat']
const STATES: StateKey[] = ['needs_reply', 'waiting_supplier', 'unread', 'read']
const MEANINGS: MeaningKey[] = ['QUOTE_FILE', 'PRICE_IN_TEXT', 'QUESTION', 'CLARIFICATION_NEEDED', 'DECLINED', 'ALT_CONTACT', 'INTERESTED', 'AUTO_REPLY']
const QUOTES: QuoteKey[] = ['submitted', 'not_submitted', 'new_version']
const ACCOUNTS: AccountKey[] = ['active', 'not_opened', 'declined']
const OWNERS: OwnerKey[] = ['mine', 'unassigned', 'colleague']

export function FilterPanel({
  initial,
  threads,
  ctx,
  labels,
  requests,
  booklets,
  showAccount,
  unknown,
  onApply,
  onSave,
  onClose,
}: FilterPanelProps) {
  const [draft, setDraft] = useState<InboxFilters>(initial)
  const [naming, setNaming] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The request filter is applied by the server: the rows loaded now may
  // belong to another request, so its count here is only a preview.
  const clientDraft = useMemo(() => ({ ...draft, rfqId: draft.rfqId === initial.rfqId ? draft.rfqId : null }), [draft, initial.rfqId])
  const results = useMemo(() => applyFilters(threads, clientDraft, ctx).length, [threads, clientDraft, ctx])
  const count = (c: FilterCriterion) => countCriterion(threads, c, draft, ctx)
  const toggle = (c: FilterCriterion) => setDraft((d) => toggleCriterion(d, c))
  const on = (c: FilterCriterion) => hasCriterion(draft, c)
  const unknownNote = (n: number) =>
    n > 0 ? `${n} من ${unknown.total} لم تُفتح بعد — قيمتها غير معروفة فلا تظهر تحت هذا الفلتر.` : undefined
  const rfqChanged = draft.rfqId !== initial.rfqId

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="فلترة المحادثات"
      className="flex flex-col max-h-full bg-white rounded-2xl border border-neutral-200 shadow-[0_12px_40px_rgba(13,31,29,0.18)] outline-none"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-lg font-black text-[#0D1F1D]">فلترة المحادثات</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 hover:bg-neutral-100">
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <Group
          title="الطلب / الكراسة"
          wide
          note={
            rfqChanged
              ? 'اختيار الطلب يُطبَّق على كل الصندوق من الخادم، لا على المحمَّل فقط — العدد يظهر بعد التطبيق.'
              : undefined
          }
        >
          {requests.length === 0 && booklets.length === 0 && <span className="text-xs text-neutral-400">لا طلبات في المحادثات المحمّلة.</span>}
          {requests.map((r) => (
            <Pill
              key={r.rfqId}
              label={r.label}
              count={r.count}
              selected={draft.rfqId === r.rfqId}
              onClick={() => setDraft((d) => ({ ...d, rfqId: d.rfqId === r.rfqId ? null : r.rfqId }))}
            />
          ))}
          {booklets.map((b) => (
            <Pill
              key={b.bookletId}
              label={b.label}
              count={b.count}
              selected={on({ group: 'booklet', value: b.bookletId })}
              onClick={() => toggle({ group: 'booklet', value: b.bookletId })}
            />
          ))}
        </Group>

        <Group title="القناة" note={unknownNote(unknown.channel)}>
          {CHANNELS.map((key) => {
            const c: FilterCriterion = { group: 'channel', value: key }
            return <Pill key={key} label={CHANNEL_LABEL[key]} count={count(c)} selected={on(c)} onClick={() => toggle(c)} />
          })}
        </Group>

        <Group title="حالة المحادثة">
          {STATES.map((key) => {
            const c: FilterCriterion = { group: 'state', value: key }
            return <Pill key={key} label={STATE_LABEL[key]} count={count(c)} selected={on(c)} onClick={() => toggle(c)} />
          })}
        </Group>

        <Group title="معنى الرد" wide note={unknownNote(unknown.meaning)}>
          {MEANINGS.map((key) => {
            const c: FilterCriterion = { group: 'meaning', value: key }
            const selected = on(c)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(c)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${meaningChipClass(key)} ${
                  selected ? 'ring-2 ring-farq ring-offset-1' : 'opacity-90 hover:opacity-100'
                }`}
              >
                {MEANING_LABEL[key]}
                <span className="opacity-70 font-semibold">{count(c)}</span>
              </button>
            )
          })}
        </Group>

        <Group title="حالة العرض" note={unknownNote(unknown.quote)}>
          {QUOTES.map((key) => {
            const c: FilterCriterion = { group: 'quote', value: key }
            return <Pill key={key} label={QUOTE_LABEL[key]} count={count(c)} selected={on(c)} onClick={() => toggle(c)} />
          })}
        </Group>

        <Group title="المرفقات" note={unknownNote(unknown.attachment)}>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#0D1F1D] cursor-pointer select-none">
            <span
              role="switch"
              aria-checked={draft.hasAttachment}
              tabIndex={0}
              onClick={() => toggle({ group: 'attachment', value: 'yes' })}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault()
                  toggle({ group: 'attachment', value: 'yes' })
                }
              }}
              className={`relative inline-block w-9 h-5 rounded-full transition-colors ${draft.hasAttachment ? 'bg-farq' : 'bg-neutral-200'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${draft.hasAttachment ? 'start-[18px]' : 'start-0.5'}`}
              />
            </span>
            فيها مرفق
            <span className="text-[11px] text-neutral-400 font-semibold">{count({ group: 'attachment', value: 'yes' })}</span>
          </label>
        </Group>

        {showAccount && (
          <Group title="حساب المورد">
            {ACCOUNTS.map((key) => {
              const c: FilterCriterion = { group: 'account', value: key }
              return <Pill key={key} label={ACCOUNT_LABEL[key]} count={count(c)} selected={on(c)} onClick={() => toggle(c)} />
            })}
          </Group>
        )}

        <Group title="المسؤول" note={unknownNote(unknown.owner)}>
          {OWNERS.map((key) => {
            const c: FilterCriterion = { group: 'owner', value: key }
            return <Pill key={key} label={OWNER_LABEL[key]} count={count(c)} selected={on(c)} onClick={() => toggle(c)} />
          })}
        </Group>

        <Group title="التاريخ">
          {(['today', '7d'] as const).map((key) => {
            const c: FilterCriterion = { group: 'date', value: key }
            return <Pill key={key} label={DATE_LABEL[key]} count={count(c)} selected={draft.date.preset === key} onClick={() => toggle(c)} />
          })}
          <Pill
            label={
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="w-3.5 h-3.5" />
                {DATE_LABEL.custom}
              </span>
            }
            selected={draft.date.preset === 'custom'}
            onClick={() => toggle({ group: 'date', value: 'custom' })}
          />
          {draft.date.preset === 'custom' && (
            <div className="w-full flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              <label className="inline-flex items-center gap-1">
                من
                <input
                  type="date"
                  value={draft.date.from || ''}
                  onChange={(event) => setDraft((d) => ({ ...d, date: { ...d.date, from: event.target.value || null } }))}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                إلى
                <input
                  type="date"
                  value={draft.date.to || ''}
                  onChange={(event) => setDraft((d) => ({ ...d, date: { ...d.date, to: event.target.value || null } }))}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-xs"
                />
              </label>
            </div>
          )}
        </Group>

        <section>
          <h3 className="text-xs font-bold text-neutral-500 mb-2">البند</h3>
          <label className="relative block">
            <span className="sr-only">نص البند</span>
            <SearchIcon className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              type="search"
              value={draft.item}
              onChange={(event) => setDraft((d) => ({ ...d, item: event.target.value }))}
              placeholder="مثال: بلوك 15"
              className="w-full rounded-xl border border-neutral-200 bg-white pe-9 ps-3 py-2.5 text-[13px] focus:border-farq focus:outline-none"
            />
          </label>
          <p className="text-[10px] text-neutral-400 leading-relaxed mt-1.5">
            {draft.item.trim()
              ? `${count({ group: 'item', value: draft.item.trim() })} محادثة — البحث في أول 3 بنود من كل طلب ونص آخر رسالة.`
              : 'يبحث في أول 3 بنود من كل طلب ونص آخر رسالة.'}
          </p>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-[#FAFAF8] border-t border-neutral-100 rounded-b-2xl">
        {naming == null ? (
          <>
            <button
              type="button"
              onClick={() => onApply(draft)}
              className="rounded-xl bg-farq text-white text-sm font-bold px-4 py-2.5 hover:bg-farq-500"
            >
              {rfqChanged ? 'طبّق الفلاتر' : `اعرض ${results} محادثة`}
            </button>
            <button
              type="button"
              disabled={!activeFilterCount(draft)}
              onClick={() => setNaming(suggestViewName(draft, labels))}
              className="rounded-xl bg-white border border-neutral-200 text-farq text-sm font-bold px-4 py-2.5 disabled:opacity-40"
            >
              احفظ كعرض
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setDraft(emptyFilters())}
              className="text-sm font-bold text-farq hover:underline"
            >
              مسح الكل
            </button>
          </>
        ) : (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!naming.trim()) return
              onSave(naming, draft)
              setNaming(null)
            }}
          >
            <input
              autoFocus
              value={naming}
              maxLength={80}
              onChange={(event) => setNaming(event.target.value)}
              placeholder="اسم العرض"
              className="flex-1 min-w-40 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-farq focus:outline-none"
            />
            <button type="submit" disabled={!naming.trim()} className="rounded-xl bg-farq text-white text-sm font-bold px-4 py-2 disabled:opacity-40">
              حفظ
            </button>
            <button type="button" onClick={() => setNaming(null)} className="text-sm text-neutral-500 hover:underline">
              إلغاء
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- toolbar */

export type FilterToolbarProps = {
  activeCount: number
  panelOpen: boolean
  onTogglePanel: () => void
  chips: ActiveChip[]
  onRemoveChip: (chip: ActiveChip) => void
  onClearAll: () => void
  savedViews: SavedView[]
  /** Result count of a saved view over the loaded rows. */
  viewCount: (view: SavedView) => number
  onApplyView: (view: SavedView) => void
  onDeleteView: (view: SavedView) => void
  onSaveCurrent: (name: string) => void
  suggestedName: string
  /** «3 من 42». */
  summary: string | null
}

export function FilterToolbar({
  activeCount,
  panelOpen,
  onTogglePanel,
  chips,
  onRemoveChip,
  onClearAll,
  savedViews,
  viewCount,
  onApplyView,
  onDeleteView,
  onSaveCurrent,
  suggestedName,
  summary,
}: FilterToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        setNaming(null)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setNaming(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={panelOpen}
          onClick={onTogglePanel}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
            activeCount > 0 || panelOpen ? 'border-farq text-farq bg-white' : 'border-neutral-200 text-farq hover:border-farq/40'
          }`}
        >
          فلترة
          {activeCount > 0 && (
            <span className="min-w-5 h-5 rounded-full bg-farq text-white text-[10px] px-1.5 flex items-center justify-center">{activeCount}</span>
          )}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-bold text-[#0D1F1D] hover:border-farq/40"
          >
            محفوظاتي
            <ChevronDownIcon className="w-3.5 h-3.5 text-neutral-400" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute top-full mt-1 start-0 z-30 w-72 rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_32px_rgba(13,31,29,0.16)] py-1">
              {savedViews.length === 0 && (
                <p className="px-4 py-3 text-xs text-neutral-500 leading-relaxed">
                  لا عروض محفوظة بعد. طبّق فلاتر ثم احفظها هنا لتعود لها بضغطة. تُحفظ على هذا المتصفح فقط.
                </p>
              )}
              {savedViews.map((view) => (
                <div key={view.id} className="group flex items-center hover:bg-farq-50">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onApplyView(view)
                      setMenuOpen(false)
                    }}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2.5 text-start"
                  >
                    <span className="truncate text-[13px] font-bold text-[#0D1F1D]">{view.name}</span>
                    <span className="flex-shrink-0 text-[11px] text-neutral-400">{viewCount(view)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`حذف «${view.name}»`}
                    onClick={() => onDeleteView(view)}
                    className="flex-shrink-0 me-2 w-6 h-6 rounded-full flex items-center justify-center text-neutral-300 hover:text-red-600 hover:bg-white"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="border-t border-neutral-100 mt-1 pt-1">
                {naming == null ? (
                  <button
                    type="button"
                    disabled={activeCount === 0}
                    onClick={() => setNaming(suggestedName)}
                    className="w-full inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold text-farq disabled:opacity-40 text-start"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    احفظ الفلاتر الحالية
                  </button>
                ) : (
                  <form
                    className="flex items-center gap-2 px-3 py-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!naming.trim()) return
                      onSaveCurrent(naming)
                      setNaming(null)
                    }}
                  >
                    <input
                      autoFocus
                      value={naming}
                      maxLength={80}
                      onChange={(event) => setNaming(event.target.value)}
                      className="flex-1 min-w-0 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs focus:border-farq focus:outline-none"
                      placeholder="اسم العرض"
                    />
                    <button type="submit" disabled={!naming.trim()} className="rounded-lg bg-farq text-white text-xs font-bold px-3 py-1.5 disabled:opacity-40">
                      حفظ
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {summary && <span className="ms-auto text-[11px] text-neutral-400 flex-shrink-0">{summary}</span>}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full bg-farq-100 text-farq ps-2.5 pe-1.5 py-1">
              <bdi className="text-xs font-bold">{chip.label}</bdi>
              <span className="text-[11px] font-semibold opacity-60">{chip.count}</span>
              <button
                type="button"
                onClick={() => onRemoveChip(chip)}
                aria-label={`إزالة «${chip.label}»`}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/70"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={onClearAll} className="text-xs font-bold text-[#0D1F1D] hover:underline px-1">
            مسح الكل
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- no results */

export function NoFilterResults({
  suggestion,
  onClearAll,
  onRemove,
}: {
  suggestion: { chip: ActiveChip; results: number } | null
  onClearAll: () => void
  onRemove: (chip: ActiveChip) => void
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 mb-3" aria-hidden="true">
        <InboxIcon className="w-6 h-6" />
      </div>
      <p className="text-sm font-black text-[#0D1F1D] mb-1">ما فيه محادثات تطابق الفلاتر</p>
      {suggestion ? (
        <p className="text-xs text-neutral-600 leading-relaxed mb-3">
          جرّب تشيل «{suggestion.chip.label}» — فيه {suggestion.results} محادثة بدونه.
        </p>
      ) : (
        <p className="text-xs text-neutral-500 leading-relaxed mb-3">الفلاتر تعمل على المحادثات المحمّلة في هذا التبويب.</p>
      )}
      <div className="flex items-center gap-2">
        {suggestion && (
          <button
            type="button"
            onClick={() => onRemove(suggestion.chip)}
            className="rounded-xl bg-farq text-white text-xs font-bold px-4 py-2"
          >
            شيل «{suggestion.chip.label}»
          </button>
        )}
        <button type="button" onClick={onClearAll} className="rounded-xl bg-white border border-neutral-200 text-farq text-xs font-bold px-4 py-2">
          مسح الكل
        </button>
      </div>
    </div>
  )
}
