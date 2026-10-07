import { describe, expect, it } from 'vitest'
import { supplierCountForDisplay, supplierCountIsLimited } from './supplierCountVisibility'
describe('company supplier count presentation', () => {
  it('caps the urgent H301 example without mutating its dispatch count', () => {
    const record = { reached: 472 }
    expect(supplierCountForDisplay(record.reached)).toBe(200)
    expect(record.reached).toBe(472)
    expect(supplierCountIsLimited(record.reached)).toBe(true)
  })
  it('preserves exact counts only when the server permission is granted', () => {
    expect(supplierCountForDisplay(472, true)).toBe(472)
    expect(supplierCountIsLimited(472, true)).toBe(false)
  })
  it('preserves small counts and the boundary', () => {
    for (const count of [0, 1, 199, 200]) {
      expect(supplierCountForDisplay(count)).toBe(count)
      expect(supplierCountIsLimited(count)).toBe(false)
    }
  })
})
