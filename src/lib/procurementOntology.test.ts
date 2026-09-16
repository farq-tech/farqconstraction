import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ONTOLOGY_VERSION,
  describeIntent,
  evaluateSupplier,
  isKnownFamilyId,
  isKnownIntentId,
  isUniqueStrongTerm,
  listFamilyIds,
  listIntentIds,
  listOntologyIds,
  normalizeProcurementText,
  rankSuppliers,
  resolveOntology,
  resolveOntologyBatch,
  termIndex,
  FAMILIES,
  FACET_DEFS,
  SECTORS,
} from './procurementOntology'

const resolve = (name: string) => resolveOntology(name)

/**
 * Regression guard for a MISLABELLING bug measured on RFQ ELE-RFQ-51D17AF6, a
 * different failure class from anything the A/B/C levels describe: ten
 * unrelated PPE lines were all relabelled «ألواح أو إس بي» (OSB wood panel) and
 * sent to a tools supplier, which is what produced the «غير متوفر» replies.
 *
 * The first four strings are verbatim from the inbox agent's `original_name`
 * trace; the rest are same-class PPE from the same booklet. A line may resolve
 * confidently and still be renamed to something it is not, so this guard asserts
 * on WHAT a line is, not on how well it resolved.
 */
const PPE_LINES_FROM_RFQ = [
  'قبعة حماية',
  'بدلة مقاومة للهب',
  'جزمة PVC',
  'مريلة جلدية',
  'قفازات جلدية',
  'واقي سمع',
  'نظارة أمان',
  'كمامة نصف وجه',
  'حزام أمان للسقوط',
  'سديري عاكس',
]

/** Anything that would represent a wood panel / cladding board. */
const WOOD_PANEL_PATTERN = /osb|wood|timber|plywood|panel|board|clad|خشب|الواح/i

describe('mislabelling guard: PPE lines must never become a wood panel', () => {
  it.each(PPE_LINES_FROM_RFQ)('%s does not resolve to an OSB/wood-panel concept', (line) => {
    const r = resolve(line)
    for (const id of [r.family, r.category, r.intent]) {
      if (id) expect(id).not.toMatch(WOOD_PANEL_PATTERN)
    }
    for (const term of r.search_terms) expect(term).not.toMatch(/osb|او اس بي|أو إس بي/i)
  })

  it('the ontology has no OSB concept to be renamed onto in the first place', () => {
    const ids = [...listFamilyIds(), ...listIntentIds()]
    expect(ids.filter((id) => /osb/i.test(id))).toEqual([])
    expect(resolve('توريد ألواح أو إس بي OSB').family).toBeNull()
  })

  it('PPE lines stay inside SAFETY_PPE when they resolve to a family at all', () => {
    for (const line of PPE_LINES_FROM_RFQ) {
      const r = resolve(line)
      // Recovery leaves sector null by design; what matters is it is never wood.
      if (r.sector) expect(r.sector).toBe('SAFETY_PPE')
    }
  })

  it('a PPE line never earns a wood/cladding supplier archetype', () => {
    for (const line of PPE_LINES_FROM_RFQ) {
      const r = resolve(line)
      for (const archetype of [...r.preferred_archetypes, ...r.allowed_archetypes]) {
        expect(archetype).not.toMatch(/wood|timber|panel|clad|خشب/i)
      }
    }
  })
})

describe('no field may imply a family the resolution does not have', () => {
  // Two sibling lanes read `level` and reached opposite B counts (384 vs 329)
  // because the old B value was literally named `family` while a recovered line
  // carries `family === null`. These assert the fields can never disagree again.
  const LINES = [
    'توريد كاميرا مراقبة IP 4 MP', // A
    'توريد لوحة توزيع كهربائية رئيسية 1600A', // B, real family
    'توريد لوح تنظيم أدوات Pegboard Steel', // B, semantic recovery
    'توريد منشار شريطي معدني Band Saw', // B, semantic recovery
    'Pegboard Steel', // C
    'أجور تركيب فقط بدون مواد', // C, rejected
  ]

  it('poolable is true exactly when a pool key exists', () => {
    for (const line of LINES) {
      const r = resolve(line)
      expect(r.poolable).toBe(r.pool_key !== null)
    }
  })

  it('a null family can never be poolable, and vice versa', () => {
    for (const line of LINES) {
      const r = resolve(line)
      if (!r.family) expect(r.poolable).toBe(false)
      if (r.poolable) expect(r.family).toBeTruthy()
    }
  })

  it('level_code agrees with level on every line', () => {
    const expected = { specific_intent: 'A', local_resolved: 'B', unresolved: 'C' } as const
    for (const line of LINES) {
      const r = resolve(line)
      expect(r.level_code).toBe(expected[r.level])
    }
  })

  it('the B value is not named after a field that may be null', () => {
    // Guards the rename: `level: 'family'` was the misleading field.
    const r = resolve('توريد لوح تنظيم أدوات Pegboard Steel')
    expect(r.level).toBe('local_resolved')
    expect(r.level).not.toBe('family')
    expect(r.family).toBeNull()
  })

  it('a semantic recovery carries no family, no pool key and no archetypes', () => {
    // «Pegboard Steel» must NOT become translucent_roofing just because the weak
    // term «لوح» belongs to that family — nor Band Saw become hand_tools.
    for (const line of [
      'توريد لوح تنظيم أدوات Pegboard Steel',
      'توريد منشار شريطي معدني Band Saw',
    ]) {
      const r = resolve(line)
      expect(r.source).toBe('semantic_recovery')
      expect(r.level_code).toBe('B')
      expect(r.family).toBeNull()
      expect(r.sector).toBeNull()
      expect(r.intent).toBeNull()
      expect(r.pool_key).toBeNull()
      expect(r.cache_key).toBeNull()
      expect(r.poolable).toBe(false)
      expect(r.preferred_archetypes).toEqual([])
      expect(r.allowed_archetypes).toEqual([])
      // It still terminates locally: reported B, and never sent to the model.
      expect(r.ai_eligible).toBe(false)
      expect(r.search_terms.length).toBeGreaterThan(0)
    }
  })

  it('recovered lines never share a pool with a confident family', () => {
    const batch = resolveOntologyBatch([
      'توريد لوح تنظيم أدوات Pegboard Steel',
      'توريد لوح بولي كربونيت شفاف للسقف',
      'توريد منشار شريطي معدني Band Saw',
    ])
    const [pegboard, polycarbonate, bandsaw] = batch.lines.map((l) => l.resolution)
    expect(polycarbonate!.family).toBe('translucent_roofing')
    expect(pegboard!.family).toBeNull()
    // The recovery must not land in the polycarbonate pool.
    const pools = new Map(batch.pools.map((p) => [p.pool_key, p]))
    // Only the polycarbonate line is in that pool; the recoveries are per-line.
    expect(pools.get('translucent_roofing')!.line_ids).toHaveLength(1)
    expect(bandsaw!.family).toBeNull()
    for (const pool of batch.pools) {
      if (pool.pool_key.startsWith('line:')) continue
      expect(pool.pool_key).toBe('translucent_roofing')
    }
  })

  it('batch poolable counts only confident lines, not every Level B line', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP 4 MP',
      'توريد لوحة توزيع كهربائية رئيسية 1600A',
      'توريد لوح تنظيم أدوات Pegboard Steel',
      'Pegboard Steel',
    ])
    const recoveries = batch.family_by_method.semantic_recovery
    expect(recoveries).toBe(1)
    expect(batch.poolable).toBe(
      batch.counts.specific_intent + batch.counts.local_resolved - recoveries,
    )
  })
})

