/**
 * Compositional Procurement Ontology (CPO) — resolver cascade.
 *
 *   BOQ LINE → Normalization → Lexicon/Dictionary → Family Resolver → Intent Resolver
 *           → Facet Extraction → Supplier Archetypes → Veto/Negative Rules → Retrieval
 *
 * Division of responsibility:
 *   Dictionary = the language · Ontology = the thing · Facets = the specs
 *   Supplier archetypes = who sells it · Veto = who cannot sell it
 *
 * Four EXPLICIT levels on every resolution: sector → family → category → intent.
 *
 * Three-tier term rule (enforced here, not only in the data):
 *   - a STRONG term may decide on its own
 *   - a WEAK term may decide only together with a CONTEXT term
 *   - a WEAK term alone NEVER decides
 *
 * Terms, archetypes and veto rules INHERIT down sector → family → category →
 * intent. An intent adds only its own exceptions, so tightening one sector does
 * not mean editing hundreds of entries.
 */
import ontologyData from './procurementOntology.data.json'

/* ------------------------------ types ---------------------------------- */

/**
 * THREE levels. This is the contract the AI gate and the retrieval lane both
 * read, so it must not grow a fourth member.
 *
 *   A = specific_intent — exact intent
 *   B = family          — family resolved, usable WITHOUT AI
 *   C = unresolved      — unresolved locally; AI runs only here, and only after
 *                         every local attempt has failed
 */
/**
 * The B value is `local_resolved`, NOT `family`.
 *
 * It used to be `family`, and that name was a lie: a semantic-recovery line is
 * Level B yet carries `family === null`. Two sibling lanes read `level` and
 * reached opposite conclusions from it — one counted B as 384, the other as 329
 * — so the field is now named after what it actually guarantees (resolved
 * locally, no model needed) rather than after a field that may be null.
 *
 * To decide whether a line has a real family to pool on, read `poolable`.
 */
export type ResolutionLevel = 'specific_intent' | 'local_resolved' | 'unresolved'

/** A/B/C, so a consumer never has to pattern-match on the value strings. */
export type LevelCode = 'A' | 'B' | 'C'

/**
 * Metadata *inside* Level C. These are not levels: every C line is unresolved,
 * and these fields only describe what happened to it after that.
 *   ai_eligible — lexical AND ontology AND semantic resolution all failed, so
 *                 the model may be called
 *   rejected    — nothing identifiable (or not a supply line); never sent
 *
 * There is no `semantic_recovered` bucket: a successful local semantic recovery
 * terminates locally and is Level B, never C.
 */
export type UnresolvedBucket = 'ai_eligible' | 'rejected'

export type AiResult = 'accepted' | 'rejected' | 'not_run'

/**
 * HOW a line resolved. On Level B this distinguishes a decisive ontology match
 * from a semantic recovery — the distinction stays visible without becoming a
 * separate level.
 */
export type ResolutionSource =
  | 'lexicon'
  | 'ontology_intent'
  | 'ontology_family'
  | 'semantic_recovery'
  | 'ai'
  | 'unresolved'

export type DecisionTier = 'strong' | 'weak_with_context' | 'none'

export type FacetValues = Record<string, string>

export type ResolvedFacet = { name: string; value: string; supplier_pool_affecting: boolean }

export type OntologyResolution = {
  level: ResolutionLevel
  source: ResolutionSource
  /** A/B/C for the same `level`, so no lane parses value strings. */
  level_code: LevelCode
  /**
   * True only when a CONFIDENT family or intent was resolved, i.e. `pool_key`
   * is set. This is the flag that governs CONSUMPTION: only a poolable line may
   * key a supplier pool, a cache entry, or `intent_supplier_map`. A Level B
   * semantic recovery is `poolable: false` — it reports as resolved and costs
   * no AI call, but it must never pin a supplier pool to a guessed trade.
   */
  poolable: boolean
  /** The four explicit levels. */
  sector: string | null
  family: string | null
  category: string | null
  intent: string | null
  domain: string
  facets: FacetValues
  resolved_facets: ResolvedFacet[]
  /** Only pool-affecting facets belong in a retrieval / cache key. */
  pool_affecting_facets: FacetValues
  search_terms: string[]
  supplier_terms: string[]
  preferred_archetypes: string[]
  allowed_archetypes: string[]
  soft_conflicts: string[]
  hard_conflicts: string[]
  negative_terms: string[]
  confidence: number
  raw: string
  head_concept: string
  /** Batch dedupe key: intent when specific, else family. */
  pool_key: string | null
  /** Cache key for the sibling AI/cache lane: version + pool + pool-affecting facets. */
  cache_key: string | null
  /** Level C metadata. `null` on Level A and B — those never reach the model. */
  unresolved_bucket: UnresolvedBucket | null
  /** The AI gate reads this. True only inside Level C. */
  ai_eligible: boolean
  /** Every Level C line has had the local semantic pass run on it first. */
  semantic_attempted: boolean
  ai_result: AiResult
  debug: {
    normalized: string
    matched_term: string | null
    decided_by: DecisionTier
    elapsed_ms: number
    not_supply?: boolean
    /** Set when the chain was derived upward from a unique strong intent term. */
    derived_from_intent?: string
  }
}

type TermTiers = {
  strong_terms?: string[]
  weak_terms?: string[]
  context_terms?: string[]
}

type ArchetypeRules = {
  preferred_archetypes?: string[]
  allowed_archetypes?: string[]
  soft_conflicts?: string[]
  hard_conflicts?: string[]
  hard_conflict_exceptions?: string[]
  soft_conflict_exceptions?: string[]
  negative_terms?: string[]
  supplier_terms?: string[]
}

type FacetRef = { name: string; supplier_pool_affecting?: boolean }

type RawFacet = {
  kind: 'enum' | 'measure'
  label_ar: string
  supplier_pool_affecting?: boolean
  pattern?: string
  values?: Record<string, string[]>
}

type RawIntent = TermTiers &
  ArchetypeRules & {
    id: string
    label_ar?: string
    requires?: string[]
    facets?: FacetRef[]
    confidence?: number
  }

type RawCategory = TermTiers &
  ArchetypeRules & {
    id: string
    label_ar?: string
    facets?: FacetRef[]
    intents?: RawIntent[]
  }

type RawFamily = TermTiers &
  ArchetypeRules & {
    id: string
    sector: string
    label_ar?: string
    facets?: FacetRef[]
    categories?: RawCategory[]
    intents?: RawIntent[]
  }

type RawSector = TermTiers & ArchetypeRules & { domain: string }

const DATA = ontologyData as unknown as {
  version: string
  learning: { promote_after_occurrences: number }
  archetypes: Record<string, { label_ar: string; patterns: string[] }>
  facets: Record<string, RawFacet>
  sectors: Record<string, RawSector>
  families: RawFamily[]
}

export const ONTOLOGY_VERSION = DATA.version
export const ARCHETYPES = DATA.archetypes
export const FAMILIES = DATA.families
export const SECTORS = DATA.sectors
export const FACET_DEFS = DATA.facets

