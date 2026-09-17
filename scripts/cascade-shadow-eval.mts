/**
 * THE SHADOW RUN. Reads two real documents, changes nothing, decides nothing.
 *
 * It runs `cpo-v10` and the three-stage cascade over the same lines and prints
 * the only result the owner asked for: COVERAGE GAINED and CONFIDENT-WRONG,
 * side by side, plus every disagreement with v10 listed individually so a human
 * adjudicates them instead of reading a summary of them.
 *
 * The bar, restated because it governs how this script reports: a coverage gain
 * paid for with one new confident error is a FAILURE. A full plausible wrong
 * answer sends an RFQ to a supplier who cannot supply; an honest gap costs the
 * owner a line he reads himself. So the two numbers are printed together and
 * neither is printed alone.
 *
 * Usage
 *   npx tsx scripts/cascade-shadow-eval.mts                       both paths, evidence verifier
 *   npx tsx scripts/cascade-shadow-eval.mts --verifier=model      stage 3 by a local model
 *   npx tsx scripts/cascade-shadow-eval.mts --no-semantic         lexical half alone
 *   npx tsx scripts/cascade-shadow-eval.mts --embed=granite-embedding:278m
 *   npx tsx scripts/cascade-shadow-eval.mts --mode=contest        also argue with weak v10 answers
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ONTOLOGY_VERSION, resolveOntology } from '../src/lib/procurementOntology'
import { buildIntentDocuments } from '../src/lib/intentRetrieval'
import {
  type CascadeResult,
  type Verifier,
  type VerifierChoice,
  buildIndexes,
  evidenceVerifier,
  runCascade,
} from '../src/lib/intentCascade'

/* ------------------------------- options -------------------------------- */

const argv = process.argv.slice(2)
const opt = (name: string, fallback: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const flag = (name: string) => argv.includes(`--${name}`)

const EMBED_MODEL = opt('embed', 'bge-m3')
const VERIFIER_KIND = opt('verifier', 'evidence') as 'evidence' | 'model'
const VERIFIER_MODEL = opt('verifier-model', 'gemma3:4b')
const MODE = opt('mode', 'conservative') as 'conservative' | 'contest'
const USE_SEMANTIC = !flag('no-semantic')
const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARCHIVE_SAMPLE = Number(opt('archive', '600'))

/* ----------------------------- the documents ----------------------------- */

const examplesFile = 'fixtures/ontology/cascade-intent-examples.json'
const examplesRaw = existsSync(examplesFile)
  ? (JSON.parse(readFileSync(examplesFile, 'utf8')) as { examples: Record<string, string[]> })
  : { examples: {} }
const examples = new Map(Object.entries(examplesRaw.examples))
const docs = buildIntentDocuments(examples)
const index = buildIndexes(docs)

/* ---------------------------- embedding path ---------------------------- */

const docsFingerprint = createHash('sha256')
  .update(docs.map((d) => `${d.intent_id}\u0000${d.text}`).join('\n'))
  .digest('hex')
  .slice(0, 16)

async function embedOne(model: string, prompt: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { embedding?: number[] }
  if (!Array.isArray(body.embedding)) throw new Error('no embedding in response')
  return body.embedding
}

/**
 * Precompute all 218 intent vectors ONCE and keep them in a plain array.
 *
 * This is the whole of the "vector store". The cache on disk is keyed by model
 * AND by a fingerprint of the document text, so a payload change invalidates it
 * rather than silently serving vectors for the previous generation — which is
 * the same class of defect as an unstamped conformance fixture.
 */
let intentVectors: Array<{ intent_id: string; vector: number[] }> = []
let semanticAvailable = false
let semanticNote = 'not attempted'

if (USE_SEMANTIC) {
  const cacheFile = `fixtures/ontology/cascade-intent-vectors.${EMBED_MODEL.replace(/[^\w.-]/g, '_')}.json`
  try {
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as {
        docs_fingerprint: string
        vectors: Array<{ intent_id: string; vector: number[] }>
      }
      if (cached.docs_fingerprint === docsFingerprint) intentVectors = cached.vectors
    }
    if (!intentVectors.length) {
      process.stderr.write(`embedding 218 intent documents with ${EMBED_MODEL} …\n`)
      for (const doc of docs) intentVectors.push({ intent_id: doc.intent_id, vector: await embedOne(EMBED_MODEL, doc.text) })
      writeFileSync(
        cacheFile,
        `${JSON.stringify({ embed_model: EMBED_MODEL, ontology_version: ONTOLOGY_VERSION, docs_fingerprint: docsFingerprint, dims: intentVectors[0]?.vector.length ?? 0, vectors: intentVectors })}\n`,
      )
    }
    semanticAvailable = true
    semanticNote = `${EMBED_MODEL}, ${intentVectors[0]?.vector.length ?? 0} dims, 218 vectors in memory, no vector database`
  } catch (error) {
    semanticAvailable = false
    semanticNote = `UNAVAILABLE — ${(error as Error).message}. Lexical half reported alone.`
  }
} else {
  semanticNote = 'disabled by --no-semantic. Lexical half reported alone.'
}