describe('the resolver attaches to a line, it never renames one', () => {
  it('carries no field that could serve as a replacement display name', () => {
    const keys = Object.keys(resolve('قبعة حماية'))
    // A catalog `name_ar` written over the BOQ text is the bug being guarded.
    for (const forbidden of ['name', 'name_ar', 'name_en', 'label', 'display_name', 'title']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('preserves the original description verbatim on every resolution level', () => {
    const lines = [
      ...PPE_LINES_FROM_RFQ,
      'توريد كاميرا مراقبة IP 4 MP', // Level A
      'توريد لوحة توزيع كهربائية رئيسية 1600A', // Level B
      'توريد كاميرا', // Level B via semantic recovery
      'توريد جهاز SD-WAN مركزي', // Level C
    ]
    for (const line of lines) {
      const r = resolve(line)
      // `raw` is the untouched input; normalization lives in `debug.normalized`
      // and `head_concept`, never in place of the human-readable text.
      expect(r.raw).toBe(line)
      expect(r.debug.normalized).not.toBe('')
    }
  })

  it('resolution output is additive: intent and terms sit beside the original text', () => {
    const line = 'توريد قبعة حماية للرأس bump cap'
    const r = resolve(line)
    expect(r.raw).toBe(line)
    expect(r.family).toBe('head_protection')
    expect(r.search_terms.length).toBeGreaterThan(0)
    // Nothing in the output replaces `raw`; the caller keeps its own name.
    expect(r.raw).not.toBe(r.head_concept)
  })
})

describe('term matching rule: Arabic proclitics and full-phrase boundaries', () => {
  // One general rule, proven across unrelated families — not per-term variants.
  it.each([
    ['ادوات صحيه', 'معرض الأدوات الصحية وأطقم الحمامات'],
    ['حديد انشايي', 'مصنع الحديد الإنشائي للقطاعات'],
    ['معدات صناعيه', 'مؤسسة المعدات الصناعية المتحدة'],
    ['اجهزه قياس', 'شركة أجهزة القياس والمعايرة'],
  ])('%s matches %s', (term, text) => {
    expect(termIndex(text, term)).toBeGreaterThanOrEqual(0)
  })

  it('matching runs post-normalization: raw hamza/ة/ى input still matches', () => {
    // The raw text differs from the vocabulary by hamza, taa marbuta and yaa.
    const raw = 'الأدوات الصحية'
    expect(raw).not.toContain(normalizeProcurementText(raw))
    expect(termIndex(raw, 'ادوات صحيه')).toBeGreaterThanOrEqual(0)
    // And the caller does not have to pre-normalize either side.
    expect(termIndex('الإنشائي', 'الانشايي')).toBe(0)
    expect(termIndex('مصنع الحديد الإنشائي', 'حديد انشايي')).toBeGreaterThan(0)
  })

  it('accepts the conjunction and attached article forms', () => {
    expect(termIndex('توريد وتجليد الأعمدة', 'تجليد')).toBeGreaterThan(0)
    expect(termIndex('أعمال بالكسوة الخارجية', 'كسوه')).toBeGreaterThan(0)
    expect(termIndex('حمولة للرفوف المعدنية', 'رفوف')).toBeGreaterThan(0)
  })

  // The negative test is what proves the boundaries exist at all.
  it('a short term does NOT match inside a larger word', () => {
    expect(termIndex('رفع الأحمال بالرافعة', 'رف')).toBe(-1)
    expect(termIndex('صرف صحي', 'رف')).toBe(-1)
    expect(termIndex('طرف الكابل', 'رف')).toBe(-1)
    expect(termIndex('شرف', 'رف')).toBe(-1)
    // but it does match as a standalone word, with or without proclitics
    expect(termIndex('رف معدني', 'رف')).toBe(0)
    expect(termIndex('على الرف المعدني', 'رف')).toBeGreaterThan(0)
  })

  it('boundaries apply to Latin phrases too, not just single words', () => {
    expect(termIndex('stainless steel sectional tank', 'steel section')).toBe(-1)
    expect(termIndex('supply steel section s355', 'steel section')).toBeGreaterThan(0)
    expect(termIndex('qsfp dd module', 'sfp')).toBe(-1)
    expect(termIndex('sfp module 10g', 'sfp')).toBe(0)
  })

  it('a bare كاميرا line is unaffected by the article rule', () => {
    expect(resolve('توريد الكاميرا').intent).toBeNull()
  })
})

describe('ontology data integrity', () => {
  it('has no duplicate JSON keys (last-key-wins must never hide a term list)', () => {
    const text = readFileSync(new URL('./procurementOntology.data.json', import.meta.url), 'utf8')
    const duplicates: string[] = []
    let pos = 0

    const skipWhitespace = () => {
      while (pos < text.length && /\s/.test(text[pos]!)) pos++
    }
    const readString = () => {
      pos++ // opening quote
      let out = ''
      for (;;) {
        const ch = text[pos]!
        if (ch === '\\') {
          out += ch + text[pos + 1]
          pos += 2
          continue
        }
        if (ch === '"') {
          pos++
          return out
        }
        out += ch
        pos++
      }
    }
    const readValue = (path: string) => {
      skipWhitespace()
      const ch = text[pos]
      if (ch === '{') {
        pos++
        const keys = new Set<string>()
        for (;;) {
          skipWhitespace()
          if (text[pos] === '}') {
            pos++
            return
          }
          const key = readString()
          if (keys.has(key)) duplicates.push(`${path}.${key}`)
          keys.add(key)
          skipWhitespace()
          pos++ // colon
          readValue(`${path}.${key}`)
          skipWhitespace()
          if (text[pos] === ',') pos++
        }
      }
      if (ch === '[') {
        pos++
        let index = 0
        for (;;) {
          skipWhitespace()
          if (text[pos] === ']') {
            pos++
            return
          }
          readValue(`${path}[${index++}]`)
          skipWhitespace()
          if (text[pos] === ',') pos++
        }
      }
      if (ch === '"') {
        readString()
        return
      }
      while (pos < text.length && !/[,}\]\s]/.test(text[pos]!)) pos++
    }

    readValue('$')
    expect(duplicates).toEqual([])
  })
})

describe('three-tier terms: a weak term alone never decides', () => {
  // The exact terms the owner flagged as dangerous.
  it.each([
    ['كاميرا', 'كاميرا'],
    ['قارئ', 'قارئ'],
    ['scanner', 'scanner'],
    ['جهاز اختبار', 'جهاز اختبار'],
  ])('bare %s does not reach a specific intent', (_label, line) => {
    const r = resolve(line)
    expect(r.level).not.toBe('specific_intent')
    expect(r.intent).toBeNull()
  })

  it('bare كاميرا does not resolve to any video-surveillance intent', () => {
    const r = resolve('توريد كاميرا')
    expect(r.intent).toBeNull()
    expect(r.category).not.toBe('video_surveillance')
  })

  it('bare قارئ does not resolve to a card reader', () => {
    const r = resolve('توريد قارئ')
    expect(r.intent).not.toBe('card_reader')
    expect(r.level).not.toBe('specific_intent')
  })

  it('bare scanner does not resolve to a document scanner', () => {
    const r = resolve('توريد scanner')
    expect(r.intent).not.toBe('document_scanners')
  })

  it('bare جهاز اختبار does not resolve into network test tools', () => {
    const r = resolve('توريد جهاز اختبار')
    expect(r.family).not.toBe('network_test_tools')
    expect(r.level).not.toBe('specific_intent')
  })

  it('weak term + context term DOES decide', () => {
    expect(resolve('توريد كاميرا مراقبة داخلية').intent).toBe('cctv_camera')
    expect(resolve('توريد قارئ بطاقات دخول MIFARE').intent).toBe('card_reader')
    expect(resolve('توريد scanner مستندات ADF 600 dpi').intent).toBe('document_scanners')
    expect(resolve('توريد جهاز اختبار كابلات شبكة CAT6').family).toBe('network_test_tools')
  })

  it('a strong term decides on its own', () => {
    expect(resolve('NVR').intent).toBe('nvr')
    expect(resolve('PTZ camera').intent).toBe('ptz_camera')
    expect(resolve('قفل مغناطيسي').intent).toBe('electromagnetic_lock')
  })

  it('demoted terms are recorded as weak, not strong, in the data', () => {
    const security = FAMILIES.find((f) => f.id === 'physical_security')!
    expect(security.weak_terms).toContain('كاميرا')
    expect(security.weak_terms).toContain('قارئ')
    expect(security.strong_terms).not.toContain('كاميرا')
    expect(security.strong_terms).not.toContain('قارئ')

    const peripherals = FAMILIES.find((f) => f.id === 'it_peripherals')!
    expect(peripherals.weak_terms).toContain('scanner')
    expect(peripherals.strong_terms).not.toContain('scanner')

    const testTools = FAMILIES.find((f) => f.id === 'network_test_tools')!
    expect(testTools.weak_terms).toContain('جهاز اختبار')
    expect(testTools.strong_terms).not.toContain('جهاز اختبار')
  })
})

describe('three-level contract: A exact intent / B family / C unresolved', () => {
  it('only three levels are ever emitted', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP 4 MP',
      'توريد لوحة توزيع كهربائية 1600A',
      'توريد Network Impairment Emulator',
      'أجور تركيب فقط بدون مواد',
    ])
    const levels = new Set(batch.lines.map((l) => l.resolution.level))
    for (const level of levels) {
      expect(['specific_intent', 'local_resolved', 'unresolved']).toContain(level)
    }
    expect(Object.keys(batch.counts).sort()).toEqual([
      'local_resolved',
      'specific_intent',
      'unresolved',
    ])
  })

  it('Level B is usable WITHOUT AI and never flagged ai_eligible', () => {
    const r = resolve('توريد لوحة توزيع كهربائية رئيسية 1600A')
    expect(r.level).toBe('local_resolved')
    expect(r.ai_eligible).toBe(false)
    expect(r.ai_result).toBe('not_run')
    expect(r.unresolved_bucket).toBeNull()
    expect(r.search_terms.length).toBeGreaterThan(0)
  })

  it('Level A never reaches the model either', () => {
    const r = resolve('توريد كاميرا مراقبة IP 4 MP')
    expect(r.level).toBe('specific_intent')
    expect(r.ai_eligible).toBe(false)
    expect(r.unresolved_bucket).toBeNull()
  })

  it('C metadata is metadata, not a level: the buckets sum to C', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP',
      'توريد Network Impairment Emulator',
      'توريد محاكي BGP/OSPF واسع النطاق',
      'أجور تركيب فقط بدون مواد',
    ])
    const u = batch.unresolved_breakdown
    expect(u.ai_eligible + u.rejected).toBe(batch.counts.unresolved)
  })

  it('B is split by resolution method, and the methods sum to B', () => {
    const batch = resolveOntologyBatch([
      'توريد لوحة توزيع كهربائية رئيسية 1600A',
      'توريد مكثفات تحسين معامل القدرة',
      'توريد خرسانة جاهزة C35',
      'أجور تركيب فقط بدون مواد',
    ])
    const m = batch.family_by_method
    expect(m.lexicon + m.ontology_family + m.semantic_recovery).toBe(batch.counts.local_resolved)
  })

  it('a semantic recovery terminates locally: Level B, never C, never AI eligible', () => {
    // Bare weak terms: ontology vocabulary fires but nothing decides.
    const batch = resolveOntologyBatch([
      'توريد كاميرا',
      'توريد قارئ',
      'توريد scanner',
      'توريد جهاز اختبار',
    ])
    const recovered = batch.lines
      .map((l) => l.resolution)
      .filter((r) => r.source === 'semantic_recovery')
    expect(recovered.length).toBe(4)
    for (const r of recovered) {
      expect(r.level).toBe('local_resolved')
      expect(r.ai_eligible).toBe(false)
      expect(r.unresolved_bucket).toBeNull()
      // Usable without AI: it still carries terms to search on.
      expect(r.search_terms.length).toBeGreaterThan(0)
    }
  })

  it('a recovered line stays out of a supplier pool it never earned', () => {
    // Recovery is Level B, but a weak term alone still decides no family — so
    // the line cannot inherit archetypes or a pool from one.
    const r = resolve('توريد كاميرا')
    expect(r.source).toBe('semantic_recovery')
    expect(r.family).toBeNull()
    expect(r.preferred_archetypes).toEqual([])
    expect(r.pool_key).toBeNull()
  })

  it('no locally-resolved line can be labelled C', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP 4 MP',
      'توريد لوحة توزيع كهربائية رئيسية 1600A',
      'توريد كاميرا',
      'توريد Network Impairment Emulator',
      'أجور تركيب فقط بدون مواد',
    ])
    for (const { resolution } of batch.lines) {
      if (resolution.level !== 'unresolved') continue
      // C means lexical AND ontology AND semantic resolution all failed.
      expect(resolution.family).toBeNull()
      expect(resolution.intent).toBeNull()
      expect(resolution.source).toBe('unresolved')
    }
  })

  it('ai_eligible lines are always a subset of Level C', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP',
      'توريد لوحة توزيع كهربائية',
      'توريد Network Impairment Emulator',
    ])
    for (const { resolution } of batch.lines) {
      if (resolution.ai_eligible) expect(resolution.level).toBe('unresolved')
    }
    expect(batch.ai_eligible).toBe(batch.unresolved_breakdown.ai_eligible)
  })

  it('every Level C line has had the local semantic pass attempted first', () => {
    const batch = resolveOntologyBatch(['توريد Network Impairment Emulator', 'أجور تركيب فقط'])
    for (const { resolution } of batch.lines) {
      if (resolution.level !== 'unresolved') continue
      expect(resolution.semantic_attempted).toBe(true)
      expect(resolution.ai_result).toBe('not_run')
      expect(resolution.unresolved_bucket).toBeTruthy()
    }
  })

  it('a labour-only line is rejected inside C and never AI eligible', () => {
    const r = resolve('أجور تركيب فقط بدون مواد')
    expect(r.level).toBe('unresolved')
    expect(r.unresolved_bucket).toBe('rejected')
    expect(r.ai_eligible).toBe(false)
  })
})

