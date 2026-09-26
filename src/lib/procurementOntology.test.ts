import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ONTOLOGY_VERSION,
  describeIntent,
  evaluateSupplier,
  classifySupplierArchetypes,
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
  termDecidesIn,
  ARCHETYPES,
  CLAUSE_RULE,
  SUPPLIER_CLAUSE_RULE,
  FAMILIES,
  FACET_DEFS,
  SECTORS,
} from './procurementOntology'

const resolve = (name: string) => resolveOntology(name)

/**
 * CONFIDENT-WRONG REGRESSION SUITE.
 *
 * Measuring 10,219 real general-contracting tender lines produced 434
 * resolutions that were confident AND wrong — they reached a supplier pool that
 * cannot supply the item. That is worse than an honest Level C: a wrong pool
 * sends a real RFQ to the wrong vendor, while a C says the engine does not know.
 *
 * All eight error families share ONE shape: a term that is legitimately strong
 * or weak for its family fired on a line whose surrounding words said the item
 * was something else. They are evidence that the three-tier rule was not being
 * applied consistently, not eight unrelated bugs. Each case below asserts the
 * WRONG answer is gone, and separately that the RIGHT answer still resolves —
 * a guard that silences a term everywhere would pass the first half alone.
 *
 * Strings are real lines from the catalogue, kept verbatim.
 */
describe('confident-wrong: a term must not decide against its own context', () => {
  it('a 0.45 mm gypsum stud is not structural steel', () => {
    for (const line of [
      'توريد قطاع Stud مجلفن عرض 100 مم سماكة 0.45 مم',
      'توريد قطاع Track مجلفن عرض 70 مم سماكة 0.6 مم',
    ]) {
      const r = resolve(line)
      expect(r.family).not.toBe('structural_steel')
      expect(r.intent).not.toBe('structural_steel_section')
      expect(r.sector).not.toBe('STRUCTURAL_METALS')
    }
  })

  it('but a real steel section still resolves — the guard is not a mute button', () => {
    for (const line of [
      'توريد قطاع فولاذ إنشائي HEA 100',
      'توريد زاوية فولاذ غير متساوية L100×100×10 مم',
      'توريد قطاع RHS مستطيل 100×100×10 مم',
      'توريد قطاع حديد IPE 200 درجة S275',
    ]) {
      const r = resolve(line)
      expect(r.family).toBe('structural_steel')
      expect(r.poolable).toBe(true)
    }
  })

  it('a fibre optic cable is not a power cable', () => {
    for (const line of [
      'توريد كابل ألياف OM3 Multimode عدد 12 Core نوع Indoor LSZH',
      'توريد كابل ألياف OS2 Singlemode عدد 24 Core نوع Outdoor Armored',
    ]) {
      const r = resolve(line)
      expect(r.family).not.toBe('power_cables')
    }
  })

  it('but a real power cable still resolves', () => {
    for (const line of [
      'توريد كابل نحاس XLPE/SWA مقاس 4×50 مم² جهد 0.6/1 kV',
      'توريد كابل تحكم 12×1.5 مم² مدرع',
    ]) {
      const r = resolve(line)
      expect(r.family).toBe('power_cables')
      expect(r.poolable).toBe(true)
    }
  })

  it('pipe insulation is insulation, and a pipe hanger is a hanger — neither is a pipe', () => {
    for (const line of [
      'توريد عزل Elastomeric لمواسير قطر 108 مم سماكة 13 مم',
      'توريد Clevis Hanger لمواسير DN100',
      'توريد حامل مواسير مجلفن DN50',
      // The support trade names the product six ways; each is still a support.
      'توريد Pipe Shoe لمواسير DN100',
      'توريد Riser Clamp لمواسير DN125',
      'توريد Roller Support لمواسير DN50',
      'توريد Split Ring Hanger لمواسير DN15',
    ]) {
      const r = resolve(line)
      expect(r.family).not.toBe('pipes_fittings')
    }
  })

  it('separating conduit from water pipe must not hand it to the roofing trade', () => {
    // Found only after the conduit fix landed: «Twinwall» is polycarbonate
    // roofing sheet in the envelope trade and HDPE conduit in the electrical
    // one. One fix uncovering the next is the expected shape here.
    for (const line of [
      'توريد ماسورة كهرباء HDPE Twinwall قطر 110 مم',
      'توريد ماسورة كهرباء PVC Heavy Duty قطر 20 مم',
    ]) {
      const r = resolve(line)
      expect(r.family).not.toBe('translucent_roofing')
      expect(r.sector).not.toBe('BUILDING_ENVELOPE')
    }
  })

  it('but real polycarbonate roofing still resolves', () => {
    const r = resolve('توريد لوح بولي كربونيت Twinwall سماكة 10 مم')
    expect(r.family).toBe('translucent_roofing')
    expect(r.poolable).toBe(true)
  })

  it('but the product-head rule is positional: a pre-insulated PIPE is still a pipe', () => {
    const r = resolve('توريد ماسورة فولاذية معزولة قطر 100 مم')
    expect(r.family).toBe('pipes_fittings')
  })

  it('electrical conduit is not a water pipe', () => {
    for (const line of [
      'توريد ماسورة كهرباء EMT Steel قطر 110 مم',
      'توريد ماسورة كهرباء EMT Steel قطر 20 مم',
    ]) {
      const r = resolve(line)
      expect(r.sector).not.toBe('MEP_WATER')
      expect(r.family).not.toBe('pipes_fittings')
    }
  })

  it('but a real water pipe still resolves', () => {
    for (const line of [
      'توريد ماسورة HDPE PN16 قطر 110 مم',
      'توريد ماسورة فولاذ كربوني DN100 Schedule 40',
    ]) {
      const r = resolve(line)
      expect(r.family).toBe('pipes_fittings')
      expect(r.poolable).toBe(true)
    }
  })

  it('«fire» as an ADJECTIVE does not make a board into fire fighting equipment', () => {
    for (const line of [
      'توريد لوح MDF سماكة 12 مم فئة FR مقاوم للحريق',
      'توريد لوح جبس مقاوم للحريق سماكة 15 مم',
    ]) {
      const r = resolve(line)
      expect(r.sector).not.toBe('FIRE')
      expect(r.family).not.toBe('fire_fighting')
    }
  })

  it('but real fire fighting equipment still resolves', () => {
    for (const line of [
      'توريد طفاية حريق بودرة جاف 6 كجم',
      'توريد رشاش حريق Pendent 68 درجة',
      'توريد حنفية حريق Pillar Hydrant قطر 4 بوصة',
    ]) {
      const r = resolve(line)
      expect(r.sector).toBe('FIRE')
      expect(r.poolable).toBe(true)
    }
  })

  it('a plumbing socket coupler is not a socket wrench', () => {
    for (const line of [
      'توريد وصلة UPVC Socket Coupler مقاس 110 مم',
      'توريد وصلة PPR Socket مقاس 32 مم',
    ]) {
      const r = resolve(line)
      expect(r.family).not.toBe('hand_tools')
    }
  })

  it('but a real socket set still resolves to hand tools', () => {
    const r = resolve('توريد طقم لقم Socket Set مقاس 1/2 بوصة عدد 24 قطعة')
    expect(r.family).toBe('hand_tools')
  })

  it('an irrigation filter is not a respirator filter', () => {
    for (const line of [
      'توريد Filter Disc مقاس 1 بوصة',
      'توريد فلتر ري شبكي مقاس 2 بوصة',
    ]) {
      const r = resolve(line)
      expect(r.intent).not.toBe('respirator_filter')
      expect(r.family).not.toBe('respiratory_protection')
    }
  })

  it('but a real respirator filter still resolves', () => {
    for (const line of [
      'توريد فلتر جسيمات P3 لقناع التنفس',
      'توريد مرشح غازات ABEK1 لكمامة نصف وجه',
    ]) {
      const r = resolve(line)
      expect(r.family).toBe('respiratory_protection')
    }
  })

  it('an electrical enclosure is not steel sheet, and an energy meter is not a flow meter', () => {
    const enclosure = resolve('توريد لوحة فارغة Enclosure Sheet Steel IP55 مقاس 1000×1200×400 مم')
    expect(enclosure.family).not.toBe('metal_sheet_coil')

    for (const line of ['توريد Energy Meter Class 0.5S اتصال BACnet IP', 'توريد Digital Ammeter اتصال BACnet IP']) {
      const r = resolve(line)
      expect(r.family).not.toBe('flow_instrumentation')
    }
  })

  it('but real sheet steel and a real flow meter still resolve', () => {
    expect(resolve('توريد صاج مجلفن GI سماكة 0.5 مم طلاء G90').family).toBe('metal_sheet_coil')
    expect(resolve('توريد عداد تصرف Electromagnetic Flowmeter DN100').family).toBe('flow_instrumentation')
  })
})

describe('the three-tier rule, applied consistently', () => {
  it('a term may not serve as its own context', () => {
    // Both of these decided as `weak_with_context` only because the family
    // listed the same word in weak_terms and context_terms.
    for (const line of ['توريد لوح MDF فئة FR مقاوم للحريق', 'توريد Filter Disc مقاس 1 بوصة']) {
      const r = resolve(line)
      if (r.debug.decided_by === 'weak_with_context' && r.debug.matched_term) {
        const term = normalizeProcurementText(r.debug.matched_term)
        expect(r.search_terms.filter((t) => normalizeProcurementText(t) === term).length).toBeLessThan(2)
      }
    }
  })

  it('a guarded term still yields search vocabulary rather than vanishing', () => {
    // Accuracy must not cost searchability: a blocked term becomes a Level B/C
    // with terms to search on, never an empty resolution.
    for (const line of [
      'توريد قطاع Stud مجلفن عرض 100 مم سماكة 0.45 مم',
      'توريد كابل ألياف OM3 Multimode عدد 12 Core',
      'توريد عزل Elastomeric لمواسير قطر 108 مم سماكة 13 مم',
    ]) {
      const r = resolve(line)
      expect(r.search_terms.length).toBeGreaterThan(0)
      expect(r.raw).toBe(line)
    }
  })
})

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

