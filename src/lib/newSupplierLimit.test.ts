import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNewSupplierLimit, MAX_NEW_SUPPLIER_LIMIT, setNewSupplierLimit } from './newSupplierLimit'

describe('new supplier limit preference', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('uses the bounded server default when the preference is empty or invalid', () => {
    expect(getNewSupplierLimit()).toBeNull()
    values.set('farq.newSupplierLimit', '-1')
    expect(getNewSupplierLimit()).toBeNull()
    values.set('farq.newSupplierLimit', '1.5')
    expect(getNewSupplierLimit()).toBeNull()
  })

  it('accepts zero and clamps old or oversized preferences to the API limit', () => {
    setNewSupplierLimit(0)
    expect(getNewSupplierLimit()).toBe(0)
    setNewSupplierLimit(MAX_NEW_SUPPLIER_LIMIT + 40)
    expect(getNewSupplierLimit()).toBe(MAX_NEW_SUPPLIER_LIMIT)
    values.set('farq.newSupplierLimit', '500')
    expect(getNewSupplierLimit()).toBe(MAX_NEW_SUPPLIER_LIMIT)
  })

  it('removes the stored preference for an empty value', () => {
    setNewSupplierLimit(4)
    setNewSupplierLimit(null)
    expect(getNewSupplierLimit()).toBeNull()
  })

  it('fails closed to the server default when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(getNewSupplierLimit()).toBeNull()
    expect(() => setNewSupplierLimit(10)).not.toThrow()
    expect(() => setNewSupplierLimit(null)).not.toThrow()
  })
})
