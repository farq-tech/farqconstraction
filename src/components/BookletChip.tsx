import { useEffect, useState } from 'react'
import { getConstructionRfqBooklet, type ConstructionRfqBookletLink } from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { bookletChipText } from '../lib/booklet'

/**
 * «يتبع الكراسة PR-H288 — دفعة 3 من 5» on a request that is one wave of a
 * booklet. Renders nothing while loading, when the request belongs to no
 * booklet (404), or when the lookup fails: the request screen stays as it was.
 */
export function BookletChip({ rfqId }: { rfqId: string | null | undefined }) {
  const { openBooklet } = useProcurement()
  const [link, setLink] = useState<ConstructionRfqBookletLink | null>(null)

  useEffect(() => {
    setLink(null)
    // Drafts made by an upload («RFQ-…») live in this browser only.
    if (!rfqId || rfqId.startsWith('RFQ-')) return
    let cancelled = false
    getConstructionRfqBooklet(rfqId)
      .then((result) => {
        if (!cancelled) setLink(result)
      })
      .catch(() => {
        if (!cancelled) setLink(null)
      })
    return () => {
      cancelled = true
    }
  }, [rfqId])

  const text = bookletChipText(link)
  if (!link || !text) return null
  return (
    <button
      onClick={() => openBooklet(link.booklet_id)}
      className="px-2 py-0.5 rounded-full font-semibold bg-[#f0faf7] text-[#123F3A] border border-[#1a7a45]/20 hover:bg-[#CFF5DC] transition-colors"
      title="افتح الكراسة: مقارنة واحدة لكل الدفعات"
    >
      {text}
    </button>
  )
}

export default BookletChip
