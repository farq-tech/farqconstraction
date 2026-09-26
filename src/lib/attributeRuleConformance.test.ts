import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeProcurementText, termDecidesIn, termIndex } from './procurementOntology'

/**
 * THE ATTRIBUTE-CLAUSE RULE HAS ONE OWNER AND TWO READERS.
 *
 * The rule lives here, in the line resolver. The API-side map builder has to
 * apply the same rule to supplier text, and a second hand-written copy would
 * be worse than no copy at all: the demand and supply sides would disagree
 * silently and neither would be identifiably wrong.
 *
 * So the resolver publishes its behaviour as a fixture instead of a
 * description. This test fails if the resolver's answers change without the
 * fixture being regenerated; the API test fails if its implementation stops
 * matching the fixture. Divergence becomes a failing test on whichever side
 * moved, which is the only arrangement where "they agree" is checkable.
 *
 * Regenerate deliberately:  UPDATE_CONFORMANCE=1 npx vitest run src/lib/attributeRuleConformance.test.ts
 */

const FIXTURE = path.join(__dirname, '../../fixtures/ontology/attribute-rule-conformance.json')

/**
 * Each case is a real phrasing, and the comment says which defect it pins.
 * `term` is the single strong term under test, so `decided` answers exactly
 * one question: may this term name the product in this text?
 */
