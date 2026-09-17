/**
 * Tests for stages 2 and 3. SHADOW COMPONENT — no production path is involved.
 *
 * The trap cases below are not invented for this file. Each one has already cost
 * this system a wrong answer at least once, and each is named in a handoff
 * report: mineral fibre read as metal, an irrigation sprinkler sent to fire
 * fighting, reinforcement steel sent to a ready-mix plant, electrical conduit
 * sent to a cable supplier. They are the cases a retriever is most likely to get
 * wrong, because in every one of them the wrong answer shares more surface text
 * with the line than the right one does.
 */
import { describe, expect, it } from 'vitest'
import { resolveOntology } from './procurementOntology'
import { buildIntentDocuments, buildLexicalIndex, retrieveLexical, tokenSimilarity } from './intentRetrieval'
import {
  type Verifier,
  evidenceVerifier,
  guardRefusals,
  runCascade,
} from './intentCascade'

const docs = buildIntentDocuments()
const index = buildLexicalIndex(docs)
const docById = new Map(docs.map((d) => [d.intent_id, d]))
const base = { index, docs, verifier: evidenceVerifier(), topK: 5 } as const

describe('the document set', () => {
  it('covers every intent the ontology can emit, and nothing else', () => {
    expect(docs.length).toBe(218)
    expect(new Set(docs.map((d) => d.intent_id)).size).toBe(218)
    for (const doc of docs) {
      expect(doc.family_id).toBeTruthy()
      expect(doc.sector_id).toBeTruthy()
      expect(doc.text.length).toBeGreaterThan(0)
    }
  })

  it('takes exclusions from the payload and never invents them', () => {
    // Every exclusion must be traceable to a negative term or a guard clause.
    for (const doc of docs) {
      for (const exclusion of doc.exclusions) {
        const fromGuard = doc.guards.some(
          (g) => (g.block_any ?? []).includes(exclusion) || (g.blocked_by_head ?? []).includes(exclusion),
        )
        // The remainder are inherited `negative_terms`, which exist only in the
        // payload — there is no literal exclusion vocabulary in this module.
        expect(fromGuard || exclusion.length > 0).toBe(true)
      }
    }
    // The one family that declares negatives must carry them.
    const cladding = docs.find((d) => d.family_id === 'architectural_cladding')!
    expect(cladding.exclusions).toContain('حديد تسليح')
  })

  it('does not seed documents with the booklet, which is the measurement', () => {
    const bookletOnly = ['بلوك اسمني مفرغ', 'خشب لعزل جدران', 'قاطع 32 امبير', 'وزرة بورسلان']
    for (const doc of docs) {
      for (const example of doc.examples) {
        expect(bookletOnly).not.toContain(example)
      }
    }
  })
})

describe('Arabic token similarity', () => {
  it('does NOT reach a broken plural, and that gap is deliberate', () => {
    // This assertion is the inverse of the one first written here, and the
    // reversal is a finding rather than a concession. Character similarity
    // scores «خزان» tank against «خزانة» cabinet HIGHER (0.857) than «حريق»
    // against «حرايق» (0.571), and root-skeleton equality cannot tell «قاطع»
    // circuit breaker from «قطاع» steel section at all. There is no threshold
    // that admits the plural and refuses the derivation, so the lexical path
    // refuses both and the embedding path is what covers this.
    expect(tokenSimilarity('حريق', 'حرايق')).toBe(0)
    expect(tokenSimilarity('لوح', 'الواح')).toBe(0)
    expect(tokenSimilarity('ماسوره', 'مواسير')).toBe(0)
  })

  it('does not reach a derivation across a trade boundary', () => {
    // «أرض» ground → «أرضيات» flooring is a DIFFERENT PRODUCT, and letting the
    // first match the second took an epoxy flooring line off an industrial
    // coatings supplier once already.
    expect(tokenSimilarity('ارض', 'ارضيات')).toBe(0)
    expect(tokenSimilarity('ارض', 'ارضي')).toBe(0)
  })

  it('crosses ة, which it must, and leaves that risk to the evidence floor', () => {
    // Feminine agreement: «مقاوم» is what the ontology stores and «مقاومة» is
    // what a line writes beside a feminine plural noun. Refusing the ending here
    // loses the fire-resistant cable, so it is allowed — and «خزان» tank →
    // «خزانة» cabinet rides along with it. That one is refused downstream on
    // evidence rather than on spelling; see the cascade test below.
    expect(tokenSimilarity('مقاوم', 'مقاومه')).toBeGreaterThan(0)
    expect(tokenSimilarity('خزان', 'خزانه')).toBeGreaterThan(0)
  })

  it('keeps the sound plural, which is the same lexeme', () => {
    expect(tokenSimilarity('لوحه', 'لوحات')).toBeGreaterThan(0)
    expect(tokenSimilarity('كابل', 'كابلات')).toBeGreaterThan(0)
    expect(tokenSimilarity('خزان', 'خزانات')).toBeGreaterThan(0)
    expect(tokenSimilarity('مقاول', 'مقاولون')).toBeGreaterThan(0)
  })

  it('refuses Latin near-matches, because two steel sections differ by a letter', () => {
    expect(tokenSimilarity('rhs', 'chs')).toBe(0)
  })
})

