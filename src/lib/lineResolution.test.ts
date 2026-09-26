import { describe, expect, it } from 'vitest'
import { looksLikeContinuation, resolveLinesSync } from './lineResolution'

const fam = (r: ReturnType<typeof resolveLinesSync>[number]) => (r?.family as string | null) ?? null

describe('looksLikeContinuation', () => {
  it('recognises a line that only varies the line above', () => {
    expect(looksLikeContinuation('نفس البند السابق مقاس 200')).toBe(true)
    expect(looksLikeContinuation('مقاس 160 مم')).toBe(true)
    expect(looksLikeContinuation('بقطر 4 بوصة')).toBe(true)
    expect(looksLikeContinuation('200 x 100 مم')).toBe(true)
    expect(looksLikeContinuation('same as above 25mm')).toBe(true)
  })

  it('does not take a product for a continuation', () => {
    expect(looksLikeContinuation('كاميرا')).toBe(false)
    expect(looksLikeContinuation('SD-WAN')).toBe(false)
    expect(looksLikeContinuation('GNSS RTK')).toBe(false)
    expect(looksLikeContinuation('PVC Pipe DN110')).toBe(false)
  })
})

describe('resolveLinesSync — inheriting the material above', () => {
  it('a size-only line inherits from the named line above it', () => {
    const out = resolveLinesSync([{ name: 'مواسير PPR PN20 مقاس 160 مم' }, { name: 'نفس البند السابق مقاس 200' }])
    expect(fam(out[0])).toBe('pipes_fittings')
    expect(fam(out[1])).toBe('pipes_fittings')
    expect(out[1]?.inherited_from_line_above).toBe(true)
  })

  it('a bare weak word after a cable line stays what it is: not a cable', () => {
    const out = resolveLinesSync([{ name: 'كابل نحاس XLPE 4x70 مم2' }, { name: 'كاميرا' }])
    expect(fam(out[0])).toBe('power_cables')
    expect(fam(out[1])).toBeNull()
    expect(out[1]?.inherited_from_line_above).toBeUndefined()
  })

  it('an unknown product after a cable line reaches the model lane, not the cable pool', () => {
    const out = resolveLinesSync([{ name: 'كابل نحاس 4x25 مم2' }, { name: 'SD-WAN' }])
    expect(fam(out[1])).toBeNull()
    expect(out[1]?.unresolved_bucket).toBe('ai_eligible')
  })

  it('an English pipe after a fire line is a pipe, never a sprinkler', () => {
    const out = resolveLinesSync([{ name: 'رشاش حريق pendent K80' }, { name: 'PVC Pipe DN110' }])
    expect(fam(out[1])).not.toBe('fire_fighting')
  })
})
