/**
 * STAGE 2 OF THE CASCADE — hybrid retrieval over the 218 intents. SHADOW ONLY.
 *
 * Nothing in this file is wired into any production path. It exists to be run
 * alongside `cpo-v10` and measured against it, because the corpora we own
 * cannot see four generations of rule work: `cpo-v6` and `cpo-v10` are
 * byte-identical across all 183,942 archive rows while genuinely differing on
 * the owner's real booklet, and 184,010 archive lines contain only 2,874
 * distinct tokens. A rule engine measured by a blind instrument cannot be
 * improved by more rules.
 *
 * WHY RETRIEVAL RATHER THAN MORE MORPHOLOGY. Every generation closed a real
 * defect and every generation was followed by a new Arabic construction the
 * rules did not cover. That sequence is unbounded by construction: «حريق» →
 * «حرائق» is re-templated at the root and no affix rule reaches it, so the only
 * rule-shaped answer is to list it — one word at a time, forever. Retrieval
 * asks the opposite question: not "does a term of this intent appear in the
 * line" but "which of the 218 intents does this line look most like".
 *
 * THERE IS NO VECTOR DATABASE HERE AND THERE MUST NOT BE. The candidate set is
 * 218 documents. Comparing 218 vectors in memory is a few hundred microseconds;
 * a vector store would add an operational dependency, a sync problem between
 * the payload and the index, and a second place where the ontology's version
 * can drift — the exact failure mode that put v6 in production while v10 sat in
 * the working tree. If a future reader is reaching for one, the honest reason is
 * that the intent count grew by two orders of magnitude, and it has not.
 */
import ontologyData from './procurementOntology.data.json'
import { normalizeProcurementText, termIndex } from './procurementOntology'

/* ---------------------------- payload shapes ---------------------------- */

type RawNode = {
  id?: string
  label_ar?: string
  strong_terms?: string[]
  weak_terms?: string[]
  context_terms?: string[]
  term_guards?: Array<{
    terms: string[]
    require_any?: string[]
    block_any?: string[]
    blocked_by_head?: string[]
    note?: string
  }>
  negative_terms?: string[]
  supplier_terms?: string[]
  preferred_archetypes?: string[]
  allowed_archetypes?: string[]
  hard_conflicts?: string[]
  soft_conflicts?: string[]
  hard_conflict_exceptions?: string[]
  intents?: RawNode[]
  categories?: RawNode[]
  sector?: string
}

const DATA = ontologyData as unknown as {
  version: string
  sectors: Record<string, RawNode & { domain: string }>
  families: Array<RawNode & { id: string; sector: string }>
}

export const RETRIEVAL_PAYLOAD_VERSION = DATA.version

export type TermGuardRule = {
  terms: string[]
  require_any?: string[]
  block_any?: string[]
  blocked_by_head?: string[]
  note?: string
}

/**
 * One intent, as a retrievable document.
 *
 * The fields are separated rather than concatenated into one blob because the
 * lexical path weights them differently and the guard layer reads `exclusions`
 * and `guards` as authority. `text` is the flattened form, and it exists only
 * for the embedding path, which cannot take structure.
 */
export type IntentDocument = {
  intent_id: string
  family_id: string
  category_id: string | null
  sector_id: string
  /** Arabic names, most specific first: intent, category, family. */
  names_ar: string[]
  /** Derived from the id, which is already English snake_case. */
  name_en: string
  /** The intent's own vocabulary, then its ancestors'. */
  synonyms: string[]
  /** Terms no sibling intent in this family shares. These separate within-family. */
  discriminating: string[]
  /** Real lines v10 resolved here, from the archives only. Never the booklet. */
  examples: string[]
  /**
   * Negative evidence, TAKEN FROM THE ONTOLOGY AND NOT INVENTED. Three sources,
   * all already encoded: inherited `negative_terms`, the `block_any` of every
   * guard that names a term this intent owns, and that guard's
   * `blocked_by_head`. Writing a fresh exclusion list here would be a fourth
   * vocabulary to keep in sync with the payload, which is how the supply lane
   * came to be running v6's clause words against a v7 payload.
   */
  exclusions: string[]
  /** The guards that apply to this intent, inherited down the chain. */
  guards: TermGuardRule[]
  preferred_archetypes: string[]
  hard_conflicts: string[]
  /** Flattened document for the embedding path. */
  text: string
}