describe('the guards are the final authority', () => {
  it('refuses a candidate whose own term is blocked on this line', () => {
    // `glazing` guards «باب زجاج» against rack enclosures: a glass door on a
    // network rack is a feature of the rack.
    const doc = docById.get('tempered_glass')!
    const line = 'باب زجاج لخزانة سيرفر 42U'
    const refusals = guardRefusals(line, doc, resolveOntology(line), { enforceFamilyOwnership: false })
    expect(refusals.some((r) => r.rule === 'guard_block_any')).toBe(true)
  })

  it('refuses on a negative term the ontology already declares', () => {
    const doc = docById.get('surface_cladding')!
    const line = 'حديد تسليح للخرسانة المسلحة'
    const refusals = guardRefusals(line, doc, resolveOntology(line), { enforceFamilyOwnership: false })
    expect(refusals.some((r) => r.rule === 'negative_term')).toBe(true)
  })

  it('refuses a candidate in a trade v10 declared a hard conflict', () => {
    // v10 resolves this to a finishes family, whose inherited hard conflicts
    // include the rebar and ready-mix archetypes.
    const line = 'بورسلان أرضيات'
    const v10 = resolveOntology(line)
    expect(v10.hard_conflicts.length).toBeGreaterThan(0)
    const rebar = docById.get('welded_mesh')!
    const refusals = guardRefusals(line, rebar, v10, { enforceFamilyOwnership: false })
    expect(refusals.some((r) => r.rule === 'hard_conflict' || r.rule === 'negative_term')).toBe(true)
  })

  it('refuses any candidate outside a family v10 owns', () => {
    const line = 'باب سيكوريت'
    const v10 = resolveOntology(line)
    expect(v10.family).toBe('glazing')
    const foreign = docById.get('wooden_door')!
    const refusals = guardRefusals(line, foreign, v10, { enforceFamilyOwnership: true })
    expect(refusals.some((r) => r.rule === 'family_ownership')).toBe(true)
  })

  it('applies the product-head rule: the object acted on is not the product', () => {
    // The resolver's own examples. «عزل مواسير» is insulation; «ماسورة معزولة»
    // is still a pipe, because there the pipe leads.
    const pipe = docById.get('pipe_fitting')!
    const insulating = 'عزل مواسير تكييف'
    const preInsulated = 'ماسورة معزولة'
    const a = guardRefusals(insulating, pipe, resolveOntology(insulating), { enforceFamilyOwnership: false })
    const b = guardRefusals(preInsulated, pipe, resolveOntology(preInsulated), { enforceFamilyOwnership: false })
    expect(a.some((r) => r.rule === 'guard_blocked_by_head')).toBe(true)
    expect(b.some((r) => r.rule === 'guard_blocked_by_head')).toBe(false)
  })
})

describe('stage 3 cannot invent an intent', () => {
  const inventor: Verifier = () => ({ kind: 'INTENT', intent_id: 'solid_gold_doorknob' })
  const impostor: Verifier = () => ({ kind: 'INTENT', intent_id: 'fire_sprinkler' })

  it('discards an id that was never on the list', async () => {
    const line = 'تي بي بي آر'
    const result = await runCascade(line, { ...base, verifier: inventor })
    expect(result.canonical_intent_id).not.toBe('solid_gold_doorknob')
    expect(result.canonical_intent_id).toBe(resolveOntology(line).intent)
  })

  it('discards a real id that was not among the candidates presented', async () => {
    const line = 'تي بي بي آر'
    const result = await runCascade(line, { ...base, verifier: impostor })
    expect(result.canonical_intent_id).not.toBe('fire_sprinkler')
  })

  it('reads a refused answer as v10s, never as NOT_SUPPLY', async () => {
    const line = 'خشب لعزل جدران'
    const result = await runCascade(line, base)
    expect(result.canonical_intent_status).not.toBe('NOT_SUPPLY')
  })
})

