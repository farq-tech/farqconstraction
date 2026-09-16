/**
 * Procurement Intent Engine — three-level timing, pool-reuse and AI-economics
 * report over the real BOQ fixtures in `fixtures/boq/`.
 *
 * Levels are taken from the ONTOLOGY'S OWN RESOLVER (`resolveOntology` in
 * `src/lib/procurementOntology.ts`, version `cpo-v2`). This script never
 * classifies lines itself — it adapts the resolver's answer through the API
 * port and measures. `listIntentIds()` / `listFamilyIds()` are treated as the
 * authoritative vocabulary and cross-checked against the port.
 *
 * THREE LEVELS ONLY:
 *   A specific_intent · B family · C unresolved
 * `ai_required` is not a level. Inside C: `semantic_recovered`, `ai_eligible`,
 * `rejected`, plus `ai_result`. Non-supply lines are reported outside the
 * distribution, never as a fourth level.
 *
 * Measurement honesty:
 *   · resolve timings and level counts are REAL — real booklets, the real
 *     parser, the real `cpo-v2` resolver;
 *   · the supplier-pool BUILD is synthetic (a generated catalog scanned with
 *     the real scorer) because the local construction DB is unreachable. The
 *     cache overhead measured around it — key build, store, read — is real.
 *     Labelled `synthetic_pool_build` everywhere;
 *   · the AI leg is mocked. The live provider path is unverified and no money
 *     is spent.
 *
 * Usage:
 *   node scripts/intent-timing-report.mjs
 *   node scripts/intent-timing-report.mjs --json
 *   node scripts/intent-timing-report.mjs --catalog 5000
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const API_ROOT = '/Users/m4pro/farq/api'
const ONTOLOGY_DATA = resolve('src/lib/procurementOntology.data.json')
const DEFAULT_FIXTURES = [
  'fixtures/boq/warehouse-ops-02.flat.txt',
  'fixtures/boq/site-safety-02.flat.txt',
  'fixtures/boq/datacenter-cyber-01.flat.txt',
]

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const catalogSize = Number(args[args.indexOf('--catalog') + 1]) || 2000
const paths = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--catalog')
const fixtures = (paths.length ? paths : DEFAULT_FIXTURES).filter((p) => {
  if (existsSync(resolve(p))) return true
  console.warn(`skip missing fixture: ${p}`)
  return false
})
if (!fixtures.length) {
  console.error('no fixtures to measure')
  process.exit(1)
}

// Point the API port at the frozen ontology BEFORE loading it, so it runs
// non-degraded. (Known gap: the ontology ships in the UI repo only.)
process.env.CONSTRUCTION_PROCUREMENT_ONTOLOGY_DATA = ONTOLOGY_DATA

const apiRequire = createRequire(`${API_ROOT}/package.json`)
const port = apiRequire('./lib/construction/procurement-ontology-port')
const poolCache = apiRequire('./lib/construction/procurement-intent-pool-cache')
const intentAi = apiRequire('./lib/construction/procurement-intent-ai')
const engine = apiRequire('./lib/construction/procurement-intent-engine')

const { RESOLUTION_LEVELS } = port
const CACHE_ON = { CONSTRUCTION_INTENT_POOL_CACHE: '1' }
const LEVELS = ['A', 'B', 'C']

const percentile = (values, p) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return +sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(3)
}
const mean = (v) => (v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null)
const stat = (v) => ({
  n: v.length,
  mean_ms: mean(v),
  p50_ms: percentile(v, 50),
  p95_ms: percentile(v, 95),
  max_ms: v.length ? +Math.max(...v).toFixed(3) : null,
})
const emptyByLevel = () => ({ A: [], B: [], C: [] })

/**
 * Synthetic supplier catalog — the local construction DB is unreachable, so the
 * pool BUILD cost is generated rather than observed.
 */