/* --------------------------- document building --------------------------- */

function chainOf(intentId: string): { sector: RawNode; family: RawNode & { id: string; sector: string }; category: RawNode | null; intent: RawNode } | null {
  for (const family of DATA.families) {
    for (const intent of family.intents || []) {
      if (intent.id === intentId) return { sector: DATA.sectors[family.sector]!, family, category: null, intent }
    }
    for (const category of family.categories || []) {
      for (const intent of category.intents || []) {
        if (intent.id === intentId) return { sector: DATA.sectors[family.sector]!, family, category, intent }
      }
    }
  }
  return null
}

function mergeList(key: 'strong_terms' | 'weak_terms' | 'context_terms' | 'negative_terms' | 'supplier_terms' | 'preferred_archetypes' | 'hard_conflicts', ...nodes: (RawNode | null | undefined)[]): string[] {
  const out: string[] = []
  for (const node of nodes) for (const value of node?.[key] ?? []) out.push(value)
  return [...new Set(out)]
}

function mergeGuards(...nodes: (RawNode | null | undefined)[]): TermGuardRule[] {
  const out: TermGuardRule[] = []
  for (const node of nodes) for (const guard of node?.term_guards ?? []) out.push(guard)
  return out
}

/** `mv_power_cable` → `mv power cable`. The ids already carry the English name. */
function englishName(intentId: string): string {
  return intentId.replace(/_/g, ' ')
}

/**
 * Every intent node in payload order, so the document set has a stable identity
 * that can be hashed and compared across runs.
 */
export function allIntentIds(): string[] {
  const ids: string[] = []
  for (const family of DATA.families) {
    for (const intent of family.intents || []) if (intent.id) ids.push(intent.id)
    for (const category of family.categories || []) {
      for (const intent of category.intents || []) if (intent.id) ids.push(intent.id)
    }
  }
  return ids
}

/**
 * Build the 218 documents.
 *
 * `examples` is supplied by the caller rather than mined here, because the only
 * legitimate source is archive lines that v10 already resolved — and mixing the
 * measurement corpora into the documents would make the shadow run score itself
 * on its own training text. The booklet adjudication in particular is a
 * MEASUREMENT and must never become vocabulary.
 */