describe('ancestor derivation from a unique strong intent term', () => {
  it('derives the whole chain upward with no term duplicated at any level', () => {
    const r = resolve('توريد كاميرا PTZ زوم 25x')
    expect(r.sector).toBe('DATACENTER_ICT')
    expect(r.family).toBe('physical_security')
    expect(r.category).toBe('video_surveillance')
    expect(r.intent).toBe('ptz_camera')
    expect(r.debug.derived_from_intent).toBe('ptz_camera')
  })

  it('the deriving term is declared ONLY on the intent, never copied upward', () => {
    const family = FAMILIES.find((f) => f.id === 'physical_security')!
    const category = family.categories!.find((c) => c.id === 'video_surveillance')!
    const ptz = category.intents!.find((i) => i.id === 'ptz_camera')!
    expect(ptz.strong_terms).toContain('كاميرا ptz')
    expect(family.strong_terms ?? []).not.toContain('كاميرا ptz')
    expect(category.strong_terms ?? []).not.toContain('كاميرا ptz')
  })

  it('is a general rule: it works for unrelated families with no special casing', () => {
    for (const [line, expected] of [
      ['توريد rope grab للحبل الرأسي', 'rope_grab'],
      ['توريد حامل إنقاذ ثلاثي Tripod Rescue', 'rescue_tripod'],
      ['توريد VAV Box 600 CFM', 'vav_terminal'],
      ['توريد Motorized Fire/Smoke Damper', 'hvac_damper'],
      ['توريد KVM switch 8 ports', 'kvm_console'],
    ] as const) {
      const r = resolve(line)
      expect(r.intent).toBe(expected)
      expect(r.debug.derived_from_intent).toBe(expected)
      expect(r.family).toBeTruthy()
      expect(r.sector).toBeTruthy()
    }
  })

  it('a term shared by several intents is not unique and cannot derive alone', () => {
    // «كاميرا» is weak and «filter»/«فلتر» is shared, so neither derives a chain.
    expect(isUniqueStrongTerm('كاميرا')).toBe(false)
    expect(isUniqueStrongTerm('فلتر')).toBe(false)
    expect(isUniqueStrongTerm('كاميرا ptz')).toBe(true)
  })

  it('composition still wins over a bare unique term', () => {
    // column_cladding requires surface_cladding vocabulary to be present too.
    expect(resolve('توريد وتركيب تجليد أعمدة خشبي').intent).toBe('column_cladding')
    expect(resolve('توريد وتركيب تجليد جدران').intent).toBe('surface_cladding')
  })
})

