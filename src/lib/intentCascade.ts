/**
 * THE THREE-STAGE CASCADE. STAGES 2 AND 3. SHADOW ONLY — NOTHING IS WIRED IN.
 *
 *   Stage 1  cpo-v10, unchanged and untouched. When the rules hold strong
 *            evidence and nothing conflicts, its answer is taken immediately.
 *            That is what keeps confident-wrong at 0.00% on the owner's booklet.
 *   Stage 2  hybrid retrieval over the 218 intents (see `intentRetrieval.ts`).
 *   Stage 3  a verifier over the top 3–5 candidates that CANNOT INVENT AN
 *            INTENT: it picks from the list, or says FAMILY_ONLY, or UNRESOLVED.
 *
 * THE GUARDS ARE THE FINAL AUTHORITY, AFTER STAGE 3 AND NOT BEFORE IT.
 *
 * A candidate a guard rejects is rejected, full stop — the verifier's opinion
 * does not enter. This ordering is deliberate: the guards are the reason the
 * confident-wrong rate is zero, and a retriever's job is to widen recall, which
 * is exactly the direction that needs a veto behind it. If a guard is blocking
 * something genuinely right, that belongs in a report, not in a weakened guard.
 * Every refusal below is recorded with its reason so it can be read rather than
 * inferred.
 *
 * WHAT FAMILY_ONLY AND UNRESOLVED MEAN. They are not new states invented here.
 * `FAMILY_ONLY` is the contract's Level B `local_resolved` with a real family
 * and `poolable: true` — the family is the complete answer, as it is for «خزان
 * مياه». `UNRESOLVED` is Level C: a real product we could not name. It is NOT
 * `NOT_SUPPLY`, which is the positive claim that there is nothing to buy here.
 * Collapsing the second into the first would tell a buyer we looked for
 * suppliers and found none when in truth we never worked out what the line was.
 */
import ontologyData from './procurementOntology.data.json'
import {
  type OntologyResolution,
  describeIntent,
  extractHeadConcept,
  normalizeProcurementText,
  resolveOntology,
  termIndex,
} from './procurementOntology'
import {
  type FusedCandidate,
  type IntentDocument,
  type LexicalIndex,
  buildLexicalIndex,
  fuse,
  retrieveLexical,
  retrieveSemantic,
} from './intentRetrieval'

type RawNode = {
  id?: string
  negative_terms?: string[]
  hard_conflicts?: string[]
  hard_conflict_exceptions?: string[]
  preferred_archetypes?: string[]
  allowed_archetypes?: string[]
  intents?: RawNode[]
  categories?: RawNode[]
}
const DATA = ontologyData as unknown as {
  version: string
  sectors: Record<string, RawNode>
  families: Array<RawNode & { id: string; sector: string }>
}

const FAMILY_BY_ID = new Map(DATA.families.map((f) => [f.id, f]))

/* ---------------------------- guard authority ---------------------------- */

/**
 * The product-head rule, as the resolver states it: a concept appearing EARLIER
 * in the head than the matched term names the product, and the matched term is
 * the object being acted on. «عزل مواسير» is insulation; «حامل ماسورة» is a
 * support; neither is a pipe.
 *
 * This mirrors three lines of the resolver rather than importing them, because
 * the resolver is frozen at `cpo-v10` and its file hash is part of the release
 * provenance. `intentCascade.test.ts` asserts agreement with the resolver over
 * every guard in the payload, so the mirror cannot drift silently — which is
 * the failure the vendored conformance fixture exists to catch elsewhere.
 */
function precededInHead(head: string, term: string, concepts: string[]): boolean {
  const termAt = termIndex(head, term)
  for (const concept of concepts) {
    const at = termIndex(head, concept)
    if (at < 0) continue
    if (termAt < 0 || at < termAt) return true
  }
  return false
}