export function buildIntentDocuments(examplesByIntent: Map<string, string[]> = new Map()): IntentDocument[] {
  const docs: IntentDocument[] = []

  // Which intents own which term, so "discriminating" is computed rather than
  // asserted. A term shared with a sibling cannot separate this intent from it.
  const ownersWithinFamily = new Map<string, Map<string, Set<string>>>()
  for (const family of DATA.families) {
    const byTerm = new Map<string, Set<string>>()
    const note = (intent: RawNode) => {
      for (const term of [...(intent.strong_terms ?? []), ...(intent.weak_terms ?? [])]) {
        const key = normalizeProcurementText(term)
        if (!key) continue
        if (!byTerm.has(key)) byTerm.set(key, new Set())
        byTerm.get(key)!.add(intent.id!)
      }
    }
    for (const intent of family.intents || []) note(intent)
    for (const category of family.categories || []) for (const intent of category.intents || []) note(intent)
    ownersWithinFamily.set(family.id, byTerm)
  }

  for (const intentId of allIntentIds()) {
    const chain = chainOf(intentId)
    if (!chain) continue
    const { sector, family, category, intent } = chain

    const ownTerms = [...(intent.strong_terms ?? []), ...(intent.weak_terms ?? [])]
    const inheritedTerms = [
      ...(category?.strong_terms ?? []),
      ...(family.strong_terms ?? []),
      ...(category?.weak_terms ?? []),
      ...(family.weak_terms ?? []),
    ]
    const guards = mergeGuards(sector, family, category, intent)

    // Only the guards that actually speak about THIS intent's vocabulary carry
    // negative evidence for it. A guard on a sibling's term says nothing here.
    const ownNormalized = new Set(ownTerms.map((t) => normalizeProcurementText(t)))
    const relevantGuards = guards.filter((g) => g.terms.some((t) => ownNormalized.has(normalizeProcurementText(t))))
    const exclusions = [
      ...mergeList('negative_terms', sector, family, category, intent),
      ...relevantGuards.flatMap((g) => [...(g.block_any ?? []), ...(g.blocked_by_head ?? [])]),
    ]

    const withinFamily = ownersWithinFamily.get(family.id)!
    const discriminating = ownTerms.filter((term) => {
      const owners = withinFamily.get(normalizeProcurementText(term))
      return owners ? owners.size === 1 : false
    })

    const namesAr = [intent.label_ar, category?.label_ar, family.label_ar].filter(Boolean) as string[]
    const examples = examplesByIntent.get(intentId) ?? []

    /*
     * THE EMBEDDING DOCUMENT.
     *
     * Arabic first and Arabic-heaviest, because the lines being matched are
     * Arabic and a document dominated by English ids drifts toward whichever
     * intent has the longest English name. Exclusions are deliberately NOT in
     * the text: an embedding has no negation, so "not metal" reads as "metal"
     * and would pull the mineral-fibre case toward exactly the family it is
     * meant to be kept away from. Exclusions act in the lexical path and in the
     * guard layer, where they can be applied as refusals.
     */
    const text = [
      namesAr.join(' — '),
      englishName(intentId),
      englishName(family.id),
      [...new Set([...ownTerms, ...inheritedTerms])].slice(0, 40).join(' · '),
      examples.slice(0, 6).join(' · '),
    ]
      .filter(Boolean)
      .join('\n')

    docs.push({
      intent_id: intentId,
      family_id: family.id,
      category_id: category?.id ?? null,
      sector_id: family.sector,
      names_ar: namesAr,
      name_en: englishName(intentId),
      synonyms: [...new Set([...ownTerms, ...inheritedTerms])],
      discriminating,
      examples,
      exclusions: [...new Set(exclusions)],
      guards: relevantGuards,
      preferred_archetypes: mergeList('preferred_archetypes', sector, family, category, intent),
      hard_conflicts: mergeList('hard_conflicts', sector, family, category, intent),
      text,
    })
  }
  return docs
}

/* --------------------------- lexical retrieval --------------------------- */

/**
 * ARABIC TOKEN SIMILARITY, AND WHY IT IS NOT AN AFFIX RULE.
 *
 * The rule engine's morphology is a generator: it produces the forms a
 * vocabulary word is allowed to match. That is why broken plurals are out of
 * scope permanently — «حريق» → «حرائق» re-templates the root and no suffix
 * reaches it. Retrieval does not need to generate the form; it needs to notice
 * that two strings are mostly the same letters in the same order. Character
 * bigrams do that: «حريق» and «حرايق» (normalized) share «حر» and «يق», which
 * is enough signal to rank, though not enough to decide — deciding is stage 3's
 * job and the guards'.
 *
 * The three tiers are ordered by how much they can be trusted:
 *   exact      — the same word after normalization
 *   affixal    — a shared prefix with a short tail, which covers ال-, -ات, -ي
 *   templatic  — bigram overlap, which is the only thing that reaches a broken
 *                plural, and the only thing here that can be accidentally right
 */
const AR = /[\u0621-\u064A]/

function bigrams(word: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < word.length - 1; i++) out.add(word.slice(i, i + 2))
  return out
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return (2 * shared) / (a.size + b.size)
}

export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!AR.test(a[0] ?? '') && !AR.test(b[0] ?? '')) {
    // Latin: exact or nothing. A Latin near-match is a different product code
    // far more often than it is the same word, and «RHS» / «CHS» are two
    // steel sections that differ by one letter.
    return 0
  }
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (short.length < 3) return 0
  // AFFIXAL: the shared prefix carries the root. Requiring most of the shorter
  // word keeps «ارض» from reaching «ارضيات», which is a derivation across a
  // trade boundary and cost this system an epoxy flooring line once already.
  if (long.startsWith(short) && long.length - short.length <= 3 && short.length >= 4) return 0.72
  const overlap = dice(bigrams(short), bigrams(long))
  // TEMPLATIC: 0.6 is where «حريق»/«حرايق» and «لوح»/«الواح» land while
  // unrelated same-length Arabic words do not.
  return overlap >= 0.6 ? 0.45 * overlap : 0
}