/* --------------------------- normalization ------------------------------ */

const ARABIC_INDIC = /[\u0660-\u0669]/g

/** Matching-only normalization. Never rewrites the buyer's visible line. */
export function normalizeProcurementText(text: string): string {
  return String(text || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[×xX*ｘ]/g, 'x')
    .replace(/[-–—_/\\،,.:;()[\]{}"'“”«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const LEAD_VERBS =
  /^(?:و?توريد\s+وتركيب|و?توريد|و?تركيب|و?تنفيذ|اعمال|عمل|شراء|supply\s+and\s+install|supply\s*&\s*install|supply|install(?:ation)?\s+of|install)\s+/

const PURE_SERVICE =
  /(?:اجور\s*تركيب\s*فقط|اجور\s*فقط|صيانه\s*فقط|عماله\s*(?:بلا|بدون)\s*ماده|labor\s*only|installation\s*only|اختبار\s*وتشغيل\s*فقط)/

/** Boilerplate tails the booklets append after the product name. */
const BOILERPLATE_MARKERS = [
  'واجهه تشغيل رقميه',
  'ملحقات التشغيل الاساسيه',
  'دقه مناسبه للاستخدام المهني',
  'مطابقه لمواصفات الشركه المصنعه',
  'نسخه مختبريه',
  'نسخه مؤسسيه',
  'مطابق لمعايير التشغيل',
  'مزود بخصايص التكرار',
  'واجهه اداره امنه',
  'اطوال تجاريه',
  'عرض قياسي',
  'شهاده مطابقه',
  'حسب المواصفات',
]

/** Generic tokens that can never be a head concept on their own. */
const NON_CONCEPT_TOKENS = new Set([
  'جهاز', 'وحده', 'منصه', 'طقم', 'نظام', 'مجموعه', 'عدد', 'نوع', 'موديل', 'قطعه',
  'مقاس', 'حسب', 'مع', 'من', 'الى', 'او', 'فقط', 'كامل', 'كامله', 'صناعي', 'صناعيه',
  'محمول', 'ثنايي', 'رباعي', 'مزدوج', 'قياسي', 'عالي', 'متعدد', 'متعدده', 'بارتفاع',
  'سعه', 'بطول', 'سماكه', 'دعم', 'set', 'kit', 'type', 'unit', 'model', 'and', 'for',
  'with', 'the', 'complete', 'standard', 'industrial', 'high', 'dual', 'quad',
])

export function cutBoilerplate(normalized: string): string {
  let out = normalized
  for (const marker of BOILERPLATE_MARKERS) {
    const at = out.indexOf(marker)
    if (at > 0) out = out.slice(0, at)
  }
  return out.trim()
}

/** Head concept = what is being procured, with supply verb and tail removed. */
export function extractHeadConcept(normalized: string): string {
  let head = cutBoilerplate(normalized)
  for (let i = 0; i < 3; i++) {
    const next = head.replace(LEAD_VERBS, '')
    if (next === head) break
    head = next
  }
  return head.trim()
}

/* ---------------------------- term matching ----------------------------- */

const ARABIC_LETTER = /[\u0621-\u064A]/

/**
 * Arabic proclitics: the conjunctions و/ف and the definite article in its
 * attached forms. Declared once so «تجليد» matches «وتجليد», «الأدوات الصحية»
 * matches the «ادوات صحيه» vocabulary, and «رفوف» matches «للرفوف» — instead of
 * hand-writing an «ال» variant per term.
 */
const AR_PROCLITIC = '(?:[وف]?(?:بال|كال|لل|ال|ب|ك|ل)?)'

/**
 * Full-phrase boundaries. JavaScript `\b` is ASCII-only and silently fails
 * before Arabic letters, so boundaries are expressed as explicit Unicode
 * character classes. The leading guard is written as a consumed alternation
 * `(?:^|[^\p{L}\p{N}])` rather than a lookbehind, for runtime compatibility;
 * the real term is capture group 1 and its offset is derived from the match.
 */
const LEAD_GUARD = '(?:^|[^\\p{L}\\p{N}])'
const TRAIL_GUARD = '(?![\\p{L}\\p{N}])'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type CompiledTerm = { re: RegExp; probe: string }

const termCache = new Map<string, CompiledTerm>()

/**
 * One matching rule for every term, Arabic or Latin, single word or phrase:
 * optional proclitics on each Arabic word, whitespace-flexible joins, and hard
 * boundaries at both ends.
 */
function compileTerm(term: string): CompiledTerm {
  const cached = termCache.get(term)
  if (cached) return cached
  const words = term.split(' ').filter(Boolean)
  const body = words
    .map((word) =>
      ARABIC_LETTER.test(word[0] || '') ? `${AR_PROCLITIC}${escapeRegex(word)}` : escapeRegex(word),
    )
    .join('\\s+')
  // Proclitics only ever prepend characters, so every bare word remains a
  // substring — the longest one is a cheap necessary condition.
  const probe = words.reduce((longest, word) => (word.length > longest.length ? word : longest), '')
  const compiled: CompiledTerm = {
    re: new RegExp(`${LEAD_GUARD}(${body})${TRAIL_GUARD}`, 'u'),
    probe,
  }
  termCache.set(term, compiled)
  return compiled
}

/**
 * Matching is only meaningful on normalized text, because normalization is what
 * folds hamza, taa marbuta and yaa (الأدوات → الادوات, الصحية → الصحيه,
 * الإنشائي → الانشايي). Normalizing here rather than trusting callers makes the
 * guarantee real; the memo keeps the repeated head/full/supplier calls cheap.
 */
const haystackMemo = new Map<string, string>()
const termMemo = new Map<string, string>()

function ensureNormalized(text: string): string {
  const hit = haystackMemo.get(text)
  if (hit !== undefined) return hit
  const value = normalizeProcurementText(text)
  if (haystackMemo.size > 64) haystackMemo.clear()
  haystackMemo.set(text, value)
  return value
}

/** Vocabulary is a fixed finite set, so its normalization is cached for good. */
function normalizeTerm(term: string): string {
  const hit = termMemo.get(term)
  if (hit !== undefined) return hit
  const value = normalizeProcurementText(term)
  termMemo.set(term, value)
  return value
}

/** Index of `term` in `haystack`, or -1. Both sides are normalized first. */
export function termIndex(rawHaystack: string, rawTerm: string): number {
  const haystack = ensureNormalized(rawHaystack)
  const term = normalizeTerm(rawTerm)
  if (!term || !haystack) return -1

  const { re, probe } = compileTerm(term)
  if (probe && haystack.indexOf(probe) < 0) return -1
  const match = re.exec(haystack)
  if (!match) return -1
  return match.index + (match[0].length - match[1]!.length)
}

type TermHit = { term: string; index: number; score: number; inHead: boolean }

function bestHit(head: string, full: string, terms: string[] | undefined): TermHit | null {
  if (!terms?.length) return null
  let best: TermHit | null = null
  for (const term of terms) {
    const normalized = normalizeTerm(term)
    if (!normalized) continue
    let index = termIndex(head, normalized)
    const inHead = index >= 0
    if (index < 0) index = termIndex(full, normalized)
    if (index < 0) continue
    const score = (inHead ? 1000 : 300) - index * 2 + normalized.length * 3
    if (!best || score > best.score) best = { term, index, score, inHead }
  }
  return best
}

export type TierDecision = { decided: boolean; tier: DecisionTier; hit: TermHit | null; score: number }

/**
 * The three-tier decision rule. Context terms may appear anywhere in the line;
 * strong and weak terms are preferred in the head concept.
 */
export function decideByTiers(head: string, full: string, tiers: TermTiers): TierDecision {
  const strong = bestHit(head, full, tiers.strong_terms)
  if (strong) return { decided: true, tier: 'strong', hit: strong, score: strong.score + 400 }

  const weak = bestHit(head, full, tiers.weak_terms)
  if (!weak) return { decided: false, tier: 'none', hit: null, score: 0 }

  const context = bestHit(full, full, tiers.context_terms)
  if (context) {
    return { decided: true, tier: 'weak_with_context', hit: weak, score: weak.score }
  }
  // Weak alone never decides — but it proves the line is not noise.
  return { decided: false, tier: 'none', hit: weak, score: 0 }
}

/* ------------------------ inheritance of rules -------------------------- */

function mergeTiers(...layers: (TermTiers | undefined)[]): TermTiers {
  const strong: string[] = []
  const weak: string[] = []
  const context: string[] = []
  for (const layer of layers) {
    if (!layer) continue
    if (layer.strong_terms) strong.push(...layer.strong_terms)
    if (layer.weak_terms) weak.push(...layer.weak_terms)
    if (layer.context_terms) context.push(...layer.context_terms)
  }
  return { strong_terms: strong, weak_terms: weak, context_terms: context }
}

type MergedRules = {
  preferred: string[]
  allowed: string[]
  soft: string[]
  hard: string[]
  negative: string[]
  supplier: string[]
}

/**
 * Veto is declared once at sector/family level and inherited. A lower level may
 * add its own conflicts, or drop an inherited one via *_exceptions.
 */
function mergeRules(...layers: (ArchetypeRules | undefined)[]): MergedRules {
  const preferred: string[] = []
  const allowed: string[] = []
  let soft: string[] = []
  let hard: string[] = []
  const negative: string[] = []
  const supplier: string[] = []

  for (const layer of layers) {
    if (!layer) continue
    if (layer.preferred_archetypes) preferred.push(...layer.preferred_archetypes)
    if (layer.allowed_archetypes) allowed.push(...layer.allowed_archetypes)
    if (layer.soft_conflicts) soft.push(...layer.soft_conflicts)
    if (layer.hard_conflicts) hard.push(...layer.hard_conflicts)
    if (layer.negative_terms) negative.push(...layer.negative_terms)
    if (layer.supplier_terms) supplier.push(...layer.supplier_terms)
    if (layer.hard_conflict_exceptions) {
      hard = hard.filter((a) => !layer.hard_conflict_exceptions!.includes(a))
    }
    if (layer.soft_conflict_exceptions) {
      soft = soft.filter((a) => !layer.soft_conflict_exceptions!.includes(a))
    }
  }

  const dedupe = (values: string[]) => [...new Set(values)]
  const preferredSet = dedupe(preferred)
  const allowedSet = dedupe(allowed).filter((a) => !preferredSet.includes(a))
  // Being preferred or allowed always wins over an inherited conflict.
  const qualified = new Set([...preferredSet, ...allowedSet])
  return {
    preferred: preferredSet,
    allowed: allowedSet,
    soft: dedupe(soft).filter((a) => !qualified.has(a)),
    hard: dedupe(hard).filter((a) => !qualified.has(a)),
    negative: dedupe(negative),
    supplier: dedupe(supplier),
  }
}

function mergeFacets(...layers: (FacetRef[] | undefined)[]): FacetRef[] {
  const byName = new Map<string, FacetRef>()
  for (const layer of layers) {
    if (!layer) continue
    for (const ref of layer) byName.set(ref.name, ref)
  }
  return [...byName.values()]
}

/* --------------------------- facet extraction --------------------------- */

const measureCache = new Map<string, RegExp>()

function measureRegex(pattern: string): RegExp {
  let re = measureCache.get(pattern)
  if (!re) {
    re = new RegExp(pattern, 'iu')
    measureCache.set(pattern, re)
  }
  return re
}

/**
 * Facets absorb the variation. `RHS 100x50x5 S355 galvanized` yields
 * section_type/dimensions/grade/finish — no alias per size.
 */
export function extractFacets(normalized: string, refs: FacetRef[]): ResolvedFacet[] {
  const out: ResolvedFacet[] = []
  for (const ref of refs) {
    const def = FACET_DEFS[ref.name]
    if (!def) continue
    const poolAffecting = ref.supplier_pool_affecting ?? def.supplier_pool_affecting ?? false

    if (def.kind === 'enum' && def.values) {
      let winner: { value: string; score: number } | null = null
      for (const [value, terms] of Object.entries(def.values)) {
        const hit = bestHit(normalized, normalized, terms)
        if (hit && (!winner || hit.score > winner.score)) winner = { value, score: hit.score }
      }
      if (winner) out.push({ name: ref.name, value: winner.value, supplier_pool_affecting: poolAffecting })
      continue
    }
    if (def.pattern) {
      const match = measureRegex(def.pattern).exec(normalized)
      if (match) {
        const captured = match.slice(1).find((g) => g !== undefined)
        out.push({
          name: ref.name,
          value: String(captured ?? match[0]).trim(),
          supplier_pool_affecting: poolAffecting,
        })
      }
    }
  }
  return out
}

/* ------------------------- lexicon (dictionary) ------------------------- */

/**
 * Lexical layer: vocabulary, acronyms and Arabic↔English equivalents that make
 * the ontology understand the *language*. Every entry points at a family/intent
 * that already exists in the ontology — it holds no product SKUs.
 *
 * Lexicon entries are STRONG by definition; ambiguous vocabulary belongs in the
 * ontology's weak_terms instead.
 */
export type LexiconEntry = {
  terms: string[]
  family: string
  intent?: string
  confidence?: number
}

export const LEXICON: LexiconEntry[] = [
  // cladding vocabulary (كسوة / تجليد / تلبيس / cladding / covering)
  { terms: ['تجليد اعمده', 'كسوه اعمده', 'column cladding', 'تلبيس اعمده'], family: 'architectural_cladding', intent: 'column_cladding', confidence: 0.98 },
  { terms: ['تجليد', 'كسوه', 'تلبيس', 'cladding', 'كلادينج', 'الوكبوند'], family: 'architectural_cladding', intent: 'surface_cladding' },
  // fire vocabulary — «حنفية حريق» is fire fighting, never plumbing
  { terms: ['حنفيه حريق', 'fire hydrant', 'pillar hydrant', 'landing valve'], family: 'fire_fighting', intent: 'fire_hydrant', confidence: 0.96 },
  { terms: ['طفايه', 'طفايات', 'fire extinguisher'], family: 'fire_fighting', intent: 'fire_extinguisher' },
  { terms: ['sprinkler', 'رشاش حريق', 'esfr'], family: 'fire_fighting', intent: 'fire_sprinkler' },
  { terms: ['مضخه حريق', 'fire pump', 'jockey pump'], family: 'fire_fighting', intent: 'fire_pump_set' },
  // steel acronyms
  { terms: ['rhs', 'shs', 'chs', 'upn', 'upe', 'ipe', 'ipn', 'heb', 'hea', 'rectangular hollow section', 'square hollow section', 'circular hollow section'], family: 'structural_steel', intent: 'structural_steel_section' },
  // pump vocabulary (مضخة غاطسة ↔ submersible pump)
  { terms: ['مضخه غاطسه', 'submersible pump', 'dewatering pump', 'مضخه نزح'], family: 'pumps', intent: 'industrial_pump' },
  // measuring acronyms
  { terms: ['متر ليزر', 'laser distance meter', 'laser meter'], family: 'measuring_instruments', intent: 'laser_distance_meter' },
  { terms: ['clamp meter', 'كلامب ميتر', 'multimeter', 'افوميتر', 'megger'], family: 'measuring_instruments', intent: 'electrical_tester' },
  // ICT acronyms
  { terms: ['ups', 'uninterruptible power supply'], family: 'ups_power_backup' },
  { terms: ['pdu', 'rack pdu'], family: 'rack_power_distribution' },
  { terms: ['siem', 'edr', 'xdr', 'soar', 'hsm', 'pam', 'dlp'], family: 'cybersecurity_platforms' },
  { terms: ['qsfp', 'sfp', 'transceiver'], family: 'optical_transceivers' },
  { terms: ['nvr', 'network video recorder'], family: 'physical_security', intent: 'nvr' },
  { terms: ['kvm', 'kvm switch'], family: 'it_peripherals', intent: 'kvm_console' },
  // safety vocabulary
  { terms: ['ppe', 'personal protective equipment'], family: 'protective_clothing' },
  { terms: ['srl', 'self retracting lifeline', 'fall arrest'], family: 'fall_protection' },
]

/* --------------------------- index building ----------------------------- */

const FAMILY_BY_ID = new Map<string, RawFamily>(DATA.families.map((f) => [f.id, f]))

type IntentNode = { intent: RawIntent; category: RawCategory | null; family: RawFamily }

const INTENTS_BY_FAMILY = new Map<string, IntentNode[]>()
for (const family of DATA.families) {
  const nodes: IntentNode[] = []
  for (const intent of family.intents || []) nodes.push({ intent, category: null, family })
  for (const category of family.categories || []) {
    for (const intent of category.intents || []) nodes.push({ intent, category, family })
  }
  INTENTS_BY_FAMILY.set(family.id, nodes)
}

const INTENT_INDEX = new Map<string, IntentNode>()
const ALL_INTENT_NODES: IntentNode[] = []
for (const nodes of INTENTS_BY_FAMILY.values()) {
  for (const node of nodes) {
    INTENT_INDEX.set(node.intent.id, node)
    ALL_INTENT_NODES.push(node)
  }
}

/**
 * ANCESTOR DERIVATION — general rule, no per-intent special cases.
 *
 * A strong term that belongs to exactly one intent in the whole ontology
 * identifies that intent, and therefore identifies its whole chain:
 *
 *   «ptz camera» → DATACENTER_ICT → physical_security → video_surveillance → ptz_camera
 *
 * So the resolver derives sector/family/category upward from the intent instead
 * of requiring the term to be repeated at every level. Terms are declared once,
 * at the most specific level where they are true.
 */
const UNIQUE_STRONG_TERMS = new Map<string, IntentNode>()
{
  const owners = new Map<string, Set<string>>()
  for (const node of ALL_INTENT_NODES) {
    for (const term of node.intent.strong_terms || []) {
      const key = normalizeProcurementText(term)
      if (!key) continue
      if (!owners.has(key)) owners.set(key, new Set())
      owners.get(key)!.add(node.intent.id)
    }
  }
  for (const [key, intentIds] of owners) {
    if (intentIds.size !== 1) continue
    const node = INTENT_INDEX.get([...intentIds][0]!)
    if (node) UNIQUE_STRONG_TERMS.set(key, node)
  }
}

/** True when `term` is a strong term of exactly one intent in the ontology. */
export function isUniqueStrongTerm(term: string): boolean {
  return UNIQUE_STRONG_TERMS.has(normalizeProcurementText(term))
}

/* ----------------------- ID surface for sibling lanes ------------------- */

/**
 * THE ID CONTRACT.
 *
 * Two sibling lanes consume these lists and MUST NOT hardcode them:
 *   - the AI/cache lane validates model proposals against real vocabulary
 *     (`isKnownIntentId` / `isKnownFamilyId`), and
 *   - the Phase 2 lane keys `intent_supplier_map.intent_key` on `listIntentIds()`.
 *
 * A hardcoded copy in either lane rots silently the next time an intent splits.
 * `scripts/ontology-ids.mjs` emits the whole surface as JSON for lanes that
 * cannot import TypeScript directly.
 */

/** Every intent id the ontology can emit. Sorted, stable ordering. */
export function listIntentIds(): string[] {
  return [...INTENT_INDEX.keys()].sort()
}

/** Every family id the ontology can emit. Sorted, stable ordering. */
export function listFamilyIds(): string[] {
  return DATA.families.map((f) => f.id).sort()
}

export function listSectorIds(): string[] {
  return Object.keys(DATA.sectors).sort()
}

export function listCategoryIds(): string[] {
  const ids = new Set<string>()
  for (const family of DATA.families) {
    for (const category of family.categories || []) ids.add(category.id)
  }
  return [...ids].sort()
}

export function listArchetypeIds(): string[] {
  return Object.keys(DATA.archetypes).sort()
}

/** Validation helpers for the AI lane — reject anything not in the ontology. */
export function isKnownIntentId(id: string): boolean {
  return INTENT_INDEX.has(id)
}

export function isKnownFamilyId(id: string): boolean {
  return FAMILY_BY_ID.has(id)
}

export function isKnownArchetypeId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DATA.archetypes, id)
}

/** The full chain for an intent id, so a lane never has to infer ancestors. */
export function describeIntent(
  id: string,
): { sector: string; family: string; category: string | null; intent: string } | null {
  const node = INTENT_INDEX.get(id)
  if (!node) return null
  return {
    sector: node.family.sector,
    family: node.family.id,
    category: node.category?.id || null,
    intent: node.intent.id,
  }
}

/**
 * One serializable snapshot of the whole ID surface, versioned so a consumer can
 * detect drift instead of discovering it through a silently empty join.
 */
export function listOntologyIds(): {
  ontology_version: string
  sectors: string[]
  families: string[]
  categories: string[]
  intents: string[]
  archetypes: string[]
  intent_chains: Array<{ sector: string; family: string; category: string | null; intent: string }>
} {
  return {
    ontology_version: ONTOLOGY_VERSION,
    sectors: listSectorIds(),
    families: listFamilyIds(),
    categories: listCategoryIds(),
    intents: listIntentIds(),
    archetypes: listArchetypeIds(),
    intent_chains: listIntentIds().map((id) => describeIntent(id)!),
  }
}

function uniq(values: (string | undefined | null)[], limit = 28): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const term = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!term || term.length < 2) continue
    const key = normalizeProcurementText(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= limit) break
  }
  return out
}

