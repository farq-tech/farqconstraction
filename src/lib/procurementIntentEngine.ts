/**
 * Procurement Intent Engine (Phase 1) — NOT A PRODUCTION RESOLVER. DO NOT WIRE
 * THIS INTO THE UPLOAD PATH.
 *
 * This is a seven-intent regex dictionary: column cladding, interior paints,
 * flooring, data outlets, electrical outlets, fire safety, lighting. `parseBoq`
 * used to call it on every upload, and on the three real booklet fixtures in
 * `fixtures/boq/` it resolved 15 of 462 lines — 3.2%. Every other line fell
 * through to raw-token keyword scoring. The «98% ontology coverage» figure that
 * was quoted alongside it belongs to a different resolver, which the upload path
 * has never imported in any commit; this engine is the row that
 * `scripts/intent-coverage-report.mjs` prints as «flat dictionary <- frozen
 * baseline».
 *
 * Understanding a BOQ line is the backend's job and only the backend's. Farq
 * ships cpo-v10 with 347 intents across 113 families, and `/boq/match` returns
 * the resolution it used. A dictionary in the browser cannot be kept in step with
 * it, and while it was in the path it silently decided coverage for the whole
 * tender.
 *
 * Kept, not deleted, because `procurementIntentEngine.test.ts` and
 * `scripts/intent-coverage-report.mjs` measure it as the baseline the backend is
 * compared against. Measurement only.
 */

export type IntentSource = 'dictionary' | 'alias' | 'ai' | 'unknown'

export type ProcurementSearchProfile = {
  intent: string
  domain: string
  type: string
  search_terms: string[]
  supplier_archetypes: string[]
  exclude: string[]
  confidence: number
  source: IntentSource
  family_id?: string | null
  raw: string
  debug?: { elapsed_ms?: number | null; ai_attempted?: boolean; reason?: string }
}

type DictionaryEntry = {
  intent: string
  domain: string
  type: string
  family_id?: string | null
  patterns: RegExp[]
  search_terms: string[]
  supplier_archetypes: string[]
  exclude: string[]
  confidence: number
}

