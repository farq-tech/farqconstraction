/**
 * Accuracy + coverage audit of the Compositional Procurement Ontology against a
 * large real tender catalogue (10,219 general-contracting supply lines).
 *
 * WHY THIS EXISTS, and why it is not the coverage report:
 * `intent-coverage-report.mjs` answers "how much resolved". It cannot answer
 * "how much resolved WRONGLY", and a confident wrong answer is worse than an
 * honest Level C — it sends an RFQ to a supplier who cannot supply the item.
 * Measuring 10,219 lines showed 98.1% local resolution on a 462-line fixture
 * was not evidence of engine quality: 434 of the poolable lines were confidently
 * wrong. So quality here is THREE numbers together, never one:
 *
 *     poolable coverage  +  confident-wrong rate  +  C rate
 *
 * A higher C rate with near-zero confident-wrong beats high poolable with 4%
 * confident-wrong. The audit below is written to make that trade visible.
 *
 * The catalogue ships its own taxonomy (11 departments / 187 categories), which
 * is what makes an accuracy measurement possible at all: the confident-wrong
 * rules compare the resolved family against the department the catalogue itself
 * assigned. Each rule names the error and the mechanical cause.
 *
 * Usage:
 *   node scripts/tender-audit.mjs [--file path.xlsx] [--json out.json] [--verbose]
 */
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
import readXlsxFile from 'read-excel-file/node'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const FILE = argOf('--file', '/Users/m4pro/Downloads/بنود_مناقصات_مقاولات_عامة_10219_بند.xlsx')
const JSON_OUT = argOf('--json', null)
const VERBOSE = args.includes('--verbose')

/** The catalogue's own columns. A mis-picked column invalidates everything. */
const SHEET = 'بنود_المقاولات'
const COL = { n: 0, department: 1, category: 2, item: 3, spec: 4, unit: 5, discipline: 6 }

/**
 * Departments of the catalogue mapped to the ontology sectors that are a
 * TRADE-COMPATIBLE answer — "compatible" meaning the resulting supplier pool is
 * one that genuinely sells the item. Deliberately generous: the point is to
 * catch answers that are wrong by trade, not to police taxonomy differences.
 */
const COMPATIBLE_SECTORS = {
  'كهرباء': ['ELECTRICAL', 'DATACENTER_ICT', 'TOOLS_WORKSHOP', 'INSTRUMENTS'],
  'كهرباء وضعيف': ['DATACENTER_ICT', 'ELECTRICAL', 'FIRE', 'SAFETY_PPE'],
  'ميكانيكا': ['MEP_WATER', 'FIRE', 'BUILDING_ENVELOPE'],
  'مدني وإنشائي': ['STRUCTURAL_METALS', 'CIVIL_CONCRETE', 'ARCHITECTURAL_FINISHES', 'BUILDING_ENVELOPE', 'TOOLS_WORKSHOP'],
  'معماري': ['ARCHITECTURAL_FINISHES', 'BUILDING_ENVELOPE', 'STRUCTURAL_METALS'],
  'بنية تحتية': ['INFRASTRUCTURE', 'MEP_WATER', 'STRUCTURAL_METALS', 'ARCHITECTURAL_FINISHES', 'ELECTRICAL', 'CIVIL_CONCRETE'],
  'مواد عامة للمقاولات': ['TOOLS_WORKSHOP', 'STRUCTURAL_METALS', 'ARCHITECTURAL_FINISHES', 'CIVIL_CONCRETE'],
  'معماري وميكانيكا': ['MEP_WATER', 'ARCHITECTURAL_FINISHES', 'BUILDING_ENVELOPE'],
  'زراعة وري': ['MEP_WATER', 'ELECTRICAL', 'ARCHITECTURAL_FINISHES', 'INFRASTRUCTURE'],
  'مدني ومعماري': ['STRUCTURAL_METALS', 'CIVIL_CONCRETE', 'ARCHITECTURAL_FINISHES', 'BUILDING_ENVELOPE'],
  'أعمال خارجية': ['ARCHITECTURAL_FINISHES', 'STRUCTURAL_METALS', 'SAFETY_PPE', 'WAREHOUSE_LOGISTICS', 'INFRASTRUCTURE'],
}