/* ------------------------------ resolver -------------------------------- */

/**
 * Level C. Unresolved locally — lexical, ontology AND semantic resolution have
 * all failed. There is no fourth level, and nothing that resolved locally can
 * land here. `ai_eligible` is the single flag the AI gate reads.
 */
function unresolvedResolution(
  raw: string,
  normalized: string,
  head: string,
  started: number,
  bucket: UnresolvedBucket,
  searchTerms: string[] = [],
): OntologyResolution {
  return {
    level: 'unresolved',
    source: 'unresolved',
    level_code: 'C',
    poolable: false,
    sector: null,
    family: null,
    category: null,
    intent: null,
    domain: 'unknown',
    facets: {},
    resolved_facets: [],
    pool_affecting_facets: {},
    search_terms: searchTerms,
    supplier_terms: [],
    preferred_archetypes: [],
    allowed_archetypes: [],
    soft_conflicts: [],
    hard_conflicts: [],
    negative_terms: [],
    confidence: 0,
    raw,
    head_concept: head,
    pool_key: null,
    cache_key: null,
    unresolved_bucket: bucket,
    // Only a line with nothing left to try locally may reach the model.
    ai_eligible: bucket === 'ai_eligible',
    semantic_attempted: true,
    ai_result: 'not_run',
    debug: {
      normalized,
      matched_term: null,
      decided_by: 'none',
      elapsed_ms: Date.now() - started,
      not_supply: bucket === 'rejected' && PURE_SERVICE.test(normalized),
    },
  }
}