const CASES: Array<{ text: string; term: string; note: string; register?: 'supplier_prose' }> = [
  // The three defects the rule was written for: 1,984 pipe fittings to
  // lubricants, 331 dampers to façade, 64 backflow preventers to cable lugs.
  { text: 'وصلة PPR Elbow مقاس 50 مم ربط Solvent Cement', term: 'solvent', note: 'solvent inside a ربط clause' },
  { text: 'VCD Opposed Blade مادة Aluminium', term: 'aluminium', note: 'aluminium inside a مادة clause' },
  { text: 'Backflow Preventer توصيل Lug', term: 'lug', note: 'lug inside a توصيل clause' },

  // The rule is positional, so the term that STARTS before the clause survives.
  { text: 'مقياس ضغط تفاضلي مقاس 100 مم', term: 'مقياس ضغط', note: 'term starts before the clause opens' },
  { text: 'صمام مقاس 100 مم ضغط 16 بار', term: 'ضغط', note: 'bare value word inside a clause' },

  // A keyword with nothing before it is the product, not a description.
  { text: 'مقاس 100 مم', term: 'مقاس', note: 'keyword at position 0 opens no clause' },

  // Attribute text still counts as KNOWN vocabulary, so the product itself
  // decides even when its line carries clauses.
  { text: 'وصلة PPR Elbow مقاس 50 مم ربط Solvent Cement', term: 'وصلة', note: 'the product still decides' },
  { text: 'كابل نحاس XLPE مقاس 4x16 مم2 جهد 0.6/1kV', term: 'كابل نحاس', note: 'product before size and voltage' },

  // MINERAL fibre is not metal. The ontology lane's acoustic-ceiling fix keyed
  // on material and read «ألياف معدنية» as metal, sending real mineral-fibre
  // tiles to a roll-former — invisible to a cross-trade sweep because family
  // and department were both right.
  { text: 'بلاط سقف مستعار ألياف معدنية 600x600', term: 'معدن', note: 'mineral fibre must not read as metal' },
  { text: 'بلاط سقف مستعار مادة ألياف معدنية', term: 'ألياف معدنية', note: 'material clause, fibre named inside it' },
  { text: 'صاج معدني مجلفن سماكة 0.7 مم', term: 'صاج معدني', note: 'genuine metal sheet still decides' },

  // Supplier-shaped strings: company names and catalogue lines, which is what
  // the map builder actually matches against.
  { text: 'مؤسسة الكابلات الوطنية كابلات نحاس XLPE', term: 'كابلات', note: 'supplier name, no clause' },
  { text: 'فلتر أولي لمكنسة ماكيتا مقاس 100 مم', term: 'فلتر', note: 'product word before a size clause' },

  // The morphology rule, published so the supply side can be held to it: a
  // nisba inside a phrase is free, bare it is gated; the sound feminine
  // plural belongs to the feminine noun.
  { text: 'باب زجاجي سحاب منزلق', term: 'باب زجاج', note: 'nisba inside a phrase: the head has pinned the trade' },
  { text: 'صوف زجاجي', term: 'زجاج', note: 'the same derivation, bare: three trades own glass' },
  { text: 'قارئ بطاقات', term: 'بطاقه', note: 'sound feminine plural, gained' },
  { text: 'مبدلات شبكات', term: 'شبك', note: 'plural belongs to «شبكة», not to rebar «شبك»' },
  { text: 'مضخة حريق مطابق NFPA 20', term: 'مضخة حريق', note: 'compliance clause after the product' },
  { text: 'لوحة كهربائية درجة حماية IP65 مادة صلب', term: 'صلب', note: 'steel only as a material value' },
  { text: 'عزل مواسير تكييف سماكة 25 مم', term: 'مواسير', note: 'product-head case with a clause too' },

  /*
   * REAL STRINGS FROM THE SUPPLIER CORPUS, recorded because the supply side
   * measured them and the two sides must not answer them differently.
   *
   * The first three are the rule earning its keep: a rebar-TYING tool maker,
   * a car-wash delivery rep and a business-networks operator all stop claiming
   * products they only mention.
   */
  { text: 'أدوات ربط حديد التسليح rebar tying tools', term: 'حديد', note: 'tool maker only mentions steel' },
  { text: 'مندوب توصيل مغاسل سيارات', term: 'مغاسل', note: 'car-wash delivery rep is not sanitaryware' },
  { text: 'شركه بنود السعوديه لتطوير وتشغيل شبكات الاعمال', term: 'شبكات', note: 'business networks, not PA networks' },

  /*
   * These four are the rule's cost, and they are all one defect: a term whose
   * FIRST WORD is itself a clause keyword can never decide unless it sits at
   * position 0, because the clause opens exactly where the term starts.
   * «تيار خفيف» (extra-low-voltage) is a trade, «حركة المرور» is traffic, and
   * «Building Material» is part of a company's name — none of them is an
   * attribute value. Recorded as the resolver currently answers them, so that
   * fixing the rule on the owning side makes the supply side's test fail until
   * it resyncs, which is the direction the correction should travel.
   */
  { text: 'كابل تيار خفيف 2x1.5', term: 'تيار خفيف', note: 'ELV cable: a BOQ line, not a supplier quirk' },
  { text: 'أنظمة تيار خفيف', term: 'تيار خفيف', note: 'ELV systems' },
  {
    text: 'معدات السلامة على الطرق مراقبة حركة المرور road safety equipment',
    term: 'safety',
    note: 'حركة opens a clause over the rest of a list',
  },
  {
    text: 'Alrashed Building Material Steel Metals Wood Rebar',
    term: 'wood',
    note: 'a company name is not a description',
  },

  /*
   * RULE THREE: ARABIC MORPHOLOGY IN TERM COMPILATION.
   *
   * Pinned here because `term_index` records matching behaviour, not just
   * clause behaviour. Without these cases a reader could implement the opener
   * fix alone, agree on every clause case above, and then drift on every
   * Arabic term carrying a nisba or an «ات» plural — a divergence that begins
   * with agreement, which is worse than outright disagreement because the
   * passing cases build confidence in the failing ones.
   */
  { text: 'باب خشب زان', term: 'باب خشبي', note: 'nisba: the term is the adjective, the text the noun' },
  { text: 'باب خشبي زان', term: 'باب خشب', note: 'nisba: and the other way round' },
  { text: 'كابلات نحاس معزولة', term: 'كابل', note: 'sound plural «ات» on the stem' },
  { text: 'لوحات توزيع كهربائية', term: 'لوحة', note: 'plural of a taa-marbuta singular' },
  { text: 'ألواح جبس معدنية', term: 'معدن', note: 'nisba on a material noun' },

  /*
   * And the direction the resolver REVERTED, pinned so it stays reverted:
   * stripping the plural «يات» reduced «ارضيات» (floors) to «ارض» (ground),
   * which took epoxy flooring off an industrial coatings supplier. Only the
   * singular «ي» is ever stripped, and only above a three-letter stem floor.
   */
  { text: 'أرضيات إيبوكسي صناعية', term: 'ارض', note: 'floors are not ground — shortening stays reverted' },
  { text: 'شبكة ري بالتنقيط', term: 'ري', note: 'a two-letter stem is never shortened' },

  /*
   * RULE FOUR: THE QUESTION TRANSFERS BETWEEN REGISTERS; THE RULE DOES NOT.
   *
   * v8 routed supplier claims through this same rule, on the reasoning that
   * both sides ask one question. The question is shared — may this term name a
   * product here — but the ANSWER depends on a premise only a BOQ line
   * satisfies: a product head with attributes trailing it. Company prose has
   * no product head, and measuring 10,104 real supplier records showed the BOQ
   * vocabulary is not merely useless there but inverted: «لل» occurs 6,298
   * times and introduces the company's own trade every time («للتبريد»,
   * «للرخام»). It cost «مؤسسة الحماية من الحريق» its entire score.
   *
   * So supplier prose is its own register with its own — currently empty —
   * vocabulary, and these rows are recorded under it. They are the same four
   * strings v8 recorded as suppressed; they now decide, and that is the
   * correction travelling in the right direction.
   */
  { text: 'شبكات ري مادة رشاش حريق', term: 'رشاش حريق', note: 'prose: no clause, so the mention stands', register: 'supplier_prose' },
  { text: 'مصنع دهانات تصنيف رشاش حريق', term: 'رشاش حريق', note: 'prose: «تصنيف» has 0 occurrences in 10,104 real records', register: 'supplier_prose' },
  { text: 'شركة مكافحة حريق ورشاشات', term: 'رشاش', note: 'a genuine fire contractor still claims it', register: 'supplier_prose' },
  { text: 'مؤسسه الحمايه من الحريق رشاشات حريق ومضخات', term: 'رشاش حريق', note: 'THE REGRESSION: «من» must not zero a qualified supplier', register: 'supplier_prose' },
  { text: 'شركه مكافحه الحرايق بالرياض', term: 'مكافحه الحرايق', note: 'THE REGRESSION: «بال» is locational in prose', register: 'supplier_prose' },
  // The same two strings under the BOQ register, where the rule DOES hold.
  { text: 'وصلة PPR مقاس 50 مم مادة رشاش حريق', term: 'رشاش حريق', note: 'boq: the clause rule still applies here' },
]