/**
 * Phase 2 built `intent_supplier_map` on `intent_key` and found SAFETY_PPE had
 * no intents at all, so the owner's most common family could only ever reach
 * keyword retrieval. These assert the family now serves the map structurally.
 */
describe('SAFETY_PPE resolves to intents, not only to a family', () => {
  it.each(PPE_LINES_FROM_RFQ)('%s carries an intent the supplier map can key', (line) => {
    const r = resolve(line)
    expect(r.level_code).toBe('A')
    expect(r.intent).toBeTruthy()
    expect(isKnownIntentId(r.intent!)).toBe(true)
    expect(r.pool_key).toBe(r.intent)
    expect(r.poolable).toBe(true)
  })

  it('the ten lines spread across intents instead of collapsing onto one', () => {
    const intents = PPE_LINES_FROM_RFQ.map((line) => resolve(line).intent)
    // Two protective-clothing items legitimately differ (coverall vs vest), so
    // the count proves the split is real rather than one bucket for all PPE.
    expect(new Set(intents).size).toBe(PPE_LINES_FROM_RFQ.length)
  })

  it('every PPE family declares at least one intent', () => {
    const ppe = FAMILIES.filter((f) => f.sector === 'SAFETY_PPE')
    const protective = ppe.filter((f) => /protection|clothing|footwear/.test(f.id))
    expect(protective.length).toBeGreaterThanOrEqual(8)
    for (const family of protective) {
      const own = (family.intents || []).length
      const nested = (family.categories || []).reduce((n, c) => n + (c.intents || []).length, 0)
      expect(own + nested).toBeGreaterThan(0)
    }
  })
})

/**
 * The owner approved the Phase 2 map build on a promise of ID stability, and a
 * rebuild is only safe if growth is additive. This is the frozen cpo-v2 intent
 * surface: a rename or removal fails here rather than silently emptying a map
 * partition that the sibling lane already built rows for.
 */
const CPO_V2_INTENT_IDS = [
  'access_controller', 'air_filtration', 'barcode_scanners', 'biometric_reader',
  'card_printers', 'card_reader', 'cctv_camera', 'column_cladding',
  'document_scanners', 'electrical_tester', 'electromagnetic_lock',
  'environmental_meter', 'fire_extinguisher', 'fire_hydrant', 'fire_pump_set',
  'fire_sprinkler', 'hvac_damper', 'industrial_pump', 'keyboards_peripherals',
  'kvm_console', 'label_printers', 'laser_distance_meter', 'level_alignment',
  'nvr', 'precision_gauge', 'printers', 'ptz_camera', 'rescue_kit',
  'rescue_tripod', 'rescue_winch', 'rfid_credentials', 'rope_grab',
  'structural_steel_section', 'surface_cladding', 'survey_instrument',
  'thermal_imaging', 'thermal_security_camera', 'turnstile_gate',
  'vav_terminal', 'vms',
]

/**
 * The cpo-v3 addition: the 24 PPE intents, which is the surface the Phase 2 map
 * was last built against. cpo-v4 must keep every one of these too.
 */
const CPO_V3_ADDED_INTENT_IDS = [
  'breathing_apparatus', 'bump_cap', 'coverall', 'ear_muff', 'ear_plug',
  'face_shield', 'fall_arrest_hardware', 'hearing_protector', 'hi_vis_vest',
  'lanyard_shock_absorber', 'lifeline_anchor', 'respirator_filter',
  'respirator_mask', 'rubber_boot', 'safety_boot', 'safety_eyewear',
  'safety_gloves', 'safety_harness', 'safety_helmet',
  'self_retracting_lifeline', 'weather_protective_clothing',
  'welding_face_shield', 'welding_gloves', 'work_apron',
]

describe('cpo-v4 grows additively from cpo-v3 and cpo-v2', () => {
  it('keeps every cpo-v2 intent id', () => {
    const current = listIntentIds()
    expect(CPO_V2_INTENT_IDS.filter((id) => !current.includes(id))).toEqual([])
  })

  it('keeps every cpo-v3 intent id', () => {
    const current = listIntentIds()
    expect(CPO_V3_ADDED_INTENT_IDS.filter((id) => !current.includes(id))).toEqual([])
  })

  it('renames nothing — the two frozen surfaces were 40 then 64 intents', () => {
    expect(CPO_V2_INTENT_IDS).toHaveLength(40)
    expect(CPO_V2_INTENT_IDS.length + CPO_V3_ADDED_INTENT_IDS.length).toBe(64)
    expect(listIntentIds().length).toBeGreaterThan(64)
  })

  it('publishes a version the sibling lane can compare against', () => {
    expect(ONTOLOGY_VERSION).toBe('cpo-v11')
  })

  it('keeps every cpo-v4 intent id that the held-out phase touched', () => {
    const current = listIntentIds()
    for (const id of ['empty_enclosure', 'irrigation_emitter', 'fire_sprinkler', 'linear_drainage', 'paving_block']) {
      expect(current).toContain(id)
    }
  })

  it('every id is unique, so no map partition can collide', () => {
    const ids = listIntentIds()
    expect(new Set(ids).size).toBe(ids.length)
    const families = listFamilyIds()
    expect(new Set(families).size).toBe(families.length)
  })
})

/**
 * Errors the coverage work itself introduced. Adding the electrical and new
 * families took confident-wrong from 0 back to 4.65% — a different error set at
 * the same rate as the one P0 removed — and none of it was visible to a
 * cross-trade check, because family and department were both right. These fix
 * that class and hold it fixed.
 */
describe('confident-wrong: coverage must not reintroduce errors', () => {
  it('cable TYPE decides, not cable CONSTRUCTION', () => {
    // Cu/PVC and Cu/XLPE describe conductor and insulation, and control, MV and
    // fire-rated cable all share them. Only the function word may decide.
    const expected: Array<[string, string]> = [
      ['توريد كابل Cu/PVC Control 10C×0.75 مم²', 'control_cable'],
      ['توريد كابل MV Cu/XLPE/CTS/PVC 1C×120 مم² جهد 11kV', 'mv_power_cable'],
      ['توريد كابل Fire Resistant LSZH PH120 2C×1.5 مم²', 'fire_resistant_cable'],
      ['توريد كابل Al/XLPE/PVC 1C×1.5 مم² 0.6/1kV', 'lv_power_cable'],
      ['توريد Instrumentation Cable 1 Pair×0.5 مم² Individual+Overall Shielded', 'instrumentation_cable'],
    ]
    for (const [line, intent] of expected) {
      const r = resolve(line)
      expect(r.family).toBe('power_cables')
      expect(r.intent).toBe(intent)
    }
  })

  it('the product-head rule holds for materials as well as objects', () => {
    // Basalt FIBRE is not a basalt slab; an elastomeric PAINT is not pipe
    // insulation. In both the leading word is the product.
    const fibre = resolve('توريد ألياف بازلت 12 مم عبوة 20 كجم')
    expect(fibre.intent).toBe('concrete_fiber')
    const paint = resolve('توريد دهان خارجي Elastomeric عبوة 20 لتر')
    expect(paint.family).toBe('paints_coatings')
    expect(paint.intent).not.toBe('pipe_duct_insulation')
  })

  it('superscript units normalize, so a cable cross-section is visible', () => {
    // «مم²» never matched the «مم2» vocabulary, hiding the strongest evidence
    // that a line is a cable at all — on every cable line in the catalogue.
    expect(normalizeProcurementText('كابل 4×50 مم²')).toContain('مم2')
    expect(normalizeProcurementText('خرسانة 10 م³')).toContain('م3')
    expect(termIndex(normalizeProcurementText('توريد كابل 1C×1.5 مم²'), 'مم2')).toBeGreaterThan(0)
  })

  it('every new sector and family reaches at least one supplier archetype', () => {
    // A family that reaches no archetype is not coverage: it resolves and then
    // has nowhere to send an RFQ.
    for (const family of FAMILIES) {
      const preferred = family.preferred_archetypes ?? []
      const allowed = family.allowed_archetypes ?? []
      expect(
        preferred.length + allowed.length,
        `${family.id} declares no archetype`,
      ).toBeGreaterThan(0)
      for (const archetype of [...preferred, ...allowed]) {
        expect(Object.keys(ARCHETYPES), `${family.id} -> ${archetype}`).toContain(archetype)
      }
    }
  })

  it('every family belongs to a sector that exists', () => {
    for (const family of FAMILIES) {
      expect(Object.keys(SECTORS), `${family.id}`).toContain(family.sector)
    }
  })
})

/**
 * Gap 2. Every PPE family allows `industrial_tools_supplier`, which is why a
 * tools company receiving PPE was never vetoed. A hard veto would be wrong:
 * the real multi-trade safety firms («أدوات سلامة») classify as tools suppliers
 * TOO, so vetoing the archetype removes legitimate vendors. Ranking is the
 * answer, and these assert ranking actually separates them.
 */