describe('the four levels are explicit on every resolution', () => {
  it('a specific intent carries sector, family, category and intent', () => {
    const r = resolve('توريد كاميرا مراقبة IP دقة 8 MP')
    expect(r.level).toBe('specific_intent')
    expect(r.sector).toBe('DATACENTER_ICT')
    expect(r.family).toBe('physical_security')
    expect(r.category).toBe('video_surveillance')
    expect(r.intent).toBe('cctv_camera')
  })

  it('a family-only resolution keeps sector and family and is still searchable', () => {
    const r = resolve('توريد لوحة توزيع كهربائية رئيسية 1600A')
    expect(r.level).toBe('local_resolved')
    expect(r.sector).toBe('ELECTRICAL')
    expect(r.family).toBe('switchgear_panels')
    expect(r.intent).toBeNull()
    expect(r.search_terms.length).toBeGreaterThan(0)
  })

  it('every declared intent id is unique', () => {
    const ids = listIntentIds()
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ID surface the sibling lanes consume instead of hardcoding', () => {
  it('exposes intents and families programmatically', () => {
    expect(listIntentIds().length).toBeGreaterThan(0)
    expect(listFamilyIds().length).toBeGreaterThan(0)
    expect(new Set(listFamilyIds()).size).toBe(listFamilyIds().length)
  })

  it('every intent id the resolver can emit is in listIntentIds()', () => {
    const known = new Set(listIntentIds())
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP 4 MP',
      'توريد طابعة بطاقات PVC هوية',
      'توريد قفل مغناطيسي 600 كجم',
      'توريد fusion splicer للألياف',
    ])
    for (const { resolution } of batch.lines) {
      if (resolution.intent) expect(known.has(resolution.intent)).toBe(true)
      if (resolution.family) expect(listFamilyIds()).toContain(resolution.family)
    }
  })

  it('validates unknown ids so the AI lane can reject invented vocabulary', () => {
    expect(isKnownIntentId('cctv_camera')).toBe(true)
    expect(isKnownIntentId('totally_invented_intent')).toBe(false)
    expect(isKnownFamilyId('physical_security')).toBe(true)
    expect(isKnownFamilyId('physical_securityy')).toBe(false)
  })

  it('describeIntent returns the full chain so no lane infers ancestors', () => {
    expect(describeIntent('ptz_camera')).toEqual({
      sector: 'DATACENTER_ICT',
      family: 'physical_security',
      category: 'video_surveillance',
      intent: 'ptz_camera',
    })
    expect(describeIntent('nope')).toBeNull()
  })

  it('the serializable snapshot is versioned and internally consistent', () => {
    const surface = listOntologyIds()
    expect(surface.ontology_version).toBe(ONTOLOGY_VERSION)
    expect(surface.intents).toEqual(listIntentIds())
    expect(surface.families).toEqual(listFamilyIds())
    expect(surface.intent_chains).toHaveLength(surface.intents.length)
    // Every chain points at declared ancestors, so a join can never dangle.
    for (const chain of surface.intent_chains) {
      expect(surface.families).toContain(chain.family)
      expect(surface.sectors).toContain(chain.sector)
      if (chain.category) expect(surface.categories).toContain(chain.category)
    }
  })
})