const lineVectorCache = new Map<string, number[]>()
const embed = semanticAvailable
  ? async (text: string) => {
      const hit = lineVectorCache.get(text)
      if (hit) return hit
      const vector = await embedOne(EMBED_MODEL, text)
      lineVectorCache.set(text, vector)
      return vector
    }
  : undefined

/* -------------------------------- stage 3 -------------------------------- */

/**
 * The model verifier. Constrained by CONSTRUCTION, not by instruction: whatever
 * it returns is checked against the presented candidate list by `runCascade`,
 * and anything else is read as UNRESOLVED. So a hallucinated intent id cannot
 * become an answer — it can only cost the line its gain.
 */
function modelVerifier(model: string): Verifier {
  return async ({ line, candidates, v10_family }): Promise<VerifierChoice> => {
    const list = candidates
      .map((c, i) => `${i + 1}. id=${c.intent_id} | العربية: ${c.names_ar.join(' / ')} | en: ${c.name_en} | family: ${c.family_id}`)
      .join('\n')
    const prompt = [
      'أنت مُحكِّم في نظام مشتريات إنشائية سعودي. أمامك بند من جدول كميات، وقائمة مرشحين مغلقة.',
      '',
      `البند: «${line}»`,
      v10_family ? `العائلة التي رجّحها المحرك القائم على القواعد: ${v10_family}` : 'المحرك القائم على القواعد لم يحدد عائلة.',
      '',
      'المرشحون (لا يجوز اختيار غيرهم):',
      list,
      '',
      'اختر واحدًا فقط من التالي:',
      '- معرِّف مرشح واحد من القائمة أعلاه، إن كان البند يطابقه يقينًا.',
      '- FAMILY_ONLY إن كنت واثقًا من العائلة فقط ولا تستطيع الجزم بالمقصد المحدد.',
      '- UNRESOLVED إن لم يكن أي مرشح صحيحًا.',
      '',
      'قاعدة حاسمة: الخطأ الواثق أسوأ من الامتناع. إن شككت، أجب FAMILY_ONLY أو UNRESOLVED.',
      'أجب بصيغة JSON فقط: {"choice":"<id|FAMILY_ONLY|UNRESOLVED>","family":"<family_id or null>"}',
    ].join('\n')

    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_predict: 120 },
      }),
    })
    if (!res.ok) return { kind: 'UNRESOLVED' }
    const body = (await res.json()) as { response?: string }
    let parsed: { choice?: string; family?: string | null } = {}
    try {
      parsed = JSON.parse(String(body.response ?? '{}'))
    } catch {
      return { kind: 'UNRESOLVED' }
    }
    const choice = String(parsed.choice ?? '').trim()
    if (choice === 'UNRESOLVED' || !choice) return { kind: 'UNRESOLVED' }
    if (choice === 'FAMILY_ONLY') {
      const family = String(parsed.family ?? '') || v10_family || candidates[0]?.family_id
      return family ? { kind: 'FAMILY_ONLY', family_id: family } : { kind: 'UNRESOLVED' }
    }
    return { kind: 'INTENT', intent_id: choice }
  }
}

