import { searchConstructionProducts } from '../api/constructionClient'
import type { ProductSearchResult } from './rfqCart'
import { safeImageUrl } from './rfqCart'

export function loadReferencePhoto(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const image = new Image()
    let finished = false
    const finish = (ok: boolean) => { if (finished) return; finished = true; clearTimeout(timer); image.onload = null; image.onerror = null; resolve(ok) }
    const timer = setTimeout(() => finish(false), 4500)
    image.referrerPolicy = 'no-referrer'
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0)
    image.onerror = () => finish(false)
    image.src = url
  })
}

export async function pickLoadablePhoto(cards: ProductSearchResult['cards'], active: () => boolean, probe = loadReferencePhoto) {
  const tried = new Set<string>()
  for (const card of cards) {
    if (!active() || tried.size >= 3) return undefined
    const url = safeImageUrl(card.image_url)
    if (!url || tried.has(url)) continue
    tried.add(url)
    if (await probe(url)) return active() ? card : undefined
  }
  return undefined
}

export function createPhotoLookup(search: (q: string) => Promise<ProductSearchResult>) {
  let pending = 0, nextStart = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const queue: Array<() => void> = []
  const searches = new Map<string, Promise<ProductSearchResult>>()
  const watchers = new Map<string, Array<() => boolean>>()
  function drain() {
    if (timer || !queue.length || pending >= 2) return
    timer = setTimeout(() => { timer = undefined; nextStart = Date.now() + 11000; queue.shift()?.(); drain() }, Math.max(0, nextStart - Date.now()))
  }
  return (name: string, active: () => boolean) => {
    if (!watchers.has(name)) watchers.set(name, [])
    watchers.get(name)!.push(active)
    if (!searches.has(name)) searches.set(name, new Promise((resolve, reject) => {
      queue.push(() => {
        if (!watchers.get(name)?.some(check => check())) { searches.delete(name); watchers.delete(name); resolve({ status: 'EMPTY', query: name, cards: [] }); return }
        pending++
        search(name).then(resolve, reject).finally(() => { pending--; drain() })
      })
      drain()
    }))
    return searches.get(name)!
  }
}
export const findReferencePhoto = createPhotoLookup(q => searchConstructionProducts(q))
