/**
 * Document isolation + Farq-test booklet parse regression.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ETIMAD_WAITING_HALL_BOQ,
  looksLikeEtimadBoq,
  looksLikeWaitingHallBoq,
  parseCodedFarqTestBoq,
  parseFarqTestBoqText,
  parseSupplyFarqTestBoq,
  resolveParsedLines,
} from './parseBoq'
import {
  beginBoqUpload,
  clearParsedBoq,
  getActiveDocumentId,
  getBoqItems,
  setParsedBoq,
} from '../store/session'
import type { BOQItem } from '../types'

const FIXTURES = path.resolve(__dirname, '../../fixtures/boq')

const WAITING_HALL_TEXT = `
كراسة الشروط والمنافسات
منافسة مشروع تجديد وتحديث صالات الانتظار (المرحلة الثانية)
جدول الكميات
البند الكمية الوحدة
توريد وتركيب أرضيات بورسلين
أعمال الأسقف الجبسية
توريد وتركيب سبوت لايت
توريد وتركيب شريط ليد
توريد وتركيب مجاري هواء مرنة
`

const CYBERSECURITY_TEXT = `
كراسة الشروط والمنافسات
كراسة الأمن السيبراني لمركز البيانات
منافسة مشروع تأمين مركز البيانات
جدول الكميات
البند الكمية الوحدة
1	نظام كشف التسلل الشبكي	2	عدد
2	جدار ناري من الجيل التالي	4	عدد
3	منصة إدارة الهويات والصلاحيات	1	عدد
4	نظام مراقبة سجلات الأمن SIEM	1	عدد
5	تشفير البيانات أثناء التخزين والنقل	1	عدد
`

const CYBER_WEAK_EXTRACT = `
كراسة الشروط والمنافسات
كراسة الأمن السيبراني
جدول الكميات
البند الكمية الوحدة
`

/** Mimics flattened warehouse PDF text (م|فئة|توريد…|وحدة|كمية). */
const WAREHOUSE_FIXTURE_TEXT = `
كراسة اختبارية توريد مواد ومعدات لمركز تشغيل ومستودعات FARQ-TEST-B جدول الكميات
م الفئة البند المواصفة المختصرة الوحدة الكمية
1 الهياكل المعدنية توريد قطاع حديد إنشائي 200 IPE فولاذ إنشائي، شهادة Mill Certificate. طن 5
2 الهياكل المعدنية توريد قطاع حديد إنشائي 300 IPE فولاذ إنشائي. طن 5
3 الهياكل المعدنية توريد قطاع حديد إنشائي 200 HEB فولاذ إنشائي. طن 8
17 غلاف المبنى والأسقف توريد لوح ساندوتش بانل سقف 50 مم PIR. م 2 150
23 أرضيات صناعية ومواد كيميائية توريد هاردنر أرضيات Dry Shake. كيس 1,200
29 أنظمة التخزين والمستودعات توريد Pallet Rack Upright ارتفاع 6 م. وحدة 8
41 معدات المناولة والتحميل توريد Dock Leveller 10 Ton Hydraulic. عدد 6
133 المولدات و UPS والطاقة الاحتياطية توريد مولد ديزل 500 kVA Standby. عدد 1
`

function asBoqItems(lines: { id: number; name: string; qty: string; unit: string }[]): BOQItem[] {
  return lines.map((line) => ({
    ...line,
    status: 'searching' as const,
    state: 'MATCH_PENDING' as const,
    supplierCount: 0,
    suppliers: [],
  }))
}

function nameOverlap(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((n) => n.trim()))
  return a.filter((n) => setB.has(n.trim()))
}