const verifier: Verifier = VERIFIER_KIND === 'model' ? modelVerifier(VERIFIER_MODEL) : evidenceVerifier()

/* ------------------------------- measuring ------------------------------- */

type Adjudicated = [string, string | null, string | null]

type Scored = {
  lines: number
  /** Reached an intent — Level A. */
  intent: number
  /** Reached a family or an intent, i.e. may key a supplier pool. */
  poolable: number
  /** No family and no intent. The honest gap. */
  unknown: number
  /** Reached the deepest level that legitimately exists for the line. */
  complete: number
  /** Lines that name more than one trade and correctly said so. */
  abstentions: number
  confidentWrong: string[]
  shortfall: string[]
}

/**
 * CONFIDENT-WRONG, defined exactly as `booklet-shortform-eval.mts` defines it,
 * because a second definition would make the comparison meaningless:
 *   - a poolable answer in the wrong trade,
 *   - a named intent that contradicts the adjudicated one,
 *   - a poolable claim on a line adjudicated as belonging to no trade.
 * Abstention is never counted wrong.
 */
function score(
  rows: Adjudicated[],
  answers: Array<{ family: string | null; intent: string | null; poolable: boolean }>,
): Scored {
  const out: Scored = { lines: rows.length, intent: 0, poolable: 0, unknown: 0, complete: 0, abstentions: 0, confidentWrong: [], shortfall: [] }
  for (const [i, [line, wantFamily, wantIntent]] of rows.entries()) {
    const a = answers[i]!
    if (a.intent) out.intent++
    if (a.poolable) out.poolable++
    if (!a.poolable && !a.intent) out.unknown++

    const reached = wantIntent ? a.intent === wantIntent : wantFamily ? a.family === wantFamily : !a.poolable
    if (reached) out.complete++
    else out.shortfall.push(`${String(a.family ?? 'NULL')}/${String(a.intent ?? '-')}  want ${String(wantFamily ?? 'unknown')}/${String(wantIntent ?? '-')}  ::  ${line}`)

    if (wantFamily === null && !a.poolable) out.abstentions++

    const wrongTrade = a.poolable && wantFamily !== null && a.family !== wantFamily
    const wrongIntent = a.intent !== null && wantIntent !== null && a.intent !== wantIntent
    const wrongClaim = a.poolable && wantFamily === null
    if (wrongTrade || wrongIntent || wrongClaim) {
      out.confidentWrong.push(`${String(a.family)}/${String(a.intent ?? '-')}  want ${String(wantFamily ?? 'unknown')}/${String(wantIntent ?? '-')}  ::  ${line}`)
    }
  }
  return out
}

/* ------------------------------- corpus A ------------------------------- */

/**
 * The owner's 68 real booklet items and their adjudication, COPIED VERBATIM from
 * `scripts/booklet-shortform-eval.mts` and then checked against it at runtime.
 *
 * Copied rather than imported because that script has top-level side effects and
 * exports nothing; checked rather than trusted because two adjudication tables
 * that drift apart produce two confident-wrong rates for one engine, and the
 * v7 round already lost a day to exactly that (98.53% against 92.65% from two
 * private tables). The guard below fails loudly instead.
 */