function tokensOf(text: string): string[] {
  return normalizeProcurementText(text)
    .split(' ')
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t))
}

/** Field weights. Ordered by how directly the field names the product. */
const FIELD_WEIGHT = {
  discriminating: 3.2,
  names_ar: 2.6,
  synonyms: 1.6,
  examples: 0.8,
  name_en: 1.0,
} as const

export type LexicalCandidate = {
  intent_id: string
  score: number
  /** Which document tokens the line actually hit. Reported so a human can read the reason. */
  evidence: string[]
  /**
   * The subset of `evidence` that came from this intent's DISCRIMINATING terms —
   * terms no sibling intent in the family shares.
   *
   * This distinction is load-bearing and the first shadow run is what forced it.
   * Without it the cascade turned «سيراميك حوائط» into `carpet_tile` and «دهان
   * بلاستيك» into `primer_coating`: the evidence was «سيراميك» and «دهان», which
   * are FAMILY vocabulary, so they name the trade and say nothing about which
   * sibling. That produced +25 Level A answers on the booklet that were mostly
   * invented depth, and inventing depth fragments the supplier pool — the exact
   * harm the booklet's ceiling adjudication exists to prevent. It is the
   * three-tier rule's own logic one level down: a term shared with a sibling
   * cannot decide between them.
   */
  discriminating_evidence: string[]
  /** An exclusion term of this intent appears in the line. */
  excluded: boolean
}

export type LexicalIndex = {
  docs: IntentDocument[]
  /** token → inverse document frequency across the 218 documents. */
  idf: Map<string, number>
  fields: Array<{ intent_id: string; byField: Record<keyof typeof FIELD_WEIGHT, string[][]> }>
}

/**
 * Build the lexical index once. 218 documents, so this is a few milliseconds and
 * needs no store.
 */
export function buildLexicalIndex(docs: IntentDocument[]): LexicalIndex {
  const fields: LexicalIndex['fields'] = []
  const documentFrequency = new Map<string, number>()

  for (const doc of docs) {
    const byField = {
      discriminating: doc.discriminating.map(tokensOf),
      names_ar: doc.names_ar.map(tokensOf),
      synonyms: doc.synonyms.map(tokensOf),
      examples: doc.examples.map(tokensOf),
      name_en: [tokensOf(doc.name_en)],
    }
    fields.push({ intent_id: doc.intent_id, byField })
    const seen = new Set<string>()
    for (const phrases of Object.values(byField)) for (const tokens of phrases) for (const token of tokens) seen.add(token)
    for (const token of seen) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
  }

  const idf = new Map<string, number>()
  for (const [token, df] of documentFrequency) idf.set(token, Math.log((docs.length + 1) / (df + 0.5)))
  return { docs, idf, fields }
}

/**
 * Score all 218 documents against one line.
 *
 * A phrase scores by its best-matching tokens, and a multi-word phrase that
 * matches in full scores super-additively — that is the ontology's own
 * observation, encoded in `bestHit`'s length term, that «باب زجاجي» is far
 * stronger evidence than «زجاج».
 */