/**
 * The exported function, not a local copy of it. If the fixture were generated
 * from its own reimplementation, it would publish a third answer rather than
 * the resolver's.
 */
const decides = (text: string, term: string, register?: 'supplier_prose') =>
  termDecidesIn(text, term, register ?? 'boq_line')

describe('attribute-clause rule conformance', () => {
  const produced = CASES.map((entry) => ({
    ...entry,
    normalized: normalizeProcurementText(entry.text),
    term_index: termIndex(entry.text, entry.term),
    decides: decides(entry.text, entry.term, entry.register),
  }))

  it('publishes the rule as behaviour the supply side can be held to', () => {
    if (process.env.UPDATE_CONFORMANCE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true })
      fs.writeFileSync(
        FIXTURE,
        `${JSON.stringify(
          {
            note:
              'Generated from src/lib/procurementOntology.ts by attributeRuleConformance.test.ts. ' +
              'The line resolver owns the attribute-clause rule; the API map builder must reproduce these answers.',
            ontology_version: normalizeProcurementText('') === '' ? undefined : undefined,
            cases: produced,
          },
          null,
          2,
        )}\n`,
      )
    }
    expect(fs.existsSync(FIXTURE), `${FIXTURE} missing — regenerate with UPDATE_CONFORMANCE=1`).toBe(true)
    const recorded = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
    expect(recorded.cases).toEqual(produced)
  })

  it('suppresses a term that starts inside an attribute clause', () => {
    expect(decides('وصلة PPR Elbow مقاس 50 مم ربط Solvent Cement', 'solvent')).toBe(false)
    expect(decides('VCD Opposed Blade مادة Aluminium', 'aluminium')).toBe(false)
  })

  it('leaves a term that starts before the clause alone', () => {
    expect(decides('مقياس ضغط تفاضلي مقاس 100 مم', 'مقياس ضغط')).toBe(true)
    expect(decides('مقاس 100 مم', 'مقاس')).toBe(true)
  })
})
