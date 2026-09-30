/**
 * «ابحث عن منتج» — search inside Farq by name, model, SKU (Arabic or English)
 * or a pasted product link, and add what you find to «طلبك».
 *
 * A card shows what the product IS: image, name, brand, model, key specs and
 * where that came from. It never shows a store price: a price on a website is
 * not a supplier's quote, and this screen only builds the request.
 */
import { useRef, useState } from 'react'
import { searchConstructionProducts } from '../../api/constructionClient'
import {
  lineFromProduct,
  quickSheetFor,
  safeImageUrl,
  type AddMode,
  type ProductCard,
  type ProductSearchResult,
} from '../../lib/rfqCart'
import type { BOQItem } from '../../types'
import QuickAddSheet from './QuickAddSheet'

const EXAMPLES = ['سخان 80 لتر', 'Ariston 80L', 'لمبة LED سقف 12 واط']

export function ProductCardView({
  card,
  onChoose,
}: {
  card: ProductCard
  onChoose: (card: ProductCard, mode: AddMode) => void
}) {
  const image = safeImageUrl(card.image_url)
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 flex gap-3 text-right" data-card={card.id}>
      <div className="w-20 h-20 rounded-xl bg-neutral-50 border border-neutral-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={card.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="text-[10px] text-neutral-400">بلا صورة</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[#0D1F1D] leading-snug">{card.name}</div>
        <div className="text-xs text-neutral-600 mt-0.5">
          {[card.brand, card.model || card.sku].filter(Boolean).join(' · ') || 'بلا علامة محددة'}
        </div>
        {card.specs.length > 0 && (
          <div className="text-[11px] text-neutral-500 mt-1 leading-relaxed line-clamp-2">
            {card.specs.map((s) => `${s.label}: ${s.value}`).join(' · ')}
          </div>
        )}
        {card.source?.name && (
          <div className="text-[10px] text-neutral-400 mt-1">
            المصدر:{' '}
            {card.source.url ? (
              <a href={card.source.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                {card.source.name}
              </a>
            ) : (
              card.source.name
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            type="button"
            data-action="product"
            onClick={() => onChoose(card, 'product')}
            className="text-xs font-bold bg-[#123F3A] text-white rounded-lg px-3 py-1.5"
          >
            أضف هذا المنتج
          </button>
          <button
            type="button"
            data-action="spec-only"
            onClick={() => onChoose(card, 'spec-only')}
            className="text-xs font-bold border border-[#123F3A] text-[#123F3A] rounded-lg px-3 py-1.5"
          >
            استخدم مواصفاته فقط
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProductSearchPanel({ onAdd }: { onAdd: (line: Omit<BOQItem, 'id'>) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProductSearchResult | null>(null)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState<{ card: ProductCard; mode: AddMode } | null>(null)
  const [added, setAdded] = useState('')
  const ctrl = useRef<AbortController | null>(null)

  const run = async (text: string) => {
    const query = text.trim()
    if (query.length < 2) {
      setError('اكتب اسم المنتج أو الموديل (حرفين على الأقل).')
      return
    }
    ctrl.current?.abort()
    const controller = new AbortController()
    ctrl.current = controller
    setBusy(true)
    setError('')
    setAdded('')
    try {
      const res = await searchConstructionProducts(query, { signal: controller.signal })
      if (ctrl.current !== controller) return
      setResult(res)
    } catch (err) {
      if (ctrl.current !== controller) return
      setResult(null)
      setError(err instanceof Error ? err.message : 'تعذّر البحث الآن.')
    } finally {
      if (ctrl.current === controller) setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 mb-6" dir="rtl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم المنتج، الموديل، رقم الصنف، أو الصق رابط المنتج"
          aria-label="ابحث عن منتج"
          className="flex-1 min-w-0 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50 flex-shrink-0"
        >
          {busy ? 'نبحث…' : 'ابحث'}
        </button>
      </form>
      {!result && !busy && !error && (
        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
          <span className="text-[11px] text-neutral-400">مثال:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex)
                void run(ex)
              }}
              className="text-[11px] rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-600"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {busy && <div className="text-xs text-neutral-500 mt-3">نبحث عن المنتج في مواقع المصنعين والمتاجر…</div>}
      {error && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">{error}</div>}
      {added && <div className="mt-3 rounded-xl bg-[#f0faf7] px-3 py-2 text-xs text-[#123F3A] font-semibold">{added}</div>}
      {result && !busy && (
        <div className="mt-3">
          {result.cards.length === 0 ? (
            <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-3 text-xs text-neutral-600">
              {result.message_ar || 'ما لقينا منتجات مطابقة. جرّب اسمًا أوضح أو الموديل، أو اكتب البند يدويًا.'}
            </div>
          ) : (
            <>
              <div className="text-[11px] text-neutral-500 mb-2">
                {result.cards.length > 1 ? `${result.cards.length} خيارات — اختر الأقرب لطلبك` : 'نتيجة واحدة'}
                {' · '}الأسعار لا تُعرض هنا: الموردون يسعّرون طلبك.
              </div>
              <div className="space-y-2">
                {result.cards.map((card) => (
                  <ProductCardView key={card.id} card={card} onChoose={(c, mode) => setChoice({ card: c, mode })} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {choice && (
        <QuickAddSheet
          card={choice.card}
          mode={choice.mode}
          initial={quickSheetFor(choice.card, choice.mode)}
          onCancel={() => setChoice(null)}
          onConfirm={(sheet) => {
            const line = lineFromProduct(choice.card, choice.mode, sheet, result?.mode === 'URL' ? 'url' : 'search')
            onAdd(line)
            setAdded(`أُضيف للطلب: ${line.name} — ${line.qty} ${line.unit}. ابحث عن منتج آخر أو تابع لاختيار الموردين.`)
            setChoice(null)
          }}
        />
      )}
    </div>
  )
}