/**
 * Level B via semantic recovery. Known ontology vocabulary fired but never
 * reached a decision, so the line is searchable on its own recovered terms and
 * terminates LOCALLY — it is never an AI candidate.
 *
 * `family` stays null on purpose. A weak term alone must not decide a family
 * any more than it may decide an intent: promoting a bare «كاميرا» into
 * `physical_security` would put a line of unknown domain into a security
 * supplier pool, which is the exact false positive the weak tier exists to
 * prevent. B here means "resolved locally and searchable", and `source`
 * records that it got there by recovery rather than by an ontology match.
 */
function semanticRecoveryResolution(
  raw: string,
  normalized: string,
  head: string,
  started: number,
  recoveredTerm: string,
  searchTerms: string[],
): OntologyResolution {
  return {
    level: 'local_resolved',
    source: 'semantic_recovery',
    // Reported as B, but NOT poolable: there is no family to pool on.
    level_code: 'B',
    poolable: false,
    sector: null,
    family: null,
    category: null,
    intent: null,
    domain: 'unknown',
    facets: {},
    resolved_facets: [],
    pool_affecting_facets: {},
    search_terms: uniq([recoveredTerm, ...searchTerms]),
    supplier_terms: [],
    preferred_archetypes: [],
    allowed_archetypes: [],
    soft_conflicts: [],
    hard_conflicts: [],
    negative_terms: [],
    confidence: 0.4,
    raw,
    head_concept: head,
    pool_key: null,
    cache_key: null,
    // Level B carries no C metadata: it never reaches the model.
    unresolved_bucket: null,
    ai_eligible: false,
    semantic_attempted: false,
    ai_result: 'not_run',
    debug: {
      normalized,
      matched_term: recoveredTerm,
      // Nothing decisive fired — `source` is what records the recovery.
      decided_by: 'none',
      elapsed_ms: Date.now() - started,
      not_supply: false,
    },
  }
}

