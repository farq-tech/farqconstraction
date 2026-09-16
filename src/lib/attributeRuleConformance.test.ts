import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decideByTiers, normalizeProcurementText, termIndex } from './procurementOntology'

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
const CASES: Array<{ text: string; term: string; note: string }> = [
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
]

function decides(text: string, term: string): boolean {
  return decideByTiers(text, text, { strong_terms: [term] }).decided
}

describe('attribute-clause rule conformance', () => {
  const produced = CASES.map((entry) => ({
    ...entry,
    normalized: normalizeProcurementText(entry.text),
    term_index: termIndex(entry.text, entry.term),
    decides: decides(entry.text, entry.term),
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
