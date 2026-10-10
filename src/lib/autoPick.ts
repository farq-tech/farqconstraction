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

function lanesOf(item: BOQItem): Supplier[][] {
  return [
    item.learnedSuggestion?.suppliers || [],
    item.outcomeSuggestion?.suppliers || [],
    item.mapSuggestion?.suppliers || [],
    item.suppliers,
    item.evidenceSuggestion?.suppliers || [],
    item.aiSuggestion?.suppliers || [],
    item.familySuggestion?.suppliers || [],
  ]
}

/*
 * «درجة الدليل» — the server's one grade per supplier (types.ts SupplierGrade,
 * api supplier-evidence-grade.js). SHADOW: the server sends it beside the old
 * fields, and this screen keeps picking by confidenceOf() until the grade is
 * switched on here. Measured first on 20 production lines (api
 * docs/construction/match-baseline-2026-10.md); the switch is the owner's call.
 *
 *   on:  localStorage farq_grade_v2 = '1', or VITE_MATCH_GRADE_V2=1 at build
 *   off: anything else (the default)
 */
export const GRADE_V2_KEY = 'farq_grade_v2'
export function gradeV2Enabled(): boolean {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(GRADE_V2_KEY) : null
    if (stored === '1') return true
    if (stored === '0') return false
  } catch {
    /* no storage: the build flag decides */
  }
  try {
    return String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MATCH_GRADE_V2 || '') === '1'
  } catch {
    return false
  }
}

const GRADE_RANK = { SURE: 2, LIKELY: 1, MAYBE: 0 } as const
/** Every supplier of the line once, carrying the strongest grade any lane gave him; undefined when the server sent no grade. */
export function gradedSuppliers(item: BOQItem): Supplier[] | undefined {
  const best = new Map<string, { s: Supplier; index: number }>()
  let index = 0
  let any = false
  for (const lane of lanesOf(item)) {
    for (const s of lane) {
      if (!s?.id) continue
      index += 1
      if (s.grade) any = true
      const prev = best.get(s.id)
      const g = s.grade
      const pg = prev?.s.grade
      if (!prev) best.set(s.id, { s, index })
      else if (g && (!pg || GRADE_RANK[g.evidenceGrade] > GRADE_RANK[pg.evidenceGrade] || (GRADE_RANK[g.evidenceGrade] === GRADE_RANK[pg.evidenceGrade] && g.evidenceScore > pg.evidenceScore))) best.set(s.id, { s, index: prev.index })
    }
  }
  if (!any) return undefined
  const rank = (s: Supplier) => (s.grade ? GRADE_RANK[s.grade.evidenceGrade] : -1)
  return [...best.values()]
    .sort((a, b) => rank(b.s) - rank(a.s) || Number(Boolean(a.s.grade?.filler)) - Number(Boolean(b.s.grade?.filler)) || (b.s.grade?.evidenceScore ?? -1) - (a.s.grade?.evidenceScore ?? -1) || a.index - b.index)
    .map((x) => x.s)
}

/** The three groups the screen shows when the grade is on: مؤكد، مرجّح، محتمل. */
export function gradeGroups(item: BOQItem): { SURE: Supplier[]; LIKELY: Supplier[]; MAYBE: Supplier[] } | undefined {
  const all = gradedSuppliers(item)
  if (!all) return undefined
  const out = { SURE: [] as Supplier[], LIKELY: [] as Supplier[], MAYBE: [] as Supplier[] }
  for (const s of all) out[s.grade?.evidenceGrade || 'MAYBE'].push(s)
  return out
}

/**
 * The grade's own pick (api supplier-evidence-grade.js pickByGrade): every SURE;
 * LIKELY only while fewer than three are SURE; never MAYBE or a filler.
 */
export const GRADE_SURE_FLOOR = 3
export function autoPickByGrade(item: BOQItem): Supplier[] | undefined {
  if (item.workOnly) return []
  const all = gradedSuppliers(item)
  if (!all) return undefined
  const rejected = new Set(item.rejectedSupplierIds || [])
  const eligible = all.filter((s) => !rejected.has(s.id) && !s.outOfCity)
  const sure = eligible.filter((s) => s.grade?.evidenceGrade === 'SURE')
  if (sure.length >= GRADE_SURE_FLOOR) return sure
  return [...sure, ...eligible.filter((s) => s.grade?.evidenceGrade === 'LIKELY' && !s.grade.filler)]
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
 *   SURE     he priced it in a round, the buyer chose him
 *            before, or the map's reason is his NAME or REGISTERED ACTIVITY
 *            naming the material — and he is not in another city
 *   LIKELY   the map confirmed the material some other way («نشاط متطابق»:
 *            the line's own word in his name, Haraj tags)
 *   MAYBE    «مورد محتمل»: his trade only
 */
export type Confidence = 'SURE' | 'LIKELY' | 'MAYBE'

export function confidenceOf(s: Supplier): Confidence {
  if (s.outOfCity) return 'MAYBE'
  if (s.learned || isPriorQuoter(s)) return 'SURE'
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
  // The grade's rule, only once switched on (shadow until then — see gradeV2Enabled).
  if (gradeV2Enabled()) {
    const byGrade = autoPickByGrade(item)
    if (byGrade) return byGrade
  }
  const all = autoPickFor(item, Number.POSITIVE_INFINITY, context)
  // 5 Oct 2026: the buyer explicitly wants EVERY sure or near-certain match,
  // including the system's named suggestions, regardless of channel or count.
  // A weak earlier lane must not hide stronger evidence for the same business.
  const strongest = new Map<string, Supplier>()
  const outsideCity = new Set<string>()
  const score = (s: Supplier) => ({ SURE: 2, LIKELY: 1, MAYBE: 0 })[confidenceOf(s)]
  const candidates = [
    ...(item.learnedSuggestion?.suppliers || []).map(s => ({ ...s, learned: true })),
    ...lanesOf(item).flat(),
  ]
  for (const s of candidates) {
    if (!s?.id) continue
    if (s.outOfCity) outsideCity.add(s.id)
    const previous = strongest.get(s.id)
    if (!previous || score(s) > score(previous)) strongest.set(s.id, s)
  }
  return all.map(s => strongest.get(s.id) || s).filter(s => !outsideCity.has(s.id) && confidenceOf(s) !== 'MAYBE')
}

export function autoPickFor(item: BOQItem, limit = AUTO_PICK, context?: PickContext): Supplier[] {
  const rejected = new Set(item.rejectedSupplierIds || [])
  const map = item.mapSuggestion?.suppliers || []
  const lanes = [
    map.filter((s) => s.evidence !== ACTIVITY_GRADE),
    item.suppliers,
    item.evidenceSuggestion?.suppliers || [],
    item.aiSuggestion?.suppliers || [],
    map.filter((s) => s.evidence === ACTIVITY_GRADE),
    item.familySuggestion?.suppliers || [],
  ]
  const ordered = [
    ...(item.learnedSuggestion?.suppliers || []),
    ...(item.outcomeSuggestion?.suppliers || []),
    ...lanes.flat().filter(isPriorQuoter),
    ...specialistsFirst(map.filter((s) => s.evidence !== ACTIVITY_GRADE), context),
    ...specialistsFirst(item.suppliers, context),
    ...specialistsFirst(item.evidenceSuggestion?.suppliers || [], context),
    ...specialistsFirst(item.aiSuggestion?.suppliers || [], context),
    ...specialistsFirst(map.filter((s) => s.evidence === ACTIVITY_GRADE), context),
    ...specialistsFirst(item.familySuggestion?.suppliers || [], context),
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