function syntheticCatalog(size) {
  const archetypes = [
    'مؤسسة ديكورات وتشطيبات وكسوة أعمدة',
    'شركة دهانات وطلاء',
    'مورد بلاط وبورسلان وسيراميك',
    'شركة شبكات وتيار خفيف',
    'مؤسسة مواد كهربائية وافياش وسويتشات',
    'شركة أنظمة حريق وسلامة وطفايات',
    'مورد إنارة وبانل LED وسبوت لايت',
    'خرسانة جاهزة وحديد تسليح',
    'مقاول سباكة وأعمال صحية',
    'مضخات وطلمبات غاطسة',
    'مورد قطاعات حديد مجلفن',
    'شركة كاميرات مراقبة وكنترول دخول',
  ]
  const cities = ['الرياض', 'جدة', 'الدمام']
  return Array.from({ length: size }, (_, i) => ({
    id: `syn-${i}`,
    haystack: `${archetypes[i % archetypes.length]} ${i} ${cities[i % cities.length]}`,
  }))
}
const catalog = syntheticCatalog(catalogSize)

/** The real scorer over the synthetic catalog — this IS the pool build. */
function buildPool(profile) {
  const scored = []
  for (const row of catalog) {
    const { score, vetoed } = engine.scoreSupplierAgainstProfile(row.haystack, profile)
    if (!vetoed && score > 0) scored.push({ id: row.id, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 100)
}

/** A search profile good enough to exercise the scorer, from a resolution. */
function profileForResolution(res, name) {
  return {
    intent: res.intent || res.family || 'unknown',
    domain: res.family || 'unknown',
    type: 'product',
    search_terms: res.search_terms?.length ? res.search_terms : [name],
    supplier_archetypes: res.supplier_terms || [],
    exclude: res.negative_terms || [],
    confidence: res.confidence || 0,
    raw: name,
  }
}

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

const report = {
  measured_at: new Date().toISOString(),
  contract: 'three levels only (A/B/C); ai_eligible is metadata inside C, not a level',
  ontology: {},
  vocabulary_crosscheck: {},
  cache: {},
  synthetic_pool_build: { catalog_rows: catalog.length, reason: 'local construction DB unreachable' },
  ai_leg: 'mocked — live provider path unverified, no spend',
  fixtures: [],
  totals: null,
}

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')
  const ont = await server.ssrLoadModule('/src/lib/procurementOntology.ts')

  report.ontology = {
    version: ont.ONTOLOGY_VERSION,
    port_version: port.ontologyVersion(),
    port_degraded: port.ontology().degraded,
    port_origin: port.ontology().origin,
    fingerprint: port.ontologyFingerprint(),
    resolver: 'resolveOntology (ontology lane) — this script does not classify',
  }

  // `listIntentIds()` / `listFamilyIds()` are authoritative. Fail loudly on drift.
  const realIntents = ont.listIntentIds()
  const realFamilies = ont.listFamilyIds()
  const portIntents = port.listIntentIds()
  const portFamilies = port.listFamilyIds()
  report.vocabulary_crosscheck = {
    intents: { authoritative: realIntents.length, port: portIntents.length, match: JSON.stringify(realIntents) === JSON.stringify(portIntents) },
    families: { authoritative: realFamilies.length, port: portFamilies.length, match: JSON.stringify(realFamilies) === JSON.stringify(portFamilies) },
    pool_affecting_facets: port.ontologyVocabulary().pool_affecting_facet_keys,
  }

  report.cache = poolCache.cacheStatus(CACHE_ON)

  // The resolver's own `level` field, unadapted — kept alongside the
  // contract-aligned counts so the mismatch is visible, not hidden.
  const rawLevelField = {}
  const bySource = {}
  const nonPoolableBySource = {}
  let poolableCount = 0

  const grand = {
    lines: 0,
    by_level: { A: 0, B: 0, C: 0 },
    poolable: 0,
    c_buckets: { ai_eligible: 0, rejected: 0 },
    not_supplyable: 0,
    resolve: emptyByLevel(),
    pool_cold: emptyByLevel(),
    pool_warm: emptyByLevel(),
    unique_exact_intents: new Set(),
    unique_family_pools: new Set(),
    unique_pool_keys: new Set(),
    lines_reusing_pool: 0,
    pool_affecting_facet_hits: {},
  }

  for (const fixture of fixtures) {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines, source } = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    const clean = parse.sanitizeBoqLines(lines)

    const perLevelResolve = emptyByLevel()
    const byLevel = { A: 0, B: 0, C: 0 }
    const buckets = { ai_eligible: 0, rejected: 0 }
    let fixturePoolable = 0
    const poolKeys = new Map()
    const exactIntents = new Set()
    const familyPools = new Set()
    let reusing = 0
    let notSupplyable = 0

    for (const line of clean) {
      // REAL resolver, then adapt. No local classification.
      const t0 = performance.now()
      const raw = ont.resolveOntology(line.name)
      const res = port.adoptResolution(raw)
      const elapsed = performance.now() - t0

      // Both readings are reported, because the resolver's `level` field and
      // its own UnresolvedBucket docs disagree about semantic recovery.
      rawLevelField[raw.level] = (rawLevelField[raw.level] || 0) + 1
      bySource[raw.source] = (bySource[raw.source] || 0) + 1
      if (raw.poolable) { poolableCount++; grand.poolable++ }
      else nonPoolableBySource[raw.source] = (nonPoolableBySource[raw.source] || 0) + 1

      byLevel[res.level]++
      perLevelResolve[res.level].push(elapsed)
      if (!res.supplyable) notSupplyable++
      if (res.level === RESOLUTION_LEVELS.UNRESOLVED && res.unresolved_bucket) {
        buckets[res.unresolved_bucket] = (buckets[res.unresolved_bucket] || 0) + 1
      }
      if (res.poolable) fixturePoolable++
      if (res.level === RESOLUTION_LEVELS.EXACT && res.intent) {
        exactIntents.add(res.intent)
        grand.unique_exact_intents.add(res.intent)
      }
      if (res.level === RESOLUTION_LEVELS.FAMILY && res.family) {
        familyPools.add(res.family)
        grand.unique_family_pools.add(res.family)
      }
      for (const name of Object.keys(res.pool_facets || {})) {
        grand.pool_affecting_facet_hits[name] = (grand.pool_affecting_facet_hits[name] || 0) + 1
      }

      // Pooling is gated on `poolable`, never on a level. A non-poolable line
      // (semantic recovery, rejected, unresolved) gets no key and no pool.
      if (!res.poolable) continue

      const key = poolCache.intentPoolCacheKey({
        actorId: 'measurement-company',
        scope: 'all',
        poolable: true,
        level: res.level,
        family: res.family,
        category: res.category,
        intent: res.intent,
        facets: res.pool_facets,
      })
      grand.unique_pool_keys.add(key)
      if (poolKeys.has(key)) {
        reusing++
        grand.lines_reusing_pool++
        poolKeys.get(key).lines++
      } else {
        poolKeys.set(key, { level: res.level, profile: profileForResolution(raw, line.name), res, lines: 1 })
      }
    }

    // Pool build: cold vs warm (SYNTHETIC build, real cache mechanism).
    poolCache._resetMemoryLayer()
    const coldByLevel = emptyByLevel()
    const warmByLevel = emptyByLevel()
    for (const [, pool] of poolKeys) {
      const keyParts = {
        actorId: 'measurement-company',
        scope: 'all',
        poolable: true,
        level: pool.level,
        family: pool.res.family,
        category: pool.res.category,
        intent: pool.res.intent,
        facets: pool.res.pool_facets,
      }
      const t0 = performance.now()
      await poolCache.cachedIntentPool(keyParts, async () => buildPool(pool.profile), { env: CACHE_ON })
      coldByLevel[pool.level].push(performance.now() - t0)

      const t1 = performance.now()
      await poolCache.cachedIntentPool(keyParts, async () => buildPool(pool.profile), { env: CACHE_ON })
      warmByLevel[pool.level].push(performance.now() - t1)
    }

    grand.lines += clean.length
    grand.not_supplyable += notSupplyable
    for (const level of LEVELS) {
      grand.by_level[level] += byLevel[level]
      grand.resolve[level].push(...perLevelResolve[level])
      grand.pool_cold[level].push(...coldByLevel[level])
      grand.pool_warm[level].push(...warmByLevel[level])
    }
    for (const bucket of Object.keys(buckets)) grand.c_buckets[bucket] += buckets[bucket]

    report.fixtures.push({
      fixture,
      parse_source: source,
      lines: clean.length,
      by_level: byLevel,
      poolable: fixturePoolable,
      level_percent: Object.fromEntries(LEVELS.map((l) => [l, +((byLevel[l] / clean.length) * 100).toFixed(1)])),
      c_buckets: buckets,
      not_supplyable: notSupplyable,
      resolve_ms: { level_a: stat(perLevelResolve.A), level_b: stat(perLevelResolve.B), level_c: stat(perLevelResolve.C) },
      pool_build_ms_synthetic: {
        level_a: { cold: stat(coldByLevel.A), warm: stat(warmByLevel.A) },
        level_b: { cold: stat(coldByLevel.B), warm: stat(warmByLevel.B) },
        level_c: { cold: stat(coldByLevel.C), warm: stat(warmByLevel.C) },
      },
      pool_reuse: {
        total_lines: clean.length,
        unique_exact_intents: exactIntents.size,
        unique_family_pools: familyPools.size,
        unique_pools: poolKeys.size,
        lines_reusing_pool: reusing,
      },
    })
  }

  /* ---------------------- AI economics on the real C lines ---------------- */

  const aiEligibleLines = []
  for (const fixture of fixtures) {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines } = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    for (const line of parse.sanitizeBoqLines(lines)) {
      const raw = ont.resolveOntology(line.name)
      if (raw.level === 'unresolved' && raw.ai_eligible) {
        aiEligibleLines.push({ line_id: String(line.id), name: line.name, resolution: raw })
      }
    }
  }

  const store = createMemoryLearningStore()
  const vocabulary = port.ontologyVocabulary()
  const firstIntent = vocabulary.intents[0]
  const placement = port.locateIntent(firstIntent)
  const mockProvider = {
    configured: true,
    provider: 'mock',
    model: 'mock-model',
    calls: 0,
    async propose(inputs) {
      this.calls++
      // A valid in-vocabulary placement so the learning/warm path is exercised.
      return {
        status: 'PROPOSED',
        calls: 1,
        usage: null,
        proposals: inputs.map((i) => ({
          id: i.id,
          family: placement.family,
          category: placement.category,
          intent: placement.intent,
          facets: [],
          confidence: 0.9,
        })),
      }
    },
  }

  const aiEnv = { CONSTRUCTION_PROCUREMENT_INTENT_AI: '1', CONSTRUCTION_AI_ENABLED: '1' }
  const t0 = performance.now()
  const cold = await intentAi.resolveMissesWithLearning({
    lines: aiEligibleLines,
    pool: store,
    actor: { actorId: 'measurement-company' },
    env: aiEnv,
    provider: mockProvider,
  })
  const coldMs = performance.now() - t0

  const t1 = performance.now()
  const warm = await intentAi.resolveMissesWithLearning({
    lines: aiEligibleLines,
    pool: store,
    actor: { actorId: 'measurement-company' },
    env: aiEnv,
    provider: mockProvider,
  })
  const warmMs = performance.now() - t1

  const maxItems = intentAi.maxItemsPerCall(aiEnv)
  report.ai_economics = {
    note: 'provider MOCKED; learning store is an in-memory stand-in for construction.product_knowledge',
    ai_eligible_lines: aiEligibleLines.length,
    unique_ai_eligible_cores: cold.stats.unique_ai_eligible_cores,
    max_items_per_call: maxItems,
    calls_needed_for_full_coverage: Math.ceil(cold.stats.unique_ai_eligible_cores / maxItems),
    cold: {
      total_ms: +coldMs.toFixed(3),
      local_pre_ai_ms: cold.stats.local_pre_ai_ms,
      ai_ms: cold.stats.ai_ms,
      ai_calls: cold.stats.ai_calls,
      ai_accepted: cold.stats.ai_accepted,
      ai_rejected: cold.stats.ai_rejected.length,
    },
    warm: {
      total_ms: +warmMs.toFixed(3),
      ai_calls: warm.stats.ai_calls,
      candidate_store_hits: warm.stats.candidate_store_hits,
      negative_cache_skips: warm.stats.negative_cache_skips,
    },
  }

  report.resolver_level_field = {
    note: 'raw `resolution.level` strings from cpo-v2, for cross-checking only',
    counts: rawLevelField,
    by_source: bySource,
    non_poolable_by_source: nonPoolableBySource,
    poolable: poolableCount,
  }

  report.totals = {
    lines: grand.lines,
    // REPORTING: how each line resolved (level_code from the resolver).
    by_level: grand.by_level,
    // CONSUMPTION: how many lines may key a supplier pool.
    poolable: grand.poolable,
    poolable_percent: +((grand.poolable / grand.lines) * 100).toFixed(1),
    level_b_not_poolable: grand.by_level.B - (grand.poolable - grand.by_level.A),
    level_percent: Object.fromEntries(LEVELS.map((l) => [l, +((grand.by_level[l] / grand.lines) * 100).toFixed(1)])),
    local_usable_a_plus_b: grand.by_level.A + grand.by_level.B,
    local_usable_percent: +(((grand.by_level.A + grand.by_level.B) / grand.lines) * 100).toFixed(1),
    c_buckets: grand.c_buckets,
    not_supplyable: grand.not_supplyable,
    resolve_ms: { level_a: stat(grand.resolve.A), level_b: stat(grand.resolve.B), level_c: stat(grand.resolve.C) },
    pool_build_ms_synthetic: {
      level_a: { cold: stat(grand.pool_cold.A), warm: stat(grand.pool_warm.A) },
      level_b: { cold: stat(grand.pool_cold.B), warm: stat(grand.pool_warm.B) },
      level_c: { cold: stat(grand.pool_cold.C), warm: stat(grand.pool_warm.C) },
    },
    pool_reuse: {
      total_lines: grand.lines,
      unique_exact_intents: grand.unique_exact_intents.size,
      unique_family_pools: grand.unique_family_pools.size,
      unique_pool_keys: grand.unique_pool_keys.size,
      lines_reusing_pool: grand.lines_reusing_pool,
      reuse_percent: +((grand.lines_reusing_pool / grand.lines) * 100).toFixed(1),
    },
    pool_affecting_facet_hits: grand.pool_affecting_facet_hits,
  }

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else printReport(report)

  writeFileSync('fixtures/boq/last-intent-timing.json', JSON.stringify(report, null, 2))
} finally {
  await server.close()
}