describe('it_peripherals is split into separate intents', () => {
  it.each([
    ['توريد طابعة ليزر شبكية A4 40 ppm', 'printers'],
    ['توريد ماسح ضوئي مستندات ADF duplex', 'document_scanners'],
    ['توريد طابعة بطاقات PVC هوية مع تشفير', 'card_printers'],
    ['توريد KVM switch 8 ports rack', 'kvm_console'],
    ['توريد لوحة مفاتيح وماوس USB مكتبي', 'keyboards_peripherals'],
  ])('%s -> %s', (line, intent) => {
    const r = resolve(line)
    expect(r.family).toBe('it_peripherals')
    expect(r.intent).toBe(intent)
  })

  it('a printer and a card printer are different pools', () => {
    const printer = resolve('توريد طابعة ليزر شبكية A4')
    const card = resolve('توريد طابعة بطاقات PVC هوية')
    expect(printer.pool_key).not.toBe(card.pool_key)
  })

  it('data_speed is not attached to printers', () => {
    const r = resolve('توريد طابعة ليزر شبكية A4 40 ppm')
    expect(Object.keys(r.facets)).not.toContain('data_speed')
  })
})

describe('video_surveillance intents inherit from the category', () => {
  it.each([
    ['توريد كاميرا مراقبة dome داخلية', 'cctv_camera'],
    ['توريد كاميرا PTZ زوم 25x مدى 150 م', 'ptz_camera'],
    ['توريد NVR 64 قناة مراقبة', 'nvr'],
    ['توريد منصة إدارة فيديو VMS رخصة 100 قناة', 'vms'],
    ['توريد كاميرا حرارية أمنية لحماية المحيط', 'thermal_security_camera'],
  ])('%s -> %s', (line, intent) => {
    const r = resolve(line)
    expect(r.family).toBe('physical_security')
    expect(r.category).toBe('video_surveillance')
    expect(r.intent).toBe(intent)
  })

  it('all video intents inherit the same preferred archetype and sector veto', () => {
    const lines = [
      'توريد كاميرا مراقبة dome',
      'توريد كاميرا PTZ',
      'توريد NVR 32 قناة مراقبة',
    ]
    for (const line of lines) {
      const r = resolve(line)
      expect(r.preferred_archetypes).toContain('cctv_security_supplier')
      expect(r.hard_conflicts).toContain('ready_mix_supplier')
      expect(r.soft_conflicts).toContain('general_trading')
    }
  })

  it('a security thermal camera and an inspection thermal camera are different families', () => {
    expect(resolve('توريد كاميرا حرارية أمنية للمراقبة المحيطية').family).toBe('physical_security')
    expect(resolve('توريد كاميرا حرارية لفحص اللوحات الكهربائية وصيانتها').family).toBe(
      'measuring_instruments',
    )
  })
})

