/**
 * THE PRODUCER FOR THE CANONICAL INTENT CONTRACT.
 *
 * The API has been able to receive the resolver's answer for some time —
 * `adoptResolution` on the API side is written to take it verbatim, with
 * "pooling eligibility is TAKEN, not computed" written into it. Nothing ever
 * sent one. The field appeared only at the consumption site, with zero
 * producers anywhere, so the API always fell through to its own weaker
 * classification, which speaks a different vocabulary: it calls a wooden door
 * `door_wood` where the ontology calls it `wooden_door`.
 *
 * The consequence was measured rather than guessed: across 2,417 real booklet
 * lines, ZERO reached an intent id the supplier map is keyed on. Nothing
 * errored. Both sides were internally consistent and neither had ever asked
 * the other what it called things.
 *
 * This module is the sender. It is deliberately thin — it resolves the line
 * with the resolver that owns the vocabulary and states the answer in the
 * contract's shape. It does not re-implement any part of the resolution, and
 * it never invents an id.
 */

import { FAMILIES, ONTOLOGY_VERSION, isKnownIntentId, normalizeProcurementText, resolveOntology } from './procurementOntology'

/** Bumped when the wire shape changes in a way the receiver must react to. */
export const CANONICAL_INTENT_CONTRACT_VERSION = 1

export type CanonicalIntentStatus =
  /** An intent id the ontology recognises. The only value that may key the map. */
  | 'CANONICAL'
  /** The resolver looked and could not name this line. Still a real product. */
  | 'UNRESOLVED'
  /** The resolver looked and there is nothing to buy here. */
  | 'NOT_SUPPLY'

/**
 * What travels on the wire for one line.
 *
 * This is the resolver's own resolution, plus one field: `canonical_intent_id`,
 * named explicitly so the identity is a CONTRACT and not a field that happens
 * to line up. The rest is passed through unchanged, because the receiver was
 * built to take it verbatim and any reshaping here would be a second place
 * where the two sides could disagree.
 */
export type OntologyResolutionWire = {
  contract_version: number
  ontology_version: string
  /** An id the ontology recognises, or null. Never a locally-invented name. */
  canonical_intent_id: string | null
  canonical_intent_status: CanonicalIntentStatus
  /**
   * TRUE ONLY WHEN THE RESOLVER SAID SO.
   *
   * Carried because the receiver takes it rather than computing it, which is
   * the correct direction: this side is the one that knows.
   */
  poolable: boolean
  not_supply: boolean
} & Record<string, unknown>

/**
 * Resolve one line into the wire shape.
 *
 * Returns `null` when there is no line text to resolve. Sending nothing is a
 * legitimate state the receiver handles as ABSENT — an explicit "I looked and
 * found nothing" is a different claim and must not be manufactured here.
 */
/**
 * WHAT THE LINE IS, NOT WHAT IS BEING DONE TO IT.
 *
 * Saudi booklets open almost every line with «توريد وتركيب واختبار وتشغيل».
 * Those four words say nothing about the material and they are a third of the
 * sentence, so they drag the match score below its floor: «مغسلة جراحية ستانلس
 * بدون لمس» resolves on its own and resolves to NOTHING with the prefix in
 * front of it. Measured on the owner's hospital booklet, that alone accounted
 * for most of the 56 unrecognised lines out of 66.
 *
 * The prefix is removed for RESOLUTION only. The buyer still sees the line as
 * his booklet printed it.
 */
// «و» may stand apart from its verb: booklets print «توريد و تركيب و اختبار»
// as often as «توريد وتركيب واختبار», and the prefix must go either way.
const SUPPLY_PREFIX =
  /^(?:\s*(?:و\s*)?(?:توريد|تركيب|تنفيذ|اختبار|إختبار|أختبار|تشغيل|ضمان|فحص|صيانة|صيانه|تجهيز|توصيل|أعمال|اعمال|عمل)[\s،:.\/-]*)+/

/**
 * THE LAM-ALEF THE PDF TURNED ROUND.
 *
 * Many booklets are exported with the «لا» ligature written back to front, so
 * «بلاط» arrives as «بالط», «سلالم» as «ساللم» and «كابلات» as «كابالت». The
 * letters are all there, in the wrong order, and no term can match them.
 *
 * A blanket swap would break far more than it fixes: «اعمال» and «اتصال» end in
 * the same two letters and are right as printed. So a word is turned back only
 * when it is NOT a word we know and its turned form IS one. The known words are
 * the ontology's own vocabulary, plus the few connectives a booklet wraps
 * around it. Matching only. The buyer still sees the line as printed.
 */
const PROCLITICS = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف']

