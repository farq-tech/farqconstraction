import { useEffect, useState } from 'react'
import { searchNeedListings, type NeedGroup } from '../api/needListings'
import { SearchIcon } from '../icons'
import { setNeedFlowStep } from '../lib/needFlowStep'
import { splitNeeds } from '../lib/needText'
import type { HarajListing } from '../lib/harajPublic/parse'
import type { NavProps } from '../types'

function formatListingDate(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function listingKey(need: string, listing: HarajListing): string {
  return `${need}:${listing.postId}`
}

function ListingCard({
  listing,
  selected,
  onToggle,
}: {
  listing: HarajListing
  selected: boolean
  onToggle: () => void
}) {
  const [brokenPhoto, setBrokenPhoto] = useState(false)
  const photo = !brokenPhoto && listing.images[0] ? listing.images[0] : null
  const date = formatListingDate(listing.postedAt)
  const rating = listing.rating

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-right rounded-2xl border bg-white overflow-hidden transition-all ${
        selected ? 'border-[#123F3A] ring-1 ring-[#123F3A]/30' : 'border-neutral-100 hover:border-[#123F3A]/30'
      }`}
    >
      <div className="flex gap-3 p-3">
        <div className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden flex-shrink-0">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setBrokenPhoto(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-lg font-black">
              {listing.title.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#0D1F1D] leading-snug line-clamp-2">{listing.title}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
            {date && <span>نُشر {date}</span>}
            {rating && (
              <span>
                تقييم البائع {rating.value}
                {rating.count > 0 ? ` (${rating.count})` : ''}
              </span>
            )}
          </div>
          <div className={`mt-2 text-[11px] font-bold ${selected ? 'text-[#123F3A]' : 'text-neutral-400'}`}>
            {selected ? 'مختار لطلب السعر' : 'اختيار'}
          </div>
        </div>
      </div>
    </button>
  )
}

export function NeedSearchView(_props: NavProps) {
  const [text, setText] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<NeedGroup[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (searching) setNeedFlowStep(2)
    else if (selected.size > 0) setNeedFlowStep(3)
    else if (groups) setNeedFlowStep(2)
    else setNeedFlowStep(1)
    return () => setNeedFlowStep(1)
  }, [searching, groups, selected.size])

  const runSearch = async () => {
    const needs = splitNeeds(text)
    if (!needs.length || searching) return
    setError('')
    setSearching(true)
    setGroups(null)
    setSelected(new Set())
    try {
      setGroups(await searchNeedListings(needs))
    } catch {
      setError('تعذّر البحث. أعد المحاولة بعد قليل.')
    } finally {
      setSearching(false)
    }
  }

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-10" dir="rtl">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">اكتب احتياجك</h1>
        <p className="text-neutral-500">اكتب ما تحتاجه بالترتيب. مثال: سباك و كهربائي ودرابزين زجاج</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          dir="rtl"
          placeholder="سباك و كهربائي ودرابزين زجاج"
          className="w-full resize-none bg-transparent text-[#0D1F1D] text-base leading-relaxed outline-none placeholder:text-neutral-300"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-400">حتى أربعة احتياجات في مرة واحدة</div>
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={!splitNeeds(text).length || searching}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40"
          >
            <SearchIcon className="w-4 h-4" />
            دور
          </button>
        </div>
      </div>

      {searching && (
        <div className="mt-16 text-center text-lg font-bold text-[#123F3A]">ندور لك</div>
      )}

      {error && !searching && (
        <div className="mt-6 rounded-xl bg-red-50 text-red-700 text-sm font-semibold px-4 py-3">{error}</div>
      )}

      {groups && !searching && (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.query}>
              <h2 className="text-base font-black text-[#0D1F1D] mb-3">{group.query}</h2>
              {group.listings.length === 0 ? (
                <div className="rounded-2xl border border-neutral-100 bg-white py-8 text-center text-sm text-neutral-500">
                  {group.failure ? 'تعذّر البحث عن هذا الاحتياج.' : 'ما لقينا إعلانات لهذا الاحتياج.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {group.listings.map((listing) => {
                    const key = listingKey(group.query, listing)
                    return (
                      <ListingCard
                        key={key}
                        listing={listing}
                        selected={selected.has(key)}
                        onToggle={() => toggle(key)}
                      />
                    )
                  })}
                </div>
              )}
            </section>
          ))}
          {selected.size > 0 && (
            <div className="sticky bottom-24 lg:bottom-6 rounded-2xl bg-[#123F3A] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="text-sm font-bold">{selected.size} إعلان مختار</div>
              <div className="text-xs text-white/70">طلب السعر يُجهَّز من المختارات — الإرسال غير مفعّل هنا.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NeedSearchView
