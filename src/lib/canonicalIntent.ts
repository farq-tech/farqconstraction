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

import { ONTOLOGY_VERSION, isKnownIntentId, resolveOntology } from './procurementOntology'

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
const SUPPLY_PREFIX =
  /^(?:\s*(?:و?توريد|و?تركيب|و?تنفيذ|و?اختبار|و?إختبار|و?تشغيل|و?ضمان|و?فحص|و?صيانة|و?صيانه|و?تجهيز|أعمال|اعمال|عمل)[\s،:.-]*)+/

export function forMatching(lineName: string | null | undefined): string {
  const name = String(lineName || '').trim()
  const stripped = name.replace(SUPPLY_PREFIX, '').trim()
  // Never strip a line down to nothing: «أعمال الخرسانة» is all prefix and is
  // still the only thing the line says.
  return stripped.length >= 4 ? stripped : name
}

export function buildOntologyResolution(lineName: string | null | undefined): OntologyResolutionWire | null {
  const name = String(lineName || '').trim()
  if (!name) return null

  const resolution = resolveOntology(forMatching(name))

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