/** In-memory stand-in for construction.product_knowledge (DB unreachable). */
function createMemoryLearningStore() {
  const rows = new Map()
  return {
    async query(sql, params = []) {
      if (/query_key = any/.test(sql)) {
        const [owner, keys] = params
        return {
          rows: (keys || [])
            .map((key) => rows.get(`${owner}\u0000${key}`))
            .filter(Boolean)
            .map((row) => ({ ...row, retry_allowed: row.next_attempt_at <= Date.now() })),
        }
      }
      if (/^insert into construction\.product_knowledge/is.test(sql)) {
        const [owner, key, label, concept, status, retryAfter] = params
        const hours = /hour/.test(retryAfter) ? parseInt(retryAfter, 10) : 24 * 30
        rows.set(`${owner}\u0000${key}`, {
          query_key: key,
          input_label: label,
          concept: JSON.parse(concept),
          status,
          updated_at: new Date(),
          next_attempt_at: Date.now() + hours * 3600_000,
        })
      }
      return { rows: [] }
    },
  }
}

function printReport(r) {
  const o = r.ontology
  console.log(`\nontology : ${o.version} via ${o.resolver}`)
  console.log(`port     : ${o.port_version} degraded=${o.port_degraded} origin=${o.port_origin} fp=${o.fingerprint}`)
  const x = r.vocabulary_crosscheck
  console.log(`vocab    : intents ${x.intents.port}/${x.intents.authoritative} match=${x.intents.match} · families ${x.families.port}/${x.families.authoritative} match=${x.families.match}`)
  console.log(`pool-affecting facets (from ontology): ${x.pool_affecting_facets.join(', ')}`)
  console.log(`cache    : enabled=${r.cache.enabled} ttl=${r.cache.ttl_seconds}s shared=${r.cache.shared_layer} in_process_fallback=${r.cache.degraded_to_in_process}`)
  console.log(`pool build is SYNTHETIC (${r.synthetic_pool_build.catalog_rows} generated rows): ${r.synthetic_pool_build.reason}`)

  for (const f of r.fixtures) {
    console.log(`\n=== ${f.fixture} (${f.parse_source}) ===`)
    console.log(`lines=${f.lines}  A=${f.by_level.A} (${f.level_percent.A}%)  B=${f.by_level.B} (${f.level_percent.B}%)  C=${f.by_level.C} (${f.level_percent.C}%)`)
    console.log(`  poolable=${f.poolable} | inside C: ai_eligible=${f.c_buckets.ai_eligible} rejected=${f.c_buckets.rejected} | not_supplyable=${f.not_supplyable}`)
    for (const [label, key] of [['A', 'level_a'], ['B', 'level_b'], ['C', 'level_c']]) {
      const s = f.resolve_ms[key]
      if (s.n) console.log(`  resolve ${label} n=${String(s.n).padStart(4)} mean=${s.mean_ms}ms p95=${s.p95_ms}ms max=${s.max_ms}ms`)
    }
    for (const [label, key] of [['A', 'level_a'], ['B', 'level_b'], ['C', 'level_c']]) {
      const p = f.pool_build_ms_synthetic[key]
      if (p.cold.n) console.log(`  pool ${label} (synthetic) cold mean=${p.cold.mean_ms}ms  warm mean=${p.warm.mean_ms}ms  pools=${p.cold.n}`)
    }
    const u = f.pool_reuse
    console.log(`  pool reuse: ${u.total_lines} lines, ${u.unique_exact_intents} unique exact intents, ${u.unique_family_pools} unique family pools, ${u.unique_pools} pool keys, ${u.lines_reusing_pool} lines reused a pool`)
  }

  const t = r.totals
  console.log('\n=== TOTALS ===')
  console.log(`lines=${t.lines}`)
  for (const l of ['A', 'B', 'C']) console.log(`  Level ${l}: ${String(t.by_level[l]).padStart(4)}  ${t.level_percent[l]}%`)
  console.log(`  local usable (A+B, reporting): ${t.local_usable_a_plus_b}  ${t.local_usable_percent}%`)
  console.log(`  POOLABLE (consumption)       : ${t.poolable}  ${t.poolable_percent}%`)
  console.log(`  Level B but NOT poolable     : ${t.level_b_not_poolable}`)
  console.log(`  inside C (metadata, not levels): ai_eligible=${t.c_buckets.ai_eligible} rejected=${t.c_buckets.rejected}`)
  console.log(`  not_supplyable (outside the distribution): ${t.not_supplyable}`)
  for (const [label, key] of [['A', 'level_a'], ['B', 'level_b'], ['C', 'level_c']]) {
    const s = t.resolve_ms[key]
    if (s.n) console.log(`  resolve ${label} n=${String(s.n).padStart(4)} mean=${s.mean_ms}ms p95=${s.p95_ms}ms max=${s.max_ms}ms`)
  }
  for (const [label, key] of [['A', 'level_a'], ['B', 'level_b'], ['C', 'level_c']]) {
    const p = t.pool_build_ms_synthetic[key]
    if (p.cold.n) console.log(`  pool ${label} (synthetic) cold mean=${p.cold.mean_ms}ms  warm mean=${p.warm.mean_ms}ms  pools=${p.cold.n}`)
  }
  const u = t.pool_reuse
  console.log(`  pool reuse: ${u.total_lines} lines, ${u.unique_exact_intents} unique exact intents, ${u.unique_family_pools} unique family pools, ${u.unique_pool_keys} pool keys, ${u.lines_reusing_pool} lines reused a pool (${u.reuse_percent}%)`)
  console.log(`  pool-affecting facets actually seen: ${JSON.stringify(t.pool_affecting_facet_hits)}`)

  const rl = r.resolver_level_field
  console.log(`\n=== RESOLVER FIELD vs CONTRACT ===\n  ${rl.note}`)
  console.log(`  raw level field : ${JSON.stringify(rl.counts)}`)
  console.log(`  by source       : ${JSON.stringify(rl.by_source)}`)
  console.log(`  NON-poolable by source: ${JSON.stringify(rl.non_poolable_by_source)}`)
  console.log(`  poolable (resolver field): ${rl.poolable}`)

  const a = r.ai_economics
  console.log(`\n=== AI ECONOMICS ===\n  ${a.note}`)
  console.log(`  ai_eligible lines=${a.ai_eligible_lines}  unique cores=${a.unique_ai_eligible_cores}  max/call=${a.max_items_per_call}  calls for full coverage=${a.calls_needed_for_full_coverage}`)
  console.log(`  cold: total=${a.cold.total_ms}ms local_pre_ai=${a.cold.local_pre_ai_ms}ms ai=${a.cold.ai_ms}ms calls=${a.cold.ai_calls} accepted=${a.cold.ai_accepted} rejected=${a.cold.ai_rejected}`)
  console.log(`  warm: total=${a.warm.total_ms}ms calls=${a.warm.ai_calls} candidate_hits=${a.warm.candidate_store_hits} negative_skips=${a.warm.negative_cache_skips}`)
}