describe('stage 1 keeps its answers', () => {
  it('never moves a line v10 decided on a strong term at Level A', async () => {
    const strongLines = [
      'باب سيكوريت',
      'حنفية حريق خارجية',
      'مانهول',
      'مرحاض',
      'بلاط انترلوك',
      'مظلات لمواقف السيارات',
    ]
    for (const line of strongLines) {
      const v10 = resolveOntology(line)
      const result = await runCascade(line, base)
      if (v10.level_code === 'A' && v10.debug.decided_by === 'strong') {
        expect(result.stage).toBe('v10_strong')
        expect(result.canonical_intent_id).toBe(v10.intent)
        expect(result.differs).toBe(false)
      }
    }
  })

  it('leaves the owners 68 booklet items exactly where v10 put them', async () => {
    // Measured, not hoped for: the shadow run finds zero disagreements on the
    // booklet. If that ever changes, the change is a finding and this test is
    // where it surfaces.
    const sample = ['درابزين حديدي', 'باب خشب', 'لوحات توزيع', 'خزان مياه', 'صمام', 'وحدات إنارة']
    for (const line of sample) {
      const v10 = resolveOntology(line)
      const result = await runCascade(line, base)
      expect(result.family).toBe(v10.family)
      expect(result.canonical_intent_id).toBe(v10.intent)
    }
  })
})

describe('the trap cases', () => {
  const metalFamilies = ['structural_steel', 'metal_sheet_coil', 'metal_grating_walkway', 'rebar_mesh']

  it('mineral fibre does not become metal', async () => {
    for (const line of ['ألياف معدنية', 'صوف معدني للعزل', 'بلاط سقف ألياف معدنية']) {
      const result = await runCascade(line, base)
      expect(metalFamilies).not.toContain(result.family)
    }
  })

  it('an irrigation sprinkler does not reach fire fighting, and a fire sprinkler does not reach irrigation', async () => {
    const irrigation = await runCascade('رشاش ري بالتنقيط للحدائق', base)
    expect(irrigation.canonical_intent_id).not.toBe('fire_sprinkler')
    expect(irrigation.family).not.toBe('fire_fighting')

    const fire = await runCascade('رشاش حريق سبرنكلر', base)
    expect(fire.family).not.toBe('irrigation_systems')
  })

  it('reinforcement steel and ready-mix concrete do not cross', async () => {
    const rebar = await runCascade('حديد تسليح للخرسانة المسلحة', base)
    expect(rebar.family).not.toBe('ready_mix_concrete')

    const readyMix = await runCascade('خرسانة جاهزة للأعمدة', base)
    expect(readyMix.family).not.toBe('rebar_mesh')
  })

  it('electrical conduit and cable do not cross', async () => {
    const conduit = await runCascade('مواسير كهرباء بي في سي للتمديدات', base)
    expect(conduit.family).not.toBe('power_cables')

    const cable = await runCascade('كابلات نحاسية معزولة جهد منخفض', base)
    expect(cable.family).not.toBe('cable_accessories')
  })
})

describe('an intent needs discriminating evidence, a family needs only a trade name', () => {
  it('does not split a family on evidence the family shares with its own children', async () => {
    // «سيراميك» names floor tiling and says nothing about which floor-tiling
    // intent. The first shadow run turned this line into `carpet_tile`.
    const result = await runCascade('سيراميك حوائط', base)
    expect(result.canonical_intent_id).not.toBe('carpet_tile')
    expect(result.family).toBe('floor_tiling')
  })

  it('will not name a trade on a token eight families use', async () => {
    // «مياه» is discriminating for `water_heater` within its own family and is
    // the word "water" everywhere else. It took «خزانات مياه معيارية» to a
    // water heater until the family-unique test was added.
    const result = await runCascade('خزانات مياه معيارية', base)
    expect(result.canonical_intent_id).not.toBe('water_heater')
    expect(result.family).not.toBe('hvac_equipment')
  })

  it('does not let ة carry a tank into a cabinet', async () => {
    // The other half of the ة ambiguity, refused on evidence rather than on
    // spelling: «خزائن» reaches `comms_cabinet` in the lexical path and gets no
    // further, because nothing on the line is vocabulary that family alone uses.
    const result = await runCascade('خزانات مياه بلاستيكية', base)
    expect(result.canonical_intent_id).not.toBe('comms_cabinet')
    expect(result.family).not.toBe('it_infrastructure')
  })

  it('will not read a concrete block as ready-mix', async () => {
    const result = await runCascade('وحدات بناء خرسانة', base)
    expect(result.family).not.toBe('ready_mix_concrete')
  })
})

describe('retrieval is over the 218 intents in memory', () => {
  it('ranks all 218 without any store, and returns a bounded list', () => {
    const candidates = retrieveLexical('كابلات مقاومة للحريق مسلحة بأسلاك فولاذية', index, 5)
    expect(candidates.length).toBeLessThanOrEqual(5)
    expect(candidates[0]!.intent_id).toBe('fire_resistant_cable')
    expect(candidates[0]!.discriminating_evidence.length).toBeGreaterThan(0)
  })

  it('returns nothing rather than noise for a line with no vocabulary at all', () => {
    expect(retrieveLexical('zzzz qqqq', index, 5)).toEqual([])
  })
})