const INTENT_DICTIONARY: DictionaryEntry[] = [
  {
    intent: 'column_cladding',
    domain: 'finishes',
    type: 'product',
    family_id: 'FINISH_COLUMN_CLADDING',
    patterns: [
      /تجليد\s*اعم/,
      /تجليد\s*أعمد/,
      /كسوة\s*اعم/,
      /كسوة\s*أعمد/,
      /column\s*clad/i,
      /column\s*wrap/i,
    ],
    search_terms: [
      'تجليد أعمدة',
      'تجليد',
      'كسوة أعمدة',
      'ديكورات',
      'تشطيبات',
      'تشطيب',
      'cladding',
      'column cladding',
      'fit out',
      'fitout',
    ],
    supplier_archetypes: [
      'finishes',
      'fit-out',
      'joinery',
      'facade',
      'ديكورات',
      'تشطيبات',
    ],
    exclude: [
      'خرسانة',
      'خرسانه',
      'حديد',
      'تسليح',
      'سباكة',
      'سباكه',
      'concrete',
      'rebar',
      'plumbing',
    ],
    confidence: 0.95,
  },
  {
    intent: 'interior_paints',
    domain: 'finishes',
    type: 'product',
    patterns: [/دهان/, /طلاء/, /\bpaint(s|ing)?\b/i],
    search_terms: ['دهان', 'طلاء', 'تشطيبات', 'paints', 'coating'],
    supplier_archetypes: ['paints', 'finishes', 'دهانات', 'تشطيبات'],
    exclude: ['خرسانة', 'حديد', 'سباكة', 'كهرباء', 'concrete', 'rebar'],
    confidence: 0.9,
  },
  {
    intent: 'flooring_finishes',
    domain: 'finishes',
    type: 'product',
    family_id: 'FLOORING_GENERIC',
    patterns: [/ارضيات/, /أرضيات/, /بلاط/, /بورسل/, /سيراميك/, /\bflooring\b/i],
    search_terms: ['ارضيات', 'بلاط', 'بورسلان', 'سيراميك', 'مواد تشطيب', 'flooring', 'tiles'],
    supplier_archetypes: ['tiles', 'flooring', 'finishes', 'بلاط', 'تشطيبات'],
    exclude: ['خرسانة جاهزة', 'حديد تسليح', 'سباكة', 'concrete', 'rebar'],
    confidence: 0.88,
  },
  {
    intent: 'data_outlets',
    domain: 'ict',
    type: 'product',
    family_id: 'ICT_DATA_OUTLET',
    patterns: [
      /مخرج\s*معلومات/,
      /مخرج\s*بيانات/,
      /مخرج\s*شبك/,
      /data\s*outlet/i,
      /(?:سويتش|مفاتيح|مفتاح).*(?:معلومات|بيانات|شبك)/,
    ],
    search_terms: ['مخرج معلومات', 'مخرج بيانات', 'شبكات', 'تيار خفيف', 'data outlet'],
    supplier_archetypes: ['networks', 'ICT', 'تيار خفيف', 'شبكات'],
    exclude: ['سباكة', 'خرسانة', 'حريق', 'plumbing', 'concrete', 'fire'],
    confidence: 0.9,
  },
  {
    intent: 'electrical_outlets',
    domain: 'electrical',
    type: 'product',
    family_id: 'ELECTRICAL_SOCKET_OUTLET',
    patterns: [
      /مخرج\s*كهرب/,
      /افياش/,
      /فيش\s*كهرب/,
      /socket\s*outlet/i,
      /سويتشات?\s*(?:كهرب|قوي)?/,
      /مفاتيح\s*كهرب/,
      /^مخارج?$/,
    ],
    search_terms: ['مخرج كهرباء', 'افياش', 'سويتشات', 'مواد كهربائية', 'electrical'],
    supplier_archetypes: ['electrical', 'كهرباء', 'مواد كهربائية'],
    exclude: ['سباكة', 'خرسانة', 'حريق', 'plumbing', 'concrete', 'fire'],
    confidence: 0.9,
  },
  {
    intent: 'fire_safety',
    domain: 'fire',
    type: 'product',
    patterns: [/حريق/, /طفاي/, /كاشف\s*دخان/, /دخان/, /\bfire\b/i, /smoke\s*detect/i],
    search_terms: ['حريق', 'طفايات', 'كاشف دخان', 'سلامة', 'fire', 'safety'],
    supplier_archetypes: ['fire', 'safety', 'حريق', 'سلامة'],
    exclude: ['دهان', 'تجليد', 'خرسانة', 'سباكة', 'paint', 'cladding', 'concrete'],
    confidence: 0.9,
  },
  {
    intent: 'lighting_fixtures',
    domain: 'electrical',
    type: 'product',
    family_id: 'LIGHTING_FIXTURE',
    patterns: [
      /اضاء/,
      /انار/,
      /إنار/,
      /بانل/,
      /panel\s*light/i,
      /led\s*panel/i,
      /سبوت/,
      /spotlight/i,
    ],
    search_terms: ['اضاءة', 'إنارة', 'بانل', 'سبوت لايت', 'LED', 'lighting'],
    supplier_archetypes: ['lighting', 'electrical', 'إنارة', 'اضاءة'],
    exclude: ['سباكة', 'خرسانة', 'حريق', 'plumbing', 'concrete'],
    confidence: 0.9,
  },
]

/** Set Vite env VITE_PROCUREMENT_INTENT_AI=1 to enable Phase-2 AI stub (still no-op). */
export function isAiIntentEnabled(): boolean {
  try {
    return String(import.meta.env?.VITE_PROCUREMENT_INTENT_AI || '').trim() === '1'
  } catch {
    return false
  }
}

export function normalizeProcurementText(text: string): string {
  return String(text || '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function uniqueTerms(terms: string[], limit = 16): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of terms) {
    const term = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
    if (!term || term.length < 2) continue
    const key = normalizeProcurementText(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= limit) break
  }
  return out
}

function dictionaryHit(normalized: string): DictionaryEntry | null {
  for (const entry of INTENT_DICTIONARY) {
    if (entry.patterns.some((re) => re.test(normalized))) return entry
  }
  return null
}

/** Phase 2 stub — never hits suppliers; returns null unless flag is on. */
export async function resolveIntentViaAiStub(
  _rawText: string,
): Promise<ProcurementSearchProfile | null> {
  if (!isAiIntentEnabled()) return null
  return null
}

/**
 * Resolve one BOQ item name → search profile (dictionary Phase 1).
 * Target: dictionary path ≪ 150ms/item (local regex only).
 */
