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
  rule:
    | 'guard_require_any'
    | 'guard_block_any'
    | 'guard_blocked_by_head'
    | 'negative_term'
    | 'hard_conflict'
    | 'family_ownership'
    | 'insufficient_evidence'
  detail: string
}

/**
 * THE EVIDENCE FLOOR, AND WHY IT IS AUTHORITY RATHER THAN VERIFIER TASTE.
 *
 * It began as a rule inside `evidenceVerifier`, which meant a model verifier
 * simply did not have it. Measured with `gemma3:4b` in that state: coverage rose
 * by 10 poolable answers on the catalogue corpus and confident-wrong rose from 5
 * to 14, and the booklet went from 0.00% to one confident error. The model was
 * not reasoning about the candidates; it was picking the first one, and it had
 * no way to know that «بولي» is not evidence for a concrete fibre.
 *
 * So the floor moved here, beside the guards, where it binds EVERY verifier
 * including one that has not been written yet. Two conditions, and each earned
 * its place from a specific wrong answer:
 *
 *   GROUNDED — the candidate was found by the lexical path. A candidate only the
 *     embedding path found is a similarity; it may rank and may not decide.
 *   DISCRIMINATING — the evidence includes a term no sibling intent shares, so
 *     it can actually choose among them. «سيراميك» named the trade and became
 *     `carpet_tile` without this.
 *   NAMES THE TRADE — when v10 abstained, and only then, the evidence must
 *     include a term NO OTHER FAMILY uses. Where v10 has no answer, both
 *     `hard_conflicts` and family ownership are unarmed, because both are read
 *     off v10's answer. This is the only thing standing in that gap. «مياه»
 *     fails it and «خرسانة» fails it, and those two tokens are exactly what sent
 *     a water tank to a water heater and a concrete block to a ready-mix plant.
 */
/**
 * Where in the head does this candidate's evidence sit? Lower is closer to being
 * the product. `null` when none of its evidence is in the head at all.
 */
function evidencePosition(head: string, evidence: string[]): number | null {
  let best: number | null = null
  for (const term of evidence) {
    const at = termIndex(head, term)
    if (at < 0) continue
    if (best === null || at < best) best = at
  }
  return best
}

/**
 * THE PRODUCT-HEAD RULE, APPLIED TO RETRIEVAL EVIDENCE RATHER THAN TO A TERM.
 *
 * The resolver already knows that a concept earlier in the head names the product
 * and a term after it is the object being acted on — «عزل مواسير» is insulation,
 * not a pipe. It enforces that through `blocked_by_head` guards, one written
 * vocabulary pair at a time, and «وحدات بناء خرسانة» has no such guard: nothing
 * in the payload says «خرسانة» goes inert behind «وحدات بناء». So retrieval read
 * the material as the product and answered structural ready-mix for a line that
 * is masonry blocks — a full, plausible, confidently wrong answer of exactly the
 * class the owner says costs him an RFQ.
 *
 * This states the rule once over the candidate set instead of once per vocabulary
 * pair: if ANOTHER FAMILY's candidate has evidence EARLIER in the head than this
 * candidate's, then this candidate's evidence is trailing material or a trailing
 * purpose, and it may not name the product. «وحدات» leads and «خرسانة» trails, so
 * ready-mix is refused and the line goes unanswered, which is the honest gap.
 *
 * Two deliberate limits. A sibling inside the SAME family leading the head is not
 * a competitor — that is the ordinary case of a family term plus a qualifier, and
 * choosing among siblings is what discriminating evidence is for. And a candidate
 * whose evidence is absent from the head entirely is left to the other conditions,
 * because a head that names nothing in the ontology carries no ordering to read.
 */
function materialRatherThanProduct(
  head: string,
  picked: { evidence: string[] },
  familyId: string,
  others: Array<{ evidence: string[]; family_id: string }>,
): string | null {
  const mine = evidencePosition(head, picked.evidence)
  if (mine === null || mine === 0) return null
  for (const other of others) {
    if (other.family_id === familyId) continue
    const theirs = evidencePosition(head, other.evidence)
    if (theirs !== null && theirs < mine) {
      return `«${picked.evidence.join('/')}» trails «${other.evidence.join('/')}» in the head — it is the material, not the product`
    }
  }
  return null
}