function contentTokens(head: string): string[] {
  return head
    .split(' ')
    .filter((token) => token.length >= 3 && !NON_CONCEPT_TOKENS.has(token) && !/^\d/.test(token))
}

function buildCacheKey(poolKey: string | null, poolFacets: FacetValues): string | null {
  if (!poolKey) return null
  const parts = Object.keys(poolFacets)
    .sort()
    .map((name) => `${name}=${poolFacets[name]}`)
  return [ONTOLOGY_VERSION, poolKey, ...parts].join('|')
}

function buildProfile(
  family: RawFamily,
  node: IntentNode | null,
  raw: string,
  normalized: string,
  head: string,
  matchedTerm: string | null,
  decidedBy: DecisionTier,
  source: ResolutionSource,
  started: number,
  confidenceOverride?: number,
  derivedFromIntent?: string,
): OntologyResolution {
  const sector = SECTORS[family.sector] || { domain: 'general' }
  const category = node?.category || null
  const intent = node?.intent || null

  const tiers = mergeTiers(sector, family, category || undefined, intent || undefined)
  const rules = mergeRules(sector, family, category || undefined, intent || undefined)
  const facetRefs = mergeFacets(family.facets, category?.facets, intent?.facets)

  const resolvedFacets = extractFacets(normalized, facetRefs)
  const facets: FacetValues = {}
  const poolFacets: FacetValues = {}
  for (const facet of resolvedFacets) {
    facets[facet.name] = facet.value
    if (facet.supplier_pool_affecting) poolFacets[facet.name] = facet.value
  }

  // Retrieval terms: strong vocabulary first, then weak, never bare context.
  const searchTerms = uniq([
    ...(intent?.strong_terms || []),
    ...(category?.strong_terms || []),
    ...(family.strong_terms || []),
    ...(tiers.weak_terms || []),
  ])

  const level: ResolutionLevel = intent ? 'specific_intent' : 'local_resolved'
  const poolKey = intent?.id || family.id
  const confidence = confidenceOverride ?? intent?.confidence ?? (intent ? 0.9 : 0.82)

  return {
    level,
    source,
    level_code: intent ? 'A' : 'B',
    // A real family/intent was resolved, so this line may key a pool.
    poolable: true,
    sector: family.sector,
    family: family.id,
    category: category?.id || null,
    intent: intent?.id || null,
    domain: sector.domain,
    facets,
    resolved_facets: resolvedFacets,
    pool_affecting_facets: poolFacets,
    search_terms: searchTerms,
    supplier_terms: uniq(rules.supplier),
    preferred_archetypes: rules.preferred,
    allowed_archetypes: rules.allowed,
    soft_conflicts: rules.soft,
    hard_conflicts: rules.hard,
    negative_terms: rules.negative,
    confidence,
    raw,
    head_concept: head,
    pool_key: poolKey,
    cache_key: buildCacheKey(poolKey, poolFacets),
    // Level A and B are usable without AI, so no C metadata applies.
    unresolved_bucket: null,
    ai_eligible: false,
    semantic_attempted: false,
    ai_result: 'not_run',
    debug: {
      normalized,
      matched_term: matchedTerm,
      decided_by: decidedBy,
      elapsed_ms: Date.now() - started,
      derived_from_intent: derivedFromIntent,
    },
  }
}

