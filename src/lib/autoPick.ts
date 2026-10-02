import type { BOQItem, Supplier } from '../types'

/**
 * The most suppliers the system chooses for a line on its own. A ceiling, not
 * a target: a line with three evidence-backed suppliers gets three.
 */
export const AUTO_PICK = 10

/**
 * PRECISION OVER PADDING. The owner: «لا تعبّي القائمة بموردين ما لهم علاقة
 * عشان توصل لرقم». When true, only suppliers with evidence for THIS material
 * are ticked on their own: his own earlier choices, who priced or answered
 * about it in an earlier round, who priced it for the company before, the
 * suppliers the map names for the material, catalogue matches and the
 * model-named lane. Suppliers of the activity (the map's family top-up /
 * sector fallback, «على مستوى النشاط») and the family lane stay ON SCREEN,
 * marked «مورد محتمل», for the buyer to tick himself.
 *
 * Set to false to restore the old behaviour (fill up to `AUTO_PICK` from the
 * activity and family lanes too).
 */
export const AUTO_PICK_EVIDENCE_ONLY = true

/**
 * «نتائج الجولات» grades that are evidence about this material or its own
 * trade: he priced it, answered about it, priced a material sold with it, or
 * priced a sibling. 'SIMILAR' only says his registered activity resembles
 * those who priced it — the same weakness as an activity-level supplier — so
 * with `AUTO_PICK_EVIDENCE_ONLY` it is shown but not ticked.
 */
export const OUTCOME_GRADES_AUTO_PICKED: ReadonlySet<string> = new Set(['PRICED', 'ANSWERED', 'ALSO_SELLS', 'FAMILY_PRICED'])

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

function lanesOf(item: BOQItem): Supplier[][] {
  return [
    item.learnedSuggestion?.suppliers || [],
    item.outcomeSuggestion?.suppliers || [],
    item.mapSuggestion?.suppliers || [],
    item.suppliers,
    item.aiSuggestion?.suppliers || [],
    item.familySuggestion?.suppliers || [],
  ]
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
 * material, catalogue matches, the named-suggestion lane. Suppliers of the
 * activity («مورد محتمل») and the family/sector lane follow only when
 * `AUTO_PICK_EVIDENCE_ONLY` is off. Never one he rejected, and never padded to
 * reach `limit`.
 * Right after his own choices comes «نتائج الجولات» (outcomeSuggestion): who
 * priced this same material in an earlier round — even when no directory list
 * holds him — then who answered about it, prices it alongside a material he
 * priced, or priced a sibling, in the server's order (one who only resembles
 * those who priced it, 'SIMILAR', is not ticked under `AUTO_PICK_EVIDENCE_ONLY`). The owner,
 * 1 Oct 2026: «اهم شي نستفيد من الي ردو ومتوفر عندهم». Replayed on the first
 * two booklets, the lists without it held none of the 160 suppliers who had
 * priced those lines.
 *
 * Inside every lane except his own choices, the specialist comes before the
 * generalist (see `PickContext`). Without that, a thin confirmed map let the
 * same handful of general suppliers fill the first five slots of nearly every
 * line, whatever the material was («نفس الموردين ثابتين على كل بند»).
 */
export function autoPickFor(item: BOQItem, limit = AUTO_PICK, context?: PickContext): Supplier[] {
  const rejected = new Set(item.rejectedSupplierIds || [])
  const map = item.mapSuggestion?.suppliers || []
  const named = map.filter((s) => s.evidence !== ACTIVITY_GRADE)
  const activity = map.filter((s) => s.evidence === ACTIVITY_GRADE)
  const family = item.familySuggestion?.suppliers || []
  // The AI lane can carry activity-grade rows too; only its named ones are evidence.
  const allAi = item.aiSuggestion?.suppliers || []
  const ai = AUTO_PICK_EVIDENCE_ONLY ? allAi.filter((s) => s.evidence !== ACTIVITY_GRADE) : allAi
  const allOutcomes = item.outcomeSuggestion?.suppliers || []
  const outcomes = allOutcomes.filter(
    (s) => !AUTO_PICK_EVIDENCE_ONLY || (s.roundOutcome != null && OUTCOME_GRADES_AUTO_PICKED.has(s.roundOutcome.grade)),
  )
  // `item.suppliers` also holds rows the buyer copied in from a suggestion lane;
  // those keep their weak grade, and a weak grade is not evidence here either.
  const matched = AUTO_PICK_EVIDENCE_ONLY
    ? (item.suppliers || []).filter(
        (s) =>
          s.evidence !== ACTIVITY_GRADE &&
          (s.roundOutcome == null || OUTCOME_GRADES_AUTO_PICKED.has(s.roundOutcome.grade)),
      )
    : item.suppliers
  const lanes = [named, item.suppliers, allAi, activity, family, allOutcomes]
  const ordered = [
    ...(item.learnedSuggestion?.suppliers || []),
    ...outcomes,
    // A prior quoter is evidence in himself, whichever lane listed him.
    ...lanes.flat().filter(isPriorQuoter),
    ...specialistsFirst(named, context),
    ...specialistsFirst(matched, context),
    ...specialistsFirst(ai, context),
    // Activity and family: no evidence for the material. Shown, never padded in.
    ...(AUTO_PICK_EVIDENCE_ONLY ? [] : [...specialistsFirst(activity, context), ...specialistsFirst(family, context)]),
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

/**
 * Whether the line's card still shows any supplier the buyer has not rejected,
 * in any lane. A line with none of the evidence-backed picks but some of these
 * has «مورد محتمل» suppliers to review — it is not "nothing in our directory".
 */
export function hasVisibleSuppliers(item: BOQItem): boolean {
  const rejected = new Set(item.rejectedSupplierIds || [])
  return [
    ...(item.suppliers || []),
    ...(item.mapSuggestion?.suppliers || []),
    ...(item.familySuggestion?.suppliers || []),
    ...(item.outcomeSuggestion?.suppliers || []),
    ...(item.aiSuggestion?.suppliers || []),
    ...(item.learnedSuggestion?.suppliers || []),
  ].some((s) => s?.id && !rejected.has(s.id))
}