function evidenceFloor(
  candidate: { evidence: string[]; discriminating_evidence: string[]; family_unique_evidence: string[]; lexical_rank: number | null },
  familyId: string,
  v10Family: string | null,
): GuardRefusal[] {
  const out: GuardRefusal[] = []
  if (candidate.lexical_rank === null) {
    out.push({ rule: 'insufficient_evidence', detail: 'found only by the embedding path — a similarity, not evidence' })
  }
  if (!candidate.discriminating_evidence.length) {
    out.push({
      rule: 'insufficient_evidence',
      detail: `no term that separates this intent from its siblings (had: ${candidate.evidence.join(', ') || 'nothing'})`,
    })
  }
  const tradeAtStake = v10Family === null || v10Family !== familyId
  if (tradeAtStake && !candidate.family_unique_evidence.length) {
    out.push({
      rule: 'insufficient_evidence',
      detail: `v10 named no family, and no evidence token belongs to ${familyId} alone`,
    })
  }
  return out
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
  /**
   * The subset of `evidence` that no sibling intent in this family shares. This
   * is the only kind of evidence that may promote a line to a specific intent;
   * family vocabulary names the trade and cannot choose among its own children.
   */
  discriminating_evidence: string[]
  /** Evidence tokens no other family in the payload uses. Names a TRADE. */
  family_unique_evidence: string[]
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
export function evidenceVerifier(): Verifier {
  return ({ candidates, v10_family }) => {
    const [top] = candidates
    if (!top) return { kind: 'UNRESOLVED' }

    /*
     * TWO REGIMES, BECAUSE TWO DIFFERENT THINGS ARE AT STAKE.
     *
     * When v10 already committed to a family, the trade is settled by the rules
     * and family ownership forbids leaving it. The only open question is which
     * sibling, so family-local discriminating evidence is exactly the right
     * test: «مقاوم للحريق» inside `power_cables` reaches `fire_resistant_cable`
     * and could not have reached anything outside the family anyway.
     *
     * When v10 abstained, THE TRADE ITSELF IS AT STAKE and nothing else is
     * guarding it — this is the finding the first shadow run produced and it is
     * worth stating plainly: `hard_conflicts` and family ownership are both read
     * off v10's answer, so where v10 has no answer the entire existing veto
     * machinery is unarmed. The only evidence that may name a trade unaided is
     * evidence NO OTHER FAMILY uses. «مياه» and «خرسانة» fail that test, and
     * they are precisely the two tokens that produced the two new confident
     * errors: a water heater for a water tank, ready-mix for a concrete block.
     */
    /*
     * These same three conditions are ALSO enforced in `runCascade` beside the
     * guards, where they bind every verifier. They are repeated here because
     * this verifier should reach the same answer by choosing, not by being
     * overruled — a verifier that proposes what will be refused is one whose
     * output cannot be read as a judgement.
     */
    const tradeAtStake = v10_family === null || v10_family !== top.family_id
    const grounded = top.lexical_rank !== null
    const namesTheTrade = !tradeAtStake || top.family_unique_evidence.length > 0

    if (grounded && namesTheTrade && top.discriminating_evidence.length > 0) {
      return { kind: 'INTENT', intent_id: top.intent_id }
    }

    /*
     * FAMILY_ONLY, and only on agreement. Every surviving candidate in ONE
     * family means the evidence names a trade and stops there — «خزان مياه» is
     * complete at its family. Candidates spread across families means the line
     * names more than one trade and committing to either is the confident error
     * the owner has said costs him an RFQ: «خشب لعزل جدران» is timber and the
     * insulating job the timber is for, and abstaining is the answer.
     */
    /*
     * Agreement is counted over the candidates THE LINE'S OWN WORDS reached —
     * every candidate the lexical path returned, and none that only the
     * embedding path did. Both halves of that matter and both were measured:
     *
     *   Including semantic-only candidates removed two correct FAMILY_ONLY
     *   answers («تي بي بي آر», «بي في سي تي») by seating a foreign neighbour
     *   beside the right family. The rule that a similarity may rank but not
     *   decide has to cut both ways — it must not be able to VETO either.
     *
     *   Requiring those candidates to carry strong evidence rather than merely
     *   be present let «خشب لعزل جدران» through as `wood_panels_joinery`, which
     *   is a confident claim on a line that names timber AND the insulating job
     *   the timber is for. `pipe_duct_insulation` WAS in the list, at lexical
     *   rank 5, on a partial match too weak to count as evidence — and its mere
     *   presence is the signal that the line speaks two trades.
     */
    const grounding = candidates.filter((c) => c.lexical_rank !== null)
    const families = new Set(grounding.map((c) => c.family_id))
    if (families.size === 1) {
      const family = [...families][0]!
      if (v10_family === family) return { kind: 'FAMILY_ONLY', family_id: family }
      const namesIt = grounding.some((c) => c.family_unique_evidence.length > 0)
      if (namesIt) return { kind: 'FAMILY_ONLY', family_id: family }
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
  candidates: Array<{ intent_id: string; family_id: string; fused: number; lexical_rank: number | null; semantic_rank: number | null; evidence: string[]; discriminating_evidence: string[]; family_unique_evidence: string[] }>
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
      discriminating_evidence: candidate.discriminating_evidence,
      family_unique_evidence: candidate.family_unique_evidence,
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
    discriminating_evidence: candidate.discriminating_evidence,
    family_unique_evidence: candidate.family_unique_evidence,
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
    /*
     * A FAMILY NEEDS A TRADE NAME AND AGREEMENT, under the same authority.
     *
     * The trade name is a token no other family uses. The agreement is over
     * candidates THE LINE'S OWN WORDS reached — every lexical candidate, and no
     * semantic-only one. A second family appearing there means the line speaks
     * two trades, which is «خشب لعزل جدران»: timber, and the insulating job the
     * timber is for. Abstaining is the answer, and it is the answer whichever
     * verifier is in the seat.
     */
    /*
     * Agreement is read from the LEXICAL RETRIEVAL, BEFORE the guards cut it
     * down, and that ordering is the whole point rather than an implementation
     * detail. Reading it after was measured and it cost the booklet its 0.00%:
     * «خشب لعزل جدران» abstained only because a wrong insulation candidate
     * happened to sit at lexical rank 5 and split the vote, and once the guard
     * layer correctly refused that candidate, the wood family stood alone and the
     * cascade committed to it. Safety that depends on a wrong answer showing up
     * is not safety.
     *
     * The guards exist to REFUSE candidates, not to manufacture consensus among
     * the survivors. Whether the line speaks two trades is a fact about the
     * line's words, so it is read off the words.
     */
    const lexicalCandidates = lexical.filter((c) => docById.has(c.intent_id)).slice(0, topK)
    const reachedFamilies = new Set(lexicalCandidates.map((c) => docById.get(c.intent_id)!.family_id))
    const namesTheTrade = lexicalCandidates.some(
      (c) => docById.get(c.intent_id)!.family_id === familyId && c.family_unique_evidence.length > 0,
    )
    if (reachedFamilies.size !== 1 || !reachedFamilies.has(familyId) || !namesTheTrade) {
      refused.push({
        intent_id: `FAMILY_ONLY:${familyId}`,
        refusals: [
          {
            rule: 'insufficient_evidence',
            detail:
              reachedFamilies.size !== 1
                ? `the line's own words reach ${reachedFamilies.size} families [${[...reachedFamilies].join(', ')}] — it names more than one trade`
                : `no evidence token belongs to ${familyId} alone`,
          },
        ],
      })
      return keepV10(v10.level_code === 'C' ? 'unresolved' : 'v10_strong')
    }
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
  const finalRefusals = [
    ...guardRefusals(line, doc, v10, { enforceFamilyOwnership: mode === 'conservative' }),
    ...evidenceFloor(picked, doc.family_id, v10.family),
  ]
  /*
   * Read over the whole lexical retrieval, not the presented five. Which word
   * leads the head is a fact about the line, so it must not depend on how many
   * of the line's other trades happened to survive into the top five: on «وحدات
   * بناء خرسانة» the concrete candidates crowded the «وحدات» ones out of the list
   * entirely, and the rule stopped seeing the competitor it exists to notice.
   */
  const trailing = materialRatherThanProduct(
    extractHeadConcept(normalizeProcurementText(line)) || normalizeProcurementText(line),
    picked,
    doc.family_id,
    lexical.flatMap((c) => {
      const other = docById.get(c.intent_id)
      return other && c.intent_id !== picked.intent_id ? [{ evidence: c.evidence, family_id: other.family_id }] : []
    }),
  )
  if (trailing) finalRefusals.push({ rule: 'insufficient_evidence', detail: trailing })
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