/** Accumulated tiers for a family (sector + family) or an intent (full chain). */
function familyTiers(family: RawFamily): TermTiers {
  return mergeTiers(SECTORS[family.sector], family)
}

function intentTiers(node: IntentNode): TermTiers {
  return mergeTiers(
    SECTORS[node.family.sector],
    node.family,
    node.category || undefined,
    node.intent,
  )
}

/**
 * Most specific intent inside a family, under the three-tier rule.
 * Intent-level strong/weak terms are evaluated with inherited context.
 */
function resolveIntentNode(
  family: RawFamily,
  head: string,
  full: string,
): { node: IntentNode; decision: TierDecision } | null {
  const nodes = INTENTS_BY_FAMILY.get(family.id) || []
  if (!nodes.length) return null

  const decisions = new Map<string, TierDecision>()
  for (const node of nodes) {
    // Own terms only for the positive signal; context inherited down the chain.
    const own: TermTiers = {
      strong_terms: node.intent.strong_terms,
      weak_terms: node.intent.weak_terms,
      context_terms: intentTiers(node).context_terms,
    }
    const decision = decideByTiers(head, full, own)
    if (decision.decided) decisions.set(node.intent.id, decision)
  }

  let winner: { node: IntentNode; decision: TierDecision; rank: number } | null = null
  for (const node of nodes) {
    const decision = decisions.get(node.intent.id)
    if (!decision) continue
    // `requires` encodes composition: column_cladding only counts when the
    // parent surface_cladding vocabulary matched too.
    const requires = node.intent.requires || []
    if (requires.some((id) => !decisions.has(id))) continue
    const rank = decision.score + requires.length * 500
    if (!winner || rank > winner.rank) winner = { node, decision, rank }
  }
  return winner ? { node: winner.node, decision: winner.decision } : null
}

/**
 * Resolve one BOQ line through the full cascade.
 *
 *   Normalization → Lexicon → Family → Intent → Facets → Archetypes → Veto
 *
 * Every local attempt runs before a line is allowed to fall to Level C.
 */
export function resolveOntology(lineName: string): OntologyResolution {
  const started = Date.now()
  const raw = String(lineName || '').replace(/\s+/g, ' ').trim()
  const normalized = normalizeProcurementText(raw)
  if (!normalized) return unresolvedResolution(raw, normalized, '', started, 'rejected')
  if (PURE_SERVICE.test(normalized)) {
    return unresolvedResolution(raw, normalized, '', started, 'rejected')
  }

  const head = extractHeadConcept(normalized) || normalized
  // Matching runs on the product text only. The booklets append vendor
  // boilerplate («مطابق لمعايير التشغيل في مراكز البيانات», «واجهة إدارة آمنة»)
  // which would otherwise hand a weak term the context term it needs to decide.
  const body = cutBoilerplate(normalized) || normalized

  // 1 — lexicon / direct intent (lexicon terms are strong by definition)
  let lexBest: { entry: LexiconEntry; hit: TermHit } | null = null
  for (const entry of LEXICON) {
    const hit = bestHit(head, body, entry.terms)
    if (hit && (!lexBest || hit.score > lexBest.hit.score)) lexBest = { entry, hit }
  }

  // 2 — ANCESTOR DERIVATION. A strong term owned by exactly one intent in the
  // whole ontology identifies that intent, so the sector/family/category chain
  // is derived upward from it. No term is repeated at a higher level.
  // The BEST unique strong hit derives, not merely the first one found: a more
  // specific term («كاميرا حراريه امنيه») must beat a shorter unique one
  // («كاميرا حراريه») that lives in a different family.
  let derived: { node: IntentNode; hit: TermHit } | null = null
  for (const node of ALL_INTENT_NODES) {
    const hit = bestHit(head, body, node.intent.strong_terms)
    if (!hit || !UNIQUE_STRONG_TERMS.has(normalizeTerm(hit.term))) continue
    if (!derived || hit.score > derived.hit.score) derived = { node, hit }
  }
  if (derived) {
    // Composition still outranks a bare unique term, and `requires` must hold.
    const composed = resolveIntentNode(derived.node.family, head, body)
    const requires = derived.node.intent.requires || []
    const winner =
      composed && (requires.length || composed.decision.score > derived.hit.score)
        ? composed.node
        : derived.node
    if (!requires.length || composed) {
      return buildProfile(
        winner.family,
        winner,
        raw, normalized, head,
        derived.hit.term,
        'strong', 'ontology_intent', started, undefined,
        winner.intent.id,
      )
    }
  }

  // 3 — compositional family resolution under the three-tier rule. A deciding
  // descendant intent also decides its family: the tier rule is a property of
  // the term, not of the level it happens to be declared at.
  let famBest: {
    family: RawFamily
    decision: TierDecision
    node: { node: IntentNode; decision: TierDecision } | null
  } | null = null
  // A weak term that never reached a decision is the semantic-recovery signal:
  // it yields searchable vocabulary, but not a family.
  let weakBest: TermHit | null = null
  for (const family of DATA.families) {
    const decision = decideByTiers(head, body, familyTiers(family))
    const node = resolveIntentNode(family, head, body)
    if (!decision.decided && !node) {
      if (decision.hit && (!weakBest || decision.hit.score > weakBest.score)) {
        weakBest = decision.hit
      }
      continue
    }
    const score = Math.max(decision.decided ? decision.score : 0, node?.decision.score ?? 0)
    if (!famBest || score > famBest.decision.score) {
      famBest = {
        family,
        decision: decision.decided ? { ...decision, score } : { ...node!.decision, score },
        node,
      }
    }
  }

  // The lexicon wins only when at least as specific as the ontology hit.
  if (lexBest && (!famBest || lexBest.hit.score + 400 >= famBest.decision.score)) {
    const family = FAMILY_BY_ID.get(lexBest.entry.family)
    if (family) {
      const declared = lexBest.entry.intent ? INTENT_INDEX.get(lexBest.entry.intent) || null : null
      const composed = resolveIntentNode(family, head, body)
      const node =
        composed && declared && composed.node.intent.id !== declared.intent.id
          ? composed.node
          : declared || composed?.node || null
      return buildProfile(
        family,
        node,
        raw,
        normalized,
        head,
        lexBest.hit.term,
        'strong',
        'lexicon',
        started,
        lexBest.entry.confidence,
      )
    }
  }

  if (famBest) {
    const node = famBest.node
    return buildProfile(
      famBest.family,
      node?.node || null,
      raw,
      normalized,
      head,
      node?.decision.hit?.term || famBest.decision.hit?.term || null,
      node?.decision.tier || famBest.decision.tier,
      node ? 'ontology_intent' : 'ontology_family',
      started,
    )
  }

  const tokens = contentTokens(head)

  // 4 — SEMANTIC RECOVERY, and it is the last LOCAL step. Known ontology
  // vocabulary appeared but never reached a decision, so the line is still
  // searchable on the recovered terms. That is a local success: Level B.
  if (weakBest) {
    return semanticRecoveryResolution(
      raw,
      normalized,
      head,
      started,
      weakBest.term,
      tokens.slice(0, 4),
    )
  }

  // LEVEL C — lexical, ontology AND semantic resolution all failed.
  if (tokens.length) {
    return unresolvedResolution(raw, normalized, head, started, 'ai_eligible', tokens.slice(0, 4))
  }
  return unresolvedResolution(raw, normalized, head, started, 'rejected')
}

