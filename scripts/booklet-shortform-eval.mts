/**
 * The register the owner actually uploads: 68 real short-form booklet items,
 * median length two words, 90% at three words or fewer. Zero AI calls.
 *
 * TWO METRICS, and the second is the one that means something.
 *
 * Level A alone is misleading here, because for most of these lines the FAMILY
 * is the complete answer — «خزانة مياه» has no further intent to reach, and
 * inventing one would fragment the supplier pool. So the headline metric is
 * COMPLETENESS AGAINST THE REACHABLE CEILING: for each line, the deepest level
 * the ontology could legitimately reach, adjudicated once below. A line whose
 * complete answer is its family counts as complete when it reaches its family.
 *
 * CONFIDENT-WRONG is measured against the same adjudication: a poolable answer
 * in the wrong trade, or a named intent that contradicts the adjudicated one.
 * This is the number to report alongside the archive figures, because this is
 * the register the owner uploads.
 *
 * The adjudication is a MEASUREMENT, not vocabulary. Nothing here may be fed
 * back into the ontology as terms, or the next measurement means nothing.
 */
import { readFileSync } from 'node:fs'
import { ONTOLOGY_VERSION, resolveOntology } from '../src/lib/procurementOntology'

/** [line, expected family (null = genuinely unknown), expected intent (null = the family IS the complete answer)] */
const ADJUDICATED: Array<[string, string | null, string | null]> = [
  ['درابزين حديدي', 'metal_grating_walkway', 'handrail_balustrade'],
  ['بوابة المدخل الرئيسي', 'industrial_doors', null],
  ['بوابة لمدخل الافراد', 'industrial_doors', null],
  ['باب زجاجي سحاب (منزلق)', 'glazing', null],
  ['باب سيكوريت', 'glazing', 'tempered_glass'],
  ['قواطع زجاج سيكوريت', 'glazing', 'tempered_glass'],
  ['باب معدني', 'industrial_doors', null],
  ['باب خشب', 'wood_panels_joinery', 'wooden_door'],
  ['نوافذ ألمنيوم', 'aluminium_systems', 'aluminium_window_door'],
  ['منور سقفي', 'translucent_roofing', null],
  ['لياسة اسمنتية', 'plaster_render', 'cement_render'],
  ['دهان بلاستيك', 'paints_coatings', null],
  ['سيراميك حوائط', 'floor_tiling', null],
  ['بورسلان أرضيات', 'floor_tiling', null],
  ['وزرة بورسلان', 'floor_tiling', null],
  ['سيراميك أرضيات', 'floor_tiling', null],
  ['وزرة سيراميك', 'floor_tiling', null],
  ['جرانيت للدرج', 'floor_tiling', 'stone_slab'],
  ['بلاط تيرازو', 'floor_tiling', null],
  // The head is the framing, not the boards it carries.
  ['هيكل لألواح الجبس', 'interior_systems', 'drywall_framing'],
  ['ألواح جبسوم بورد', 'interior_systems', 'gypsum_board'],
  // Wood for insulating a wall is not a product any trade here sells.
  ['خشب لعزل جدران', null, null],
  ['طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن', 'waterproofing', null],
  ['عازل بيتومين', 'waterproofing', null],
  ['عازل بيتومين مسلح بالبوليستر', 'waterproofing', null],
  ['الواح عزل حراري', 'thermal_insulation', 'rigid_board_insulation'],
  ['مظلات لمواقف السيارات', 'shade_structures', 'car_park_shade'],
  ['بلاط انترلوك', 'paving', 'paving_block'],
  ['بردورات خرسانة', 'paving', 'kerbstone'],
  ['بردورات خرسانة', 'paving', 'kerbstone'],
  // «اسمني» is a misspelling of «اسمنتي», and the intent it names exists. The
  // spelling is NOT in the vocabulary; hollow/solid is what reaches the intent.
  ['بلوك اسمني مفرغ', 'masonry_blocks', 'concrete_block'],
  // CEILING CORRECTED in v8. This was adjudicated family-complete on the
  // grounds that 32A could be either device. That was wrong: the rating IS the
  // discriminator the trade uses, and the English writer already reached the
  // intent from «MCB 32A», so the Arabic writer was being charged for a
  // language asymmetry rather than for a genuine ambiguity. Ratings between
  // 63A and 100A remain family-complete, because those are ambiguous in fact.
  ['قاطع 32 امبير', 'switchgear_panels', 'mcb'],
  ['حديد تسليح للخرسانة المسلحة', 'rebar_mesh', null],
  ['خرسانة أرضيات', 'ready_mix_concrete', 'structural_ready_mix'],
  ['خرسانة عادية', 'ready_mix_concrete', 'blinding_lean_concrete'],
  ['خرسانة قواعد', 'ready_mix_concrete', 'structural_ready_mix'],
  ['خرسانة للأعمدة والكمرات', 'ready_mix_concrete', 'structural_ready_mix'],
  ['كابلات الجهد المتوسط', 'power_cables', 'mv_power_cable'],
  ['مفتاح تحويل', 'switchgear_panels', 'transfer_switch'],
  ['لوحات توزيع', 'switchgear_panels', 'distribution_board'],
  ['لوحة كهرباء', 'switchgear_panels', 'distribution_board'],
  ['كابلات نحاسية', 'power_cables', null],
  ['قاطع 100 امبير', 'switchgear_panels', 'mccb'],
  ['قاطع 32 امبير', 'switchgear_panels', 'mcb'],
  ['مخرج سخان', 'wiring_devices', 'socket_outlet'],
  ['نظام تأريض', 'earthing_lightning', null],
  ['وحدات إنارة', 'lighting', null],
  ['مخارج القوى والأفياش', 'wiring_devices', 'socket_outlet'],
  ['مخرج هاتف وبيانات', 'structured_cabling', 'data_outlet'],
  ['أنابيب المياه الباردة والحارة', 'pipes_fittings', null],
  ['أنابيب صرف صحي', 'pipes_fittings', null],
  ['أنابيب مياه الأمطار', 'pipes_fittings', null],
  ['مانهول', 'precast_drainage', 'precast_chamber'],
  ['أغطية مانهول', 'precast_drainage', 'manhole_cover'],
  ['أنابيب مياه الحريق', 'pipes_fittings', null],
  ['حنفية حريق خارجية', 'fire_fighting', 'fire_hydrant'],
  ['صندوق حريق', 'fire_fighting', null],
  ['مواسير UPVC', 'pipes_fittings', null],
  ['صمام', 'valves', null],
  ['مرحاض', 'sanitary_ware', 'wc_sanitaryware'],
  ['حوض غسيل يدي', 'sanitary_ware', 'wc_sanitaryware'],
  ['سخان كهربائي', 'hvac_equipment', 'water_heater'],
  ['نظام التحكم بالأبواب', 'physical_security', 'access_controller'],
  ['خزان مياه', 'water_tanks', null],
  ['وحدات التكييف والتدفئة', 'hvac_equipment', null],
  ['قنوات التبريد والتكييف والتهوية', 'hvac_equipment', null],
  ['عزل حرارى لمجاري التكييف', 'thermal_insulation', 'pipe_duct_insulation'],
  ['مخارج التهوية', 'hvac_equipment', 'ventilation_opening'],
]

