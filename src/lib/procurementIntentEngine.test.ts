import { describe, expect, it } from 'vitest'
import {
  resolveProcurementIntent,
  resolveProcurementIntentBatch,
  scoreSupplierAgainstProfile,
  hitsExcludeTerms,
  isAiIntentEnabled,
} from './procurementIntentEngine'

describe('procurementIntentEngine', () => {
  it('resolves column cladding via dictionary with exclude terms', () => {
    const started = Date.now()
    const profile = resolveProcurementIntent('تجليد أعمدة 3.5م')
    const elapsed = Date.now() - started

    expect(profile.intent).toBe('column_cladding')
    expect(profile.source).toBe('dictionary')
    expect(profile.domain).toBe('finishes')
    expect(profile.search_terms.some((t) => /تجليد|cladding|تشطيب|ديكور|fit/i.test(t))).toBe(
      true,
    )
    expect(profile.exclude.some((t) => /خرسان|حديد|سباك|concrete|rebar/i.test(t))).toBe(
      true,
    )
    expect(elapsed).toBeLessThan(150)
    expect(profile.debug?.ai_attempted).toBe(false)
  })

  it('does not rank paints supplier above cladding for column cladding', () => {
    const profile = resolveProcurementIntent('تجليد أعمدة')
    const cladding = scoreSupplierAgainstProfile(
      'مؤسسة ديكورات وتشطيبات وكسوة أعمدة',
      profile,
    )
    const paints = scoreSupplierAgainstProfile('شركة دهانات جوتن للطلاء', profile)
    const concrete = scoreSupplierAgainstProfile('خرسانة جاهزة وحديد تسليح', profile)

    expect(cladding.score).toBeGreaterThan(paints.score)
    expect(concrete.vetoed).toBe(true)
    expect(hitsExcludeTerms('سباكة عامة', profile.exclude)).toBe(true)
  })

  it('dictionary path does not call AI', () => {
    expect(isAiIntentEnabled()).toBe(false)
    const profile = resolveProcurementIntent('كاشف دخان')
    expect(profile.intent).toBe('fire_safety')
    expect(profile.source).toBe('dictionary')
  })

  it('batch-dedupes cladding lines into one pool', () => {
    const batch = resolveProcurementIntentBatch([
      { id: 1, name: 'تجليد أعمدة م 3.5' },
      { id: 2, name: 'تجليد أعمدة م 7' },
      { id: 3, name: 'دهان داخلي' },
      { id: 4, name: 'تجليد أعمدة 2.4م' },
    ])

    expect(batch.line_count).toBe(4)
    const cladding = batch.pools.find((p) => p.intent === 'column_cladding')
    expect(cladding?.line_ids).toEqual(['1', '2', '4'])
    expect(batch.unique_intent_count).toBeLessThanOrEqual(3)
  })
})
