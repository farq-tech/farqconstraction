/**
 * «كيف تبي تبدأ طلب التسعير؟» — three ways into ONE request: a booklet, a
 * product found by search, or lines typed by hand. Whichever is chosen, the
 * lines land in the same cart («طلبك») and the others stay available.
 */
import { UploadIcon } from '../../icons'

export type StartPath = 'upload' | 'search' | 'manual'

const PATHS: Array<{ id: StartPath; title: string; hint: string; icon: string }> = [
  { id: 'upload', title: 'ارفع كراسة', hint: 'ملف PDF — نقرأ البنود تلقائيًا', icon: 'upload' },
  { id: 'search', title: 'ابحث عن منتج', hint: 'ابحث بالاسم أو الموديل وأضفه للطلب', icon: '⌕' },
  { id: 'manual', title: 'اكتب البنود يدويًا', hint: 'مثال: 6 سخانات كهربائية 80 لتر', icon: '✎' },
]

export default function StartChooser({
  active,
  onChoose,
}: {
  active: StartPath | null
  onChoose: (path: StartPath) => void
}) {
  return (
    <div className="mb-6" dir="rtl">
      <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D] mb-4">كيف تبي تبدأ طلب التسعير؟</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="list">
        {PATHS.map((p) => {
          const on = active === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              data-path={p.id}
              aria-pressed={on}
              onClick={() => onChoose(p.id)}
              className={`w-full min-h-16 flex items-center gap-3 sm:block text-right rounded-2xl border px-4 py-4 transition-colors ${
                on ? 'border-[#123F3A] bg-[#f0faf7]' : 'border-neutral-200 bg-white hover:border-[#123F3A]/40'
              }`}
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-[#CFF5DC] flex items-center justify-center sm:mb-3 text-[#123F3A] text-lg font-black">
                {p.icon === 'upload' ? <UploadIcon className="w-5 h-5 text-[#123F3A]" /> : p.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#0D1F1D]">{p.title}</div>
                <div className="text-xs text-neutral-500 mt-1 leading-relaxed">{p.hint}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
