import { useEffect, useState } from 'react'

/**
 * «الاسم الدارج بالسوق (اقتراح)» on a booklet line before sending: the reader's
 * suggestion, which the buyer may edit or clear. It is sent BESIDE the booklet
 * text and never replaces it. The change is kept when the field loses focus
 * (or on Enter), so typing never rewrites a long booklet on every key.
 */
export default function MarketNameField({
  value,
  bookletText,
  onCommit,
}: {
  value: string
  bookletText: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (next: string) => {
    const clean = next.replace(/\s+/g, ' ').trim()
    if (clean !== value) onCommit(clean)
    setDraft(clean)
  }
  return (
    <div className="px-5 pb-4 -mt-1" dir="rtl">
      <label className="block text-[11px] font-bold text-[#123F3A] mb-1">الاسم الدارج بالسوق (اقتراح)</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          dir="rtl"
          value={draft}
          maxLength={240}
          placeholder="اتركه فارغًا ليُرسل نص الكراسة وحده"
          aria-label="الاسم الدارج بالسوق (اقتراح)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="flex-1 min-w-0 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-[#0D1F1D] outline-none focus:border-[#123F3A] bg-[#f7faf9]"
        />
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
