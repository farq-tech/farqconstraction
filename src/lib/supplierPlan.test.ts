import { describe, expect, it } from 'vitest'
import { channelLabel, channelSummary, isPlanServiceOff, kindLabel } from './supplierPlan'

describe('supplier plan helpers', () => {
  it('labels a landline or an unlinked mobile «يحتاج رقم جوال», never as a channel', () => {
    expect(channelLabel({ channel: 'LANDLINE', channel_ar: 'هاتف' })).toBe('يحتاج رقم جوال')
    expect(channelLabel({ channel: 'MOBILE_UNLINKED', channel_ar: 'x' })).toBe('يحتاج رقم جوال')
    expect(channelLabel({ channel: 'WHATSAPP', channel_ar: 'واتساب' })).toBe('واتساب')
  })
  it('summarises channels in send order', () => {
    expect(channelSummary({ HARAJ: 3, WHATSAPP: 5, LANDLINE: 2, MOBILE_UNLINKED: 1 })).toBe('واتساب 5 · محادثة 3 · يحتاج رقم جوال 3')
    expect(channelSummary(undefined)).toBe('')
  })
  it('names contractors and factories', () => {
    expect(kindLabel('CONTRACTOR')).toBe('مقاول/منفّذ')
    expect(kindLabel('SUPPLIER')).toBeNull()
  })
  it('treats a 403 as «service off»', () => {
    expect(isPlanServiceOff({ status: 403 })).toBe(true)
    expect(isPlanServiceOff(new Error('network'))).toBe(false)
  })
})