const LAM_ALEF_WORDS: Set<string> = (() => {
  const words = new Set<string>([
    'بلاط', 'بلاطات', 'سلالم', 'سلالم', 'كابلات', 'طاولات', 'طاوله', 'توصيلات', 'وصلات',
    'شاملا', 'كاملا', 'لازمه', 'اللازمه', 'اشعه', 'ارضيات', 'انذار', 'الانذار', 'لانهاء',
    'بلاستيك', 'بلاستيكي', 'زلاجه', 'شلال', 'علاقه', 'علامات', 'اغلاق', 'فلاتر', 'بلاك',
  ])
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(collect)
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.endsWith('_terms') && Array.isArray(value)) {
        for (const term of value) {
          for (const word of normalizeProcurementText(String(term)).split(' ')) {
            if (word.length >= 3) words.add(word)
          }
        }
      } else if (typeof value === 'object') collect(value)
    }
  }
  collect(FAMILIES)
  return words
})()

function isKnownWord(word: string): boolean {
  if (LAM_ALEF_WORDS.has(word)) return true
  for (const p of PROCLITICS) {
    if (word.startsWith(p) && word.length - p.length >= 3 && LAM_ALEF_WORDS.has(word.slice(p.length))) return true
  }
  return false
}

function turnLamAlef(word: string): string {
  if (!word.includes('ال') || isKnownWord(word)) return word
  // «األنذار» → «الأنذار»: the article before an alef word, turned round.
  const article = word.replace(/اال/g, 'الا')
  if (article !== word && isKnownWord(article)) return article
  for (let i = 1; i < word.length - 1; i += 1) {
    if (word[i] !== 'ا' || word[i + 1] !== 'ل') continue
    const turned = word.slice(0, i) + 'لا' + word.slice(i + 2)
    if (isKnownWord(turned)) return turned
  }
  return word
}

export function repairLamAlef(text: string): string {
  const normalized = normalizeProcurementText(text)
  return normalized.split(' ').map(turnLamAlef).join(' ')
}

export function forMatching(lineName: string | null | undefined): string {
  const name = String(lineName || '').trim()
  const stripped = repairLamAlef(name).replace(SUPPLY_PREFIX, '').trim()
  // Never strip a line down to nothing: «أعمال الخرسانة» is all prefix and is
  // still the only thing the line says.
  return stripped.length >= 4 ? stripped : repairLamAlef(name)
}

/**
 * THE BOOKLET READER'S KNOWN DAMAGES, UNDONE FOR MATCHING ONLY.
 *
 * Measured on 1,832 production booklet lines (audit cpo-v21, F143–F146), these
 * kinds of reader damage hide a material the resolver knows perfectly well:
 *
 * 1. A list bullet glued to the first letter: «أطفاية حريق», «أرشاشات حريق»,
 *    «أمفتاح فصل». «طفاية حريق» is named; with the bullet it is not.
 * 2. A long work preamble the shorter prefix above does not cover:
 *    «توريد وتركيب وأختبار وتسليم ووضع في الخدمة منظومة إنذار حريق».
 * 3. Two rows joined by the extraction's own « — »: the tail of one item and
 *    the head of the next, or an item and a tail that names nothing
 *    («… كشك خدمة ذاتية — يلزم للتسليم الكامل»).
 * 4. A section's general-requirements paragraph read as a line («متطلبات عامة
 *    أسعار البنود يجب أن تشمل ولا تقتصر على …»): nothing to buy (NOT_SUPPLY).
 *
 * Each repair is tried ONLY when the line as printed is not already named, and
 * kept ONLY when the repaired text resolves strictly better. A line the
 * resolver already names is never re-read. Nothing here is shown to anyone or
 * sent to a supplier: the buyer and the supplier see the booklet's own text.
 */

// Words that open a work preamble. Normalized forms (أ/إ → ا, ة → ه).
const WORK_WORDS =
  'توريد|اتوريد|تركيب|تنفيذ|اختبار|تشغيل|ضمان|الضمان|فحص|صيانه|تجهيز|توصيل|اعمال|عمل|تسليم|التسليم|ضبط|الضبط|معايره|موازنه|الموازنه|اتزان|برمجه|وضع في الخدمه'
const WORK_PREAMBLE = new RegExp(`^(?:\\s*(?:و\\s*)?(?:${WORK_WORDS})(?=\\s|$)\\s*)+`)
const WORK_WORD_SET = new Set(WORK_WORDS.split('|').filter((w) => !w.includes(' ')))

/**
 * «أطفاية» → «طفاية»: the hamza is a bullet the reader glued on. Removed only
 * from a word that STARTS WITH «أ» or «إ» as printed and whose remainder is a
 * word the ontology knows (or a work verb) — so «أكسيد», «أمبير», «أمنية» and
 * «أبواب» stay exactly as printed: «كسيد», «مبير», «منية», «بواب» are not
 * words. A doubled bullet («أاتوريد») loses both letters. The un-glued line is
 * used only when it resolves better than the line as printed.
 */