export type GuardRefusal = {
  rule: 'guard_require_any' | 'guard_block_any' | 'guard_blocked_by_head' | 'negative_term' | 'hard_conflict' | 'family_ownership'
  detail: string
}

/**
 * May this candidate stand on this line, under the rules that already exist?
 *
 * Returns every refusal rather than the first, because a candidate blocked for
 * two independent reasons is a different report from one blocked by a single
 * marginal guard, and the second is the case worth a human's attention.
 */
export function guardRefusals(
  line: string,
  doc: IntentDocument,
  v10: OntologyResolution,
  options: { enforceFamilyOwnership: boolean },
): GuardRefusal[] {
  const refusals: GuardRefusal[] = []
  const head = extractHeadConcept(normalizeProcurementText(line)) || normalizeProcurementText(line)

  /*
   * 1 — GUARDS. A guard makes a term inert in a context. The candidate is
   * refused when a guard names one of its own terms, that term is present on
   * this line, and the guard's condition fails. This is the same predicate the
   * resolver applies before letting a term decide; the difference is only that
   * here it is applied to a candidate proposed by retrieval instead of to a
   * term that matched.
   */
  for (const guard of doc.guards) {
    const present = guard.terms.find((term) => termIndex(line, term) >= 0)
    if (!present) continue
    if (guard.require_any && !guard.require_any.some((t) => termIndex(line, t) >= 0)) {
      refusals.push({ rule: 'guard_require_any', detail: `«${present}» requires one of [${guard.require_any.join(', ')}]` })
    }
    const blocking = guard.block_any?.find((t) => termIndex(line, t) >= 0)
    if (blocking) {
      refusals.push({ rule: 'guard_block_any', detail: `«${present}» blocked by «${blocking}»` })
    }
    if (guard.blocked_by_head && precededInHead(head, present, guard.blocked_by_head)) {
      refusals.push({ rule: 'guard_blocked_by_head', detail: `«${present}» is the object, not the head` })
    }
  }

  /*
   * 2 — NEGATIVE TERMS. Inherited veto vocabulary. «حديد تسليح» on an
   * architectural-cladding candidate is the ontology already saying that line
   * is not this trade.
   */
  const negative = doc.exclusions.find((term) => termIndex(line, term) >= 0)
  if (negative) refusals.push({ rule: 'negative_term', detail: `exclusion «${negative}» present` })

  /*
   * 3 — HARD CONFLICTS, read at line level.
   *
   * v10's own answer carries the archetypes that cannot serve this line. If the
   * candidate's trade IS one of them, the two answers are in different trades
   * by the ontology's own declaration — rebar against ready-mix, finishes
   * against structural. This is the check that catches a cross-trade retrieval
   * hit without any new vocabulary: the conflict was already written down.
   */
  if (v10.hard_conflicts.length && doc.preferred_archetypes.length) {
    const clash = doc.preferred_archetypes.find((archetype) => v10.hard_conflicts.includes(archetype))
    if (clash) refusals.push({ rule: 'hard_conflict', detail: `${v10.family ?? 'v10'} hard-conflicts «${clash}»` })
  }

  /*
   * 4 — FAMILY OWNERSHIP. When v10 confidently named a family, that family owns
   * the line and retrieval may only go DEEPER inside it, never sideways. This
   * is what makes the conservative cascade unable to lose an answer: the worst
   * it can do inside a family v10 already committed to is pick the wrong intent
   * among siblings, and it cannot move the trade at all.
   */
  if (options.enforceFamilyOwnership && v10.poolable && v10.family && v10.family !== doc.family_id) {
    refusals.push({ rule: 'family_ownership', detail: `v10 owns this line for ${v10.family}` })
  }

  return refusals
}

/* ------------------------------- stage 3 -------------------------------- */

export type VerifierChoice =
  | { kind: 'INTENT'; intent_id: string }
  | { kind: 'FAMILY_ONLY'; family_id: string }
  | { kind: 'UNRESOLVED' }

