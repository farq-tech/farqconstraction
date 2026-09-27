import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyNameMemory, rowsToLines, type ParsedLine } from './parseBoq'
import { buildRfqLinesFromItems, marketNameCleared } from './rfqPackages'
import MarketNameField from '../components/MarketNameField'
import type { BOQItem } from '../types'

const HEADER8 = ['اسم المادة', 'الكمية', 'الوحدة', 'المواصفة الفنية', 'موقع التوريد', 'ملاحظات', 'الاسم الدارج بالسوق', 'مصدر الاسم الدارج']

describe('market-name memory on the reader sheet', () => {
  it('the eighth column marks a name that came from memory; other names are the reader’s', () => {
    const lines = rowsToLines([
      HEADER8,
      ['بلك مقاس 15', 3000, 'حبة', '', '', '', 'بلوك أسمنتي 15', 'MEMORY'],
      ['فوم فاير ريت', 200, 'حبة', '', '', '', 'فوم مقاوم للحريق (فاير فوم)', ''],
      ['غراء أبو جمل', 100, 'حبة', '', '', '', '', ''],
    ])
    expect(lines.map((l) => [l.marketName, l.marketNameSource])).toEqual([
      ['بلوك أسمنتي 15', 'memory'],
      ['فوم مقاوم للحريق (فاير فوم)', undefined],
      [undefined, undefined],
    ])
    expect('marketNameSource' in lines[1]!).toBe(false)
  })
})

describe('applyNameMemory (lines read in the browser)', () => {
  const line = (over: Partial<ParsedLine>): ParsedLine => ({ id: 1, name: 'بلك مقاس 15', qty: '1', unit: 'حبة', ...over })

  it('asks only for lines without a name, fills hits and marks them as remembered', async () => {
    const lookup = vi.fn(async (asked: Array<{ name: string; spec?: string }>) =>
      asked.map((a) => (a.name === 'بلك مقاس 15' ? { market_name_ar: 'بلوك أسمنتي 15' } : null)),
    )
    const lines = [
      line({ id: 1 }),
      line({ id: 2, name: 'فوم فاير ريت', marketName: 'فوم مقاوم للحريق (فاير فوم)' }),
      line({ id: 3, name: 'حفر', workOnly: true }),
      line({ id: 4, name: 'غراء أبو جمل', spec: 'علبة كبيرة' }),
    ]
    const out = await applyNameMemory(lines, lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]![0]).toEqual([
      { name: 'بلك مقاس 15', spec: '' },
      { name: 'غراء أبو جمل', spec: 'علبة كبيرة' },
    ])
    expect(out.map((l) => [l.marketName, l.marketNameSource])).toEqual([
      ['بلوك أسمنتي 15', 'memory'],
      ['فوم مقاوم للحريق (فاير فوم)', undefined],
      [undefined, undefined],
      [undefined, undefined],
    ])
  })

  it('no lookup when every line is named, and any failure keeps the lines as read', async () => {
    const named = [line({ marketName: 'بلوك' })]
    const never = vi.fn()
    expect(await applyNameMemory(named, never)).toBe(named)
    expect(never).not.toHaveBeenCalled()
    const lines = [line({})]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await applyNameMemory(lines, async () => { throw new Error('offline') })).toBe(lines)
    warn.mockRestore()
    expect(await applyNameMemory(lines, async () => [null])).toBe(lines)
  })

  it('a remembered name that only repeats the booklet text is not used', async () => {
    const out = await applyNameMemory([line({})], async () => [{ market_name_ar: ' بلك  مقاس 15 ' }])
    expect(out[0]!.marketName).toBeUndefined()
  })
})

describe('clearing a name is told to the memory', () => {
  const item = (over: Partial<BOQItem>): BOQItem => ({ id: 1, name: 'غراء أبو جمل', qty: '1', unit: 'حبة', status: 'ready', supplierCount: 0, suppliers: [], lineKey: 'line-1', ...over })
  it('only a suggestion the buyer emptied carries market_name_cleared', () => {
    expect(marketNameCleared(item({ marketName: '' }))).toBe(true)
    expect(marketNameCleared(item({}))).toBe(false)
    expect(marketNameCleared(item({ marketName: 'غراء خشب' }))).toBe(false)
    const [cleared, none, named] = buildRfqLinesFromItems([item({ marketName: '' }), item({}), item({ marketName: 'غراء خشب', marketNameSource: 'memory' })])
    expect(cleared!.market_name_cleared).toBe(true)
    expect('market_name_cleared' in none!).toBe(false)
    expect(named).toMatchObject({ market_name_ar: 'غراء خشب' })
    expect('market_name_cleared' in named!).toBe(false)
  })
})

describe('MarketNameField', () => {
  const render = (props: Partial<Parameters<typeof MarketNameField>[0]>) =>
    renderToStaticMarkup(
      createElement(MarketNameField, { value: 'بلوك أسمنتي 15', bookletText: 'بلك مقاس 15', onCommit: () => {}, suggest: async () => [], ...props }),
    )
  it('says «محفوظ من طلب سابق» only for a remembered name', () => {
    expect(render({ fromMemory: true })).toContain('محفوظ من طلب سابق')
    expect(render({})).not.toContain('محفوظ من طلب سابق')
    expect(render({ fromMemory: true, value: '' })).not.toContain('محفوظ من طلب سابق')
  })
})