/**
 * The eight measured error families, as predicates. Each is a resolution that
 * reaches the WRONG supplier trade, with the mechanical cause named. Keeping
 * them here — rather than in prose — is what makes "did the fix hold?" a
 * measurement instead of a claim.
 */
const CONFIDENT_WRONG_RULES = [
  { id: 'gypsum_stud_as_steel', category: 'قطاعات قواطع جافة',
    hit: (r) => r.family === 'structural_steel',
    en: 'light-gauge gypsum stud -> structural steel', cause: 'weak «قطاع» + generic galvanized/thickness context' },
  { id: 'fiber_as_power_cable', category: 'كوابل ألياف ضوئية',
    hit: (r) => r.family === 'power_cables',
    en: 'fibre optic cable -> power cable', cause: 'strong «كابل» outranks structured cabling' },
  { id: 'pipe_support_as_pipe', category: 'حوامل مواسير',
    hit: (r) => r.family === 'pipes_fittings',
    en: 'pipe hanger -> pipes', cause: 'matched the OBJECT, not the product head' },
  { id: 'pipe_insulation_as_pipe', category: 'عزل مواسير تكييف',
    hit: (r) => r.family === 'pipes_fittings',
    en: 'pipe insulation -> pipes', cause: 'matched the OBJECT, not the product head' },
  { id: 'conduit_as_water_pipe', category: 'مواسير وتمديدات كهربائية',
    hit: (r) => r.sector === 'MEP_WATER',
    en: 'electrical EMT conduit -> water pipes', cause: 'strong «ماسوره» crosses sectors' },
  { id: 'fire_rated_as_fire_fighting', category: 'MDF',
    hit: (r) => r.sector === 'FIRE',
    en: 'fire-rated MDF board -> fire fighting', cause: '«حريق» is an ADJECTIVE here, not a product' },
  { id: 'pipe_socket_as_hand_tool', category: 'وصلات مواسير',
    hit: (r) => r.family === 'hand_tools',
    en: 'UPVC socket coupler -> socket wrench', cause: 'bare «socket» decided without plumbing context' },
  { id: 'irrigation_filter_as_respirator', category: 'ملحقات ري',
    hit: (r) => r.intent === 'respirator_filter',
    en: 'irrigation filter disc -> respirator filter', cause: 'bare «filter» with no respiratory context' },
  { id: 'enclosure_as_steel_sheet', category: 'لوحات وصناديق',
    hit: (r) => r.family === 'metal_sheet_coil',
    en: 'electrical enclosure -> steel sheet/coil', cause: 'bare «sheet» decided without context' },
  { id: 'energy_meter_as_flow_meter', category: 'أجهزة قياس كهربائية',
    hit: (r) => r.family === 'flow_instrumentation',
    en: 'electrical energy meter -> flow instrumentation', cause: 'bare «meter» decided without context' },
]

/**
 * WRONG INTENT INSIDE THE RIGHT FAMILY.
 *
 * The cross-trade sweep above compares sectors, so it is structurally blind to
 * an error that stays inside one family — and that is where the largest single
 * error found in this exercise was hiding: 456 control and medium-voltage cable
 * lines resolving to `lv_power_cable`. The family was right, the department was
 * right, the sweep was silent, and the RFQ would still go to the wrong
 * specialists. `intent_supplier_map` is keyed on the INTENT, so a wrong intent
 * is a wrong pool.
 *
 * Ground truth is the catalogue's own category name where that name states the
 * product class unambiguously. Several intents may be acceptable for one
 * category; all acceptable ones are listed.
 */
