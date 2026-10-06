import { searchConstructionProducts } from '../api/constructionClient'
import type { ProductSearchResult } from './rfqCart'

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
