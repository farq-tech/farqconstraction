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
 *   SURE     he priced or answered about it in a round, the buyer chose him
 *            before, or the map's reason is his NAME or REGISTERED ACTIVITY
 *            naming the material — and he is not in another city
 *   LIKELY   the map confirmed the material some other way («نشاط متطابق»:
 *            the line's own word in his name, Haraj tags)
 *   MAYBE    «مورد محتمل»: his trade only
 */
export type Confidence = 'SURE' | 'LIKELY' | 'MAYBE'

export function confidenceOf(s: Supplier): Confidence {
  if (s.learned || isPriorQuoter(s)) return 'SURE'
  if (s.roundOutcome && (s.roundOutcome.grade === 'PRICED' || s.roundOutcome.grade === 'ANSWERED')) return 'SURE'
  if (s.outOfCity) return 'MAYBE'
  if (s.evidence === 'نشاط متطابق') {
    const why = s.why || ''
    return why.startsWith('الاسم') || why.startsWith('النشاط المسجّل') || why.startsWith('المادة') ? 'SURE' : 'LIKELY'
  }
  return 'MAYBE'
}

/**
 * Everyone the system is confident about, not a fixed ten.
 *
 * The owner, 3 Oct 2026: «يختار لي كل المطابقين المتوفرين، وإذا كان واتساب
 * يتأكد تأكد كبير جدًا عشان ما تكون تكلفة كبيرة». A message by email or
 * Haraj chat costs nothing, so every LIKELY-or-better match is taken. A
 * WhatsApp template is paid per message, so a WhatsApp-only supplier is taken
 * only when we are SURE. «مورد محتمل» is never taken on his own; the buyer
 * adds him by hand. Rejected suppliers never. Order as autoPickFor.
 */
/**
 * WhatsApp is paid per message, so how many WhatsApp-only sellers the screen
 * ticks by itself depends on what the free channels already cover. The owner,
 * 4 Oct 2026: «واتساب إذا كانت المصادر الأخرى لا يوجد مورد اختر عادي 100–200
 * مب مشكلة، وإذا فيه مليان اختر أفضل 30 لكل بند». A line the free channels
 * already fill (WA_FULL_FREE_PICKS confirmed sellers by e-mail or chat) takes
 * only the best WA_CAP_FULL WhatsApp sellers, in evidence order; a line they
 * leave thin takes up to WA_CAP_THIN. Every seller stays listed and tickable.
 */
export const WA_FULL_FREE_PICKS = 30
export const WA_CAP_FULL = 30
export const WA_CAP_THIN = 200

export function autoPickConfident(item: BOQItem, context?: PickContext): Supplier[] {
  const all = autoPickFor(item, Number.POSITIVE_INFINITY, context)
  const confident = all.filter((s) => {
    const c = confidenceOf(s)
    if (c === 'MAYBE') return false
    if (s.channel === 'واتساب') return c === 'SURE'
    return true
  })
  const free = confident.filter((s) => s.channel !== 'واتساب').length
  const waCap = free >= WA_FULL_FREE_PICKS ? WA_CAP_FULL : WA_CAP_THIN
  let wa = 0
  return confident.filter((s) => (s.channel !== 'واتساب' ? true : ++wa <= waCap))
}

export function autoPickFor(item: BOQItem, limit = AUTO_PICK, context?: PickContext): Supplier[] {
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
  for (const s of ordered) {
    if (!s?.id || seen.has(s.id) || rejected.has(s.id)) continue
    seen.add(s.id)
    chosen.push(s)
    if (chosen.length >= limit) break
  }
  return chosen
}
