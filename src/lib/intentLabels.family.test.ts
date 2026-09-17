import { describe, expect, it } from 'vitest'
import { familyLabelAr, intentChoices, intentLabelAr } from './intentLabels'

describe('labels for the review queue', () => {
  it('names a family in Arabic and falls back to the id', () => {
    expect(familyLabelAr('sanitary_ware')).not.toBe('sanitary_ware')
    expect(/[؀-ۿ]/.test(familyLabelAr('sanitary_ware'))).toBe(true)
    expect(familyLabelAr('no_such_family')).toBe('no_such_family')
  })
  it('offers every material of the closed list once, grouped by its own family', () => {
    const groups = intentChoices()
    const ids = groups.flatMap((g) => g.intents.map((i) => i.id))
    expect(ids.length).toBeGreaterThan(150)
    expect(new Set(ids).size).toBe(ids.length)
    const sanitary = groups.find((g) => g.family === 'sanitary_ware')
    expect(sanitary?.intents.some((i) => i.id === 'washroom_accessories')).toBe(true)
    expect(intentLabelAr('washroom_accessories')).toBe(sanitary?.intents.find((i) => i.id === 'washroom_accessories')?.label)
  })
})