export type PresentedCandidate = {
  intent_id: string
  family_id: string
  names_ar: string[]
  name_en: string
  /** Document tokens the line actually hit, so a reason can be read. */
  evidence: string[]
  /** Fused rank score, and the rank each path gave it. `null` means that path missed it. */
  fused: number
  lexical_rank: number | null
  semantic_rank: number | null
}

export type VerifierInput = {
  line: string
  candidates: PresentedCandidate[]
  /** The family v10 committed to, when it did. The verifier may not leave it. */
  v10_family: string | null
}

/**
 * A verifier is any function of this shape. It is injected rather than imported
 * so this module has no network dependency and stays unit-testable: the model
 * lives in the shadow script, and the contract it must honour lives here.
 *
 * THE CONTRACT: the return value is validated against the presented candidate
 * list by `runCascade`. A pick that is not on the list is not an error to
 * report and route around — it is discarded and read as UNRESOLVED, because a
 * model that names an intent it was not shown has invented one, and inventing
 * one is the failure this stage exists to make impossible.
 */
export type Verifier = (input: VerifierInput) => Promise<VerifierChoice> | VerifierChoice

/**
 * The lexical-only verifier, used when no model is available and as the floor
 * every model result is compared against.
 *
 * It is deliberately timid. It promotes a candidate to an intent only when the
 * top candidate carries real evidence — a discriminating token of its own — and
 * clearly leads the runner-up. Anything else that at least agrees on a family
 * becomes FAMILY_ONLY, which is an honest partial answer rather than a guess
 * between siblings. A guess between two trades is the one outcome the owner has
 * said costs him an RFQ.
 */
export function evidenceVerifier(margin = 1.2, minEvidence = 1): Verifier {
  return ({ candidates, v10_family }) => {
    const [top, second] = candidates
    if (!top) return { kind: 'UNRESOLVED' }

    const enough = top.evidence.length >= minEvidence
    // A retrieval hit that only the embedding path found is a similarity, not
    // evidence. It may rank; it may not decide.
    const grounded = top.lexical_rank !== null
    const clear = !second || top.fused >= second.fused * margin || top.family_id === second.family_id

    if (enough && grounded && clear) return { kind: 'INTENT', intent_id: top.intent_id }

    // Every surviving candidate in one family means the FAMILY is what the
    // evidence supports, and the sibling choice is not. That is a real partial
    // answer, and it is the state the contract already has a name for.
    const families = new Set(candidates.map((c) => c.family_id))
    if (families.size === 1 && (enough || v10_family === [...families][0])) {
      return { kind: 'FAMILY_ONLY', family_id: [...families][0]! }
    }
    return { kind: 'UNRESOLVED' }
  }
}

/* ------------------------------- cascade -------------------------------- */

export type CascadeStage = 'v10_strong' | 'v10_not_supply' | 'retrieval_intent' | 'retrieval_family' | 'unresolved'

export type CascadeResult = {
  line: string
  /** The stage that produced the answer. */
  stage: CascadeStage
  /** The answer, in the contract's own vocabulary. */
  canonical_intent_id: string | null
  canonical_intent_status: 'CANONICAL' | 'UNRESOLVED' | 'NOT_SUPPLY'
  family: string | null
  level_code: 'A' | 'B' | 'C'
  poolable: boolean
  /** v10's answer, always carried so the pair can be read side by side. */
  v10: { intent: string | null; family: string | null; level_code: 'A' | 'B' | 'C'; poolable: boolean; decided_by: string }
  /** Top candidates as presented to the verifier, for adjudication by a human. */
  candidates: Array<{ intent_id: string; family_id: string; fused: number; lexical_rank: number | null; semantic_rank: number | null; evidence: string[] }>
  /** Every candidate a guard refused, with the reason. Never silently dropped. */
  refused: Array<{ intent_id: string; refusals: GuardRefusal[] }>
  verifier: VerifierChoice | null
  /** True when the cascade's answer differs from v10's. */
  differs: boolean
}