export function unglueBullets(text: string): string {
  return unglue(text).text
}

function unglue(text: string): { text: string; words: string[] } {
  const known = (raw: string) => {
    const word = normalizeProcurementText(raw)
    return !word.includes(' ') && (isKnownWord(word) || WORK_WORD_SET.has(word))
  }
  const words: string[] = []
  const out = String(text || '')
    .split(/(\s+)/)
    .map((token) => {
      if (!/^[أإ][\u0621-\u064A]{3,}/.test(token)) return token
      const once = token.slice(1)
      const rest = known(once) ? once : /^[اأإ]/.test(once) && once.length >= 4 && known(once.slice(1)) ? once.slice(1) : null
      if (!rest) return token
      words.push(normalizeProcurementText(rest))
      return rest
    })
    .join('')
  return { text: out, words }
}

type Reread = { text: string; fix: string; resolution: ReturnType<typeof resolveOntology> }

const rankOf = (r: ReturnType<typeof resolveOntology>): number => {
  if (r.debug?.not_supply === true || r.intent === 'not_supply') return -1
  if (r.intent && isKnownIntentId(r.intent)) return 2
  return r.family ? 1 : 0
}

/** The text the resolver reads for one booklet fragment, with the reader's damage undone. */
function rereadText(raw: string): { text: string; fixes: string[]; unglued: string[] } {
  const fixes: string[] = []
  let text = raw
  const unglued = unglue(text)
  if (unglued.text !== text) {
    fixes.push('glued_bullet')
    text = unglued.text
  }
  const matched = forMatching(text)
  const stripped = matched.replace(WORK_PREAMBLE, '').trim()
  if (stripped !== matched && stripped.length >= 4) {
    fixes.push('work_preamble')
    return { text: stripped, fixes, unglued: unglued.words }
  }
  return { text: matched, fixes, unglued: unglued.words }
}

/**
 * An un-glued word must be the one that named the line: «أطفاية» → «طفاية»
 * counts when «طفاية حريق» is the term that decided. Un-gluing a word the
 * decision never used («أجدار» → «جدار» in a line named by «العزل») proves
 * nothing about the line and is not kept. A bullet glued to the work verb
 * («أاتوريد») counts when the preamble it opened was then removed.
 */
function ungluedWordDecided(unglued: string[], fixes: string[], resolution: ReturnType<typeof resolveOntology>): boolean {
  if (!unglued.length) return true
  if (fixes.includes('work_preamble') && unglued.some((w) => WORK_WORD_SET.has(w))) return true
  const term = normalizeProcurementText(String(resolution.debug?.matched_term || '')).split(' ')
  return unglued.some((w) => term.includes(w))
}

/** «باب دوار احادي …» opens with its term «باب دوار»; «غرفة الإسعافات الأولية» does not. */
function opensWithItsMaterial(read: Reread): boolean {
  const term = String((read.resolution.debug as { matched_term?: unknown } | undefined)?.matched_term || '')
  const first = normalizeProcurementText(term).split(' ')[0] || ''
  const opening = normalizeProcurementText(read.text).split(' ')[0] || ''
  return first.length >= 3 && opening.startsWith(first)
}

/** A fragment that starts an item of its own: «توريد وتركيب …» anywhere in its first words. */
function isItemOfItsOwn(part: string): boolean {
  return /(^|\s)(?:[اأإ]?توريد|تركيب)(?=\s|$)/.test(normalizeProcurementText(part).split(' ').slice(0, 4).join(' '))
}

/**
 * «متطلبات عامة — أسعار البنود يجب أن تشمل ولا تقتصر على …»: the paragraph a
 * section opens with, read as a line. All three marks must be there.
 */
export function isGeneralRequirements(text: string): boolean {
  const t = normalizeProcurementText(text)
  return /متطلبات/.test(t) && /(^|\s)اسعار(?=\s|$)/.test(t) && /ولا\s*تقتصر/.test(t)
}

/**
 * The best re-reading of a line the resolver could not name as printed, or
 * null when no repair names it better. `base` is the rank of the line as
 * printed; a repair must beat it.
 */