const EXPECTED_INTENT = {
  'كابلات قدرة منخفضة الجهد': ['lv_power_cable'],
  'كابلات جهد متوسط': ['mv_power_cable'],
  'كابلات تحكم': ['control_cable'],
  'كابلات مقاومة للحريق': ['fire_resistant_cable'],
  'كابلات أجهزة Instrumentation': ['instrumentation_cable'],
  'حوامل كابلات': ['cable_tray'],
  'سلالم كابلات': ['cable_ladder'],
  'قنوات كابلات': ['cable_trunking'],
  'مواسير وتمديدات كهربائية': ['electrical_conduit'],
  'نهايات كابلات': ['cable_termination'],
  'Cable Glands': ['cable_gland'],
  'قواطع MCCB': ['mccb'],
  'قواطع MCB': ['mcb'],
  'حماية تسرب أرضي': ['residual_current_device'],
  'مفاتيح عزل': ['isolator_switch'],
  'مفاتيح تحويل': ['transfer_switch'],
  'كونتاكتورات': ['contactor'],
  'ريليهات حماية': ['protection_relay'],
  'محولات تيار': ['current_transformer'],
  'قضبان نحاس': ['busbar'],
  'أجهزة قياس كهربائية': ['electrical_metering', 'electrical_tester'],
  'تحسين معامل القدرة': ['capacitor_bank'],
  'إنارة داخلية': ['downlight', 'led_panel_light'],
  'إنارة خطية': ['linear_light'],
  'إنارة خارجية': ['floodlight'],
  'إنارة طرق': ['street_light'],
  'أعمدة إنارة': ['lighting_pole'],
  'إنارة صناعية': ['highbay_light'],
  'مخارج كهربائية': ['socket_outlet'],
  'مفاتيح إنارة': ['light_switch'],
  'تأريض': ['earth_rod', 'earthing_accessories'],
  'ملحقات تأريض': ['earthing_accessories'],
  'حماية من الصواعق': ['lightning_protection'],
  'كوابل ألياف ضوئية': ['fiber_optic_cable'],
  'Fiber Patch Cords': ['fiber_patch_cord'],
  'Patch Cords': ['copper_patch_cord'],
  'باتش بانل': ['patch_panel'],
  'توزيع ألياف': ['fiber_distribution', 'patch_panel'],
  'مخارج بيانات': ['data_outlet'],
  'كوابل بيانات': ['data_cable'],
  'مبدلات شبكات': ['network_switch'],
  'وحدات شبكة ضوئية': ['optical_transceiver'],
  'خزائن اتصالات': ['comms_cabinet'],
  'حساسات BMS': ['bms_field_sensor'],
  BMS: ['bms_controller'],
  'وصلات فولاذ كربوني': ['pipe_fitting'],
  'وصلات مواسير': ['pipe_fitting'],
  'حوامل مواسير': ['pipe_hanger'],
  'عوازل وحوامل ميكانيكية': ['vibration_isolator'],
  'عزل مواسير تكييف': ['pipe_duct_insulation'],
  'عزل حراري XPS': ['rigid_board_insulation'],
  'عزل حراري EPS': ['rigid_board_insulation'],
  'عزل PIR': ['rigid_board_insulation'],
  'صوف صخري': ['mineral_wool_insulation'],
  'صوف زجاجي': ['mineral_wool_insulation'],
  'دامبرز': ['air_damper'],
  'مخارج هواء': ['air_terminal_device'],
  'ملحقات مجاري الهواء': ['duct_accessories'],
  'مراوح': ['fan_unit'],
  'سخانات مياه': ['water_heater'],
  'أوعية ضغط': ['expansion_vessel'],
  'صمامات مياه مبردة': ['control_valve'],
  'مصارف أرضية': ['floor_drain'],
  'أدوات صحية': ['wc_sanitaryware'],
  'إكسسوارات دورات مياه': ['washroom_accessories'],
  'مساند ذوي الإعاقة': ['accessibility_grab_bar'],
  'مثبتات ميكانيكية': ['mechanical_anchor'],
  'قضبان ملولبة': ['threaded_rod'],
  'براغي': ['bolt_screw'],
  'مسامير قص': ['shear_stud'],
  'قطاعات قواطع جافة': ['drywall_framing'],
  'بلاطات أسقف صوتية': ['acoustic_ceiling_tile'],
  'فتحات صيانة': ['access_panel'],
  'حماية حوائط': ['wall_protection'],
  'قواطع دورات مياه': ['toilet_partition', 'laminate_panel'],
  'ملحقات قواطع دورات المياه': ['toilet_partition'],
  'أرضيات مرتفعة': ['raised_floor'],
  'أرضيات LVT': ['resilient_flooring'],
  'موكيت بلاطات': ['carpet_tile'],
  'أحجار وأسطح': ['stone_slab'],
  'شبك تسليح': ['welded_mesh'],
  'حديديات أبواب': ['door_hardware'],
  MDF: ['mdf_board'],
  'خشب رقائقي': ['plywood'],
  'لامينيت HPL': ['laminate_panel'],
  'HPL خارجي': ['laminate_panel'],
  'أبواب خشبية مصنعة': ['wooden_door'],
  'زجاج مصفح': ['laminated_glass'],
  'زجاج معماري': ['architectural_glass', 'tempered_glass'],
  'زجاج مزدوج': ['insulated_glass_unit'],
  'قطاعات واجهات ألمنيوم': ['curtain_wall_profile'],
  'لوفرات ألمنيوم': ['aluminium_louver'],
  'كسوة ألمنيوم': ['aluminium_cladding_panel'],
  'غرف تصريف جاهزة': ['precast_chamber'],
  'غرف تفتيش مسبقة الصب': ['precast_chamber'],
  'أغطية غرف تفتيش': ['manhole_cover'],
  'قنوات تصريف خطية': ['linear_drainage'],
  'شبك تصريف': ['drainage_grating'],
  'بلاطات رصف': ['paving_block'],
  'بلاط إرشادي': ['tactile_paving'],
  'جيوتكستايل': ['geotextile'],
  'جيوجريد': ['geogrid'],
  'لوحات مرورية': ['traffic_sign'],
  'عيون طرق': ['road_stud'],
  'بولارد خارجي': ['bollard'],
  'أثاث مواقع': ['site_furniture'],
  // «بلوك خفيف بركاني» sits under the concrete-block category but IS a
  // lightweight block; the category name is broader than the item.
  'بلوك إسمنتي': ['concrete_block', 'lightweight_block'],
  'مباني خفيفة': ['lightweight_block'],
  'طوب': ['clay_brick', 'concrete_block'],
  'إضافات خرسانية': ['concrete_admixture'],
  'ألياف الخرسانة': ['concrete_fiber'],
  // «مونة تسوية أسطح» is genuinely a levelling screed, not a repair mortar.
  'مواد إصلاح الخرسانة': ['concrete_repair', 'mortar_screed'],
  'أسمنت ومواد رابطة': ['cement', 'mortar_screed'],
  'جراوت': ['tile_grout_adhesive'],
  'مواد لاصقة وسيلانت': ['tile_grout_adhesive', 'construction_sealant'],
  'دهانات وطلاءات': ['primer_coating'],
  'ملحقات ري': ['irrigation_filter', 'irrigation_control', 'irrigation_emitter'],
  'تحكم ري': ['irrigation_control'],
  'أقراص مراقبة': ['storage_drive'],
  'نظام صوت عام': ['pa_speaker'],
  'مضخمات صوت': ['pa_amplifier'],
  'لوحات إنذار حريق': ['fire_alarm_panel'],
  'لوحات وصناديق': ['empty_enclosure'],
  'لوحات توزيع نهائية': ['distribution_board'],
  'ملحقات حوامل كابلات': ['cable_support_accessories'],
  'علب كهربائية': ['junction_box'],
}