export function resolveProcurementIntent(itemName: string): ProcurementSearchProfile {
  const started = Date.now()
  const raw = String(itemName || '')
    .replace(/\s+/g, ' ')
    .trim()
  const normalized = normalizeProcurementText(raw)

  if (!raw) {
    return {
      intent: 'unknown',
      domain: 'unknown',
      type: 'unknown',
      search_terms: [],
      supplier_archetypes: [],
      exclude: [],
      confidence: 0,
      source: 'unknown',
      raw,
      debug: { reason: 'EMPTY', elapsed_ms: Date.now() - started },
    }
  }

  const dict = dictionaryHit(normalized)
  if (dict) {
    return {
      intent: dict.intent,
      domain: dict.domain,
      type: dict.type,
      search_terms: uniqueTerms(dict.search_terms),
      supplier_archetypes: [...dict.supplier_archetypes],
      exclude: [...dict.exclude],
      confidence: dict.confidence,
      source: 'dictionary',
      family_id: dict.family_id || null,
      raw,
      debug: { elapsed_ms: Date.now() - started, ai_attempted: false },
    }
  }

  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 4)

  return {
    intent: 'unknown',
    domain: 'unknown',
    type: 'unknown',
    search_terms: tokens,
    supplier_archetypes: [],
    exclude: [],
    confidence: tokens.length ? 0.2 : 0,
    source: 'unknown',
    family_id: null,
    raw,
    debug: {
      reason: 'DICTIONARY_MISS',
      elapsed_ms: Date.now() - started,
      ai_attempted: false,
    },
  }
}

export type IntentBatchResult = {
  lines: Array<{ line_id: string; name: string; profile: ProcurementSearchProfile }>
  pools: Array<{
    pool_key: string
    intent: string
    domain: string
    search_terms: string[]
    supplier_archetypes: string[]
    exclude: string[]
    line_ids: string[]
  }>
  unique_intent_count: number
  line_count: number
  elapsed_ms: number
}

/** Same intent → one supplier pool retrieval, then per-line rank. */
export function resolveProcurementIntentBatch(
  items: Array<string | { id?: string | number; name?: string; name_ar?: string }>,
): IntentBatchResult {
  const started = Date.now()
  const lines: IntentBatchResult['lines'] = []
  const pools = new Map<string, IntentBatchResult['pools'][number]>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const name =
      typeof item === 'string' ? item : String(item?.name_ar || item?.name || '')
    const lineId =
      typeof item === 'object' && item
        ? String(item.id ?? i)
        : String(i)
    const profile = resolveProcurementIntent(name)
    lines.push({ line_id: lineId, name, profile })

    if (!profile.search_terms.length || profile.intent === 'not_supply') continue
    const poolKey =
      profile.intent !== 'unknown' ? profile.intent : `line:${lineId}`
    if (!pools.has(poolKey)) {
      pools.set(poolKey, {
        pool_key: poolKey,
        intent: profile.intent,
        domain: profile.domain,
        search_terms: profile.search_terms,
        supplier_archetypes: profile.supplier_archetypes,
        exclude: profile.exclude,
        line_ids: [],
      })
    }
    pools.get(poolKey)!.line_ids.push(lineId)
  }

  return {
    lines,
    pools: [...pools.values()],
    unique_intent_count: pools.size,
    line_count: lines.length,
    elapsed_ms: Date.now() - started,
  }
}

export function hitsExcludeTerms(
  haystack: string,
  excludeTerms: string[] = [],
): boolean {
  const hay = normalizeProcurementText(haystack)
  if (!hay) return false
  for (const term of excludeTerms) {
    const n = normalizeProcurementText(term)
    if (n && hay.includes(n)) return true
  }
  return false
}

export function scoreSupplierAgainstProfile(
  haystack: string,
  profile: ProcurementSearchProfile,
): { score: number; vetoed: boolean; matched: string[] } {
  const hay = normalizeProcurementText(haystack)
  if (!hay || !profile) return { score: 0, vetoed: false, matched: [] }

  if (hitsExcludeTerms(hay, profile.exclude || [])) {
    return { score: 0, vetoed: true, matched: [] }
  }

  let score = 0
  const matched: string[] = []
  for (const term of profile.search_terms || []) {
    const n = normalizeProcurementText(term)
    if (n && hay.includes(n)) {
      score += 2
      matched.push(term)
    }
  }
  for (const arch of profile.supplier_archetypes || []) {
    const n = normalizeProcurementText(arch)
    if (n && hay.includes(n)) {
      score += 3
      matched.push(arch)
    }
  }
  return { score, vetoed: false, matched }
}

export { INTENT_DICTIONARY }
