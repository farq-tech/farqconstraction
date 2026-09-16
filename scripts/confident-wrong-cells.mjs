/**
 * Confident-wrong re-measurement on the adjudicated error cells.
 *
 * A cell is a set of lines whose correct family the held-out report (or this
 * round's adjudication) states explicitly. A row is confident-wrong when it is
 * POOLABLE and its family is not the adjudicated one. Non-poolable rows are
 * abstentions, which cost coverage and never send an RFQ to the wrong supplier.
 */
import { readFileSync } from 'node:fs'

// [label, line matcher, correct family, corpus]
const CELLS = [
  // --- batches 11-20: the material / location / joining-method class ---
  ['«ربط Solvent Cement» joining method', /ربط\s*solvent\s*cement/i, 'pipes_fittings', 'b11-20'],
  ['`Floor-to-Floor` location', /floor-to-floor/i, 'movement_joint_systems', 'b11-20'],
  ['`Ceiling Joint` location', /ceiling\s*joint/i, 'movement_joint_systems', 'b11-20'],
  ['`Wall-to-Wall` + «مادة Aluminium»', /wall-to-wall/i, 'movement_joint_systems', 'b11-20'],
  ['«توصيل Lug» connection type', /backflow\s*preventer/i, 'valves', 'b11-20'],
  ['`Vinyl Sheet` shape word', /vinyl\s*sheet/i, 'floor_tiling', 'b11-20'],
  ['`Vacuum Breaker`', /vacuum\s*breaker/i, 'valves', 'b11-20'],
  ['«مادة Aluminium» on a damper', /\bvcd\b|volume\s*control\s*damper/i, 'hvac_equipment', 'b11-20'],
  // --- batches 3-10: the cells fixed in earlier rounds, to detect regression ---
  ['HDPE Corrugated SN (the conduit 90)', /hdpe\s*corrugated/i, 'precast_drainage', 'b3-10'],
  ['EMT / IMC / PVC conduit', /\bemt\b|\bimc\b|ماسوره كهرباء/i, 'cable_accessories', 'b3-10'],
  ['Cable Ladder Elbow', /cable\s*(ladder|tray).*elbow/i, 'cable_accessories', 'b3-10'],
  ['Coupling / Flange Nut (bare hardware)', /(?<!emt |imc |upvc |ppr |hdpe )(coupling|flange|dome)\s*nut/i, 'fasteners', 'b3-10'],
  ['EMT / IMC Locknut (conduit accessory)', /(emt|imc)\s*locknut/i, 'cable_accessories', 'b3-10'],
  ['UPVC Locknut (pipe fitting)', /upvc.*locknut/i, 'pipes_fittings', 'b3-10'],
  ['fire sprinkler «رشاش»', /رشاش.*(pendent|upright|k5|k8|حريق)/i, 'fire_fighting', 'b3-10'],
  ['irrigation pop-up sprinkler', /pop-?up|رشاش نافر|رشاش حدايق/i, 'irrigation_systems', 'b3-10'],
  ['electrical enclosure', /electrical\s*enclosure|صندوق كهربايي|علبه كهربايي/i, 'switchgear_panels', 'b3-10'],
  ['metal ceiling tile, Arabic «معدني»', /سقف معدني/i, 'interior_systems', 'b3-10'],
  ['metal ceiling tile, English `Galvanized`', /سقف galvanized|سقف\s*Galvanized Steel/i, 'interior_systems', 'b11-20'],
  ['Expansion Joint Cover', /expansion\s*joint\s*cover/i, 'movement_joint_systems', 'b3-10'],
]

const FILES = {
  'b3-10': ['fixtures/boq/heldout-full.cpo-v5.rows.jsonl', 'fixtures/boq/heldout-b3-10-final.cpo-v6.rows.jsonl'],
  'b11-20': ['fixtures/boq/heldout-b11-20-full.cpo-v5.rows.jsonl', 'fixtures/boq/heldout-b11-20-final.cpo-v6.rows.jsonl'],
}
const load = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const corpora = {}
for (const [k, [a, b]] of Object.entries(FILES)) corpora[k] = { v5: load(a), v6: load(b) }

for (const corpus of ['b11-20', 'b3-10']) {
  console.log(`\n######## ${corpus}`)
  console.log('  ' + 'cell'.padEnd(38) + 'rows'.padStart(7) + '   cpo-v5 wrong'.padStart(16) + '   cpo-v6 wrong'.padStart(16))
  let t5 = 0, t6 = 0, tp5 = 0, tp6 = 0
  for (const [label, re, want, only] of CELLS) {
    if (only !== corpus) continue
    const out = {}
    for (const v of ['v5', 'v6']) {
      const hits = corpora[corpus][v].filter((r) => re.test(r.line))
      const poolable = hits.filter((r) => r.poolable)
      const wrong = poolable.filter((r) => r.family !== want)
      out[v] = { n: hits.length, pool: poolable.length, wrong: wrong.length, got: [...new Set(wrong.map((r) => r.family + '/' + (r.intent ?? '-')))].slice(0, 2) }
    }
    if (!out.v5.n && !out.v6.n) continue
    t5 += out.v5.wrong; t6 += out.v6.wrong; tp5 += out.v5.pool; tp6 += out.v6.pool
    const mark = out.v6.wrong === 0 && out.v5.wrong > 0 ? ' CLOSED' : out.v6.wrong > out.v5.wrong ? ' REGRESSED' : ''
    console.log('  ' + label.padEnd(38) + String(out.v6.n).padStart(7) + String(out.v5.wrong).padStart(16) + String(out.v6.wrong).padStart(16) + mark)
    if (out.v6.wrong) console.log('      still landing at: ' + out.v6.got.join(', '))
  }
  console.log('  ' + '-'.repeat(77))
  console.log('  ' + 'adjudicated poolable rows'.padEnd(38) + String(tp6).padStart(7))
  console.log('  ' + 'confident-wrong'.padEnd(38) + ''.padStart(7) + String(t5).padStart(16) + String(t6).padStart(16))
  console.log('  ' + 'confident-wrong rate of poolable'.padEnd(38) + ''.padStart(7) +
    (tp5 ? (100 * t5 / tp5).toFixed(2) + '%' : '-').padStart(16) + (tp6 ? (100 * t6 / tp6).toFixed(2) + '%' : '-').padStart(16))
}
