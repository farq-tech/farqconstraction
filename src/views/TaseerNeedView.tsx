import { useEffect, useState } from 'react'
import { fetchTaseerNeed } from '../api/taseerClient'
import { useProcurement } from '../procurementContext'
import { formatSar } from '../lib/taseerCompare'

export function TaseerNeedView() {
  const { taseerNeed, openTaseerCompare, openTaseerChat, navigate } = useProcurement()
  const need = taseerNeed || 'سباك'
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTaseerNeed>> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTaseerNeed(need)
      .then((row) => {
        if (!cancelled) setData(row)
      })
      .catch(() => {
        if (!cancelled) setData({ need, conversations: [], offerCount: 0, conversationCount: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [need])

  const conversations = data?.conversations || []
  const offerCount = data?.offerCount ?? 0
  const compareLabel = `مقارنة ${offerCount} عروض`

  return (
    <div className="px-4 py-6 pb-28" dir="rtl">
      <button type="button" onClick={() => navigate('rfq-list')} className="text-xs font-bold text-[#123F3A] mb-3">
        ← الطلبات
      </button>
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">{need}</h1>
      <p className="text-sm text-neutral-500 mb-4">
        {conversations.length} محادثة · {offerCount} عرض وصل
      </p>

      <button
        type="button"
        onClick={() => openTaseerCompare(need)}
        className="sticky top-0 z-20 w-full mb-5 py-3.5 rounded-2xl bg-[#123F3A] text-white text-base font-black shadow-md"
      >
        {compareLabel}
      </button>

      <div className="space-y-3">
        {conversations.length === 0 ? (
          <div className="text-sm text-neutral-500">ما فيه محادثات لهذا الاحتياج بعد.</div>
        ) : (
          conversations.map((row) => (
            <button
              key={row.token}
              type="button"
              onClick={() => openTaseerChat(row.token, need)}
              className="w-full text-right rounded-2xl bg-white border border-neutral-100 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-[#0D1F1D]">{row.name}</div>
                <span className={`text-[11px] font-bold ${row.replied ? 'text-[#123F3A]' : 'text-neutral-400'}`}>
                  {row.replied ? 'من رد' : 'لم يرد'}
                </span>
              </div>
              {row.listingTitle && (
                <div className="text-xs text-neutral-500 mt-1 line-clamp-1">{row.listingTitle}</div>
              )}
              <div className="text-xs text-neutral-400 mt-1">
                {formatSar(row.price)} · {row.statusLabel}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
