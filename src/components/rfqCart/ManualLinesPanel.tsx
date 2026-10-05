/**
 * «اكتب البنود يدويًا» — one line per row, the quantity first:
 * «6 سخانات كهربائية 80 لتر». Each row becomes a line in «طلبك».
 */
import { useState } from 'react'
import { linesFromManualText } from '../../lib/rfqCart'
import type { BOQItem } from '../../types'

export default function ManualLinesPanel({ onAdd }: { onAdd: (lines: Array<Omit<BOQItem, 'id'>>) => void }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const lines = linesFromManualText(text)
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 mb-6" dir="rtl">
      <label className="block">
        <span className="text-xs font-semibold text-neutral-600">كل بند في سطر، والكمية أولًا</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setNote('')
          }}
          placeholder={'6 سخانات كهربائية 80 لتر\n20 كيس أسمنت مقاوم\n3 كرتون بلاط 60×60'}
          className="mt-1 w-full min-h-[110px] border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
        />
      </label>
      <div className="flex items-center justify-between gap-3 mt-2">
        <span className="text-[11px] text-neutral-500">
          {lines.length ? `${lines.length} ${lines.length === 1 ? 'بند' : 'بنود'} جاهزة للإضافة` : 'مثال: 6 سخانات كهربائية 80 لتر'}
        </span>
        <button
          type="button"
          disabled={!lines.length}
          onClick={() => {
            onAdd(lines)
            setNote(`أُضيف ${lines.length === 1 ? 'بند واحد' : `${lines.length} بنود`} للطلب.`)
            setText('')
          }}
          className="px-4 py-2 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40"
        >
          أضف للطلب
        </button>
      </div>
      {note && <div className="mt-2 text-xs text-[#123F3A] font-semibold">{note}</div>}
    </div>
  )
}
