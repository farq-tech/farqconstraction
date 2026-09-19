import type { BOQItem, Supplier } from '../types'
import { adoptOtherSourceCandidates, getOtherSourceSearch, startOtherSourceSearch } from '../api/constructionClient'

/** Lines searched per BOQ: each search takes about half a minute on the server. */
export const OTHER_SOURCES_MAX_LINES = 10
const TARGET_PER_LINE = 5
const GRADE_ORDER = { A: 0, B: 1, C: 2 } as const

export type OtherSourcesProgress = { done: number; total: number; added: number; stopped?: string }

/**
 * For lines matched to a catalogue item but short of suppliers, search other
 * sources one line at a time and add the best-graded accounts found there.
 * Returns new items; stops (and says why) on a rate limit or server refusal.
 */
export async function addOtherSourceSuppliers(
  items: BOQItem[],
  opts: { city?: string; onProgress?: (p: OtherSourcesProgress) => void; isCurrent?: () => boolean } = {},
): Promise<{ items: BOQItem[]; progress: OtherSourcesProgress }> {
  const targets = items.filter((i) => i.farqSpecId && i.suppliers.length < TARGET_PER_LINE).slice(0, OTHER_SOURCES_MAX_LINES)
  const byId = new Map(items.map((i) => [i.id, i]))
  const progress: OtherSourcesProgress = { done: 0, total: targets.length, added: 0 }
  opts.onProgress?.({ ...progress })
  for (const item of targets) {
    if (opts.isCurrent && !opts.isCurrent()) break
    try {
      const started = await startOtherSourceSearch({ item_name: item.name, spec: item.spec, city: opts.city, farq_spec_id: String(item.farqSpecId) })
      let job = await getOtherSourceSearch(started.job_id)
      for (let n = 0; n < 40 && (job.status === 'QUEUED' || job.status === 'RUNNING'); n++) {
        await new Promise((r) => setTimeout(r, 3000))
        job = await getOtherSourceSearch(started.job_id)
      }
      const have = new Set(item.suppliers.map((s) => s.id))
      const picks = (job.result?.candidates || [])
        .filter((c) => !have.has(`haraj:seller:${c.author_id}`))
        .sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade])
        .slice(0, TARGET_PER_LINE - item.suppliers.length)
      if (job.status === 'COMPLETE' && picks.length) {
        const adopted = await adoptOtherSourceCandidates({ job_id: started.job_id, author_ids: picks.map((c) => String(c.author_id)), farq_spec_id: String(item.farqSpecId) })
        const extra: Supplier[] = (adopted.suppliers || []).map((s) => ({
          id: s.id,
          name: String(s.name_ar || s.id),
          city: String(s.city || ''),
          evidence: 'على مستوى النشاط',
          channel: 'حراج',
          origin: 'OTHER',
        }))
        const suppliers = [...item.suppliers, ...extra]
        byId.set(item.id, { ...item, suppliers, supplierCount: suppliers.length, status: suppliers.length ? 'ready' : item.status })
        progress.added += extra.length
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      progress.stopped = status === 429 ? 'بلغنا حد البحث في المصادر الأخرى لهذه الساعة.' : err instanceof Error ? err.message : 'تعذّر البحث في المصادر الأخرى.'
      opts.onProgress?.({ ...progress })
      break
    }
    progress.done += 1
    opts.onProgress?.({ ...progress })
  }
  return { items: items.map((i) => byId.get(i.id) || i), progress }
}
