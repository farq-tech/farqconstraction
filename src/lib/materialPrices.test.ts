import { describe, expect, it } from 'vitest'
import { changeTone, formatChange, formatSar, monthLabel } from './materialPrices'

describe('material price labels', () => {
  it('writes the riyal amount with two decimals', () => {
    expect(formatSar(3163.36)).toBe('3,163.36 ر.س')
  })

  it('marks a rise, a fall, and a flat month', () => {
    expect(formatChange(19.67)).toBe('+19.67%')
    expect(formatChange(-1.21)).toBe('-1.21%')
    expect(changeTone(0.5)).toBe('up')
    expect(changeTone(-0.5)).toBe('down')
    expect(changeTone(0)).toBe('flat')
  })

  it('names the published month', () => {
    expect(monthLabel('2026-07-01')).toBe('يوليو 2026')
  })
})