describe('access_control corrections', () => {
  it('قفل مغناطيسي (not كالب) resolves to the electromagnetic lock intent', () => {
    const r = resolve('توريد قفل مغناطيسي 600 كجم للباب')
    expect(r.intent).toBe('electromagnetic_lock')
    expect(r.category).toBe('access_control')
  })

  it('the misspelling كالب مغناطيسي is gone from the ontology data', () => {
    expect(JSON.stringify(FAMILIES)).not.toContain('كالب')
  })

  it('PVC cards belong to card printing, not access control', () => {
    const r = resolve('توريد بطاقات PVC للطباعة')
    expect(r.intent).toBe('card_printers')
    expect(r.category).not.toBe('access_control')
  })

  it('قارئ only becomes a card reader with access-control context', () => {
    expect(resolve('توريد قارئ').intent).not.toBe('card_reader')
    expect(resolve('توريد قارئ بطاقات تحكم بالدخول RFID').intent).toBe('card_reader')
  })

  it('access control splits into distinct intents', () => {
    expect(resolve('توريد وحدة تحكم دخول 4 أبواب').intent).toBe('access_controller')
    expect(resolve('توريد قارئ بصمة للتحكم بالدخول').intent).toBe('biometric_reader')
    expect(resolve('توريد بوابة دوران أمنية ستانلس').intent).toBe('turnstile_gate')
  })
})