const pct = (n, d) => (d ? +((n / d) * 100).toFixed(2) : 0)
const tally = (rows, key) => {
  const m = new Map()
  for (const r of rows) m.set(key(r), (m.get(key(r)) || 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

/* ------------------------------- read ---------------------------------- */

const book = await readXlsxFile(FILE, { getSheets: true })
const sheet = book.find((s) => s.sheet === SHEET)
if (!sheet) throw new Error(`sheet "${SHEET}" not found in ${book.map((s) => s.sheet).join(', ')}`)
const header = sheet.data[0]
if (String(header[COL.item]) !== 'البند') {
  throw new Error(`col${COL.item} is "${header[COL.item]}", expected "البند" — refusing to measure the wrong column`)
}
const lines = sheet.data.slice(1).map((r, i) => ({
  id: String(r[COL.n] ?? i),
  item: String(r[COL.item] ?? '').trim(),
  department: String(r[COL.department] ?? ''),
  category: String(r[COL.category] ?? ''),
  unit: String(r[COL.unit] ?? ''),
}))
const blank = lines.filter((l) => !l.item).length
if (blank) throw new Error(`${blank} blank item descriptions`)

/* ------------------------------ resolve -------------------------------- */

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})
let report
try {
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  const t0 = performance.now()
  const batch = cpo.resolveOntologyBatch(lines.map((l) => ({ id: l.id, name: l.item })))
  const elapsed = performance.now() - t0
  const byId = new Map(batch.lines.map((row) => [String(row.line_id), row.resolution]))
  const rows = lines.map((l) => {
    const r = byId.get(l.id)
    if (!r) throw new Error(`no resolution for line ${l.id}`)
    return {
      ...l,
      level: r.level_code, source: r.source, sector: r.sector, family: r.family,
      category_id: r.category, intent: r.intent, poolable: r.poolable, pool_key: r.pool_key,
      ai_eligible: r.ai_eligible, bucket: r.unresolved_bucket, head: r.head_concept,
      matched_term: r.debug.matched_term, decided_by: r.debug.decided_by,
    }
  })

  const N = rows.length
  const levels = { A: 0, B: 0, C: 0 }
  let poolable = 0, aiEligible = 0, recovery = 0, rejected = 0
  const pools = new Set()
  for (const r of rows) {
    levels[r.level]++
    if (r.poolable) { poolable++; pools.add(r.pool_key) }
    if (r.ai_eligible) aiEligible++
    if (r.source === 'semantic_recovery') recovery++
    if (r.bucket === 'rejected') rejected++
  }

  // ---- accuracy: the number that gates everything else ----
  const wrongRows = []
  const wrongByRule = []
  for (const rule of CONFIDENT_WRONG_RULES) {
    const hits = rows.filter((r) => r.category === rule.category && r.poolable && rule.hit(r))
    wrongByRule.push({
      id: rule.id, en: rule.en, cause: rule.cause, lines: hits.length,
      A: hits.filter((h) => h.level === 'A').length,
      B: hits.filter((h) => h.level === 'B').length,
      resolved_to: hits.length ? `${hits[0].family}${hits[0].intent ? '/' + hits[0].intent : ''}` : null,
    })
    wrongRows.push(...hits)
  }
  // Cross-trade sweep: catches error families the eight rules do not name.
  const crossTrade = rows.filter(
    (r) => r.poolable && !(COMPATIBLE_SECTORS[r.department] || []).includes(r.sector),
  )
  const named = new Set(wrongRows.map((r) => r.id))
  const unnamedCrossTrade = crossTrade.filter((r) => !named.has(r.id))

  // Wrong intent inside the right family: same severity, different blind spot.
  const wrongIntentRows = rows.filter(
    (r) => r.poolable && r.intent && EXPECTED_INTENT[r.category] && !EXPECTED_INTENT[r.category].includes(r.intent),
  )
  for (const r of wrongIntentRows) if (!named.has(r.id)) wrongRows.push(r)

  const wrongA = wrongRows.filter((r) => r.level === 'A').length
  const wrongB = wrongRows.filter((r) => r.level === 'B').length

  report = {
    ontology_version: cpo.ONTOLOGY_VERSION,
    source: { file: FILE, sheet: SHEET, item_column: `col${COL.item} "${header[COL.item]}"`, lines: N },
    levels: {
      A: levels.A, B: levels.B, C: levels.C,
      A_pct: pct(levels.A, N), B_pct: pct(levels.B, N), C_pct: pct(levels.C, N),
      local_usable: levels.A + levels.B, local_usable_pct: pct(levels.A + levels.B, N),
    },
    poolable, poolable_pct: pct(poolable, N), unique_pools: pools.size,
    semantic_recovery: recovery, semantic_recovery_pct: pct(recovery, N),
    ai_eligible: aiEligible, ai_eligible_pct: pct(aiEligible, N), rejected,
    confident_wrong: {
      total: wrongRows.length, rate_of_all: pct(wrongRows.length, N), rate_of_poolable: pct(wrongRows.length, poolable),
      A: wrongA, A_rate_of_A: pct(wrongA, levels.A),
      B: wrongB, B_rate_of_B: pct(wrongB, levels.B),
      by_rule: wrongByRule,
      unnamed_cross_trade: unnamedCrossTrade.length,
      unnamed_cross_trade_groups: tally(unnamedCrossTrade, (r) => `${r.category} [${r.department}] -> ${r.sector}/${r.family}`)
        .map(([k, v]) => ({ group: k, lines: v })),
      wrong_intent_same_family: wrongIntentRows.length,
      wrong_intent_groups: tally(wrongIntentRows, (r) => `${r.category} -> ${r.intent} (expected ${EXPECTED_INTENT[r.category].join('|')})`)
        .map(([k, v]) => ({ group: k, lines: v })),
      intent_ground_truth: {
        categories_checked: Object.keys(EXPECTED_INTENT).length,
        lines_checked: rows.filter((r) => r.poolable && r.intent && EXPECTED_INTENT[r.category]).length,
      },
    },
    by_department: tally(rows, (r) => r.department).map(([dep, n]) => {
      const sub = rows.filter((r) => r.department === dep)
      const w = sub.filter((r) => wrongRows.includes(r)).length
      return {
        department: dep, lines: n,
        A: sub.filter((r) => r.level === 'A').length,
        B: sub.filter((r) => r.level === 'B').length,
        C: sub.filter((r) => r.level === 'C').length,
        poolable_pct: pct(sub.filter((r) => r.poolable).length, n),
        confident_wrong: w, confident_wrong_pct: pct(w, n),
      }
    }),
    intent_coverage: tally(rows.filter((r) => r.intent), (r) => r.intent).map(([intent, n]) => ({ intent, lines: n })),
    family_coverage: tally(rows.filter((r) => r.poolable), (r) => `${r.sector}/${r.family}`).map(([f, n]) => ({ family: f, lines: n })),
    gap_categories: tally(rows.filter((r) => !r.poolable), (r) => `${r.category} [${r.department}]`).map(([k, v]) => ({ group: k, lines: v })),
    perf: { total_ms: Math.round(elapsed), ms_per_line: +(elapsed / N).toFixed(3) },
  }

  /* ------------------------------ print -------------------------------- */
  const R = report
  console.log(`=== ${R.ontology_version} over ${N} lines — ${R.source.sheet} / ${R.source.item_column} ===\n`)
  console.log('THREE NUMBERS TOGETHER (none of them means anything alone)')
  console.log(`  poolable coverage   ${String(R.poolable).padStart(6)}  ${R.poolable_pct}%`)
  console.log(`  confident-wrong     ${String(R.confident_wrong.total).padStart(6)}  ${R.confident_wrong.rate_of_all}% of all · ${R.confident_wrong.rate_of_poolable}% of poolable`)
  console.log(`  C rate              ${String(R.levels.C).padStart(6)}  ${R.levels.C_pct}%`)
  console.log('')
  console.log(`A  exact intent       ${String(R.levels.A).padStart(6)}  ${R.levels.A_pct}%`)
  console.log(`B  local resolved     ${String(R.levels.B).padStart(6)}  ${R.levels.B_pct}%`)
  console.log(`C  unresolved         ${String(R.levels.C).padStart(6)}  ${R.levels.C_pct}%`)
  console.log(`   local usable A+B   ${String(R.levels.local_usable).padStart(6)}  ${R.levels.local_usable_pct}%`)
  console.log(`   semantic recovery  ${String(R.semantic_recovery).padStart(6)}  ${R.semantic_recovery_pct}%   (B, but NOT poolable)`)
  console.log(`   AI eligible        ${String(R.ai_eligible).padStart(6)}  ${R.ai_eligible_pct}%`)
  console.log(`   rejected           ${String(R.rejected).padStart(6)}`)
  console.log(`   unique pools       ${String(R.unique_pools).padStart(6)}`)
  console.log(`   resolve            ${R.perf.ms_per_line} ms/line (${R.perf.total_ms} ms total)`)

  console.log(`\n=== CONFIDENT-WRONG, split by level ===`)
  console.log(`A: ${R.confident_wrong.A} of ${R.levels.A} Level A (${R.confident_wrong.A_rate_of_A}%)`)
  console.log(`B: ${R.confident_wrong.B} of ${R.levels.B} Level B (${R.confident_wrong.B_rate_of_B}%)`)
  console.log('\nlines  A   B   error family                                        resolved to')
  for (const r of R.confident_wrong.by_rule) {
    console.log(String(r.lines).padStart(5), String(r.A).padStart(3), String(r.B).padStart(3), ` ${r.en}`.padEnd(52), r.resolved_to ?? '— FIXED —')
  }
  console.log(`\nunnamed cross-trade mismatches: ${R.confident_wrong.unnamed_cross_trade}`)
  for (const g of R.confident_wrong.unnamed_cross_trade_groups.slice(0, VERBOSE ? 99 : 12)) {
    console.log(`  ${String(g.lines).padStart(5)}  ${g.group}`)
  }
  const gt = R.confident_wrong.intent_ground_truth
  console.log(`\nwrong intent inside the right family: ${R.confident_wrong.wrong_intent_same_family} of ${gt.lines_checked} lines checked against ${gt.categories_checked} categories`)
  for (const g of R.confident_wrong.wrong_intent_groups.slice(0, VERBOSE ? 99 : 20)) {
    console.log(`  ${String(g.lines).padStart(5)}  ${g.group}`)
  }

  console.log(`\n=== BY DEPARTMENT ===`)
  console.log('department'.padEnd(22), 'lines'.padStart(6), 'A'.padStart(6), 'B'.padStart(6), 'C'.padStart(6), 'pool%'.padStart(7), 'wrong'.padStart(6))
  for (const d of R.by_department) {
    console.log(d.department.padEnd(22), String(d.lines).padStart(6), String(d.A).padStart(6), String(d.B).padStart(6), String(d.C).padStart(6), String(d.poolable_pct).padStart(7), String(d.confident_wrong).padStart(6))
  }

  console.log(`\n=== INTENT COVERAGE (${R.intent_coverage.length} intents used) ===`)
  for (const i of R.intent_coverage) console.log(String(i.lines).padStart(6), i.intent)

  if (VERBOSE) {
    console.log(`\n=== FAMILY COVERAGE ===`)
    for (const f of R.family_coverage) console.log(String(f.lines).padStart(6), f.family)
    console.log(`\n=== NON-POOLABLE CATEGORIES (${R.gap_categories.length}) ===`)
    for (const g of R.gap_categories) console.log(String(g.lines).padStart(6), g.group)
  }
} finally {
  await server.close()
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nwrote ${JSON_OUT}`)
}
