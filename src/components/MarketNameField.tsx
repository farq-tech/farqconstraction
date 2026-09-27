import { useEffect, useId, useState } from 'react'
import { searchNameSynonyms, type NameSynonymSuggestion } from '../api/constructionClient'

/** Market names from earlier requests whose name or wording contains the text typed. */
type Suggest = (q: string, options: { signal?: AbortSignal }) => Promise<NameSynonymSuggestion[]>

const SUGGEST_DELAY_MS = 300

/**
 * «الاسم الدارج بالسوق (اقتراح)» on a booklet line before sending: the reader's
 * suggestion, which the buyer may edit or clear. It is sent BESIDE the booklet
 * text and never replaces it. The change is kept when the field loses focus
 * (or on Enter), so typing never rewrites a long booklet on every key.
 *
 * `fromMemory`: the name was remembered from an earlier request for the same
 * booklet wording, not proposed by the reader now — «محفوظ من طلب سابق». While
 * typing, names remembered for other lines are offered (memory only).
 */
export default function MarketNameField({
  value,
  bookletText,
  onCommit,
  fromMemory = false,
  suggest = searchNameSynonyms,
}: {
  value: string
  bookletText: string
  onCommit: (next: string) => void
  fromMemory?: boolean
  suggest?: Suggest
}) {
  const [draft, setDraft] = useState(value)
  const [typing, setTyping] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const listId = useId()
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    const q = draft.replace(/\s+/g, ' ').trim()
    if (!typing || q.length < 2) {
      setOptions([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggest(q, { signal: controller.signal })
        .then((rows) => {
          if (controller.signal.aborted) return
          const names = [...new Set(rows.map((row) => row.market_name_ar).filter((name) => name && name !== q))]
          setOptions(names.slice(0, 8))
        })
        .catch(() => {
          if (!controller.signal.aborted) setOptions([])
        })
    }, SUGGEST_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [draft, typing, suggest])

  const commit = (next: string) => {
    const clean = next.replace(/\s+/g, ' ').trim()
    if (clean !== value) onCommit(clean)
    setDraft(clean)
    setTyping(false)
  }
  const remembered = fromMemory && Boolean(value) && draft === value
  return (
    <div className="px-5 pb-4 -mt-1" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <label className="block text-[11px] font-bold text-[#123F3A]">الاسم الدارج بالسوق (اقتراح)</label>
        {remembered && (
          <span
            className="text-[10px] font-semibold text-[#123F3A] bg-[#e8f1ef] rounded-full px-2 py-0.5"
            title="استُخدم هذا الاسم لنفس نص الكراسة في طلب سابق"
          >
            محفوظ من طلب سابق
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          dir="rtl"
          value={draft}
          maxLength={240}
          list={options.length ? listId : undefined}
          placeholder="اتركه فارغًا ليُرسل نص الكراسة وحده"
          aria-label="الاسم الدارج بالسوق (اقتراح)"
          onChange={(e) => {
            setTyping(true)
            setDraft(e.target.value)
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="flex-1 min-w-0 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-[#0D1F1D] outline-none focus:border-[#123F3A] bg-[#f7faf9]"
        />
        {options.length > 0 && (
          <datalist id={listId} data-testid="market-name-suggestions">
            {options.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
        {draft && (
          <button
            type="button"
            onClick={() => commit('')}
            className="flex-shrink-0 text-xs font-semibold text-neutral-500 hover:text-red-600 px-2 py-2"
          >
            مسح
          </button>
        )}
      </div>
      <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
        يظهر للمورد بخط أكبر، وتحته «كما في الكراسة: {bookletText}» دون تغيير. امسحه إن لم يكن دقيقًا.
      </p>
    </div>
  )
}