describe('veto: hard and soft tiers behave differently', () => {
  const cladding = resolve('توريد وتركيب تجليد أعمدة خشبي داخلي')
  const cctv = resolve('توريد كاميرا مراقبة IP للمبنى')

  it('a paints-only supplier is hard-vetoed on a cladding line', () => {
    const verdict = evaluateSupplier('مصنع جزيرة الدهانات - دهانات وبويات', cladding)
    expect(verdict.verdict).toBe('HARD_VETO')
    expect(verdict.auto_tick).toBe(false)
  })

  it('a ready-mix supplier is hard-vetoed on a CCTV line', () => {
    const verdict = evaluateSupplier('شركة الخرسانة الجاهزة - ready mix concrete', cctv)
    expect(verdict.verdict).toBe('HARD_VETO')
    expect(verdict.auto_tick).toBe(false)
  })

  it('general trading appears on a CCTV line but arrives UNTICKED (soft)', () => {
    const verdict = evaluateSupplier('مؤسسة تجارة عامة - general trading', cctv)
    expect(verdict.verdict).toBe('SOFT_DEMOTED')
    expect(verdict.auto_tick).toBe(false)
  })

  it('soft demotion still shows the supplier; hard veto removes it from the list', () => {
    const suppliers = [
      { name: 'شركة أنظمة المراقبة والكاميرات CCTV' },
      { name: 'مؤسسة تجارة عامة general trading' },
      { name: 'شركة الخرسانة الجاهزة ready mix' },
    ]
    const ranked = rankSuppliers(suppliers, (s) => s.name, cctv)
    const names = ranked.map((r) => r.candidate.name)
    expect(names[0]).toContain('المراقبة')
    expect(names).toContain('مؤسسة تجارة عامة general trading')
    expect(names.some((n) => n.includes('الخرسانة'))).toBe(false)
  })

  it('legitimate suppliers still rank first for their own family', () => {
    for (const [line, supplier] of [
      ['توريد وتركيب تجليد أعمدة', 'شركة الكلادينج والتشطيبات الداخلية'],
      ['توريد حنفية حريق UL/FM', 'شركة مكافحة الحريق والسلامة'],
      ['توريد قطاع حديد RHS 100x50x5', 'مصنع الحديد الإنشائي وقطاعات الفولاذ'],
      ['توريد كاميرا مراقبة IP', 'شركة أنظمة المراقبة والتيار الخفيف'],
    ] as const) {
      const evaluation = evaluateSupplier(supplier, resolve(line))
      expect(evaluation.verdict).toBe('PREFERRED')
      expect(evaluation.auto_tick).toBe(true)
    }
  })

  it('a fire-hydrant line does not hard-veto a plumbing+fire supplier, only demotes plumbing-only', () => {
    const hydrant = resolve('توريد حنفية حريق UL/FM قطر 4 بوصة')
    expect(evaluateSupplier('شركة السباكة ومكافحة الحريق', hydrant).verdict).toBe('PREFERRED')
    expect(evaluateSupplier('مؤسسة السباكة فقط - plumbing', hydrant).verdict).toBe('SOFT_DEMOTED')
    expect(evaluateSupplier('معرض الأدوات الصحية وأطقم الحمامات', hydrant).verdict).toBe('HARD_VETO')
  })
})

describe('veto is inherited, not repeated', () => {
  it('ICT intents pick up the sector-level veto without declaring it', () => {
    const ictSector = SECTORS.DATACENTER_ICT
    expect(ictSector.hard_conflicts).toEqual(
      expect.arrayContaining([
        'ready_mix_supplier',
        'paint_only_supplier',
        'sanitary_ware_supplier',
        'plumbing_only_supplier',
      ]),
    )
    for (const line of [
      'توريد كاميرا مراقبة IP',
      'توريد خادم rack 2U',
      'توريد طابعة ليزر شبكية',
      'توريد مبدل شبكة 48 منفذ',
    ]) {
      const r = resolve(line)
      expect(r.hard_conflicts).toEqual(
        expect.arrayContaining(['ready_mix_supplier', 'paint_only_supplier', 'sanitary_ware_supplier']),
      )
    }
  })

  it('no ICT family or intent repeats the inherited sector conflicts', () => {
    const inherited = new Set(SECTORS.DATACENTER_ICT.hard_conflicts || [])
    for (const family of FAMILIES.filter((f) => f.sector === 'DATACENTER_ICT')) {
      for (const declared of family.hard_conflicts || []) {
        expect(inherited.has(declared)).toBe(false)
      }
      const intents = [
        ...(family.intents || []),
        ...(family.categories || []).flatMap((c) => c.intents || []),
      ]
      for (const intent of intents) {
        for (const declared of intent.hard_conflicts || []) {
          expect(inherited.has(declared)).toBe(false)
        }
      }
    }
  })

  it('a qualifying archetype overrides an inherited conflict', () => {
    // A paints supplier must NOT be globally banned: industrial floor coatings
    // are exactly the context where it is the right supplier. And the family
    // drops the sector's inherited rebar veto via hard_conflict_exceptions.
    const r = resolve('توريد أرضية إيبوكسي self leveling صناعية')
    expect(r.family).toBe('industrial_flooring_coating')
    expect([...r.preferred_archetypes, ...r.allowed_archetypes]).toContain('paint_only_supplier')
    expect(r.hard_conflicts).not.toContain('paint_only_supplier')
    expect(r.hard_conflicts).not.toContain('rebar_supplier')
    // The sector still vetoes what it should.
    expect(SECTORS.ARCHITECTURAL_FINISHES.hard_conflicts).toContain('rebar_supplier')
    expect(r.hard_conflicts).toContain('ready_mix_supplier')
  })
})

