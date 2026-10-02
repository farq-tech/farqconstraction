/**
 * A suggestion list carries its lane's label, except a row the server graded
 * «على مستوى النشاط» (the map's family top-up / sector fallback): that weaker
 * grade must survive, or the auto-pick and the «مورد محتمل» chip cannot tell
 * a borrowed family supplier from one named for the material.
 */
import { describe, expect, it } from 'vitest'
import { suggestionSuppliers } from './constructionClient'

describe('suggestionSuppliers evidence', () => {
  it('keeps the server activity grade and labels every other row with its lane', () => {
    const out = suggestionSuppliers(
      [
        { id: 'named', name_ar: 'مورد مسمّى' },
        { id: 'borrowed', name_ar: 'مورد العائلة', evidence: 'على مستوى النشاط' },
        { id: 'other', name_ar: 'مورد آخر', evidence: 'دليل مباشر' },
      ],
      'خريطة فرق',
    )
    expect(out.map((s) => [s.id, s.evidence])).toEqual([
      ['named', 'خريطة فرق'],
      ['borrowed', 'على مستوى النشاط'],
      // Any other server string does not change the lane's chip.
      ['other', 'خريطة فرق'],
    ])
  })

  it('the family lane stays at the activity level', () => {
    const out = suggestionSuppliers([{ id: 'f', name_ar: 'قطاع' }], 'على مستوى النشاط')
    expect(out[0].evidence).toBe('على مستوى النشاط')
  })
})
