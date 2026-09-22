import { useEffect, useState } from 'react'
import { awardTaseerOffer, fetchTaseerChat, sendTaseerChat } from '../api/taseerClient'
import { formatSar, parseMoney } from '../lib/taseerCompare'
import { useProcurement } from '../procurementContext'

export function TaseerChatView() {
  const { taseerToken, taseerNeed, openTaseerCompare, openTaseerNeed } = useProcurement()
  const token = taseerToken || ''
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTaseerChat>> | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => {
    if (!token) return
    fetchTaseerChat(token).then(setData).catch(() => setData(null))
  }

  useEffect(() => {
    reload()
  }, [token])

  const send = async () => {
    if (!token || !text.trim() || busy) return
    setBusy(true)
    try {
      await sendTaseerChat(token, text)
      setText('')
      reload()
    } finally {
      setBusy(false)
    }
  }

  const award = async () => {
    if (!token || busy || data?.invite.awardedAt) return
    setBusy(true)
    try {
      await awardTaseerOffer(token)
      reload()
    } finally {
      setBusy(false)
    }
  }

  const offers = data?.supplier?.offers || []
  const latest = offers[offers.length - 1]
  const need = data?.invite.need || taseerNeed || ''

  return (
    <div className="px-4 py-5 pb-28 flex flex-col min-h-full" dir="rtl">
      <button
        type="button"
        onClick={() => (need ? openTaseerNeed(need) : openTaseerCompare(need))}
        className="text-xs font-bold text-[#123F3A] mb-3"
      >
        ← المحادثات
      </button>
      <h1 className="text-xl font-black text-[#0D1F1D]">{data?.invite.sellerName || 'المزود'}</h1>
      <p className="text-xs text-neutral-500 mb-3">{need}</p>

      {offers.length > 1 && (
        <div className="mb-3 rounded-xl bg-[#FAFAF8] px-3 py-2 text-[11px] text-neutral-600">
          تاريخ السعر:{' '}
          {offers.map((o) => parseMoney(o.amount) ?? o.amount ?? '—').join(' → ')}
          {latest ? ` · الأحدث ${formatSar(parseMoney(latest.amount))}` : ''}
        </div>
      )}

      <div className="flex-1 space-y-2">
        {(data?.messages || []).map((message) => (
          <div
            key={message.id}
            className={`rounded-2xl px-3 py-2 text-sm ${
              message.from === 'buyer'
                ? 'bg-[#123F3A] text-white mr-8'
                : message.from === 'system'
                  ? 'bg-[#CFF5DC] text-[#123F3A]'
                  : 'bg-white border border-neutral-100 ml-8'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{message.text}</div>
            <div className={`text-[10px] mt-1 ${message.from === 'buyer' ? 'text-white/70' : 'text-neutral-400'}`}>
              {new Date(message.at).toLocaleString('ar-SA')}
            </div>
          </div>
        ))}
        {!data?.messages.length && (
          <div className="text-sm text-neutral-500">ما فيه رسائل بعد. اكتب للمزود أو راجع عرضه.</div>
        )}
      </div>

      {data?.invite.awardedAt ? (
        <div className="mt-4 rounded-xl bg-[#f0faf7] text-[#123F3A] font-bold text-sm px-3 py-3">تمّت الترسية من هذه المحادثة.</div>
      ) : (
        <button
          type="button"
          onClick={() => void award()}
          disabled={busy}
          className="mt-4 w-full py-3 rounded-xl border border-[#123F3A] text-[#123F3A] font-bold text-sm disabled:opacity-40"
        >
          ترسية من المحادثة
        </button>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب للمزود…"
          className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm bg-white outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="px-4 rounded-xl bg-[#123F3A] text-white font-bold text-sm disabled:opacity-40"
        >
          إرسال
        </button>
      </div>
    </div>
  )
}