describe('facets are per-intent and declare pool impact', () => {
  it('every facet reference resolves to a definition with a pool flag', () => {
    const refs: Array<{ name: string; supplier_pool_affecting?: boolean }> = []
    for (const family of FAMILIES) {
      refs.push(...(family.facets || []))
      for (const category of family.categories || []) {
        refs.push(...(category.facets || []))
        for (const intent of category.intents || []) refs.push(...(intent.facets || []))
      }
      for (const intent of family.intents || []) refs.push(...(intent.facets || []))
    }
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      expect(FACET_DEFS[ref.name], `missing facet definition: ${ref.name}`).toBeTruthy()
      expect(typeof ref.supplier_pool_affecting).toBe('boolean')
    }
  })

  it('facets absorb variation instead of needing an alias per size', () => {
    const r = resolve('توريد قطاع حديد RHS 100x50x5 مم S355 مجلفن طول 6 م')
    expect(r.intent).toBe('structural_steel_section')
    expect(r.facets.section_type).toBe('rhs')
    expect(r.facets.dimensions).toBe('100')
    expect(r.facets.grade).toBe('s355')
    expect(r.facets.finish).toBe('galvanized')
  })

  it('only pool-affecting facets enter the cache key', () => {
    const r = resolve('توريد قطاع حديد RHS 100x50x5 مم S355 مجلفن')
    expect(r.pool_affecting_facets.finish).toBe('galvanized')
    expect(r.pool_affecting_facets.dimensions).toBeUndefined()
    expect(r.cache_key).toContain(ONTOLOGY_VERSION)
    expect(r.cache_key).toContain('finish=galvanized')
    expect(r.cache_key).not.toContain('dimensions=')
  })

  it('a decorative facet does not split the pool; a pool-affecting one does', () => {
    const plain = resolve('توريد قطاع حديد RHS 100x50x5')
    const otherSize = resolve('توريد قطاع حديد RHS 200x100x8')
    const galvanized = resolve('توريد قطاع حديد RHS 100x50x5 مجلفن')
    expect(otherSize.cache_key).toBe(plain.cache_key)
    expect(galvanized.cache_key).not.toBe(plain.cache_key)
  })
})

describe('generalization: unseen variants resolve without literal aliases', () => {
  it.each([
    ['توريد قطاع حديد SHS 140x140x6 مم S275', 'structural_steel_section'],
    ['توريد قطاع حديد CHS قطر 219 سماكة 8 مم', 'structural_steel_section'],
    ['توريد وتركيب تجليد جدران HPL خارجي', 'surface_cladding'],
    ['توريد كسوة أعمدة ألوكبوند 4 مم', 'column_cladding'],
    ['توريد حنفية حريق تحت الأرض UL/FM', 'fire_hydrant'],
    ['توريد مضخة غاطسة للنزح 15 kW', 'industrial_pump'],
    ['توريد متر ليزر مدى 100 م دقة ±1 مم', 'laser_distance_meter'],
  ])('%s -> %s', (line, intent) => {
    expect(resolve(line).intent).toBe(intent)
  })

  it('an unseen ICT variant still resolves to a family even without an intent', () => {
    for (const line of [
      'توريد مبدل شبكة spine 400G مع مراوح قابلة للاستبدال',
      'توريد مصفوفة تخزين all-flash NVMe سعة 200 TB',
      'توريد جدار حماية NGFW 40 Gbps',
    ]) {
      const r = resolve(line)
      expect(['specific_intent', 'local_resolved']).toContain(r.level)
      expect(r.family).toBeTruthy()
    }
  })

  it('an unseen size or grade never changes the resolved intent', () => {
    const sizes = ['RHS 50x30x3', 'RHS 300x200x10', 'RHS 80x40x4 مجلفن']
    for (const size of sizes) {
      expect(resolve(`توريد قطاع حديد ${size}`).intent).toBe('structural_steel_section')
    }
  })
})

describe('domain separation holds', () => {
  it.each([
    ['توريد وتركيب تجليد أعمدة', 'ARCHITECTURAL_FINISHES'],
    ['توريد حنفية حريق', 'FIRE'],
    ['توريد قطاع حديد IPE 300', 'STRUCTURAL_METALS'],
    ['توريد كاميرا مراقبة IP', 'DATACENTER_ICT'],
    ['توريد حزام سلامة كامل الجسم', 'SAFETY_PPE'],
    ['توريد رفوف تخزين بالتات', 'WAREHOUSE_LOGISTICS'],
  ])('%s -> %s', (line, sector) => {
    expect(resolve(line).sector).toBe(sector)
  })

  it('a cladding line never lands in the fire or ICT sector', () => {
    const r = resolve('توريد وتركيب تجليد أعمدة داخلي')
    expect(r.sector).toBe('ARCHITECTURAL_FINISHES')
    expect(r.hard_conflicts).toContain('ready_mix_supplier')
  })
})

describe('batch pooling and levels', () => {
  it('identical intents collapse into one pool', () => {
    const batch = resolveOntologyBatch([
      'توريد قطاع حديد RHS 100x50x5',
      'توريد قطاع حديد RHS 120x60x6',
      'توريد قطاع حديد RHS 150x80x6',
      'توريد كاميرا مراقبة IP 4 MP',
    ])
    expect(batch.counts.specific_intent).toBe(4)
    expect(batch.pools.length).toBe(2)
    const steel = batch.pools.find((p) => p.intent === 'structural_steel_section')!
    expect(steel.line_ids.length).toBe(3)
  })

  it('a labour-only line is flagged not_supply and never pooled', () => {
    const batch = resolveOntologyBatch(['أجور تركيب فقط بدون مواد'])
    expect(batch.not_supply).toBe(1)
    expect(batch.pools.length).toBe(0)
  })

  it('every pool carries both conflict tiers', () => {
    const batch = resolveOntologyBatch([
      'توريد كاميرا مراقبة IP',
      'توريد وتركيب تجليد أعمدة',
      'توريد حنفية حريق',
    ])
    for (const pool of batch.pools) {
      expect(Array.isArray(pool.hard_conflicts)).toBe(true)
      expect(Array.isArray(pool.soft_conflicts)).toBe(true)
      expect(pool.hard_conflicts.length + pool.soft_conflicts.length).toBeGreaterThan(0)
    }
  })
})