/* ---------------------------- batch + pools ----------------------------- */

export type OntologyPool = {
  pool_key: string
  cache_key: string | null
  level: ResolutionLevel
  sector: string | null
  family: string | null
  category: string | null
  intent: string | null
  domain: string
  search_terms: string[]
  supplier_terms: string[]
  preferred_archetypes: string[]
  allowed_archetypes: string[]
  soft_conflicts: string[]
  hard_conflicts: string[]
  negative_terms: string[]
  pool_affecting_facets: FacetValues
  line_ids: string[]
}

export type OntologyBatch = {
  lines: Array<{ line_id: string; name: string; resolution: OntologyResolution }>
  pools: OntologyPool[]
  /** THREE levels only. */
  counts: Record<ResolutionLevel, number>
  /** HOW each Level B line resolved. Sums to counts.local_resolved. Not levels. */
  family_by_method: Record<'ontology_family' | 'semantic_recovery' | 'lexicon', number>
  /**
   * Lines carrying a CONFIDENT family or intent — the only ones that may key a
   * supplier pool, a cache entry, or `intent_supplier_map`. Always
   * `counts.specific_intent + counts.local_resolved - semantic_recovery`.
   */
  poolable: number
  /** Metadata inside Level C — these sum to counts.unresolved, they are not levels. */
  unresolved_breakdown: Record<UnresolvedBucket, number>
  /** Lines the AI gate is allowed to call on. Always ⊆ Level C. */
  ai_eligible: number
  not_supply: number
  line_count: number
  elapsed_ms: number
}

/**
 * Same pool key → one supplier retrieval, then per-line rank.
 * Pool-affecting facets split the pool; decorative facets never do.
 */
export function resolveOntologyBatch(
  items: Array<string | { id?: string | number; name?: string; name_ar?: string }>,
): OntologyBatch {
  const started = Date.now()
  const lines: OntologyBatch['lines'] = []
  const pools = new Map<string, OntologyPool>()
  const counts: OntologyBatch['counts'] = {
    specific_intent: 0,
    local_resolved: 0,
    unresolved: 0,
  }
  let poolable = 0
  const familyByMethod: OntologyBatch['family_by_method'] = {
    ontology_family: 0,
    semantic_recovery: 0,
    lexicon: 0,
  }
  const unresolvedBreakdown: OntologyBatch['unresolved_breakdown'] = { ai_eligible: 0, rejected: 0 }
  let aiEligible = 0
  let notSupply = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const name = typeof item === 'string' ? item : String(item?.name_ar || item?.name || '')
    const lineId = typeof item === 'object' && item ? String(item.id ?? i) : String(i)
    const resolution = resolveOntology(name)
    lines.push({ line_id: lineId, name, resolution })
    counts[resolution.level] += 1
    if (resolution.poolable) poolable += 1
    if (resolution.level === 'local_resolved' && resolution.source in familyByMethod) {
      familyByMethod[resolution.source as keyof OntologyBatch['family_by_method']] += 1
    }
    if (resolution.unresolved_bucket) unresolvedBreakdown[resolution.unresolved_bucket] += 1
    if (resolution.ai_eligible) aiEligible += 1
    if (resolution.debug.not_supply) notSupply += 1

    const key = resolution.cache_key || (resolution.search_terms.length ? `line:${lineId}` : null)
    if (!key) continue
    if (!pools.has(key)) {
      pools.set(key, {
        pool_key: resolution.pool_key || `line:${lineId}`,
        cache_key: resolution.cache_key,
        level: resolution.level,
        sector: resolution.sector,
        family: resolution.family,
        category: resolution.category,
        intent: resolution.intent,
        domain: resolution.domain,
        search_terms: resolution.search_terms,
        supplier_terms: resolution.supplier_terms,
        preferred_archetypes: resolution.preferred_archetypes,
        allowed_archetypes: resolution.allowed_archetypes,
        soft_conflicts: resolution.soft_conflicts,
        hard_conflicts: resolution.hard_conflicts,
        negative_terms: resolution.negative_terms,
        pool_affecting_facets: resolution.pool_affecting_facets,
        line_ids: [],
      })
    }
    pools.get(key)!.line_ids.push(lineId)
  }

  return {
    lines,
    pools: [...pools.values()],
    counts,
    family_by_method: familyByMethod,
    poolable,
    unresolved_breakdown: unresolvedBreakdown,
    ai_eligible: aiEligible,
    not_supply: notSupply,
    line_count: lines.length,
    elapsed_ms: Date.now() - started,
  }
}

/* --------------------- supplier archetypes + veto ----------------------- */

export type SupplierVerdict = 'PREFERRED' | 'ALLOWED' | 'SOFT_DEMOTED' | 'HARD_VETO' | 'NO_MATCH'

export type SupplierEvaluation = {
  verdict: SupplierVerdict
  /** Soft/broad matches are shown unticked and never swept by «تحديد الكل». */
  auto_tick: boolean
  score: number
  archetypes: string[]
  matched_terms: string[]
  reasons: string[]
}

export type SupplierProfile = Pick<
  OntologyResolution,
  | 'search_terms'
  | 'supplier_terms'
  | 'preferred_archetypes'
  | 'allowed_archetypes'
  | 'soft_conflicts'
  | 'hard_conflicts'
  | 'negative_terms'
>

/**
 * Classify a supplier from its own words (name / activity / category) into the
 * standalone archetype vocabulary. No company-name blacklist anywhere.
 */
export function classifySupplierArchetypes(haystack: string): string[] {
  const hay = normalizeProcurementText(haystack)
  if (!hay) return []
  const out: string[] = []
  for (const [id, def] of Object.entries(ARCHETYPES)) {
    if (def.patterns.some((p) => termIndex(hay, p) >= 0)) out.push(id)
  }
  return out
}

/**
 * Structural veto: family/intent × supplier archetype, inherited from the
 * sector. Never a keyword that merely appears in a supplier description.
 */