const BOOKLET: Adjudicated[] = [
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
  ['هيكل لألواح الجبس', 'interior_systems', 'drywall_framing'],
  ['ألواح جبسوم بورد', 'interior_systems', 'gypsum_board'],
  ['خشب لعزل جدران', null, null],
  ['طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن', 'waterproofing', null],
  ['عازل بيتومين', 'waterproofing', null],
  ['عازل بيتومين مسلح بالبوليستر', 'waterproofing', null],
  ['الواح عزل حراري', 'thermal_insulation', 'rigid_board_insulation'],
  ['مظلات لمواقف السيارات', 'shade_structures', 'car_park_shade'],
  ['بلاط انترلوك', 'paving', 'paving_block'],
  ['بردورات خرسانة', 'paving', 'kerbstone'],
  ['بردورات خرسانة', 'paving', 'kerbstone'],
  ['بلوك اسمني مفرغ', 'masonry_blocks', 'concrete_block'],
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

{
  const source = readFileSync('scripts/booklet-shortform-eval.mts', 'utf8')
  const quoted = (value: string | null) => (value === null ? 'null' : `'${value}'`)
  for (const [line, family, intent] of BOOKLET) {
    const needle = `['${line}', ${quoted(family)}, ${quoted(intent)}]`
    if (!source.includes(needle)) {
      throw new Error(`ADJUDICATION DRIFT: ${needle} is not in scripts/booklet-shortform-eval.mts — the two tables disagree, so no number below is comparable.`)
    }
  }
  const bookletLines = readFileSync('fixtures/boq/reference-booklet-68.shortform.txt', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (bookletLines.length !== BOOKLET.length) throw new Error('booklet fixture length changed')
  for (const [i, line] of bookletLines.entries()) {
    if (line !== BOOKLET[i]![0]) throw new Error(`booklet order drifted at ${i}: «${line}»`)
  }
}

/* ------------------------------- corpus B ------------------------------- */

const catalogue = JSON.parse(readFileSync('fixtures/boq/catalogue-shortform-60.adjudicated.json', 'utf8')) as {
  label: string
  rows: Adjudicated[]
}

/* --------------------------------- run ---------------------------------- */

async function runCorpus(rows: Adjudicated[]) {
  const results: CascadeResult[] = []
  for (const [line] of rows) {
    results.push(await runCascade(line, { index, docs, verifier, embed, intentVectors, mode: MODE, topK: 5 }))
  }
  const v10Answers = rows.map(([line]) => {
    const r = resolveOntology(line)
    return { family: r.family, intent: r.intent, poolable: r.poolable }
  })
  const cascadeAnswers = results.map((r) => ({ family: r.family, intent: r.canonical_intent_id, poolable: r.poolable }))
  return { results, v10: score(rows, v10Answers), cascade: score(rows, cascadeAnswers) }
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(2)}%`

function report(label: string, rows: Adjudicated[], run: Awaited<ReturnType<typeof runCorpus>>) {
  const { v10, cascade, results } = run
  console.log(`\n${'='.repeat(78)}`)
  console.log(`${label} — ${rows.length} lines`)
  console.log('='.repeat(78))
  console.log('                                cpo-v10        cascade        delta')
  const row = (name: string, a: number, b: number) =>
    console.log(
      `  ${name.padEnd(28)}${`${a} (${pct(a, rows.length)})`.padStart(14)}${`${b} (${pct(b, rows.length)})`.padStart(15)}${`${b - a >= 0 ? '+' : ''}${b - a}`.padStart(13)}`,
    )
  row('reached an intent (A)', v10.intent, cascade.intent)
  row('poolable (A or family B)', v10.poolable, cascade.poolable)
  row('remained unknown', v10.unknown, cascade.unknown)
  row('complete to ceiling', v10.complete, cascade.complete)
  row('correct abstentions', v10.abstentions, cascade.abstentions)
  row('CONFIDENT-WRONG', v10.confidentWrong.length, cascade.confidentWrong.length)

  const verdict =
    cascade.confidentWrong.length > v10.confidentWrong.length
      ? 'FAILURE — confident-wrong increased. Any coverage gain here is not accepted.'
      : cascade.poolable > v10.poolable || cascade.intent > v10.intent || cascade.complete > v10.complete
        ? 'GAIN — coverage up, confident-wrong not up.'
        : 'NO CHANGE — nothing gained, nothing lost.'
  console.log(`\n  VERDICT: ${verdict}`)

  if (v10.confidentWrong.length) {
    console.log(`\n  --- v10 confident-wrong (${v10.confidentWrong.length}) ---`)
    for (const w of v10.confidentWrong) console.log(`    ${w}`)
  }
  if (cascade.confidentWrong.length) {
    console.log(`\n  --- cascade confident-wrong (${cascade.confidentWrong.length}) ---`)
    for (const w of cascade.confidentWrong) console.log(`    ${w}`)
  }

  const disagreements = results.filter((r) => r.differs)
  console.log(`\n  --- ${disagreements.length} disagreements with v10, listed individually for adjudication ---`)
  for (const r of disagreements) {
    const idx = rows.findIndex(([line]) => line === r.line)
    const [, wantFamily, wantIntent] = rows[idx]!
    const v10Side = `${r.v10.family ?? 'NULL'}/${r.v10.intent ?? '-'} (${r.v10.level_code}, ${r.v10.decided_by})`
    const casSide = `${r.family ?? 'NULL'}/${r.canonical_intent_id ?? '-'} (${r.level_code}, ${r.stage})`
    const want = `${wantFamily ?? 'unknown'}/${wantIntent ?? '-'}`
    const bothWrong = (() => {
      const before = r.v10.poolable && wantFamily !== null && r.v10.family !== wantFamily
      const after = r.poolable && wantFamily !== null && r.family !== wantFamily
      const beforeIntent = r.v10.intent !== null && wantIntent !== null && r.v10.intent !== wantIntent
      const afterIntent = r.canonical_intent_id !== null && wantIntent !== null && r.canonical_intent_id !== wantIntent
      const b = before || beforeIntent
      const a = after || afterIntent
      if (a && !b) return 'REGRESSION'
      if (!a && b) return 'FIX'
      if (a && b) return 'still wrong'
      return 'improvement'
    })()
    console.log(`\n    «${r.line}»`)
    console.log(`      adjudicated : ${want}`)
    console.log(`      v10         : ${v10Side}`)
    console.log(`      cascade     : ${casSide}   → ${bothWrong}`)
    if (r.candidates.length) {
      console.log(`      candidates  : ${r.candidates.map((c) => `${c.intent_id}[lex ${c.lexical_rank ?? '-'} sem ${c.semantic_rank ?? '-'}]`).join(', ')}`)
    }
    if (r.candidates[0]?.evidence.length) console.log(`      evidence    : ${r.candidates[0].evidence.join(', ')}`)
    if (r.refused.length) {
      console.log(`      guard-refused: ${r.refused.map((x) => `${x.intent_id} (${x.refusals.map((f) => f.rule).join('+')})`).join(', ')}`)
    }
  }
  return { v10, cascade, disagreements: disagreements.length }
}

/* ---------------------------- archive regression ------------------------ */

/**
 * A REGRESSION CHECK, NOT A COVERAGE CHECK.
 *
 * These are the long over-specified archive lines where v10 is already 81% Level
 * A and 99.6% poolable, so there is almost no headroom. The question they answer
 * is the other one: does the cascade LOSE anything, or change an answer v10 was
 * confident about, on a register it was not tuned on. There is no adjudication
 * for these lines, so nothing here is scored as right or wrong — only as moved.
 */
async function archiveRegression(n: number) {
  const lines = [
    ...readFileSync('fixtures/boq/heldout-b3-10.full.flat.txt', 'utf8').split('\n'),
    ...readFileSync('fixtures/boq/heldout-b11-20.full.flat.txt', 'utf8').split('\n'),
  ].filter(Boolean)
  // Deterministic spread rather than a random sample, so the number is repeatable.
  const step = Math.max(1, Math.floor(lines.length / n))
  const sample: string[] = []
  for (let i = 0; i < lines.length && sample.length < n; i += step) sample.push(lines[i]!.trim())

  let moved = 0
  let gainedIntent = 0
  let gainedFamily = 0
  let lostPoolable = 0
  const movedRows: string[] = []
  for (const line of sample) {
    const r = await runCascade(line, { index, docs, verifier, embed, intentVectors, mode: MODE, topK: 5 })
    if (!r.differs && r.poolable === r.v10.poolable) continue
    if (r.v10.poolable && !r.poolable) lostPoolable++
    if (!r.v10.intent && r.canonical_intent_id) gainedIntent++
    if (!r.v10.poolable && r.poolable && !r.canonical_intent_id) gainedFamily++
    if (r.differs) {
      moved++
      if (movedRows.length < 30) {
        movedRows.push(
          `    «${r.line.slice(0, 76)}»\n      v10 ${r.v10.family ?? 'NULL'}/${r.v10.intent ?? '-'} (${r.v10.level_code},${r.v10.decided_by}) → cascade ${r.family ?? 'NULL'}/${r.canonical_intent_id ?? '-'} (${r.level_code},${r.stage})`,
        )
      }
    }
  }
  console.log(`\n${'='.repeat(78)}`)
  console.log(`ARCHIVE REGRESSION — ${sample.length} real held-out lines, no adjudication, movement only`)
  console.log('='.repeat(78))
  console.log(`  answers moved            ${moved}`)
  console.log(`  gained an intent         ${gainedIntent}`)
  console.log(`  gained a family only     ${gainedFamily}`)
  console.log(`  LOST a poolable answer   ${lostPoolable}`)
  if (movedRows.length) {
    console.log(`\n  --- first ${movedRows.length} moves ---`)
    for (const row of movedRows) console.log(row)
  }
  return { sampled: sample.length, moved, gainedIntent, gainedFamily, lostPoolable }
}

/* --------------------------------- main --------------------------------- */

console.log(`payload ${ONTOLOGY_VERSION} · docs ${docs.length} · fingerprint ${docsFingerprint}`)
console.log(`mode ${MODE} · verifier ${VERIFIER_KIND}${VERIFIER_KIND === 'model' ? ` (${VERIFIER_MODEL})` : ''} · topK 5`)
console.log(`semantic path: ${semanticNote}`)
console.log(`intents with at least one real archive example: ${examples.size} of ${docs.length}`)

const bookletRun = await runCorpus(BOOKLET)
const bookletSummary = report("CORPUS A — the owner's real 68-item booklet (his adjudication)", BOOKLET, bookletRun)

const catalogueRun = await runCorpus(catalogue.rows)
const catalogueSummary = report(
  'CORPUS B — 60 real Arabic catalogue lines (lane adjudication; NOT the owner\'s 60-line RFQ)',
  catalogue.rows,
  catalogueRun,
)

const archive = ARCHIVE_SAMPLE > 0 ? await archiveRegression(ARCHIVE_SAMPLE) : null

console.log(`\n${'='.repeat(78)}`)
console.log('THE PAIR OF NUMBERS')
console.log('='.repeat(78))
for (const [label, s] of [
  ['booklet 68', bookletSummary],
  ['catalogue 60', catalogueSummary],
] as const) {
  console.log(
    `  ${label.padEnd(14)} coverage ${s.v10.poolable} → ${s.cascade.poolable} poolable, ${s.v10.intent} → ${s.cascade.intent} intents · confident-wrong ${s.v10.confidentWrong.length} → ${s.cascade.confidentWrong.length} · ${s.disagreements} disagreements`,
  )
}
if (archive) {
  console.log(`  archive ${String(archive.sampled).padEnd(6)} moved ${archive.moved} · gained intent ${archive.gainedIntent} · gained family ${archive.gainedFamily} · LOST poolable ${archive.lostPoolable}`)
}

const anyRegression =
  bookletSummary.cascade.confidentWrong.length > bookletSummary.v10.confidentWrong.length ||
  catalogueSummary.cascade.confidentWrong.length > catalogueSummary.v10.confidentWrong.length ||
  (archive?.lostPoolable ?? 0) > 0
console.log(
  `\n  ${anyRegression ? 'BAR NOT CLEARED — a new confident error or a lost answer appears above. Under the stated rule this is a failure, whatever the coverage gain.' : 'BAR CLEARED on the corpora measured — no new confident error, no lost answer.'}`,
)
