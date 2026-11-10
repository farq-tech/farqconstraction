import type { BOQItem, Supplier } from '../types'

/** How many suppliers the system chooses for a line on its own. */
export const AUTO_PICK = 10

const ACTIVITY_GRADE = 'على مستوى النشاط'

/**
 * What the booklet itself says about each supplier's breadth.
 *
 * `breadth` is the number of DISTINCT material families a supplier was
 * suggested for anywhere in this booklet. A steel supplier suggested on two
 * hundred steel lines has breadth 1; a general-contracting supplier the
 * register lists under every trade has breadth 20. Families, never lines, so
 * being right often is not punished, only being everywhere.
 */
export type PickContext = { breadth: Map<string, number> }

/** The material a line is about, at family granularity where one is known. */
function materialKeyOf(item: BOQItem): string | null {
  return (
    item.mapSuggestion?.family ||
    item.aiSuggestion?.family ||
    item.familySuggestion?.family ||
    item.mapSuggestion?.intent ||
    item.aiSuggestion?.intent ||
    item.farqSpecId ||
    item.lineKey ||
    null
  )
}

function identityText(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[×✕]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A catalogue item can represent a product family with several purchasable
 * specifications (for example PPR pipe PN20 at diameters 20–50 mm). Reuse a
 * buyer's selection or rejection only when the buyer-facing line identity and
 * its structured technical constraints also agree.
 */
function sameLineIdentity(a: BOQItem, b: BOQItem): boolean {
  if (!identityText(a.name) || identityText(a.name) !== identityText(b.name)) return false
  if (identityText(a.spec) !== identityText(b.spec)) return false

  const identityFields = [
    'brand',
    'any_approved_brand',
    'standard',
    'grade',
    'dimensions',
    'thickness',
    'length',
    'material',
    'finish',
    'sale_units',
  ] as const
  return identityFields.every((field) =>
    JSON.stringify(a.specCard?.[field] ?? null) === JSON.stringify(b.specCard?.[field] ?? null),
  )
}

/** Whether two lines are the same exact material for buyer feedback propagation. */
export function sameMaterial(a: BOQItem, b: BOQItem): boolean {
  if (!sameLineIdentity(a, b)) return false
  if (a.farqSpecId && a.farqSpecId === b.farqSpecId) return true
  const intentsA = [a.mapSuggestion?.intent, a.aiSuggestion?.intent].filter((value): value is string => Boolean(value))
  const intentsB = new Set([b.mapSuggestion?.intent, b.aiSuggestion?.intent].filter((value): value is string => Boolean(value)))
  return intentsA.some((intent) => intentsB.has(intent))
}

// The person's own list («قائمة بدر») is shown for him to choose from and is
// never ticked automatically (owner 14-10), so it is not a lane here.
function lanesOf(item: BOQItem): Supplier[][] {
  return [
    item.fitReviewSuggestion?.suppliers || [],
    item.learnedSuggestion?.suppliers || [],
    item.outcomeSuggestion?.suppliers || [],
    item.mapSuggestion?.suppliers || [],
    item.suppliers,
    item.aiSuggestion?.suppliers || [],
    item.familySuggestion?.suppliers || [],
  ]
}

function fitMismatches(item: BOQItem): Set<string> {
  // A reviewed supplier can be repeated across the match, outcome, and
  // suggestion lanes. Apply the buyer's explicit mismatch verdict wherever
  // that supplier appears, not only when the review lane is present.
  return new Set(
    lanesOf(item)
      .flat()
      .filter(s => s?.id && s.fitReview?.verdict === 'QUOTE_MISMATCHED')
      .map(s => s.id),
  )
}

/** «مقدّم عروض سابقاً»: he priced this material for the company before. */
export function isPriorQuoter(s: Supplier | null | undefined): boolean {
  return Boolean(s && (s.priorQuotes ?? 0) > 0)
}

/** Read once per booklet, then handed to every `autoPickFor` call. */
export function buildPickContext(items: BOQItem[]): PickContext {
  const families = new Map<string, Set<string>>()
  for (const item of items) {
    if (item.workOnly) continue
    const key = materialKeyOf(item)
    if (!key) continue
    for (const lane of lanesOf(item)) {
      for (const s of lane) {
        if (!s?.id) continue
        let set = families.get(s.id)
        if (!set) families.set(s.id, (set = new Set()))
        set.add(key)
      }
    }
  }
  const breadth = new Map<string, number>()
  for (const [id, set] of families) breadth.set(id, set.size)
  return { breadth }
}

/** Specialists first; equal breadth keeps the server's order. */
function specialistsFirst(lane: Supplier[], context?: PickContext): Supplier[] {
  if (!context || lane.length < 2) return lane
  return lane
    .map((s, i) => ({ s, i, b: context.breadth.get(s.id) ?? 1 }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((x) => x.s)
}

/**
 * The suppliers the system would choose for a line, best first.
 *
 * One rule, read by both screens. The upload summary used to count only the
 * catalogue's confirmed matches (25 suppliers for 1,514 lines) while the
 * proposals page chose five for every line from every source, so the owner
 * saw two answers to one question.
 *
 * Order: what he chose before, then suppliers who already priced this
 * material for the company («مقدّم عروض سابقاً», from any lane of this line —
 * the API put them first inside each lane), then suppliers named for the
 * material, catalogue matches, the named-suggestion lane, suppliers of the
 * activity («مورد محتمل»), then the family and sector. Never one he rejected.
 * Right after his own choices comes «نتائج الجولات» (outcomeSuggestion): who
 * priced this same material in an earlier round — even when no directory list
 * holds him — then who answered about it, prices it alongside a material he
 * priced, or resembles those who priced it, in the server's order. The owner,
 * 1 Oct 2026: «اهم شي نستفيد من الي ردو ومتوفر عندهم». Replayed on the first
 * two booklets, the lists without it held none of the 160 suppliers who had
 * priced those lines.
 *
 * Inside every lane except his own choices, the specialist comes before the
 * generalist (see `PickContext`). Without that, a thin confirmed map let the
 * same handful of general suppliers fill the first five slots of nearly every
 * line, whatever the material was («نفس الموردين ثابتين على كل بند»).
 */
/**
 * How sure we are that this supplier sells this line's material.
 *
 *   SURE     he previously priced this material, has direct product evidence,
 *            or the map's reason is his NAME or REGISTERED ACTIVITY naming it
 *   LIKELY   the map confirmed the material some other way («نشاط متطابق»:
 *            the line's own word in his name, Haraj tags)
 *   MAYBE    a broad trade suggestion, a buyer-choice preference without
 *            independent fit evidence, or a supplier outside the delivery city
 */
export type Confidence = 'SURE' | 'LIKELY' | 'MAYBE'

export function confidenceOf(s: Supplier): Confidence {
  if (s.outOfCity) return 'MAYBE'
  // A buyer's prior quote-fit confirmation is useful context, but it does not
  // confirm today's availability or authorize a new RFQ without selection.
  if (s.fitReview?.verdict === 'QUOTE_MISMATCHED' || s.fitReview?.verdict === 'QUOTE_MATCHED') return 'MAYBE'
  // A prior quote is direct evidence that the supplier priced this material.
  // A prior buyer choice is only a preference: the server marks that lane
  // review_required and must not be treated as proof of technical fit.
  if (isPriorQuoter(s)) return 'SURE'
  // A question or clarification also counts as ANSWERED; a reply alone
  // does not establish that the supplier sells the requested material.
  if (s.roundOutcome?.grade === 'PRICED') return 'SURE'
  // A sibling product or broad trade cannot establish sale of this material,
  // even if a legacy adapter labelled the row as a catalogue match.
  if (/^(?:منتج شقيق|نشاط العائلة|صيانة\/إصلاح)/u.test((s.why || '').trim())) return 'MAYBE'
  if (s.evidence === 'دليل مباشر' || s.evidence === 'دليل منتج') return 'SURE'
  if (s.evidence === 'من الكتالوج' || s.evidence === 'تسمية آلية' || s.evidence === 'خريطة فرق') return 'LIKELY'
  if (s.evidence === 'نشاط متطابق') {
    const why = s.why || ''
    return why.startsWith('الاسم') || why.startsWith('النشاط المسجّل') || why.startsWith('المادة') ? 'SURE' : 'LIKELY'
  }
  return 'MAYBE'
}

/** Select every sure or near-certain supplier, including named system suggestions.
 * Channel costs are reviewed at send time; there is no selection cap.
 * Broad family-only suggestions, rejected suppliers and work-only lines stay out.
 */
export function autoPickConfident(item: BOQItem, context?: PickContext): Supplier[] {
  if (item.workOnly) return []
  const all = autoPickFor(item, Number.POSITIVE_INFINITY, context)
  // 5 Oct 2026: the buyer explicitly wants EVERY sure or near-certain match,
  // including the system's named suggestions, regardless of channel or count.
  // A weak earlier lane must not hide stronger evidence for the same business.
  const strongest = new Map<string, Supplier>()
  const outsideCity = new Set<string>()
  const mismatched = fitMismatches(item)
  const score = (s: Supplier) => ({ SURE: 2, LIKELY: 1, MAYBE: 0 })[confidenceOf(s)]
  const candidates = [
    ...(item.fitReviewSuggestion?.suppliers || []),
    ...(item.learnedSuggestion?.suppliers || []).map(s => ({ ...s, evidence: 'اختيارك' as const })),
    ...lanesOf(item).flatMap((lane, index) => index === 1 ? [] : lane),
  ]
  for (const s of candidates) {
    if (!s?.id) continue
    if (s.outOfCity) outsideCity.add(s.id)
    const previous = strongest.get(s.id)
    if (!previous || score(s) > score(previous)) strongest.set(s.id, s)
  }
  return all.map(s => strongest.get(s.id) || s).filter(s => !outsideCity.has(s.id) && !mismatched.has(s.id) && confidenceOf(s) !== 'MAYBE')
}

export function autoPickFor(item: BOQItem, limit = AUTO_PICK, context?: PickContext): Supplier[] {
  if (limit <= 0) return []
  const rejected = new Set(item.rejectedSupplierIds || [])
  const map = item.mapSuggestion?.suppliers || []
  const lanes = [
    map.filter((s) => s.evidence !== ACTIVITY_GRADE),
    item.suppliers,
    item.aiSuggestion?.suppliers || [],
    map.filter((s) => s.evidence === ACTIVITY_GRADE),
    item.familySuggestion?.suppliers || [],
  ]
  const ordered = [
    ...(item.fitReviewSuggestion?.suppliers || []),
    ...(item.learnedSuggestion?.suppliers || []),
    ...(item.outcomeSuggestion?.suppliers || []),
    ...lanes.flat().filter(isPriorQuoter),
    ...specialistsFirst(map.filter((s) => s.evidence !== ACTIVITY_GRADE), context),
    ...specialistsFirst(item.suppliers, context),
    ...specialistsFirst(item.aiSuggestion?.suppliers || [], context),
    ...specialistsFirst(map.filter((s) => s.evidence === ACTIVITY_GRADE), context),
    ...specialistsFirst(item.familySuggestion?.suppliers || [], context),
  ]
  const chosen: Supplier[] = []
  const seen = new Set<string>()
  const mismatched = fitMismatches(item)
  for (const s of ordered) {
    if (!s?.id || seen.has(s.id) || rejected.has(s.id) || mismatched.has(s.id)) continue
    seen.add(s.id)
    chosen.push(s)
    if (chosen.length >= limit) break
  }
  return chosen
}

/**
 * Count unique suppliers shown on the proposal card, not only the automatic
 * pick lane. Personal preferences are visible for manual choice, while AI and
 * family boxes are hidden whenever a stronger map/AI box already exists.
 */
export function visibleSupplierCandidateCount(item: BOQItem): number {
  const rejected = new Set(item.rejectedSupplierIds || [])
  const boxed = [
    item.preferredSuggestion?.suppliers || [],
    item.fitReviewSuggestion?.suppliers || [],
    item.learnedSuggestion?.suppliers || [],
    item.outcomeSuggestion?.suppliers || [],
    item.mapSuggestion?.suppliers || [],
    ...(!item.mapSuggestion ? [item.aiSuggestion?.suppliers || []] : []),
    ...(!item.mapSuggestion && !item.aiSuggestion ? [item.familySuggestion?.suppliers || []] : []),
  ]
  const boxedIds = new Set(boxed.flatMap((lane) => lane.map((supplier) => supplier?.id).filter((id): id is string => Boolean(id))))
  const visibleIds = new Set<string>()
  for (const supplier of boxed.flat()) {
    if (supplier?.id && !rejected.has(supplier.id)) visibleIds.add(supplier.id)
  }
  for (const supplier of item.suppliers || []) {
    if (supplier?.id && !boxedIds.has(supplier.id) && !rejected.has(supplier.id)) visibleIds.add(supplier.id)
  }
  return visibleIds.size
}
