import type { BOQItem, Supplier } from '../types'

/** How many suppliers the system chooses for a line on its own. */
export const AUTO_PICK = 5

const ACTIVITY_GRADE = 'على مستوى النشاط'

/**
 * The suppliers the system would choose for a line, best first.
 *
 * One rule, read by both screens. The upload summary used to count only the
 * catalogue's confirmed matches (25 suppliers for 1,514 lines) while the
 * proposals page chose five for every line from every source, so the owner
 * saw two answers to one question.
 *
 * Order: what he chose before, suppliers named for the material, catalogue
 * matches, the named-suggestion lane, suppliers of the activity («مورد
 * محتمل»), then the family and sector. Never one he rejected.
 */
export function autoPickFor(item: BOQItem, limit = AUTO_PICK): Supplier[] {
  const rejected = new Set(item.rejectedSupplierIds || [])
  const map = item.mapSuggestion?.suppliers || []
  const ordered = [
    ...(item.learnedSuggestion?.suppliers || []),
    ...map.filter((s) => s.evidence !== ACTIVITY_GRADE),
    ...item.suppliers,
    ...(item.aiSuggestion?.suppliers || []),
    ...map.filter((s) => s.evidence === ACTIVITY_GRADE),
    ...(item.familySuggestion?.suppliers || []),
  ]
  const chosen: Supplier[] = []
  const seen = new Set<string>()
  for (const s of ordered) {
    if (!s?.id || seen.has(s.id) || rejected.has(s.id)) continue
    seen.add(s.id)
    chosen.push(s)
    if (chosen.length >= limit) break
  }
  return chosen
}