export function evaluateSupplier(haystack: string, profile: SupplierProfile): SupplierEvaluation {
  const hay = normalizeProcurementText(haystack)
  const archetypes = classifySupplierArchetypes(hay)
  const reasons: string[] = []
  const matched: string[] = []

  const preferred = archetypes.filter((a) => profile.preferred_archetypes.includes(a))
  const allowed = archetypes.filter((a) => profile.allowed_archetypes.includes(a))
  const hard = archetypes.filter((a) => profile.hard_conflicts.includes(a))
  const soft = archetypes.filter((a) => profile.soft_conflicts.includes(a))

  // A conflicting archetype is only fatal when nothing qualifies the supplier —
  // «سباكة ومكافحة حريق» still serves a fire line.
  if (hard.length && !preferred.length && !allowed.length) {
    return {
      verdict: 'HARD_VETO',
      auto_tick: false,
      score: 0,
      archetypes,
      matched_terms: [],
      reasons: [`hard_conflict:${hard.join(',')}`],
    }
  }

  if (!preferred.length && !allowed.length && profile.negative_terms.length) {
    const negative = profile.negative_terms.find((t) => termIndex(hay, t) >= 0)
    if (negative) {
      return {
        verdict: 'HARD_VETO',
        auto_tick: false,
        score: 0,
        archetypes,
        matched_terms: [],
        reasons: [`negative_term:${negative}`],
      }
    }
  }

  let score = 0
  for (const term of profile.search_terms) {
    if (termIndex(hay, term) >= 0) {
      score += 3
      matched.push(term)
    }
  }
  for (const term of profile.supplier_terms) {
    if (termIndex(hay, term) >= 0) {
      score += 2
      matched.push(term)
    }
  }
  score += preferred.length * 6 + allowed.length * 3

  if (preferred.length) {
    reasons.push(`preferred:${preferred.join(',')}`)
    return { verdict: 'PREFERRED', auto_tick: true, score, archetypes, matched_terms: matched, reasons }
  }
  if (allowed.length) {
    reasons.push(`allowed:${allowed.join(',')}`)
    return { verdict: 'ALLOWED', auto_tick: true, score, archetypes, matched_terms: matched, reasons }
  }
  if (soft.length) {
    reasons.push(`soft_conflict:${soft.join(',')}`)
    return {
      verdict: 'SOFT_DEMOTED',
      auto_tick: false,
      score: Math.min(score, 2),
      archetypes,
      matched_terms: matched,
      reasons,
    }
  }
  if (score > 0) {
    reasons.push('broad_term_match')
    return {
      verdict: 'SOFT_DEMOTED',
      auto_tick: false,
      score: Math.min(score, 3),
      archetypes,
      matched_terms: matched,
      reasons,
    }
  }
  return { verdict: 'NO_MATCH', auto_tick: false, score: 0, archetypes, matched_terms: [], reasons: ['no_signal'] }
}

const VERDICT_RANK: Record<SupplierVerdict, number> = {
  PREFERRED: 3,
  ALLOWED: 2,
  SOFT_DEMOTED: 1,
  NO_MATCH: 0,
  HARD_VETO: -1,
}

/** Rank candidates: verdict class first, then score. Hard vetoes are dropped. */
export function rankSuppliers<T>(
  candidates: T[],
  haystackOf: (candidate: T) => string,
  profile: SupplierProfile,
): Array<{ candidate: T; evaluation: SupplierEvaluation }> {
  return candidates
    .map((candidate) => ({ candidate, evaluation: evaluateSupplier(haystackOf(candidate), profile) }))
    .filter((row) => row.evaluation.verdict !== 'HARD_VETO' && row.evaluation.verdict !== 'NO_MATCH')
    .sort(
      (a, b) =>
        VERDICT_RANK[b.evaluation.verdict] - VERDICT_RANK[a.evaluation.verdict] ||
        b.evaluation.score - a.evaluation.score,
    )
}

/* -------------------------- learning candidates ------------------------- */

/**
 * Contract for the open system. The AI/cache lane is owned by a sibling agent;
 * this module only defines the handoff shape and the local recurrence counter.
 */
export type LearningCandidate = {
  candidate_id: string
  head_concept: string
  normalized: string
  suggested_family: string | null
  suggested_intent: string | null
  facets: FacetValues
  occurrences: number
  first_seen: string
  last_seen: string
  status: 'pending' | 'promoted' | 'rejected'
  source: 'local_semantic' | 'ai'
}

export const PROMOTE_AFTER_OCCURRENCES = DATA.learning.promote_after_occurrences

/** Step 4 handoff shape — the sibling agent implements the call and the cache. */
export const AI_HANDOFF_CONTRACT = Object.freeze({
  step: 4,
  when: 'level === "unresolved" && ai_eligible === true',
  never: 'Level A and Level B never reach the model; Level B is usable without it, '
    + 'including source === "semantic_recovery" which terminates locally',
  ontology_version: ONTOLOGY_VERSION,
  // Read these from listIntentIds()/listFamilyIds()/listArchetypeIds() — never a
  // hardcoded copy, which rots the next time an intent splits.
  id_source: 'listOntologyIds()',
  cache_key: 'resolution.cache_key — ontology_version | pool_key | pool-affecting facets only',
  request: Object.freeze({
    head_concept: 'string',
    normalized: 'string',
    known_families: 'string[] (ontology family ids)',
    known_intents: 'string[] (ontology intent ids)',
    known_archetypes: 'string[] (archetype ids)',
  }),
  response: Object.freeze({
    suggested_family: 'string | null',
    suggested_intent: 'string | null',
    suggested_archetypes: 'string[]',
    confidence: 'number',
  }),
  rules: Object.freeze([
    'called at most once per distinct head concept; sibling lane caches',
    'never receives the supplier table',
    'result enters the ontology only after approval via learning candidates',
    'decorative (non pool-affecting) facets must not enter the cache key',
  ]),
})

const candidateStore = new Map<string, LearningCandidate>()

function candidateId(head: string): string {
  let hash = 0
  for (let i = 0; i < head.length; i++) hash = (Math.imul(31, hash) + head.charCodeAt(i)) | 0
  return `cpo-${(hash >>> 0).toString(16)}`
}

/** Record an unresolved head concept so recurring gaps surface for approval. */
export function recordLearningCandidate(
  resolution: OntologyResolution,
  suggestion?: { family?: string | null; intent?: string | null; source?: LearningCandidate['source'] },
): LearningCandidate {
  const head = resolution.head_concept || resolution.debug.normalized
  const id = candidateId(head)
  const now = new Date().toISOString()
  const existing = candidateStore.get(id)
  const next: LearningCandidate = existing
    ? { ...existing, occurrences: existing.occurrences + 1, last_seen: now }
    : {
        candidate_id: id,
        head_concept: head,
        normalized: resolution.debug.normalized,
        suggested_family: suggestion?.family ?? null,
        suggested_intent: suggestion?.intent ?? null,
        facets: resolution.facets,
        occurrences: 1,
        first_seen: now,
        last_seen: now,
        status: 'pending',
        source: suggestion?.source ?? 'local_semantic',
      }
  candidateStore.set(id, next)
  return next
}

/** Candidates that recurred enough to be proposed as a new subtype/alias. */
export function listLearningCandidates(options: { minOccurrences?: number } = {}): LearningCandidate[] {
  const min = options.minOccurrences ?? PROMOTE_AFTER_OCCURRENCES
  return [...candidateStore.values()]
    .filter((c) => c.occurrences >= min && c.status === 'pending')
    .sort((a, b) => b.occurrences - a.occurrences)
}

export function resetLearningCandidates(): void {
  candidateStore.clear()
}
