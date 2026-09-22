import { describe, expect, it } from 'vitest'
import { splitNeeds } from './needText'

describe('splitNeeds', () => {
  it('splits a spoken sequence of trades', () => {
    expect(splitNeeds('سباك و كهربائي ودرابزين زجاج')).toEqual([
      'سباك',
      'كهربائي',
      'درابزين زجاج',
    ])
  })

  it('splits Arabic and Latin commas', () => {
    expect(splitNeeds('سباك، كهربائي, درابزين زجاج')).toEqual([
      'سباك',
      'كهربائي',
      'درابزين زجاج',
    ])
  })

  it('keeps a single need together', () => {
    expect(splitNeeds('درابزين زجاج')).toEqual(['درابزين زجاج'])
  })

  it('drops blanks and caps at four', () => {
    expect(splitNeeds('  أ و ب و ج و د و ه  ')).toEqual(['أ', 'ب', 'ج', 'د'])
  })
})