function rereadLine(name: string, base: ReturnType<typeof resolveOntology>): Reread | null {
  const baseRank = rankOf(base)
  const tryText = (raw: string, extra: string[] = []): Reread | null => {
    const { text, fixes, unglued } = rereadText(raw)
    if (!fixes.length && !extra.length) return null
    const resolution = resolveOntology(text)
    // A bullet repair that did not decide the answer is no repair: read the
    // fragment without it rather than credit it.
    if (!ungluedWordDecided(unglued, fixes, resolution)) {
      if (!extra.length) return null
      const plain = forMatching(raw)
      return { text: plain, fix: extra.join('+'), resolution: resolveOntology(plain) }
    }
    return { text, fix: [...extra, ...fixes].join('+'), resolution }
  }

  // 1 — the whole line, bullet and preamble undone.
  const whole = tryText(name)
  if (whole && rankOf(whole.resolution) === 2) return whole
  let best = whole && rankOf(whole.resolution) > baseRank ? whole : null

  // 2 — two rows the extraction joined with its own « — ». Each part is read on
  // its own. A part is kept only when (a) it OPENS with the material it names —
  // «باب دوار …», not «وكابلات الألياف …» or «مثبتة على الحائط لنقاط الوصول …»,
  // which are the tail of some other row — (b) no other part names a different
  // material, and (c) no other part is an item of its own («توريد وتركيب …»):
  // two items in one line cannot be told apart, so the line stays as it was.
  const parts = name.split(/\s+—\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const reads = parts.map((part) => tryText(part, ['merged_row'])!)
    const canonical = reads.filter((r) => rankOf(r.resolution) === 2)
    const pickFrom = (rank: number) => {
      const ranked = reads.filter((r) => rankOf(r.resolution) === rank)
      const keys = new Set(ranked.map((r) => (rank === 2 ? r.resolution.intent : r.resolution.family)))
      // A line already placed in a family stays in it: a fragment of another
      // row must never carry it into a different trade.
      const headed = ranked.filter((r) => opensWithItsMaterial(r) && (!base.family || r.resolution.family === base.family))
      if (keys.size !== 1 || !headed.length) return null
      const others = parts.filter((_, i) => !ranked.includes(reads[i]))
      if (others.some(isItemOfItsOwn)) return null
      return headed[0]
    }
    if (canonical.length) {
      const picked = pickFrom(2)
      if (picked) return picked
    } else if (Math.max(baseRank, best ? rankOf(best.resolution) : 0) < 1) {
      const picked = pickFrom(1)
      if (picked) best = picked
    }
  }
  return best && rankOf(best.resolution) > baseRank ? best : null
}

export function buildOntologyResolution(lineName: string | null | undefined): OntologyResolutionWire | null {
  const name = String(lineName || '').trim()
  if (!name) return null

  let resolution = resolveOntology(forMatching(name))
  let reread: Reread | null = null
  if (rankOf(resolution) < 2 && rankOf(resolution) >= 0) {
    if (isGeneralRequirements(name)) {
      // A section's general-requirements paragraph: there is nothing to buy.
      reread = { text: resolution.debug.normalized, fix: 'boilerplate', resolution }
      resolution = {
        ...resolution,
        sector: null,
        family: null,
        category: null,
        intent: null,
        poolable: false,
        pool_key: null,
        cache_key: null,
        ai_eligible: false,
        debug: { ...resolution.debug, not_supply: true },
      }
    } else {
      reread = rereadLine(name, resolution)
      if (reread) resolution = reread.resolution
    }
  }

  /*
   * THREE DISTINCT OUTCOMES, AND THEY MUST STAY DISTINCT.
   *
   * `NOT_SUPPLY` is a positive statement that there is nothing to buy — a
   * heading, a preamble, a subtotal. `UNRESOLVED` says the opposite: this is a
   * real product we could not identify. Collapsing the second into the first
   * would tell a buyer we checked for suppliers and found none, when in truth
   * we never worked out what the line was.
   */
  const notSupply = resolution.debug?.not_supply === true || resolution.intent === 'not_supply'
  const canonical =
    !notSupply && resolution.intent && isKnownIntentId(resolution.intent) ? resolution.intent : null

  return {
    ...resolution,
    contract_version: CANONICAL_INTENT_CONTRACT_VERSION,
    ontology_version: ONTOLOGY_VERSION,
    canonical_intent_id: canonical,
    canonical_intent_status: notSupply ? 'NOT_SUPPLY' : canonical ? 'CANONICAL' : 'UNRESOLVED',
    poolable: resolution.poolable === true,
    not_supply: notSupply,
    // What the resolver read instead of the printed line, and why. Matching
    // only: the line itself is sent and shown exactly as the booklet printed it.
    ...(reread ? { reader_reread: { text: reread.text, fix: reread.fix } } : {}),
  }
}

/**
 * Attach the resolver's answer to a set of request lines.
 *
 * Kept as a helper rather than inlined at each call site so that a new caller
 * cannot accidentally ship the un-resolved shape — which is exactly how the
 * field came to have a consumer and no producer.
 */
export function withOntologyResolution<T extends { farq_spec_id?: string; name_ar?: string; name_en?: string }>(
  lines: T[],
): Array<T & { ontology_resolution: OntologyResolutionWire | null }> {
  return lines.map((line) => ({
    ...line,
    ontology_resolution: buildOntologyResolution(line.name_ar || line.name_en),
  }))
}
