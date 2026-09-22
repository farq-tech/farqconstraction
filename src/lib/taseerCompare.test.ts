import { describe, expect, it } from 'vitest'
import { applyCompareFilter, buildNeedComparison, parseMoney } from './taseerCompare'

const invites = [
  { token: 'a', need: 'سباك', sellerName: 'أحمد' },
  { token: 'k', need: 'سباك', sellerName: 'خالد' },
  { token: 's', need: 'سباك', sellerName: 'سالم' },
]

const suppliers = [
  {
    key: 'ahmad',
    name: 'أحمد',
    offers: [
      {
        id: '1',
        token: 'a',
        amount: '180',
        includesAttendance: true,
        includesMaterials: false,
        appointment: 'اليوم 7 مساءً',
        submittedAt: '2026-09-22T10:00:00.000Z',
      },
    ],
  },
  {
    key: 'khalid',
    name: 'خالد',
    offers: [
      { id: '2', token: 'k', amount: '220', submittedAt: '2026-09-22T09:00:00.000Z' },
      { id: '3', token: 'k', amount: '190', includesMaterials: true, submittedAt: '2026-09-22T11:00:00.000Z' },
    ],
  },
]

describe('taseerCompare', () => {
  it('parses Arabic and Latin amounts', () => {
    expect(parseMoney('180')).toBe(180)
    expect(parseMoney('١٩٠ ر.س')).toBe(190)
    expect(parseMoney('')).toBeNull()
  })

  it('uses the latest price per conversation and keeps history', () => {
    const { rows, summary } = buildNeedComparison('سباك', invites, suppliers)
    const khalid = rows.find((r) => r.token === 'k')
    expect(khalid?.price).toBe(190)
    expect(khalid?.history.map((h) => h.amount)).toEqual(['220', '190'])
    expect(rows.find((r) => r.token === 's')?.statusLabel).toBe('لم يرد')
    expect(rows.find((r) => r.token === 'a')?.statusLabel).toBe('عرض مؤكد')
    expect(summary.arrived).toBe(2)
    expect(summary.cheapest).toBe(180)
    expect(summary.min).toBe(180)
    expect(summary.max).toBe(190)
    expect(summary.cheapestComplete).toBeNull()
  })

  it('does not invent a complete-cost fee from boolean extras', () => {
    const withBoth = [
      {
        key: 'n',
        name: 'نورة',
        offers: [
          {
            id: '4',
            token: 'n',
            amount: '250',
            extraAmount: '20',
            includesMaterials: true,
            includesAttendance: true,
            submittedAt: '2026-09-22T12:00:00.000Z',
          },
        ],
      },
    ]
    const extraInvite = [...invites, { token: 'n', need: 'سباك', sellerName: 'نورة' }]
    const { rows, summary } = buildNeedComparison('سباك', extraInvite, [...suppliers, ...withBoth])
    const nora = rows.find((r) => r.token === 'n')
    expect(nora?.finalCost).toBe(270)
    expect(summary.cheapestComplete).toBe(270)
    expect(rows.find((r) => r.token === 'a')?.finalCost).toBe(180)
  })

  it('adds a known delivery fee and never invents one from the boolean', () => {
    const withDelivery = [
      {
        key: 'd',
        name: 'دلال',
        offers: [
          {
            id: '5',
            token: 'd',
            amount: '200',
            deliveryAmount: '50',
            includesDelivery: true,
            includesMaterials: true,
            includesAttendance: true,
            submittedAt: '2026-09-22T13:00:00.000Z',
          },
        ],
      },
      {
        key: 'b',
        name: 'بندر',
        offers: [
          {
            id: '6',
            token: 'b',
            amount: '210',
            includesDelivery: true,
            includesMaterials: true,
            includesAttendance: true,
            submittedAt: '2026-09-22T13:01:00.000Z',
          },
        ],
      },
    ]
    const extraInvite = [
      ...invites,
      { token: 'd', need: 'سباك', sellerName: 'دلال' },
      { token: 'b', need: 'سباك', sellerName: 'بندر' },
    ]
    const { rows, summary } = buildNeedComparison('سباك', extraInvite, [...suppliers, ...withDelivery])
    expect(rows.find((r) => r.token === 'd')?.finalCost).toBe(250)
    expect(rows.find((r) => r.token === 'b')?.finalCost).toBe(210)
    expect(rows.find((r) => r.token === 'b')?.includesDelivery).toBe(true)
    expect(summary.cheapestComplete).toBe(210)
    expect(applyCompareFilter(rows, 'delivery').map((r) => r.name).sort()).toEqual(['بندر', 'دلال'].sort())
  })

  it('leaves rating empty when none was published', () => {
    const { rows } = buildNeedComparison('سباك', invites, suppliers)
    expect(rows.every((r) => r.ratingValue == null)).toBe(true)
    expect(applyCompareFilter(rows, 'materials').map((r) => r.name)).toEqual(['خالد'])
  })
})