describe('document identity / booklet isolation', () => {
  it('fingerprints waiting-hall vs generic Etimad cybersecurity booklet', () => {
    expect(looksLikeEtimadBoq(WAITING_HALL_TEXT)).toBe(true)
    expect(looksLikeWaitingHallBoq(WAITING_HALL_TEXT)).toBe(true)

    expect(looksLikeEtimadBoq(CYBERSECURITY_TEXT)).toBe(true)
    expect(looksLikeWaitingHallBoq(CYBERSECURITY_TEXT)).toBe(false)
    expect(looksLikeWaitingHallBoq(CYBER_WEAK_EXTRACT)).toBe(false)
  })

  it('upload A (waiting-hall) then upload B (cybersecurity) yields B lines only', () => {
    const uploadA = resolveParsedLines({
      fileName: 'waiting-hall.pdf',
      text: WAITING_HALL_TEXT,
      apiLines: [],
    })
    expect(uploadA.source).toBe('waiting-hall-curated')
    expect(uploadA.lines).toHaveLength(45)

    setParsedBoq({
      fileName: 'waiting-hall.pdf',
      projectName: uploadA.projectName,
      items: asBoqItems(uploadA.lines),
      documentId: 'doc-waiting-hall-aaa',
    })
    expect(getBoqItems()).toHaveLength(45)

    beginBoqUpload({ fileName: 'cybersecurity.pdf', documentId: null })
    expect(getBoqItems()).toHaveLength(0)

    const uploadB = resolveParsedLines({
      fileName: 'cybersecurity.pdf',
      text: CYBERSECURITY_TEXT,
      apiLines: [],
    })
    expect(uploadB.source).toBe('pdf-text')
    expect(uploadB.lines.length).toBeGreaterThanOrEqual(3)

    const hallNames = ETIMAD_WAITING_HALL_BOQ.map((l) => l.name)
    const cyberNames = uploadB.lines.map((l) => l.name)
    expect(nameOverlap(cyberNames, hallNames)).toHaveLength(0)

    setParsedBoq({
      fileName: 'cybersecurity.pdf',
      projectName: uploadB.projectName,
      items: asBoqItems(uploadB.lines),
      documentId: 'doc-cyber-bbb',
    })
    expect(getActiveDocumentId()).toBe('doc-cyber-bbb')
    expect(nameOverlap(getBoqItems().map((i) => i.name), hallNames)).toHaveLength(0)
  })

  it('weak cybersecurity extract must NOT inject waiting-hall curated 45', () => {
    const resolved = resolveParsedLines({
      fileName: 'cyber-weak.pdf',
      text: CYBER_WEAK_EXTRACT,
      apiLines: [],
    })
    expect(resolved.source).toBe('empty')
    expect(resolved.lines).toHaveLength(0)
  })

  it('failed parse does not restore booklet A', () => {
    setParsedBoq({
      fileName: 'waiting-hall.pdf',
      projectName: 'صالات الانتظار',
      items: asBoqItems(ETIMAD_WAITING_HALL_BOQ.slice(0, 5)),
      documentId: 'doc-a',
    })
    expect(getBoqItems()).toHaveLength(5)

    beginBoqUpload({ fileName: 'cyber-fail.pdf' })
    expect(getBoqItems()).toHaveLength(0)

    const failed = resolveParsedLines({
      fileName: 'cyber-fail.pdf',
      text: CYBER_WEAK_EXTRACT,
      apiLines: [],
    })
    expect(failed.lines).toHaveLength(0)

    clearParsedBoq()
    expect(getBoqItems()).toHaveLength(0)
    expect(getActiveDocumentId()).toBeNull()
  })
})