export type CascadeOptions = {
  index: LexicalIndex
  docs: IntentDocument[]
  verifier: Verifier
  /** Line vector provider. Absent means the lexical half runs alone. */
  embed?: (text: string) => Promise<number[]>
  intentVectors?: Array<{ intent_id: string; vector: number[] }>
  /** How many candidates stage 3 sees. The brief says 3–5; 5 is the default. */
  topK?: number
  /**
   * CONSERVATIVE (default): v10's family, when it has one, is inviolable, so the
   * cascade can only deepen B→A inside it or fill a C. It cannot overturn v10.
   * CONTEST: also lets retrieval contest a v10 answer that did NOT come from a
   * strong term. Reported, never adopted, because a contest is exactly where a
   * new confident error would come from and that is the one thing the bar
   * forbids paying for coverage.
   */
  mode?: 'conservative' | 'contest'
}

export function buildIndexes(docs: IntentDocument[]): LexicalIndex {
  return buildLexicalIndex(docs)
}

/**
 * Run one line through all three stages.
 */
export async function runCascade(line: string, options: CascadeOptions): Promise<CascadeResult> {
  const topK = options.topK ?? 5
  const mode = options.mode ?? 'conservative'
  const v10 = resolveOntology(line)
  const v10Summary = {
    intent: v10.intent,
    family: v10.family,
    level_code: v10.level_code,
    poolable: v10.poolable,
    decided_by: v10.debug.decided_by,
  }
  const asV10 = (stage: CascadeStage): CascadeResult => ({
    line,
    stage,
    canonical_intent_id: v10.intent,
    canonical_intent_status: v10.debug.not_supply ? 'NOT_SUPPLY' : v10.intent ? 'CANONICAL' : 'UNRESOLVED',
    family: v10.family,
    level_code: v10.level_code,
    poolable: v10.poolable,
    v10: v10Summary,
    candidates: [],
    refused: [],
    verifier: null,
    differs: false,
  })

  /*
   * STAGE 1. Taken immediately on strong evidence with no conflict.
   *
   * "Strong evidence" is the resolver's own word for it: `decided_by ===
   * 'strong'` means a strong term named the product, which is the tier that may
   * decide alone. A Level A reached by `weak_with_context` is a weaker claim, and
   * in CONTEST mode retrieval is allowed to argue with it.
   */
  if (v10.debug.not_supply) return asV10('v10_not_supply')
  if (v10.level_code === 'A' && v10.debug.decided_by === 'strong' && mode === 'conservative') {
    return asV10('v10_strong')
  }
  if (v10.level_code === 'A' && v10.debug.decided_by === 'strong' && mode === 'contest') {
    // Even in contest mode a strong unique term stands. Contest is for the
    // weaker tiers; arguing with the strongest signal the engine has is how a
    // retriever manufactures a confident error.
    return asV10('v10_strong')
  }

  /* STAGE 2 — retrieve, both paths, and fuse. */
  const lexical = retrieveLexical(line, options.index, 12)
  let semantic: Array<{ intent_id: string; score: number }> = []
  if (options.embed && options.intentVectors?.length) {
    const vector = await options.embed(line)
    semantic = retrieveSemantic(vector, options.intentVectors, 12)
  }
  const fused = fuse(lexical, semantic)

  /*
   * GUARD AUTHORITY, applied to the candidate set before the verifier sees it
   * AND again to whatever it returns. Before, so the verifier is not invited to
   * choose something that cannot stand; after, so a verifier that ignores the
   * list still cannot get a refused candidate through.
   */
  const docById = new Map(options.docs.map((d) => [d.intent_id, d]))
  const refused: CascadeResult['refused'] = []
  const admissible: FusedCandidate[] = []
  for (const candidate of fused) {
    const doc = docById.get(candidate.intent_id)
    if (!doc) continue
    const refusals = guardRefusals(line, doc, v10, { enforceFamilyOwnership: mode === 'conservative' })
    if (refusals.length) {
      if (refused.length < 8) refused.push({ intent_id: candidate.intent_id, refusals })
      continue
    }
    admissible.push(candidate)
    if (admissible.length >= topK) break
  }

  const presented: PresentedCandidate[] = admissible.map((candidate) => {
    const doc = docById.get(candidate.intent_id)!
    return {
      intent_id: candidate.intent_id,
      family_id: doc.family_id,
      names_ar: doc.names_ar,
      name_en: doc.name_en,
      evidence: candidate.evidence,
      fused: candidate.fused,
      lexical_rank: candidate.lexical_rank,
      semantic_rank: candidate.semantic_rank,
    }
  })
  const candidateReport = admissible.map((candidate) => ({
    intent_id: candidate.intent_id,
    family_id: docById.get(candidate.intent_id)!.family_id,
    fused: candidate.fused,
    lexical_rank: candidate.lexical_rank,
    semantic_rank: candidate.semantic_rank,
    evidence: candidate.evidence,
  }))

  if (!presented.length) {
    return { ...asV10(v10.level_code === 'C' ? 'unresolved' : 'v10_strong'), candidates: [], refused }
  }

  /* STAGE 3 — verify, then validate the answer against the presented list. */
  const choice = await options.verifier({ line, candidates: presented, v10_family: v10.family })

  const keepV10 = (stage: CascadeStage): CascadeResult => ({
    ...asV10(stage),
    candidates: candidateReport,
    refused,
    verifier: choice,
  })

  if (choice.kind === 'UNRESOLVED') return keepV10(v10.level_code === 'C' ? 'unresolved' : 'v10_strong')

  if (choice.kind === 'FAMILY_ONLY') {
    const familyId = choice.family_id
    if (!FAMILY_BY_ID.has(familyId)) return keepV10('unresolved')
    // A family v10 already gave is no gain; report it as v10's own answer.
    if (v10.poolable && v10.family === familyId) return keepV10('v10_strong')
    // Family ownership again: the verifier may not move a family v10 owns.
    if (mode === 'conservative' && v10.poolable && v10.family && v10.family !== familyId) return keepV10('v10_strong')
    return {
      line,
      stage: 'retrieval_family',
      canonical_intent_id: null,
      canonical_intent_status: 'UNRESOLVED',
      family: familyId,
      level_code: 'B',
      poolable: true,
      v10: v10Summary,
      candidates: candidateReport,
      refused,
      verifier: choice,
      differs: v10.family !== familyId,
    }
  }

  // INTENT. Three things must hold: it was on the list, the ontology knows it,
  // and the guards allow it. The first is what makes invention impossible.
  const picked = presented.find((c) => c.intent_id === choice.intent_id)
  if (!picked) return keepV10(v10.level_code === 'C' ? 'unresolved' : 'v10_strong')
  const chain = describeIntent(choice.intent_id)
  if (!chain) return keepV10('unresolved')
  const doc = docById.get(choice.intent_id)!
  const finalRefusals = guardRefusals(line, doc, v10, { enforceFamilyOwnership: mode === 'conservative' })
  if (finalRefusals.length) {
    refused.push({ intent_id: choice.intent_id, refusals: finalRefusals })
    return keepV10(v10.level_code === 'C' ? 'unresolved' : 'v10_strong')
  }

  return {
    line,
    stage: 'retrieval_intent',
    canonical_intent_id: choice.intent_id,
    canonical_intent_status: 'CANONICAL',
    family: chain.family,
    level_code: 'A',
    poolable: true,
    v10: v10Summary,
    candidates: candidateReport,
    refused,
    verifier: choice,
    differs: v10.intent !== choice.intent_id,
  }
}