describe('PPE tools-supplier handling is ranking, not veto', () => {
  const MULTI_TRADE = 'مؤسسة أدوات سلامة ومهمات وقاية'
  const BARE_TOOLS = 'AP Tools أدوات ومعدات صناعية'
  const WOOD = 'القاسم ألمنيوم حديد دربزين أخشاب'

  it('a multi-trade safety firm is PREFERRED despite being a tools supplier', () => {
    const profile = resolve('قبعة حماية')
    const evaluation = evaluateSupplier(MULTI_TRADE, profile)
    expect(evaluation.archetypes).toContain('industrial_tools_supplier')
    expect(evaluation.verdict).toBe('PREFERRED')
  })

  it('a bare tools supplier survives but never outranks a PPE supplier', () => {
    for (const line of PPE_LINES_FROM_RFQ) {
      const profile = resolve(line)
      const bare = evaluateSupplier(BARE_TOOLS, profile)
      // Not vetoed — a tools house can genuinely stock gloves and helmets.
      expect(bare.verdict).toBe('ALLOWED')

      const ranked = rankSuppliers([BARE_TOOLS, MULTI_TRADE], (s) => s, profile)
      expect(ranked[0].candidate).toBe(MULTI_TRADE)
      expect(ranked[ranked.length - 1].candidate).toBe(BARE_TOOLS)
    }
  })

  it('industrial_tools_supplier is never a hard conflict for PPE', () => {
    for (const line of PPE_LINES_FROM_RFQ) {
      expect(resolve(line).hard_conflicts).not.toContain('industrial_tools_supplier')
    }
  })

  it('a wood supplier is dropped from every PPE line by structure, not keywords', () => {
    for (const line of PPE_LINES_FROM_RFQ) {
      const profile = resolve(line)
      // No PPE archetype and no PPE vocabulary, so it yields no signal at all.
      expect(evaluateSupplier(WOOD, profile).verdict).toBe('NO_MATCH')
      expect(rankSuppliers([WOOD], (s) => s, profile)).toEqual([])
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
    // The pool is keyed on the MATERIAL now that the family has one, which is
    // the same answer one level finer.
    expect(polycarbonate!.intent).toBe('polycarbonate_sheet')
    expect(pools.get('polycarbonate_sheet')!.line_ids).toHaveLength(1)
    expect(bandsaw!.family).toBeNull()
    for (const pool of batch.pools) {
      if (pool.pool_key.startsWith('line:')) continue
      expect(pool.pool_key).toBe('polycarbonate_sheet')
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

  it('PVC cards belong to the card family, not access control, and not to the printer', () => {
    const r = resolve('توريد بطاقات PVC للطباعة')
    expect(r.family).toBe('it_peripherals')
    expect(r.intent).toBe('pvc_cards')
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

  it('earthwork is work: no sand supplier is asked to price an excavation', () => {
    for (const line of ['حفر وردم ودك', 'أعمال حفر وردم ودك للتأسيس', 'Excavation backfilling and compaction']) {
      const r = resolveOntology(line)
      expect(r.level, line).toBe('unresolved')
      expect(r.debug.not_supply, line).toBe(true)
      expect(r.poolable, line).toBe(false)
    }
    // Naming the material still buys it.
    expect(resolveOntology('توريد رمل ردم').family).toBe('aggregates_fill')
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

/**
 * A HELD-OUT CORPUS OF 81,752 LINES FOUND WHAT AN OWN-FIXTURE AUDIT CANNOT.
 *
 * Its most valuable finding was not a missing family, it was a shape: the
 * engine knew the English word for a concept and not the Arabic one, and the
 * two words sat in DIFFERENT TIERS. `sprinkler` was strong and decided alone;
 * «رشاش» was weak and never decided. The consequence was the worst arrangement
 * available — every irrigation pop-up head became a FIRE sprinkler at 0.90
 * confidence, while real fire sprinklers written in Arabic reached Level A zero
 * times out of 1,008 rows. 70% of all Level A in that corpus was wrong from
 * this single gap.
 *
 * The rule these tests hold is TIER PARITY: a concept's right to decide must
 * not depend on which language the buyer writes in. Where parity alone would
 * merely relocate the error — because both trades really do sell the thing —
 * the shared word is guarded by trade and the other trade claims it positively.
 */
describe('tier parity: a concept decides in Arabic or it does not decide at all', () => {
  it('a fire sprinkler written in Arabic reaches the same intent as the English one', () => {
    const arabic = resolveOntology('توريد رشاش Pendent K5.6 درجة 93°C')
    const english = resolveOntology('Supply Sprinkler Pendent K5.6 rated 93C')
    expect(arabic.intent).toBe('fire_sprinkler')
    expect(english.intent).toBe('fire_sprinkler')
    // Parity is about the PRIVILEGE, not just the outcome: both must be Level A
    // and poolable, or the Arabic buyer is still a second-class user.
    expect(arabic.level_code).toBe('A')
    expect(arabic.level_code).toBe(english.level_code)
    expect(arabic.poolable).toBe(true)
  })

  it('the Arabic plural is a different token and must be listed as one', () => {
    // «رشاشات» does not contain «رشاش» as a WORD, so phrase matching cannot
    // reach it by inflection. The ontology already spells plurals out
    // («قطاعات», «مسامير», «طفايات»); omitting this one was an oversight.
    const plural = resolveOntology('توريد وتركيب رشاشات حريق نوع pendent')
    expect(plural.intent).toBe('fire_sprinkler')
    expect(plural.poolable).toBe(true)
  })

  it('an irrigation sprinkler is not a fire sprinkler, in either language', () => {
    for (const line of [
      'توريد Pop-Up Sprinkler نطاق 5 م',
      'رشاش حدائق نطاق 3 متر',
      'Gear Drive Sprinkler arc adjustable',
      'Impact Sprinkler brass 1/2 inch',
      'رشاش مسطحات خضراء',
    ]) {
      const r = resolveOntology(line)
      expect(r.family, line).toBe('irrigation_systems')
      expect(r.intent, line).toBe('irrigation_emitter')
    }
  })

  it('irrigation CLAIMS its sprinklers rather than merely losing them', () => {
    // Guarding the fire side only removes a wrong answer. If landscape had no
    // positive vocabulary the line would fall to an honest-but-useless C and
    // never reach an irrigation supplier, which is not a fix.
    const r = resolveOntology('Pop-Up Sprinkler 4 inch with nozzle')
    expect(r.level_code).toBe('A')
    expect(r.poolable).toBe(true)
  })

  it('the guard reads the trade, not merely the presence of a word', () => {
    // «توريد» contains the letters of «ري» and «حريق» ends in them; a
    // substring-based guard would blank every fire sprinkler line in the file.
    const r = resolveOntology('توريد رشاش حريق UL FM K8.0')
    expect(r.intent).toBe('fire_sprinkler')
  })
})

/**
 * The same corpus reported a second finding — generic joint words (`elbow`,
 * `coupling`, `flange`, `nut`) pulled into `pipes_fittings` regardless of
 * sector, 73% of its confident-wrong lines. It is the SAME defect as the
 * sprinkler one: a bare word that several trades legitimately use, granted the
 * right to decide by whichever family happened to claim it first.
 */
describe('a joint word belongs to the trade that names the assembly', () => {
  it('electrical containment keeps its own elbows, couplings and tees', () => {
    for (const [line, family] of [
      ['Cable Ladder Elbow 300mm Hot Dip Galvanized', 'cable_accessories'],
      ['توريد كوع تراي كابلات 300 مم', 'cable_accessories'],
      ['EMT Coupling 25mm Steel', 'cable_accessories'],
      ['PVC Conduit Coupling 20mm', 'cable_accessories'],
      ['Cable Tray Tee 200mm', 'cable_accessories'],
    ] as const) {
      expect(resolveOntology(line).family, line).toBe(family)
    }
  })

  it('a nut is a fastener even when its name begins with a fitting word', () => {
    // "Coupling Nut" and "Flange Nut" are real fastener SKUs. English puts the
    // head noun LAST in a compound, so the coupling here is the thread form and
    // the product is the nut.
    for (const line of ['Coupling Nut M12 Galvanized', 'Flange Nut M16 Zinc Plated']) {
      expect(resolveOntology(line).family, line).toBe('fasteners')
    }
  })

  it('plumbing still owns the joints that really are plumbing', () => {
    for (const line of [
      'كوع upvc قطر 110 مم ضغط 6 بار',
      'Elbow 90 deg PPR 32mm',
      'Coupling HDPE 63mm electrofusion',
      'Flange Adaptor DI DN200 PN16',
      'تي متساوي حديد مجلفن 2 انش',
    ]) {
      expect(resolveOntology(line).family, line).toBe('pipes_fittings')
    }
  })
})

/**
 * "Resolved" was not "usable". The corpus found five sectors 100% unusable and
 * one category — electrical enclosures, 7,824 rows — that matched a known word,
 * produced family = null and poolable = false, and still counted as coverage.
 * A line that names no family cannot name a supplier, so these assert the
 * property that matters: POOLABLE, not merely resolved.
 */
describe('the largest unusable groups now reach a supplier pool', () => {
  const mustPool: Array<[string, string, string]> = [
    ['توريد electrical enclosure ss316 مقاس 400x300x200 مم ip66', 'switchgear_panels', 'empty_enclosure'],
    ['Electrical Enclosure Mild Steel 800x600x300 IP65', 'switchgear_panels', 'empty_enclosure'],
    ['توريد قطاعات باردة التشكيل C 200x75x20 مم', 'structural_steel', 'cold_formed_section'],
    ['Cold Formed Section Z 250x75x2.5mm galvanized', 'structural_steel', 'cold_formed_section'],
    ['توريد Track Light LED 30W 3000K', 'lighting', 'track_light'],
    ['كشاف تراك لايت 20 واط', 'lighting', 'track_light'],
    ['توريد سقف معدني مستعار الومنيوم 600x600', 'interior_systems', 'metal_ceiling'],
    ['اسقف معدنيه شرائح المنيوم', 'interior_systems', 'metal_ceiling'],
    ['مصرف خطي خرساني بولمر 150 مم', 'precast_drainage', 'linear_drainage'],
  ]

  for (const [line, family, intent] of mustPool) {
    it(`pools: ${line.slice(0, 44)}`, () => {
      const r = resolveOntology(line)
      expect(r.family).toBe(family)
      expect(r.intent).toBe(intent)
      expect(r.poolable).toBe(true)
    })
  }

  it('an enclosure that really is a server rack still goes to the IT lane', () => {
    expect(resolveOntology('19 inch Server Rack Enclosure 42U 800x1000').family).toBe('racks_enclosures')
    expect(resolveOntology('Network Rack Enclosure 27U glass door').family).toBe('racks_enclosures')
  })

  it('Arabic puts adjectives inside a phrase, so the phrase cannot be the only route', () => {
    // «سقف معدني مستعار» never matched the family term «سقف مستعار», because a
    // two-word term needs the words adjacent and Arabic inserts the adjective
    // between them. The concept needs a term at its own head.
    expect(resolveOntology('توريد سقف معدني مستعار الومنيوم 600x600').poolable).toBe(true)
  })
})

/**
 * The last two of the seven adjudicated held-out cells. Both are the contested
 * word again, one level further out: a channel-support system's accessories
 * carry names that the WAREHOUSE and RIGGING trades also use for their own
 * products. The line already says which system it belongs to.
 */
describe('a strut accessory belongs to the support trade, not the warehouse', () => {
  it('a cantilever arm on a strut channel is a bracket, not pallet racking', () => {
    const r = resolveOntology('توريد Cantilever Arm 300mm لنظام Strut 41×21 مم تشطيب Zinc')
    expect(r.family).toBe('pipe_supports')
    expect(r.poolable).toBe(true)
  })

  it('a beam clamp on a strut channel is a fixing, not lifting gear', () => {
    const r = resolveOntology('توريد Beam Clamp لنظام Strut 41×21 مم تشطيب Zinc')
    expect(r.family).toBe('pipe_supports')
    expect(r.poolable).toBe(true)
  })

  it('but real racking and real rigging keep their own words', () => {
    expect(resolveOntology('Cantilever Rack Arm 1000mm for pallet racking').family).toBe('storage_racking')
    expect(resolveOntology('Pallet Rack Beam 2700mm 1500kg UDL').family).toBe('storage_racking')
    expect(resolveOntology('Beam Clamp 2 Ton for lifting hoist WLL').family).toBe('lifting_gear')
    expect(resolveOntology('Chain Sling 2 leg 3 ton with shackle').family).toBe('lifting_gear')
  })
})

/**
 * RATCHETS, so the two defect shapes cannot come back quietly.
 *
 * The sprinkler inversion was not caught by any test, any fixture or any
 * cross-trade sweep — it took a 81,752-line held-out corpus to surface one
 * missing Arabic tier. That is too expensive a detector for a defect that is
 * visible in the ontology file itself, so these encode the shapes directly:
 * `npm run ontology:language` prints them, and these keep the counts from
 * drifting upward as vocabulary is added.
 */
describe('language and trade-contest ratchets', () => {
  const ARABIC = /[\u0621-\u064A]/
  const bare = (t: string) => t.trim().split(/\s+/).length === 1
  /** An international designation (RHS, MCCB, LVT) has no Arabic form to miss. */
  const isDesignation = (t: string) => {
    if (/[0-9]/.test(t)) return true
    const letters = t.replace(/[^a-z]/gi, '')
    return letters.length < 5 || (letters.match(/[aeiou]/gi) || []).length < 2
  }

  type Node = { path: string; strong: string[]; weak: string[]; sector: string }
  const nodes: Node[] = []
  for (const family of FAMILIES) {
    const push = (path: string, n: { strong_terms?: string[]; weak_terms?: string[] }) =>
      nodes.push({ path, strong: n.strong_terms ?? [], weak: n.weak_terms ?? [], sector: family.sector })
    push(family.id, family)
    for (const intent of family.intents ?? []) push(`${family.id}/${intent.id}`, intent)
    for (const category of family.categories ?? []) {
      push(`${family.id}/${category.id}`, category)
      for (const intent of category.intents ?? []) push(`${family.id}/${category.id}/${intent.id}`, intent)
    }
  }

  it('every concept that decides in English also decides in Arabic, or is a designation', () => {
    const offenders = nodes.filter((n) => {
      const deciding = [...n.strong, ...n.weak]
      if (!deciding.length) return false
      return !deciding.some((t) => ARABIC.test(t)) && deciding.some((t) => /[a-z]/i.test(t) && !isDesignation(t))
    })
    // `kvm` / `rack console` are the trade's own words in Arabic tenders too.
    expect(offenders.map((n) => n.path)).toEqual(['it_peripherals/rack_management_peripherals'])
  })

  it('fire and irrigation hold tier parity on the word they share', () => {
    const fire = nodes.find((n) => n.path.endsWith('/fire_sprinkler'))!
    // The defect was `sprinkler` strong and «رشاش» weak. Both must now decide.
    expect(fire.strong).toContain('sprinkler')
    expect(fire.strong).toContain('رشاش')
    expect(fire.weak).not.toContain('رشاش')
  })

  it('a bare word claimed by two trades does not grow unguarded', () => {
    const guarded = new Set<string>()
    const collect = (n: { term_guards?: Array<{ terms: string[] }> }) => {
      for (const g of n.term_guards ?? []) for (const t of g.terms) guarded.add(t.toLowerCase())
    }
    for (const family of FAMILIES) {
      collect(family)
      for (const intent of family.intents ?? []) collect(intent)
      for (const category of family.categories ?? []) {
        collect(category)
        for (const intent of category.intents ?? []) collect(intent)
      }
    }
    const claims = new Map<string, Set<string>>()
    for (const n of nodes) {
      for (const term of [...n.strong, ...n.weak]) {
        if (!bare(term)) continue
        const key = term.toLowerCase()
        if (!claims.has(key)) claims.set(key, new Set())
        claims.get(key)!.add(n.sector)
      }
    }
    const contested = [...claims.entries()].filter(([t, s]) => s.size > 1 && !guarded.has(t))
    // A RATCHET, not a target: 34 is where cpo-v6 stands, and each remaining
    // one is a real risk waiting for a line from the other trade. Adding
    // vocabulary must not add contested words without also guarding them.
    expect(contested.length).toBeLessThanOrEqual(34)
  })
})

/**
 * cpo-v6. Two findings drove this round, and they are the same finding seen
 * from two sides: the ontology knew catalogue and MEP products while real
 * booklet lines are civil and architectural, and a stray adjective could name
 * a product whenever the product itself was unknown.
 */
describe('attribute clauses describe the product, they do not name it', () => {
  // A BOQ line names the product, then lists attributes behind explicit
  // keywords. Matching inside those clauses was the whole of a 5.84%
  // confident-wrong rate on truly held-out batches, and it had the perverse
  // property that a MORE detailed line resolved WORSE.
  const cases: Array<[string, string, string]> = [
    ['pipes_fittings', 'pipe_fitting', 'توريد وصلة PP-RCT Tee Equal مقاس 50 مم PN20 ربط Solvent Cement'],
    ['pipes_fittings', 'pipe_fitting', 'توريد وصلة UPVC Elbow 90 مقاس 110 مم PN10 ربط Solvent Cement'],
    ['hvac_equipment', 'volume_control_damper', 'توريد VCD Opposed Blade مقاس 600×400 مم مادة Aluminium تشغيل 24V Actuator'],
    ['valves', 'backflow_preventer', 'توريد Backflow Preventer DN80 PN16 جسم Carbon Steel توصيل Lug'],
    ['floor_tiling', 'resilient_flooring', 'توريد Static Dissipative Vinyl Sheet سماكة 2 مم لون Grey'],
  ]
  for (const [family, intent, line] of cases) {
    it(`a joining method, material or connection type cannot win: ${line.slice(0, 44)}`, () => {
      const hit = resolveOntology(line)
      expect(hit.family).toBe(family)
      expect(hit.intent).toBe(intent)
    })
  }

  it('the rule restricts deciding, never corroborating', () => {
    // «مادة Aluminium» must not NAME a product, yet it is legitimate evidence
    // for a weak term that already named one. Context reads the whole line.
    const hit = resolveOntology('توريد بلاطة سقف 600×600 مم مادة Galvanized Steel سماكة 0.6 مم')
    expect(hit.intent).toBe('metal_ceiling')
    expect(hit.poolable).toBe(true)
  })

  it('an attribute word inside a real product name still decides', () => {
    // The rule is positional: a term may decide if its match STARTS outside
    // every clause. «مقياس ضغط» starts at «مقياس», before «ضغط» opens one.
    expect(resolveOntology('مقياس ضغط 0-10 بار').family).toBe('flow_instrumentation')
    expect(resolveOntology('صمام تخفيض ضغط DN50').family).toBe('valves')
    expect(resolveOntology('صاج مجلفن سماكة 2 مم').family).toBe('metal_sheet_coil')
    expect(resolveOntology('كابل نحاس مقاس 4 مم2').family).toBe('power_cables')
  })

  it('a term buried in a clause still proves the line speaks known vocabulary', () => {
    // Losing the right to decide must not cost the semantic-recovery signal,
    // or an honest Level B would be demoted to a false unknown.
    const hit = resolveOntology('توريد صندوق معدني عام مقاس 300x200 مم مادة Solvent Resistant')
    expect(hit.level_code).not.toBe('C')
  })
})

describe('a fix bound to one phrasing is not a fix', () => {
  // The previous round keyed the metal-ceiling split on the Arabic «معدني» and
  // the defect returned the moment a batch wrote `Galvanized Steel`. The
  // discriminator is the MATERIAL, in whatever language it arrives.
  const metal = [
    'توريد بلاطة سقف 600×600 مم مادة Galvanized Steel سماكة 0.6 مم',
    'توريد بلاطة سقف معدني 600×600 مم',
    'ceiling tile aluminium 600x600',
    'بلاطة سقف مجلفن',
  ]
  for (const line of metal) {
    it(`a metal tile reaches the roll-former: ${line.slice(0, 40)}`, () => {
      expect(resolveOntology(line).intent).toBe('metal_ceiling')
    })
  }

  const mineral = ['توريد بلاطة سقف Mineral Fiber 600×600 مم', 'بلاطة سقف مستعار', 'acoustic tile 600x600']
  for (const line of mineral) {
    it(`a mineral-fibre tile keeps its own supplier: ${line.slice(0, 40)}`, () => {
      expect(resolveOntology(line).intent).toBe('acoustic_ceiling_tile')
    })
  }
})

describe('the corrugated drainage pipe is not plumbing', () => {
  // 90 rows that sat in `pipes_fittings` because «ماسوره» is that family's
  // strong term and nothing else competed. SN ring stiffness plus a corrugated
  // wall is a buried gravity-drainage designation.
  for (const line of [
    'توريد ماسورة HDPE Corrugated قطر 400 مم SN8 وصلة Socket Rubber Ring',
    'توريد ماسورة HDPE Corrugated قطر 600 مم SN8 وصلة Welded Coupler',
    'ماسورة مضلعة تصريف 300 مم',
  ]) {
    it(`reaches a drainage extruder: ${line.slice(0, 42)}`, () => {
      const hit = resolveOntology(line)
      expect(hit.family).toBe('precast_drainage')
      expect(hit.intent).toBe('buried_drainage_pipe')
    })
  }

  it('pressure plumbing pipe is untouched', () => {
    expect(resolveOntology('توريد ماسورة PPR قطر 25 مم PN20').family).toBe('pipes_fittings')
    expect(resolveOntology('ماسورة كهرباء EMT قطر 25 مم').intent).toBe('electrical_conduit')
  })
})

describe('the civil and architectural families the booklet register needs', () => {
  // Real booklet lines are two words long and civil. «خرسانة جاهزة» — the most
  // common item in general contracting anywhere — resolved to C while a
  // `ready_mix_supplier` archetype had existed since the first version, so the
  // supply side was modelled and the demand side never was.
  const expected: Array<[string, string]> = [
    ['خرسانة جاهزة', 'ready_mix_concrete'],
    ['خرسانة مسلحة C35', 'ready_mix_concrete'],
    ['خرسانة عادية', 'ready_mix_concrete'],
    ['لياسة', 'plaster_render'],
    ['طرطشة', 'plaster_render'],
    ['بلاستر اسمنتي', 'plaster_render'],
    ['جبس بورد', 'interior_systems'],
    ['لوح جبس 12.5 مم', 'interior_systems'],
    ['بحص', 'aggregates_fill'],
    ['رمل مغسول', 'aggregates_fill'],
    ['ركام خشن', 'aggregates_fill'],
    ['درابزين', 'metal_grating_walkway'],
    ['balustrade glass', 'metal_grating_walkway'],
    ['غرفة تفتيش', 'precast_drainage'],
    ['مظلات مواقف سيارات', 'shade_structures'],
    ['سواتر', 'shade_structures'],
    ['برجولة', 'shade_structures'],
    ['فتحات تهوية', 'hvac_equipment'],
    ['شبك تهوية', 'hvac_equipment'],
    ['غطاء فاصل حركة', 'movement_joint_systems'],
  ]
  for (const [line, family] of expected) {
    it(`«${line}» keys a pool`, () => {
      const hit = resolveOntology(line)
      expect(hit.family).toBe(family)
      expect(hit.poolable).toBe(true)
    })
  }

  it('a grade is a facet, not an intent', () => {
    // A batching plant that mixes C25 mixes C40, so splitting per grade would
    // fragment one supplier pool into twenty.
    const grades = ['C25', 'C30', 'C35', 'C40'].map((g) => resolveOntology(`خرسانة جاهزة ${g}`))
    expect(new Set(grades.map((g) => g.intent)).size).toBe(1)
  })

  it('an archetype is reused when the supply side already modelled the trade', () => {
    const readyMix = FAMILIES.find((f) => f.id === 'ready_mix_concrete')!
    expect(readyMix.preferred_archetypes).toContain('ready_mix_supplier')
    const plaster = FAMILIES.find((f) => f.id === 'plaster_render')!
    expect(plaster.preferred_archetypes).toContain('cement_supplier')
  })

  it('one phrasing belongs to one family', () => {
    // «بلاستر» sat in both cement_binders and the new rendering family, which
    // made the winner depend on scoring rather than on meaning.
    const claims = FAMILIES.filter((f) =>
      [...(f.strong_terms ?? []), ...(f.weak_terms ?? [])].some((t) => t === 'بلاستر' || t === 'plaster'),
    )
    expect(claims.map((f) => f.id)).toEqual(['plaster_render'])
  })
})

describe('«ألياف معدنية» is mineral fibre, not metal', () => {
  // Caught by the intent-level audit, not the cross-trade sweep: family and
  // department were both right, which is exactly the class that hides.
  for (const line of [
    'توريد بلاطة سقف ألياف معدنية مقاس 600×600 مم حافة Tegular',
    'بلاطة سقف صوف معدني',
    'mineral fibre ceiling tile 600x600',
  ]) {
    it(`reaches the mineral-fibre distributor: ${line.slice(0, 44)}`, () => {
      expect(resolveOntology(line).intent).toBe('acoustic_ceiling_tile')
    })
  }

  it('a perforated aluminium tile is still a metal ceiling', () => {
    // Acoustically rated, but the trade is a roll-former either way.
    expect(resolveOntology('توريد بلاطة سقف ألمنيوم مثقب مقاس 600×600 مم حافة Tegular').intent).toBe('metal_ceiling')
  })
})

/* ======================================================================== *
 * cpo-v7. Five defects, and four of them are one defect seen from different
 * sides: a rule verified in one register, one language, one node or one code
 * path, and never checked in the other.
 * ======================================================================== */

describe('the attribute clause is a construction, not a keyword list', () => {
  // The archive introduces an attribute with a noun («مادة»); real booklets
  // introduce it with a preposition («للخرسانة»). Inserting the archive's
  // keyword into the booklet's sentence made it resolve correctly, which is
  // what proved the two are one construction.
  it('a preposition opens a clause, exactly as the keyword does', () => {
    expect(resolveOntology('حديد تسليح للخرسانة المسلحة').family).toBe('rebar_mesh')
    expect(resolveOntology('حديد تسليح مادة الخرسانة المسلحة').family).toBe('rebar_mesh')
    expect(resolveOntology('حديد تسليح').family).toBe('rebar_mesh')
  })

  it('«لألواح» is the same لـ+الـ construction with a hamza-initial noun', () => {
    // The head is the framing, not the boards it carries.
    expect(resolveOntology('هيكل لألواح الجبس').intent).toBe('drywall_framing')
  })

  for (const [line, family] of [
    // DERIVED REFUSALS. Bare «ب» was 0 of 14 prepositional in the real
    // register, and bare «ل» failed on precisely «لياسة» and «لوحات» — the
    // plaster term and the distribution-board term. Adopting either would have
    // suppressed the vocabulary it was meant to protect.
    ['لياسة اسمنتية', 'plaster_render'],
    ['لوحات توزيع', 'switchgear_panels'],
    ['دهان بلاستيك', 'paints_coatings'],
    ['عازل بيتومين', 'waterproofing'],
    ['بلاط انترلوك', 'paving'],
    ['بوابة لمدخل الافراد', 'industrial_doors'],
  ] as const) {
    it(`a word merely starting with ل or ب is not a clause: ${line}`, () => {
      expect(resolveOntology(line).family).toBe(family)
    })
  }

  it('a clause still yields Level B recovery rather than a false unknown', () => {
    const r = resolveOntology('ربط Solvent Cement للمواسير')
    expect(r.level_code).not.toBe('C')
    expect(r.intent).not.toBe('lubricants')
  })
})

describe('an opener is not part of the value it introduces', () => {
  // Found by the supply side implementing the same rule and testing it back
  // against this resolver: a term whose FIRST word is a clause keyword could
  // never decide anywhere except position 0.
  for (const [line, expected] of [
    ['Panel Voltage Transformer 11kV', 'current_transformer'],
    ['Rescue Kit Height 30m', 'rescue_kit'],
    ['Digital Thickness Gauge 0-25mm', 'precision_gauge'],
    ['اسمنت مادة رابطة', 'concrete_repair'],
    ['خرسانة مادة معالجة', 'concrete_repair'],
  ] as const) {
    it(`decides away from position 0: ${line}`, () => {
      expect(resolveOntology(line).intent).toBe(expected)
    })
  }

  it('the value after the keyword is still suppressed', () => {
    // The fix must not reopen the class it was built to close.
    expect(resolveOntology('كوع مواسير مادة Aluminium').intent).not.toBe('aluminium_window_door')
    expect(resolveOntology('Wall-to-Wall Joint مادة Aluminium').family).not.toBe('aluminium_systems')
  })
})

describe('tier parity: the lexicon is a shortcut into a family, not past it', () => {
  // The third appearance of "one concept, two languages, unequal authority" —
  // and the cause was never language. The legacy lexicon ran with no guards at
  // all, so every guard was conditional on the word being ABSENT from a
  // dictionary that is overwhelmingly English.
  it('English irrigation is refused by the same guard as Arabic', () => {
    expect(resolveOntology('Irrigation Sprinkler Head').family).toBe('irrigation_systems')
    expect(resolveOntology('Pop-Up Lawn Sprinkler Gear Drive').family).toBe('irrigation_systems')
    expect(resolveOntology('رشاش ري').family).toBe('irrigation_systems')
  })

  it('a real fire sprinkler is untouched in both languages', () => {
    expect(resolveOntology('fire sprinkler pendent K5.6').intent).toBe('fire_sprinkler')
    expect(resolveOntology('توريد رشاش Pendent K5.6').intent).toBe('fire_sprinkler')
    expect(resolveOntology('رشاش حريق').intent).toBe('fire_sprinkler')
  })

  it('a guard on an intent also binds its own ancestors', () => {
    // «لاصق رخام» reached a tiling supplier because the guard lived on the
    // intent while the family carried the same word unguarded.
    expect(resolveOntology('لاصق رخام 25 كجم').intent).toBe('tile_grout_adhesive')
  })
})

describe('a material phrase does not name a trade', () => {
  // Glass fibre is an admixture, a tank, a grating and a roof sheet; mineral
  // fibre is a ceiling tile, an insulation batt and a concrete fibre. Whichever
  // trade held the bare phrase strong won every line that named no product.
  for (const [line, expected] of [
    // Both now reach the INTENT inside that family, which is the same answer
    // one level finer: the family owns the line either way.
    ['خزان ألياف زجاجية', 'grp_water_tank'],
    ['خزان GRP 5000 لتر', 'grp_water_tank'],
    ['ألياف زجاجية للخرسانة', 'concrete_fiber'],
    ['ألياف معدنية للخرسانة', 'concrete_fiber'],
    ['بلاطة سقف ألياف معدنية', 'acoustic_ceiling_tile'],
    ['صوف صخري 50 مم', 'mineral_wool_insulation'],
  ] as const) {
    it(`the product head decides, not the material: ${line}`, () => {
      const r = resolveOntology(line)
      expect(r.intent ?? r.family).toBe(expected)
    })
  }

  it('«معدني» is MINERAL in «صوف معدني» and METAL in «سقف معدني»', () => {
    // Blocking the bare word sent mineral wool tiles to nobody: the guard
    // meant to catch a roll-formed metal tile fired on the tile it protected.
    expect(resolveOntology('بلاطة سقف صوف معدني').intent).toBe('acoustic_ceiling_tile')
    expect(resolveOntology('سقف مستعار معدني ألمنيوم').intent).toBe('metal_ceiling')
  })
})

describe('Arabic morphology: one letter is not a different product', () => {
  it('the nisba adjective and its noun are one product', () => {
    expect(resolveOntology('باب خشب').intent).toBe('wooden_door')
    expect(resolveOntology('باب خشبي').intent).toBe('wooden_door')
  })

  it('the sound plural is the same word', () => {
    expect(resolveOntology('كابلات الجهد المتوسط').intent).toBe('mv_power_cable')
    expect(resolveOntology('كابل جهد متوسط').intent).toBe('mv_power_cable')
  })

  it('SHORTENING a stem is the direction that manufactures matches', () => {
    // Stripping the plural «يات» as well as the nisba reduced «ارضيات» to
    // «ارض», and floor tiling started claiming epoxy flooring.
    expect(resolveOntology('توريد أرضية إيبوكسي self leveling صناعية').family).toBe(
      'industrial_flooring_coating',
    )
  })
})

describe('the product head still outranks what it acts on', () => {
  for (const [line, notFamily, expected] of [
    ['توريد جهاز اختبار كابلات شبكة CAT6', 'structured_cabling', 'network_test_tools'],
    ['خرسانة أرضيات', 'floor_tiling', 'ready_mix_concrete'],
  ] as const) {
    it(`${line}`, () => {
      const r = resolveOntology(line)
      expect(r.family).not.toBe(notFamily)
      expect(r.family).toBe(expected)
    })
  }

  it('a main switchboard is not a final distribution board', () => {
    expect(resolveOntology('توريد لوحة توزيع كهربائية رئيسية 1600A').intent).toBeNull()
    expect(resolveOntology('لوحات توزيع').family).toBe('switchgear_panels')
  })

  it('a door access-control system is not a turnstile', () => {
    expect(resolveOntology('نظام التحكم بالأبواب').intent).toBe('access_controller')
    expect(resolveOntology('بوابة دوران').intent).toBe('turnstile_gate')
  })
})

describe('COMPUTED: a guard is classified, not adjudicated', () => {
  /**
   * WHAT REPLACED THE RATCHET, AND WHY.
   *
   * The previous version of this test carried a hand-written allowlist of
   * "legitimate" offences, declared may-only-shrink. It grew. A may-only-shrink
   * list that grew is not a ratchet, it is a comment: nothing enforced it but
   * goodwill, and goodwill broke at the first well-argued case, which
   * guarantees the next one. So the judgement is computed instead.
   *
   * A guard on a descendant, where the ancestor carries the same word freely,
   * is one of two things:
   *
   *   DEPTH GUARD  — every word it blocks on is this family's own vocabulary.
   *     It is separating siblings, so the ancestor answering is the honest
   *     fallback. Benign, automatically, with nobody signing anything off.
   *
   *   TRADE GUARD  — it blocks on a word that DECIDES some other family and
   *     that this family never uses. It is pushing the line out of the family
   *     altogether, so an unguarded ancestor re-catches exactly what the intent
   *     just declined. That is the sprinkler leak, and it must be mirrored.
   *
   * The predicate is what proves the «عزل» defect is fixed: bare «عزل» is
   * insulation's word, so its presence in the breaker guard classified those
   * guards as TRADE guards and failed this test — while also costing
   * «قاطع 32 امبير عزل مزدوج» its intent. Swapping it for «مفتاح عزل» and
   * «قاطع عزل», which switchgear owns, fixes the line and the classification
   * at once.
   */
  const ALL_TIERS = ['strong_terms', 'weak_terms', 'context_terms'] as const
  const DECIDING = ['strong_terms', 'weak_terms'] as const
  const key = (t: string) => t.toLowerCase().trim()

  /** term -> families where it can DECIDE. term -> every family that uses it at all. */
  const decidesIn = new Map<string, Set<string>>()
  const vocabOf = new Map<string, Set<string>>()
  for (const family of FAMILIES as any[]) {
    const bag = new Set<string>()
    const walk = (node: any) => {
      for (const tier of ALL_TIERS) for (const t of node[tier] ?? []) bag.add(key(t))
      for (const tier of DECIDING) {
        for (const t of node[tier] ?? []) {
          if (!decidesIn.has(key(t))) decidesIn.set(key(t), new Set())
          decidesIn.get(key(t))!.add(family.id)
        }
      }
      for (const c of node.categories ?? []) walk(c)
      for (const i of node.intents ?? []) walk(i)
    }
    walk(family)
    vocabOf.set(family.id, bag)
  }

  const classify = () => {
    const depth: string[] = []
    const unmirroredTrade: string[] = []
    for (const family of FAMILIES as any[]) {
      const carried = new Map<string, { terms: Set<string>; guards: any[] }>()
      const walk = (node: any, path: string) => {
        const here = `${path}/${node.id}`
        carried.set(here, {
          terms: new Set<string>([...(node.strong_terms ?? []), ...(node.weak_terms ?? [])]),
          guards: node.term_guards ?? [],
        })
        for (const c of node.categories ?? []) walk(c, here)
        for (const i of node.intents ?? []) walk(i, here)
      }
      walk(family, '')

      for (const [path, node] of carried) {
        for (const guard of node.guards) {
          const blocked = [...(guard.block_any ?? []), ...(guard.blocked_by_head ?? [])]
          const foreign = blocked.filter((b: string) => {
            const owners = decidesIn.get(key(b))
            return owners && [...owners].some((o) => o !== family.id) && !vocabOf.get(family.id)!.has(key(b))
          })
          for (const term of guard.terms) {
            if (!node.terms.has(term)) continue
            for (const [ancestor, ancestorNode] of carried) {
              // Strictly upward. A SIBLING may legitimately guard the same word
              // differently, and unioning siblings would block both.
              if (!path.startsWith(`${ancestor}/`)) continue
              if (!ancestorNode.terms.has(term)) continue
              if (ancestorNode.guards.some((g: any) => g.terms.includes(term))) continue
              const label = `«${term}» at ${path}, free at ${ancestor}`
              if (foreign.length) unmirroredTrade.push(`${label} — foreign: ${foreign.join(', ')}`)
              else depth.push(label)
            }
          }
        }
      }
    }
    return { depth, unmirroredTrade }
  }

  it('never leaves a trade guard unmirrored on an ancestor that decides the word', () => {
    expect(classify().unmirroredTrade).toEqual([])
  })

  it('still finds depth guards, so the predicate is discriminating and not just empty', () => {
    // If this ever hits zero the predicate has stopped distinguishing anything
    // and the test above is passing vacuously.
    expect(classify().depth.length).toBeGreaterThan(0)
  })

  it('classifies the breaker guards as depth guards, which is what the «عزل» fix bought', () => {
    const { depth } = classify()
    for (const node of ['mcb', 'mccb']) {
      expect(depth.some((d) => d.includes(`/switchgear_panels/${node}`))).toBe(true)
    }
  })

  it('keeps «قاطع 32 امبير عزل مزدوج» at its intent', () => {
    // The line the borrowed word cost. Double insulation is a property of the
    // breaker, not a different trade.
    expect(resolveOntology('قاطع 32 امبير عزل مزدوج').intent).toBe('mcb')
    expect(resolveOntology('قاطع 32 امبير عزل مزدوج').family).toBe('switchgear_panels')
  })

  it('would catch the sprinkler leak if it came back', () => {
    // Constructed, not recorded: a trade guard on an intent whose family
    // decides the same word must be reported by the predicate.
    const owners = decidesIn.get('ري')
    expect(owners && [...owners]).toContain('irrigation_systems')
    expect(vocabOf.get('fire_fighting')!.has('ري')).toBe(false)
  })
})

/**
 * The same defect shape has now been measured three times: «باب خشب / باب
 * خشبي» (morphology), «رشاش / sprinkler» (concept), and here in UNITS. A buyer
 * writing English names the device and reaches an intent; a buyer writing
 * Arabic names the rating and stopped at family. Both are the same purchase.
 */
describe('cpo-v8: the rating is the device name, in Arabic', () => {
  const cases: Array<[string, string | null]> = [
    // The two measured booklet lines.
    ['قاطع 32 امبير', 'mcb'],
    ['قاطع 100 امبير', 'mccb'],
    // Parity with what the English writer already got.
    ['MCB 32A', 'mcb'],
    ['MCCB 100A', 'mccb'],
    ['breaker 63a', 'mcb'],
    ['breaker 250 a', 'mccb'],
    ['قواطع 16 امبير', 'mcb'],
  ]
  for (const [line, intent] of cases) {
    it(`«${line}» reaches ${intent}`, () => {
      expect(resolveOntology(line).intent).toBe(intent)
    })
  }

  /**
   * 64–99A is in NEITHER series because an 80A breaker is genuinely either
   * device. Stopping at family is the honest answer; picking one at 0.90
   * confidence is the failure mode the owner ranks as worse than a Level C.
   */
  it('refuses the ambiguous band rather than guessing between the two', () => {
    const r = resolveOntology('قاطع 80 امبير')
    expect(r.intent).toBeNull()
    expect(r.family).toBe('switchgear_panels')
    expect(r.poolable).toBe(true)
  })

  /** An in-range rating must never override a device that names itself. */
  it.each([
    ['قاطع تسرب ارضي 63 امبير', 'residual_current_device'],
    ['قاطع هوايي 800 امبير', 'acb'],
    ['rcbo 32a', 'residual_current_device'],
  ])('«%s» is still %s despite an in-range rating', (line, intent) => {
    expect(resolveOntology(line).intent).toBe(intent)
  })

  it('does not let a rating alone promote a switch that merely breaks current', () => {
    // «قاطع عزل» is an isolator. v8 left it at family because the breaker
    // guards blocked on a bare «عزل» borrowed from insulation; v9 gives the
    // phrase to the family that actually sells it, so it reaches its own
    // intent instead of the rating's.
    expect(resolveOntology('قاطع عزل 100 امبير').intent).toBe('isolator_switch')
    expect(resolveOntology('مفتاح عزل 100 امبير').intent).toBe('isolator_switch')
  })
})

/**
 * «بلوك مفرغ» was ALREADY a strong term. «بلوك اسمني مفرغ» failed for exactly
 * one reason — a misspelling sitting between the two words broke adjacency —
 * so the fix is compositional and the typo stays out of the vocabulary.
 */
describe('cpo-v8: hollow/solid decides the block, whatever adjective sits in the middle', () => {
  it.each([
    ['بلوك اسمني مفرغ', 'concrete_block'],
    ['بلوك اسمنتي مفرغ', 'concrete_block'],
    ['بلوك خرساني مصمت', 'concrete_block'],
    ['بلوك مفرغ', 'concrete_block'],
    // A strong term still outranks the weak one, so the lightweight trade keeps
    // its own hollow blocks.
    ['بلوك خفيف مفرغ', 'lightweight_block'],
    ['aac block hollow', 'lightweight_block'],
  ])('«%s» -> %s', (line, intent) => {
    expect(resolveOntology(line).intent).toBe(intent)
  })

  it('carries no misspelling in the vocabulary', () => {
    const terms: string[] = []
    const walk = (node: any) => {
      for (const k of ['strong_terms', 'weak_terms', 'context_terms', 'supplier_terms', 'negative_terms']) {
        for (const t of node[k] ?? []) terms.push(t)
      }
      for (const g of node.term_guards ?? []) {
        for (const k of ['terms', 'require_any', 'block_any', 'blocked_by_head']) {
          for (const t of g[k] ?? []) terms.push(t)
        }
      }
      for (const c of node.categories ?? []) walk(c)
      for (const i of node.intents ?? []) walk(i)
    }
    for (const f of FAMILIES) walk(f)
    expect(terms.filter((t) => t.includes('اسمني'))).toEqual([])
  })

  /**
   * What happens to the line if the typo appears WITHOUT the hollow/solid word:
   * it keys the masonry pool at family level. That is the honest floor, and it
   * is why declining the typo costs the owner nothing.
   */
  it('still keys a pool when the typo stands alone', () => {
    const r = resolveOntology('توريد بلوك اسمني للمباني')
    expect(r.family).toBe('masonry_blocks')
    expect(r.poolable).toBe(true)
  })
})

/**
 * An opener adopted on one observation must not read like a measured one. The
 * evidence lives in the payload so a future reader cannot mistake the two, and
 * this test is what stops the flag from being dropped quietly.
 */
describe('cpo-v8: the clause vocabulary declares its own evidence', () => {
  const THRESHOLD = 5

  it('flags every thinly-attested opener as provisional', () => {
    const thin = CLAUSE_RULE.proclitic_clause_openers.openers.filter((o) => o.observations < THRESHOLD)
    expect(thin.map((o) => o.prefix).sort()).toEqual(['بال', 'لال'])
    for (const o of thin) expect(o.provisional).toBe(true)
  })

  it('names the review threshold in the data, not in a report', () => {
    const review = CLAUSE_RULE.provisional_review
    expect(review).toBeDefined()
    expect(review!.after_booklet_lines).toBe(1000)
    expect(review!.booklet_lines_seen).toBeLessThan(1000)
  })

  it('keeps every provisional opener error-safe by requiring a stem floor', () => {
    // The reason a one-observation rule is tolerable: it errs toward
    // suppression, which falls back instead of hijacking. The stem floor is
    // what bounds how often it can fire at all.
    for (const o of CLAUSE_RULE.proclitic_clause_openers.openers) {
      if (o.provisional) expect(o.min_stem).toBeGreaterThanOrEqual(3)
      expect(o.evidence.length).toBeGreaterThan(20)
    }
  })

  it('never re-adopts a rejected opener', () => {
    const active = new Set<string>([
      ...CLAUSE_RULE.proclitic_clause_openers.openers.map((o) => o.prefix),
      ...CLAUSE_RULE.preposition_clause_keys.keys.map((k) => k.key),
    ])
    for (const r of CLAUSE_RULE.rejected_openers.openers) {
      expect(active.has(r.prefix ?? r.key ?? '')).toBe(false)
    }
  })

  /** The resolver must READ this vocabulary, not carry a second copy of it. */
  it('is the vocabulary the resolver actually applies', () => {
    // «لال» is payload-only; if the resolver held its own copy, removing the
    // payload entry would not change behaviour. This asserts the live wiring.
    expect(CLAUSE_RULE.proclitic_clause_openers.openers.map((o) => o.prefix)).toContain('لال')
    expect(resolveOntology('هيكل معدني لألواح الجبس').intent).toBe('drywall_framing')
    expect(CLAUSE_RULE.attribute_clause_keys.keys).toContain('ماده')
    expect(resolveOntology('وصلة PPR مقاس 50 مم ربط Solvent Cement').family).toBe('pipes_fittings')
  })
})

/**
 * The bypass hunt found the demand side clean — all four resolution paths
 * funnel through `bestHit` — and the supply side with no chokepoint at all.
 * These are the two cases demonstrated live against production.
 */
describe('cpo-v9: supplier prose is its own register', () => {
  const sprinkler = resolveOntology('توريد وتركيب رشاش حريق Pendent K5.6')

  it('resolves the line it is matching against', () => {
    expect(sprinkler.family).toBe('fire_fighting')
    expect(sprinkler.intent).toBe('fire_sprinkler')
  })

  /**
   * THE MEASURED REGRESSION v8 SHIPPED.
   *
   * Routing supplier claims through the BOQ clause rule applied booklet
   * vocabulary to company prose. A qualified fire-protection supplier scored
   * zero because its name contains «من», and the identical business written
   * «ضد» scored 23. Arabic company names are full of these words; 10,104 real
   * records say «لل» alone occurs 6,298 times and introduces the company's own
   * trade every single time.
   */
  it('scores a supplier the same however its name joins the words', () => {
    const withPreposition = evaluateSupplier('مأسسة الحماية من الحريق — رشاشات حريق ومضخات', sprinkler)
    const without = evaluateSupplier('مؤسسة الحماية ضد الحريق — رشاشات حريق ومضخات', sprinkler)
    expect(withPreposition.score).toBe(without.score)
    expect(withPreposition.verdict).toBe('PREFERRED')
    expect(withPreposition.auto_tick).toBe(true)
  })

  it('does not let a city zero a contractor', () => {
    for (const s of ['شركة مكافحة الحرائق في الرياض', 'شركة مكافحة الحرائق بالرياض']) {
      const e = evaluateSupplier(s, sprinkler)
      expect(e.archetypes).toContain('fire_fighting_supplier')
      expect(e.verdict).toBe('PREFERRED')
    }
  })

  /**
   * «حرائق» is the BROKEN plural of «حريق». Suffix rules cannot derive it, so
   * it is listed. This was reported as a casualty of the chokepoint and was
   * not: it scored zero before the chokepoint existed.
   */
  it('matches the broken plural, which no suffix rule can reach', () => {
    expect(classifySupplierArchetypes('مكافحة الحرائق')).toContain('fire_fighting_supplier')
    expect(classifySupplierArchetypes('مكافحة حريق')).toContain('fire_fighting_supplier')
  })

  it('declares an empty prose vocabulary rather than silently reusing the BOQ one', () => {
    expect(SUPPLIER_CLAUSE_RULE.register).toBe('supplier_prose')
    expect(SUPPLIER_CLAUSE_RULE.attribute_clause_keys.keys).toEqual([])
    expect(SUPPLIER_CLAUSE_RULE.preposition_clause_keys.keys).toEqual([])
    expect(SUPPLIER_CLAUSE_RULE.proclitic_clause_openers.openers).toEqual([])
    // Empty is a RESULT, so it carries its evidence like any other result.
    expect(SUPPLIER_CLAUSE_RULE.rejected_openers.openers.length).toBeGreaterThan(8)
    const ll = SUPPLIER_CLAUSE_RULE.rejected_openers.openers.find((o) => o.prefix === 'لل')
    expect(ll?.observations).toBe(6298)
  })

  it('declares the index-0 policy per register instead of assuming one', () => {
    expect(CLAUSE_RULE.opens_at_index_0).toBe(false)
    expect(SUPPLIER_CLAUSE_RULE.opens_at_index_0).toBe(true)
  })

  /** The BOQ register is untouched by any of this. */
  it('keeps the BOQ rule exactly where it was', () => {
    expect(termDecidesIn('وصلة PPR Elbow مقاس 50 مم ربط Solvent Cement', 'solvent')).toBe(false)
    expect(termDecidesIn('حديد تسليح للخرسانة المسلحة', 'خرسانه')).toBe(false)
    expect(termDecidesIn('شبكات ري مادة رشاش حريق', 'رشاش حريق')).toBe(false)
    // Same string, other register.
    expect(termDecidesIn('شبكات ري مادة رشاش حريق', 'رشاش حريق', 'supplier_prose')).toBe(true)
  })

  /**
   * The chokepoint itself STAYS: every positive claim still goes through
   * `bestHit`, which is what makes the register swap a one-line change rather
   * than a second implementation. Only the vocabulary it applies is register-
   * specific. Negative terms remain raw — an exclusion is not a claim.
   */
  it('lets a negative term veto from anywhere, including inside a clause', () => {
    const profile = {
      ...sprinkler,
      preferred_archetypes: [],
      allowed_archetypes: [],
      negative_terms: ['دهانات'],
    }
    expect(evaluateSupplier('مؤسسة عامة مادة دهانات', profile).verdict).toBe('HARD_VETO')
    expect(evaluateSupplier('مؤسسة عامة تصنيف دهانات', profile).verdict).toBe('HARD_VETO')
    expect(evaluateSupplier('مؤسسة عامة من دهانات', profile).verdict).toBe('HARD_VETO')
  })

  it('still prefers a supplier that genuinely says it does the work', () => {
    for (const s of ['شركة مكافحة حريق ورشاشات', 'مؤسسة انظمة مكافحة الحريق', 'fire fighting sprinkler contractor']) {
      expect(evaluateSupplier(s, sprinkler).verdict).toBe('PREFERRED')
    }
  })
})


/**
 * cpo-v11. Two findings from the 1,650-row stress booklet.
 *
 * English technical lines arrived intact from the reader and left without a
 * family: «Power cable 4x35mm2», «PVC Pipe DN110», «Motor 220V 2kW». Not a
 * translation problem — a vocabulary one: the aliases were Arabic, and the
 * unit glued to its number («220V», «DN110») hid the context word the
 * three-tier rule needed. Every intent now carries both languages and the
 * shorthand is normalised on both sides of the match.
 *
 * And blank PVC cards were the same intent as the printer that prints them,
 * so a card-printer supplier was a specialist in blank cards. One family for
 * grouping, two intents for matching.
 */
describe('cpo-v11: English technical lines resolve, and attributes are read', () => {
  const cases: Array<[string, string, string | null, Record<string, string>]> = [
    ['Power cable 4x35mm2', 'power_cables', null, { cable_cores: '4', cross_section_mm2: '35' }],
    ['LV cable 4x35 mm²', 'power_cables', null, { cable_cores: '4', cross_section_mm2: '35' }],
    ['XLPE cable 4x70mm2', 'power_cables', null, { cable_cores: '4', cross_section_mm2: '70' }],
    ['electrical cable 3x2.5mm2', 'power_cables', null, { cable_cores: '3', cross_section_mm2: '2.5' }],
    ['كابل كهرباء 4x35 مم2', 'power_cables', null, { cable_cores: '4', cross_section_mm2: '35' }],
    ['كابل قدرة', 'power_cables', null, {}],
    ['PVC Pipe DN110', 'pipes_fittings', null, { material: 'pvc', diameter: '110' }],
    ['UPVC pipe DN 110', 'pipes_fittings', null, { material: 'pvc', diameter: '110' }],
    ['CPVC pipe 2 inch', 'pipes_fittings', null, { diameter: '2' }],
    ['plastic pipe 110mm', 'pipes_fittings', null, {}],
    ['Steel Pipe DN110', 'pipes_fittings', null, { material: 'steel', diameter: '110' }],
    ['Copper Pipe DN110', 'pipes_fittings', null, { material: 'copper', diameter: '110' }],
    ['مواسير pvc', 'pipes_fittings', null, { material: 'pvc' }],
    ['Motor 220V 2kW', 'electric_motors', null, { voltage: '220', power_kw: '2' }],
    ['Motor 380V 2kW', 'electric_motors', null, { voltage: '380', power_kw: '2' }],
    ['electric motor 5.5 kW', 'electric_motors', 'induction_motor', { power_kw: '5.5' }],
    ['محرك كهربائي 3 حصان', 'electric_motors', 'induction_motor', { power_kw: '3' }],
  ]
  for (const [line, family, intent, facets] of cases) {
    it(`${line} → ${family}${intent ? '/' + intent : ''}`, () => {
      const r = resolveOntology(line)
      expect(r.level, line).not.toBe('unresolved')
      expect(r.family, line).toBe(family)
      if (intent) expect(r.intent, line).toBe(intent)
      for (const [name, value] of Object.entries(facets)) expect(r.facets[name], `${line} · ${name}`).toBe(value)
    })
  }

  it('the shorthand is one form on both sides of the match', () => {
    expect(normalizeProcurementText('35 mm2')).toBe(normalizeProcurementText('35mm²'))
    expect(normalizeProcurementText('220 V')).toBe(normalizeProcurementText('220V'))
    expect(normalizeProcurementText('DN 110')).toBe(normalizeProcurementText('DN110'))
    expect(normalizeProcurementText('2 kW')).toBe(normalizeProcurementText('2kW'))
    expect(normalizeProcurementText('2.5mm2')).toContain('2.5')
    // Product names keep their digits glued.
    expect(normalizeProcurementText('cat6 om3 ip54 m20')).toBe('cat6 om3 ip54 m20')
  })

  it('a rating written as a term still meets the same rating on a line', () => {
    expect(resolveOntology('قاطع MCCB 160A').intent).toBe('mccb')
    expect(resolveOntology('MCCB 160 A 3P').intent).toBe('mccb')
  })
})

describe('cpo-v11: blank cards and the printer are one family and two pools', () => {
  const cards = ['بطاقات PVC', 'PVC cards', 'blank PVC cards', 'بطاقات PVC بيضاء', 'توريد بطاقات هوية PVC فارغة']
  const printers = ['طابعة بطاقات', 'طابعة بطاقات PVC', 'PVC card printer', 'ID card printer', 'توريد طابعة بطاقات PVC هوية مع تشفير']
  for (const line of cards) {
    it(`${line} → it_peripherals / pvc_cards`, () => {
      const r = resolveOntology(line)
      expect(r.family).toBe('it_peripherals')
      expect(r.intent).toBe('pvc_cards')
    })
  }
  for (const line of printers) {
    it(`${line} → it_peripherals / card_printers`, () => {
      const r = resolveOntology(line)
      expect(r.family).toBe('it_peripherals')
      expect(r.intent).toBe('card_printers')
    })
  }
  it('supplier matching keys on the intent: the two never share a pool', () => {
    expect(resolveOntology('بطاقات PVC').pool_key).not.toBe(resolveOntology('طابعة بطاقات').pool_key)
    expect(resolveOntology('بطاقات PVC').cache_key).not.toBe(resolveOntology('طابعة بطاقات').cache_key)
  })
  it('a card-printer supplier is not preferred for blank cards, and the card supplier not for printers', () => {
    const cards = resolveOntology('بطاقات PVC بيضاء')
    const printer = resolveOntology('طابعة بطاقات PVC')
    const printerOnly = 'مؤسسة طباعة البطاقات — طابعات بطاقات وأحبار'
    const cardsOnly = 'شركة البطاقات البلاستيكية — بطاقات PVC ومستلزمات بطاقات'
    expect(evaluateSupplier(cardsOnly, cards).verdict).toBe('PREFERRED')
    expect(evaluateSupplier(printerOnly, cards).verdict).not.toBe('PREFERRED')
    expect(evaluateSupplier(cardsOnly, printer).verdict).not.toBe('PREFERRED')
  })
})

describe('cpo-v11: sibling intents that share a word never share a pool', () => {
  const pairs: Array<[string, string]> = [
    ['Fiber optic cable 24 core', 'Power cable 4x35mm2'],
    ['كابل ألياف بصرية 24 كور', 'كابل نحاس 4x25 مم2'],
    ['رشاش ري pop-up', 'رشاش حريق upright'],
    ['Irrigation sprinkler head', 'Fire sprinkler K80 pendent'],
    ['مواسير كهرباء EMT', 'مواسير مياه PPR'],
    ['electrical conduit 25mm', 'water pipe DN25'],
    ['بطاقات PVC', 'طابعة بطاقات PVC'],
    ['كاميرا حرارية أمنية perimeter', 'كاميرا حرارية للفحص والصيانة'],
  ]
  for (const [a, b] of pairs) {
    it(`${a} ≠ ${b}`, () => {
      const ra = resolveOntology(a)
      const rb = resolveOntology(b)
      expect(ra.level, a).not.toBe('unresolved')
      expect(rb.level, b).not.toBe('unresolved')
      expect(ra.pool_key, `${a} vs ${b}`).not.toBe(rb.pool_key)
      expect(`${ra.family}/${ra.intent}`).not.toBe(`${rb.family}/${rb.intent}`)
    })
  }
})