describe('warehouse / Farq-test booklet parse', () => {
  it('parses warehouse supply-table fixture with non-empty lines unrelated to waiting-hall', () => {
    const lines = parseSupplyFarqTestBoq(WAREHOUSE_FIXTURE_TEXT)
    expect(lines.length).toBeGreaterThanOrEqual(6)
    expect(lines.some((l) => /قطاع حديد|ساندوتش|Pallet Rack|مولد ديزل/i.test(l.name))).toBe(true)

    const hallNames = ETIMAD_WAITING_HALL_BOQ.map((l) => l.name)
    expect(nameOverlap(lines.map((l) => l.name), hallNames)).toHaveLength(0)

    const resolved = resolveParsedLines({
      fileName: 'warehouse-ops.pdf',
      text: WAREHOUSE_FIXTURE_TEXT,
      apiLines: [],
    })
    expect(resolved.source).toBe('pdf-text')
    expect(resolved.lines.length).toBeGreaterThanOrEqual(6)
    expect(resolved.source).not.toBe('waiting-hall-curated')
  })

  it('parses real warehouse PDF flat extract (≥150 lines, includes UPS category)', () => {
    const flatPath = path.join(FIXTURES, 'warehouse-ops-02.flat.txt')
    const text = readFileSync(flatPath, 'utf8')
    const lines = parseFarqTestBoqText(text)
    expect(lines.length).toBeGreaterThanOrEqual(120)
    expect(lines.some((l) => l.id === 1 && /حديد|IPE/i.test(l.name))).toBe(true)
    expect(lines.some((l) => l.id === 133 && /مولد|UPS|ديزل/i.test(l.name))).toBe(true)

    const hallNames = ETIMAD_WAITING_HALL_BOQ.map((l) => l.name)
    expect(nameOverlap(lines.map((l) => l.name), hallNames)).toHaveLength(0)

    // A then failed B still clears; warehouse C succeeds with its own lines.
    setParsedBoq({
      fileName: 'a.pdf',
      projectName: 'A',
      items: asBoqItems(ETIMAD_WAITING_HALL_BOQ.slice(0, 10)),
      documentId: 'doc-a',
    })
    beginBoqUpload({ fileName: 'fail.pdf' })
    expect(getBoqItems()).toHaveLength(0)
    clearParsedBoq()

    const warehouse = resolveParsedLines({
      fileName: 'warehouse-ops-02.pdf',
      text,
      apiLines: [],
    })
    expect(warehouse.lines.length).toBeGreaterThanOrEqual(120)
    setParsedBoq({
      fileName: 'warehouse-ops-02.pdf',
      projectName: warehouse.projectName,
      items: asBoqItems(warehouse.lines),
      documentId: 'doc-warehouse',
    })
    expect(getBoqItems().length).toBeGreaterThanOrEqual(120)
    expect(nameOverlap(getBoqItems().map((i) => i.name), hallNames)).toHaveLength(0)
  })

  it('parses real datacenter/cyber PDF flat extract (DC- coded rows)', () => {
    const text = readFileSync(path.join(FIXTURES, 'datacenter-cyber-01.flat.txt'), 'utf8')
    const lines = parseCodedFarqTestBoq(text)
    expect(lines.length).toBeGreaterThanOrEqual(80)
    expect(lines.some((l) => /خادم|Rack|سيبر|جدار|شبكة|تخزين/i.test(l.name))).toBe(true)
    expect(nameOverlap(lines.map((l) => l.name), ETIMAD_WAITING_HALL_BOQ.map((l) => l.name))).toHaveLength(
      0,
    )
  })

  it('parses real sites/workshops/safety PDF (SITE- coded rows)', () => {
    const text = readFileSync(path.join(FIXTURES, 'site-safety-02.flat.txt'), 'utf8')
    const lines = parseCodedFarqTestBoq(text)
    expect(lines.length).toBeGreaterThanOrEqual(100)
    expect(lines.some((l) => /خوذة|سلامة|Bump Cap|واقي وجه|حزام|Harness/i.test(l.name))).toBe(true)
    expect(nameOverlap(lines.map((l) => l.name), ETIMAD_WAITING_HALL_BOQ.map((l) => l.name))).toHaveLength(
      0,
    )

    const resolved = resolveParsedLines({
      fileName: 'كراسة_اختبار_جديدة_02_معدات_مواقع_وورش_وسلامة.pdf',
      text,
      apiLines: [],
    })
    expect(resolved.source).toBe('pdf-text')
    expect(resolved.lines.length).toBeGreaterThanOrEqual(100)
  })

  it('client Farq-test extract outranks sparse junk API rows (SITE zero-lines root cause)', () => {
    const text = readFileSync(path.join(FIXTURES, 'site-safety-02.flat.txt'), 'utf8')
    const junkApi = [
      { id: 1, name: 'api-noise-a', qty: '1', unit: 'عدد' },
      { id: 2, name: 'api-noise-b', qty: '1', unit: 'عدد' },
      { id: 3, name: 'api-noise-c', qty: '1', unit: 'عدد' },
      { id: 4, name: 'api-noise-d', qty: '1', unit: 'عدد' },
      { id: 5, name: 'api-noise-e', qty: '1', unit: 'عدد' },
    ]
    const resolved = resolveParsedLines({
      fileName: 'site-safety.pdf',
      text,
      apiLines: junkApi,
    })
    expect(resolved.lines.length).toBeGreaterThanOrEqual(100)
    expect(resolved.lines.some((l) => /خوذة|سلامة/i.test(l.name))).toBe(true)
    expect(resolved.lines.every((l) => !/^api-noise/.test(l.name))).toBe(true)
  })

  it('all three Farq-test booklets stay distinct from each other and waiting-hall', () => {
    const warehouse = parseFarqTestBoqText(
      readFileSync(path.join(FIXTURES, 'warehouse-ops-02.flat.txt'), 'utf8'),
    )
    const datacenter = parseFarqTestBoqText(
      readFileSync(path.join(FIXTURES, 'datacenter-cyber-01.flat.txt'), 'utf8'),
    )
    const site = parseFarqTestBoqText(
      readFileSync(path.join(FIXTURES, 'site-safety-02.flat.txt'), 'utf8'),
    )
    expect(warehouse.length).toBeGreaterThanOrEqual(120)
    expect(datacenter.length).toBeGreaterThanOrEqual(80)
    expect(site.length).toBeGreaterThanOrEqual(100)

    const hall = ETIMAD_WAITING_HALL_BOQ.map((l) => l.name)
    expect(nameOverlap(warehouse.map((l) => l.name), hall)).toHaveLength(0)
    expect(nameOverlap(datacenter.map((l) => l.name), hall)).toHaveLength(0)
    expect(nameOverlap(site.map((l) => l.name), hall)).toHaveLength(0)

    // Cross-booklet name overlap should be near-zero for these distinct test sets.
    expect(nameOverlap(warehouse.map((l) => l.name), site.map((l) => l.name)).length).toBeLessThan(5)
    expect(nameOverlap(datacenter.map((l) => l.name), site.map((l) => l.name)).length).toBeLessThan(5)
  })
})
