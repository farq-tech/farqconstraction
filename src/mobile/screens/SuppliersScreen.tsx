import { useEffect, useState } from 'react'
import { listConstructionSuppliers } from '../../api/constructionSuppliers'
import type { SupplierEntry } from '../../types'
import type { Nav } from '../MobileApp'
import { Avatar, Empty, ErrorNote, Pill, Screen, Sheet, Skeleton } from '../ui'

const PAGE = 40

function telHref(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  return digits.length >= 7 ? `tel:${digits}` : null
}
function waHref(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('05')) d = `966${d.slice(1)}`
  if (d.startsWith('5') && d.length === 9) d = `966${d}`
  return d.length >= 11 ? `https://wa.me/${d}` : null
}

export default function SuppliersScreen(_props: { nav: Nav }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<SupplierEntry[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SupplierEntry | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 350)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    listConstructionSuppliers({ query: debounced, limit: PAGE })
      .then((r) => {
        if (!alive) return
        setRows(r.suppliers)
        setTotal(r.total ?? null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'تعذّر تحميل الموردين.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [debounced])

  async function loadMore() {
    setMore(true)
    try {
      const r = await listConstructionSuppliers({ query: debounced, limit: PAGE, offset: rows.length })
      setRows((x) => [...x, ...r.suppliers])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحميل المزيد.')
    } finally {
      setMore(false)
    }
  }

  const tel = open ? telHref(open.phone) : null
  const wa = open ? waHref(open.phone) : null

  return (
    <Screen title="الموردون" subtitle={total != null ? `${total.toLocaleString('en-US')} مورد` : undefined}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث بالاسم أو المدينة أو المادة"
        className="w-full h-11 rounded-xl bg-black/[0.05] px-4 mb-4 outline-none placeholder:text-neutral-400"
      />
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Skeleton rows={8} height={64} />
      ) : rows.length === 0 ? (
        <Empty title="لا موردين" body={debounced ? 'لا مورد يطابق البحث.' : undefined} />
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden divide-y divide-neutral-100 shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
          {rows.map((s) => (
            <button key={s.id} onClick={() => setOpen(s)} className="w-full flex items-center gap-3 px-4 py-3 text-right active:bg-neutral-100">
              <Avatar name={s.name} size={42} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[15px] truncate">{s.name}</div>
                <div className="text-[13px] text-neutral-500 truncate">{[s.city, s.category].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="flex gap-1">
                {s.hasWhatsapp && <Pill tone="good">واتساب</Pill>}
                {s.hasEmail && <Pill tone="brand">بريد</Pill>}
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && total != null && rows.length < total && (
        <button onClick={loadMore} disabled={more} className="w-full mt-3 h-11 text-[14px] font-bold text-[#123F3A] disabled:opacity-50">
          {more ? 'جارٍ التحميل…' : 'عرض المزيد'}
        </button>
      )}

      <Sheet open={Boolean(open)} onClose={() => setOpen(null)}>
        {open && (
          <div className="pb-2">
            <div className="flex items-center gap-3">
              <Avatar name={open.name} size={56} />
              <div className="min-w-0">
                <div className="font-black text-[19px] leading-snug">{open.name}</div>
                <div className="text-[14px] text-neutral-500">{[open.city, open.category].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-5">
              <a href={tel || undefined} aria-disabled={!tel} className={`h-16 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold text-[13px] ${tel ? 'bg-[#e0efec] text-[#123F3A]' : 'bg-neutral-100 text-neutral-300 pointer-events-none'}`}>
                <span className="text-[20px]">📞</span>اتصال
              </a>
              <a href={wa || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!wa} className={`h-16 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold text-[13px] ${wa ? 'bg-[#dcf8e6] text-[#128C4B]' : 'bg-neutral-100 text-neutral-300 pointer-events-none'}`}>
                <span className="text-[20px]">💬</span>واتساب
              </a>
              <a href={open.email ? `mailto:${open.email}` : undefined} aria-disabled={!open.email} className={`h-16 rounded-2xl flex flex-col items-center justify-center gap-1 font-bold text-[13px] ${open.email ? 'bg-[#e8eef8] text-[#2f5aa8]' : 'bg-neutral-100 text-neutral-300 pointer-events-none'}`}>
                <span className="text-[20px]">✉️</span>بريد
              </a>
            </div>
            <div className="mt-5 rounded-2xl bg-[#f2f3ef] divide-y divide-white">
              {open.phone && <div className="px-4 py-3 flex justify-between text-[14px]"><span className="text-neutral-500">الجوال</span><bdi dir="ltr" className="font-semibold">{open.phone}</bdi></div>}
              {open.email && <div className="px-4 py-3 flex justify-between gap-3 text-[14px]"><span className="text-neutral-500">البريد</span><bdi dir="ltr" className="font-semibold truncate">{open.email}</bdi></div>}
              <div className="px-4 py-3 flex justify-between text-[14px]"><span className="text-neutral-500">التعاملات</span><span className="font-semibold tabular-nums">{open.interactions}</span></div>
            </div>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