export function retrieveLexical(line: string, index: LexicalIndex, limit = 12): LexicalCandidate[] {
  const lineTokens = tokensOf(line)
  if (!lineTokens.length) return []
  const lineSet = new Set(lineTokens)

  const out: LexicalCandidate[] = []
  for (const [i, entry] of index.fields.entries()) {
    const doc = index.docs[i]!
    let score = 0
    const evidence = new Set<string>()

    for (const [field, weight] of Object.entries(FIELD_WEIGHT) as Array<[keyof typeof FIELD_WEIGHT, number]>) {
      let fieldBest = 0
      for (const phrase of entry.byField[field]) {
        if (!phrase.length) continue
        let matched = 0
        let phraseScore = 0
        for (const term of phrase) {
          let best = 0
          if (lineSet.has(term)) best = 1
          else for (const token of lineTokens) best = Math.max(best, tokenSimilarity(term, token))
          if (best > 0) {
            matched++
            phraseScore += best * (index.idf.get(term) ?? 1)
            if (best >= 0.7) evidence.add(term)
          }
        }
        if (!matched) continue
        // Full-phrase coverage is the signal; a phrase matched one word out of
        // three is the weak-term case the three-tier rule exists to refuse.
        const coverage = matched / phrase.length
        const value = phraseScore * coverage * (coverage === 1 ? 1.6 : 1)
        fieldBest = Math.max(fieldBest, value)
      }
      score += fieldBest * weight
    }

    if (score <= 0) continue
    const excluded = doc.exclusions.some((term) => termIndex(line, term) >= 0)
    // An exclusion does not delete the candidate here; it is reported and it is
    // the guard layer that refuses. Deleting it silently would hide the case
    // from the disagreement list a human has to adjudicate.
    out.push({ intent_id: doc.intent_id, score: excluded ? score * 0.25 : score, evidence: [...evidence], excluded })
  }

  out.sort((a, b) => b.score - a.score || a.intent_id.localeCompare(b.intent_id))
  return out.slice(0, limit)
}

/* ---------------------------- semantic path ----------------------------- */

export type SemanticCandidate = { intent_id: string; score: number }

export function cosine(a: Float64Array | number[], b: Float64Array | number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (!na || !nb) return 0
  return dot / Math.sqrt(na * nb)
}

/**
 * Compare one line vector against all 218 in memory. This is the whole of the
 * semantic path: a loop over 218 dot products.
 */
export function retrieveSemantic(
  lineVector: number[],
  intentVectors: Array<{ intent_id: string; vector: number[] }>,
  limit = 12,
): SemanticCandidate[] {
  const scored = intentVectors.map((entry) => ({ intent_id: entry.intent_id, score: cosine(lineVector, entry.vector) }))
  scored.sort((a, b) => b.score - a.score || a.intent_id.localeCompare(b.intent_id))
  return scored.slice(0, limit)
}

/* -------------------------------- fusion -------------------------------- */

export type FusedCandidate = {
  intent_id: string
  fused: number
  lexical_rank: number | null
  lexical_score: number
  semantic_rank: number | null
  semantic_score: number
  evidence: string[]
  excluded: boolean
}

/**
 * RECIPROCAL RANK FUSION, chosen because it has no weight to tune.
 *
 * A weighted sum of a lexical score and a cosine would need a coefficient, and
 * the only data available to fit it is the 68-line booklet that is also the
 * measurement — fitting on it would turn the one honest instrument into a
 * training set. RRF reads ranks only, so there is nothing to fit.
 */
export function fuse(
  lexical: LexicalCandidate[],
  semantic: SemanticCandidate[],
  k = 60,
): FusedCandidate[] {
  const byIntent = new Map<string, FusedCandidate>()
  const ensure = (intentId: string) => {
    let entry = byIntent.get(intentId)
    if (!entry) {
      entry = {
        intent_id: intentId,
        fused: 0,
        lexical_rank: null,
        lexical_score: 0,
        semantic_rank: null,
        semantic_score: 0,
        evidence: [],
        excluded: false,
      }
      byIntent.set(intentId, entry)
    }
    return entry
  }

  for (const [i, candidate] of lexical.entries()) {
    const entry = ensure(candidate.intent_id)
    entry.lexical_rank = i + 1
    entry.lexical_score = candidate.score
    entry.evidence = candidate.evidence
    entry.excluded = candidate.excluded
    entry.fused += 1 / (k + i + 1)
  }
  for (const [i, candidate] of semantic.entries()) {
    const entry = ensure(candidate.intent_id)
    entry.semantic_rank = i + 1
    entry.semantic_score = candidate.score
    entry.fused += 1 / (k + i + 1)
  }

  return [...byIntent.values()].sort((a, b) => b.fused - a.fused || a.intent_id.localeCompare(b.intent_id))
}
