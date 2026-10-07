import { describe, expect, it } from 'vitest'
import { priorQuotesOf } from './constructionClient'

describe('prior quote evidence', () => {
  it.each(['SPEC', 'LINE_TEXT'])('retains matching %s history', match => {
    expect(priorQuotesOf({ prior_quoter: { match, quotes: 3 } })).toBe(3)
  })
  it.each(['CATEGORY', undefined, 'UNKNOWN'])('does not turn %s history into material proof', match => {
    expect(priorQuotesOf({ prior_quoter: { match, quotes: 20 } })).toBeUndefined()
  })
  it.each([0, -1, 'bad', Infinity])('rejects invalid quote count %s', quotes => {
    expect(priorQuotesOf({ prior_quoter: { match: 'SPEC', quotes } })).toBeUndefined()
  })
})