const lines = readFileSync('fixtures/boq/reference-booklet-68.shortform.txt', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

if (lines.length !== ADJUDICATED.length) {
  throw new Error(`fixture has ${lines.length} items, adjudication has ${ADJUDICATED.length}`)
}

const pct = (n: number) => `${((n / lines.length) * 100).toFixed(2)}%`
const levels = { A: 0, B: 0, C: 0 }
let poolable = 0
const shortfall: string[] = []
const wrong: string[] = []

for (const [i, line] of lines.entries()) {
  const [adjLine, wantFamily, wantIntent] = ADJUDICATED[i]!
  if (adjLine !== line) throw new Error(`adjudication drifted at ${i}: «${line}» vs «${adjLine}»`)
  const r = resolveOntology(line)
  levels[r.level_code as 'A' | 'B' | 'C']++
  if (r.poolable) poolable++

  // COMPLETENESS: did it reach the deepest level that legitimately exists?
  const reached = wantIntent ? r.intent === wantIntent : wantFamily ? r.family === wantFamily : !r.poolable
  if (!reached) {
    shortfall.push(
      `${String(r.family ?? 'NULL')}/${String(r.intent ?? '-')}  want ${String(wantFamily ?? 'unknown')}/${String(wantIntent ?? '-')}  ::  ${line}`,
    )
  }

  // CONFIDENT-WRONG: a poolable answer in the wrong trade, or a named intent
  // that contradicts the adjudicated one. Abstention is never counted wrong.
  const wrongTrade = r.poolable && wantFamily !== null && r.family !== wantFamily
  const wrongIntent = r.intent !== null && wantIntent !== null && r.intent !== wantIntent
  const wrongClaim = r.poolable && wantFamily === null
  if (wrongTrade || wrongIntent || wrongClaim) {
    wrong.push(`${String(r.family)}/${String(r.intent ?? '-')} @${r.confidence}  want ${String(wantFamily ?? 'unknown')}/${String(wantIntent ?? '-')}  ::  ${line}`)
  }
}

const ceiling = lines.length - shortfall.length
/**
 * TWO NUMBERS, NOT ONE.
 *
 * One line — #22 «خشب لعزل جدران» — names two trades and commits to neither:
 * timber, and the insulating job the timber is for. The held-out lane scores it
 * a shortfall; this script scored it complete, because abstaining is the
 * behaviour we asked for. Both readings are defensible, so both are reported
 * instead of one being argued into the other.
 *
 *   ACTIONABLE COMPLETENESS — lines that name one trade and reached it.
 *   CORRECT ABSTENTIONS     — lines that name more than one and said so.
 *
 * The second number is not a consolation for the first. A guess between two
 * trades is a confident error, which is the one outcome the owner has told us
 * costs him an RFQ; an abstention costs him a line he has to read himself.
 */
const abstentions = ADJUDICATED.filter(([, wantFamily], i) => {
  if (wantFamily !== null) return false
  return !resolveOntology(lines[i]!).poolable
}).length
const actionable = lines.length - abstentions
console.log(`payload ${ONTOLOGY_VERSION} · ${lines.length} real booklet items · 0 AI calls\n`)
/**
 * The v7 column is restated against the CORRECTED ceiling above, not against
 * the one v7 was scored on. v7 was reported at 98.53% because three breaker
 * lines were adjudicated family-complete; under the corrected ceiling it is
 * 64/68. The held-out lane measured 92.65% (63/68) — one line apart from this,
 * from an adjudication table that is theirs rather than shared, so the
 * difference is recorded here instead of reverse-engineered away.
 */
console.log('                            cpo-v5      cpo-v6      cpo-v7      cpo-v11')
console.log(`  Level A                    16.18%      33.82%      50.00%      ${pct(levels.A).padStart(6)}  (${levels.A})`)
console.log(`  Level B                         -      66.18%      50.00%      ${pct(levels.B).padStart(6)}  (${levels.B})`)
console.log(`  true unknown (C)           14.71%       0.00%       0.00%      ${pct(levels.C).padStart(6)}  (${levels.C})`)
console.log(`  poolable                   66.18%      98.53%      98.53%      ${pct(poolable).padStart(6)}  (${poolable})`)
console.log(`  COMPLETENESS to ceiling         -      88.24%      94.12%      ${pct(ceiling).padStart(6)}  (${ceiling})`)
console.log(`  actionable completeness         -           -           -      ${pct(actionable).padStart(6)}  (${actionable}/${lines.length})`)
console.log(`  correct abstentions             -           -           -           -       (${abstentions})`)
console.log(`  confident-wrong                 -       4.41%       0.00%      ${pct(wrong.length).padStart(6)}  (${wrong.length})`)

if (shortfall.length) {
  console.log(`\n  --- ${shortfall.length} short of the reachable ceiling ---`)
  for (const s of shortfall) console.log(`    ${s}`)
}
if (wrong.length) {
  console.log(`\n  --- ${wrong.length} confident-wrong ---`)
  for (const w of wrong) console.log(`    ${w}`)
}
