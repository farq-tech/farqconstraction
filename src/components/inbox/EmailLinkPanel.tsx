import { useEffect, useState } from 'react'
import {
  getConstructionEmailLinkTargets,
  linkConstructionEmail,
  listConstructionEmailLinks,
  type ConstructionEmailLink,
  type ConstructionEmailLinkTargets,
} from '../../api/constructionClient'

/**
 * «بريد يحتاج ربط»: supplier email that reached info@farq.sa but could not be
 * tied to a request by itself (a new address, no request number). One click
 * links it to a request and supplier; the address is then remembered, so the
 * next email from it is linked by the server.
 */
export default function EmailLinkPanel({
  onBack,
  onCount,
}: {
  onBack: () => void
  onCount?: (count: number, more: boolean) => void
}) {
  const [items, setItems] = useState<ConstructionEmailLink[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    listConstructionEmailLinks()
      .then((page) => {
        if (!alive) return
        setItems(page.arrivals)
        setNext(page.next_cursor)
        onCount?.(page.arrivals.length, Boolean(page.next_cursor))
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'تعذّر التحميل'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMore = async () => {
    if (!next) return
    try {
      const page = await listConstructionEmailLinks(next)
      setItems((rows) => [...rows, ...page.arrivals])
      setNext(page.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر التحميل')
    }
  }

  const linked = (id: string, note: string) => {
    setDone((d) => ({ ...d, [id]: note }))
    setOpenId(null)
    const left = items.filter((i) => i.id !== id && !done[i.id]).length
    onCount?.(left, Boolean(next))
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-4 py-3 bg-white border-b border-neutral-200">
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع إلى قائمة المحادثات"
          className="flex-shrink-0 w-9 h-9 -ms-1 rounded-full flex items-center justify-center text-[#123F3A] hover:bg-neutral-100"
        >
          <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#0D1F1D]">بريد يحتاج ربط</h2>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            رسائل موردين وصلت إلى info@ ولم نعرف طلبها. اربطها مرة، ونعرف المرسل في المرة القادمة.
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#FAFAF8] px-3 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {loading && <p className="text-sm text-neutral-400 text-center py-10">جارٍ التحميل…</p>}
          {!loading && error && (
            <p role="alert" className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 break-words">
              {error}
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-10">لا يوجد بريد يحتاج ربط.</p>
          )}
          {items.map((item) => (
            <EmailCard
              key={item.id}
              item={item}
              note={done[item.id] || null}
              open={openId === item.id}
              onOpen={() => setOpenId(openId === item.id ? null : item.id)}
              onLinked={(note) => linked(item.id, note)}
            />
          ))}
          {next && (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="w-full text-xs font-bold text-[#123F3A] py-2 rounded-xl border border-neutral-200 bg-white"
            >
              تحميل المزيد
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailCard({
  item,
  note,
  open,
  onOpen,
  onLinked,
}: {
  item: ConstructionEmailLink
  note: string | null
  open: boolean
  onOpen: () => void
  onLinked: (note: string) => void
}) {
  const p = item.preview
  const files = p?.files || []
  const suggested = item.candidates.filter((c) => c.supplier_name_ar).map((c) => c.supplier_name_ar)
  return (
    <div className={`bg-white border rounded-2xl p-4 ${note ? 'border-[#CFF5DC] opacity-70' : 'border-neutral-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#0D1F1D] truncate" dir="auto">
            {p?.subject || 'بلا عنوان'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5" dir="ltr">
            {p?.sender || '—'}
          </div>
        </div>
        <span className="flex-shrink-0 text-[10px] text-neutral-400">
          {new Date(item.ingested_at).toLocaleDateString('ar-SA')}
        </span>
      </div>
      {(p?.snippet || p?.text) && (
        <p className="text-xs text-neutral-600 mt-2 leading-relaxed line-clamp-3" dir="auto">
          {p?.snippet || p?.text}
        </p>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.map((f, i) => (
            <span key={`${f.filename}-${i}`} className="text-[10px] font-semibold bg-neutral-100 text-neutral-700 rounded-full px-2 py-0.5" dir="ltr">
              {f.filename}
            </span>
          ))}
        </div>
      )}
      {suggested.length > 0 && (
        <p className="text-[11px] text-[#123F3A] mt-2">
          مقترح: {[...new Set(suggested)].slice(0, 3).join('، ')}
          {item.candidates.length > 1 ? ` — ${item.candidates.length} طلبات مفتوحة` : ''}
        </p>
      )}
      {note ? (
        <p className="text-xs text-[#1a7a45] font-semibold mt-3">{note}</p>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={onOpen}
            aria-expanded={open}
            className="px-3 py-1.5 bg-[#123F3A] text-white text-xs font-bold rounded-lg"
          >
            {open ? 'إلغاء' : 'اربطه بالطلب'}
          </button>
          {open && <LinkPicker item={item} onLinked={onLinked} />}
        </div>
      )}
    </div>
  )
}

function LinkPicker({ item, onLinked }: { item: ConstructionEmailLink; onLinked: (note: string) => void }) {
  const [targets, setTargets] = useState<ConstructionEmailLinkTargets | null>(null)
  const [query, setQuery] = useState('')
  const [rfqId, setRfqId] = useState('')
  const [inviteId, setInviteId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const id = window.setTimeout(() => {
      getConstructionEmailLinkTargets(item.id, query)
        .then((t) => {
          if (!alive) return
          setTargets(t)
          // The only suggested request and supplier are chosen for the owner.
          const suggested = t.requests.filter((r) => r.suggested)
          if (!rfqId && suggested.length === 1) {
            setRfqId(suggested[0].rfq_id)
            const s = suggested[0].suppliers.filter((x) => x.suggested)
            if (s.length === 1) setInviteId(s[0].invite_id)
          }
        })
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'تعذّر تحميل الطلبات'))
    }, query ? 300 : 0)
    return () => {
      alive = false
      window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, query])

  const request = targets?.requests.find((r) => r.rfq_id === rfqId) || null

  const submit = async () => {
    if (!inviteId || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await linkConstructionEmail(item.id, inviteId, item.revision)
      const supplier = request?.suppliers.find((s) => s.invite_id === inviteId)
      onLinked(
        `رُبط بالطلب ${request?.reference || ''}${supplier?.name_ar ? ` — ${supplier.name_ar}` : ''}. يظهر في المحادثة خلال لحظات${
          result.contact_added ? '، وحُفظ العنوان للمورد' : ''
        }.`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(message.includes('STALE') ? 'تغيّرت الرسالة. أعد فتح القائمة.' : message || 'تعذّر الربط')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث برقم الطلب أو اسم المورد"
        className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2"
      />
      {!targets && !error && <p className="text-[11px] text-neutral-400">جارٍ تحميل الطلبات…</p>}
      {targets && targets.requests.length === 0 && <p className="text-[11px] text-neutral-500">لا طلبات مفتوحة مطابقة.</p>}
      {targets && targets.requests.length > 0 && (
        <label className="block">
          <span className="text-[11px] text-neutral-500">الطلب</span>
          <select
            value={rfqId}
            onChange={(e) => {
              setRfqId(e.target.value)
              setInviteId('')
            }}
            className="mt-1 w-full text-xs border border-neutral-200 rounded-lg px-2 py-2 bg-white"
          >
            <option value="">اختر الطلب</option>
            {targets.requests.map((r) => (
              <option key={r.rfq_id} value={r.rfq_id}>
                {r.suggested ? '★ ' : ''}
                {r.reference}
                {r.project_name ? ` — ${r.project_name}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {request && (
        <fieldset className="space-y-1">
          <legend className="text-[11px] text-neutral-500 mb-1">المورد</legend>
          {request.suppliers.map((s) => (
            <label key={s.invite_id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`supplier-${item.id}`}
                checked={inviteId === s.invite_id}
                onChange={() => setInviteId(s.invite_id)}
              />
              <span>{s.name_ar || s.name_en || 'مورد'}</span>
              {s.suggested && <span className="text-[10px] font-bold text-[#123F3A] bg-[#CFF5DC] rounded-full px-1.5">مقترح</span>}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="text-[11px] text-amber-800 break-words">{error}</p>}
      <button
        type="button"
        disabled={!inviteId || busy}
        onClick={() => void submit()}
        className="px-4 py-2 bg-[#123F3A] text-white text-xs font-bold rounded-lg disabled:opacity-50"
      >
        {busy ? 'جارٍ الربط…' : 'ربط'}
      </button>
    </div>
  )
}
