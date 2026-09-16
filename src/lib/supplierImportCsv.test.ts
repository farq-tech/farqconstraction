import { describe, expect, it } from 'vitest'
import { parseSupplierCsv, SupplierCsvError } from './supplierImportCsv'

const HEADERS = 'اسم المورد,المدينة,النشاط,البريد الإلكتروني,الجوال'

describe('parseSupplierCsv', () => {
  it('reads a UTF-8 file that Excel saved with a BOM and CRLF', () => {
    // Both are what Excel actually writes, and a BOM left on the first header
    // makes «اسم المورد» unrecognisable — the file then imports as nameless rows.
    const parsed = parseSupplierCsv(
      `\uFEFF${HEADERS}\r\nشركة الأندلس,الرياض,زجاج,a@example.com,0500000001\r\n`,
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]!.name_ar).toBe('شركة الأندلس')
    expect(parsed.rows[0]!.city).toBe('الرياض')
  })

  it('reads the semicolon files Arabic Windows locales produce', () => {
    const parsed = parseSupplierCsv(
      'اسم المورد;المدينة;النشاط;البريد الإلكتروني\nمؤسسة النور;جدة;كهرباء;b@example.com\n',
    )
    expect(parsed.rows[0]!.name_ar).toBe('مؤسسة النور')
    expect(parsed.rows[0]!.email).toBe('b@example.com')
  })

  it('keeps a comma that sits inside a quoted activity list', () => {
    const parsed = parseSupplierCsv(
      `${HEADERS}\nشركة البناء,الدمام,"حديد, أسمنت, رمل",c@example.com,0500000002\n`,
    )
    expect(parsed.rows[0]!.supplied_items).toBe('حديد, أسمنت, رمل')
  })

  it('accepts English headers and a doubled quote', () => {
    const parsed = parseSupplierCsv(
      'supplier name,city,activity,email\n"Al ""Noor"" Trading",Riyadh,steel,d@example.com\n',
    )
    expect(parsed.rows[0]!.name_ar).toBe('Al "Noor" Trading')
  })

  it('matches a header whose hamza is spelled differently', () => {
    const parsed = parseSupplierCsv(
      'اسم المورد,البريد الالكترونى\nشركة أ,e@example.com\n',
    )
    expect(parsed.rows[0]!.email).toBe('e@example.com')
  })

  it('does not let the contact-person column capture the supplier name', () => {
    const parsed = parseSupplierCsv(
      'اسم مسؤول التواصل,اسم المورد,البريد الإلكتروني\nأحمد,شركة الفجر,f@example.com\n',
    )
    expect(parsed.rows[0]!.name_ar).toBe('شركة الفجر')
    expect(parsed.rows[0]!.contact_name).toBe('أحمد')
  })

  it('numbers rows the way Excel does, so a reason points at the right line', () => {
    const parsed = parseSupplierCsv(
      `${HEADERS}\nالأول,الرياض,زجاج,g@example.com,\nالثاني,جدة,حديد,h@example.com,\n`,
    )
    expect(parsed.rows.map((row) => row.rowNumber)).toEqual([2, 3])
  })

  it('names the columns it did read when the supplier name column is missing', () => {
    // Refusing with the real header list is what lets the owner fix the file;
    // «no suppliers found» would not.
    expect(() => parseSupplierCsv('الهاتف,المدينة\n0500000001,الرياض\n')).toThrow(SupplierCsvError)
    expect(() => parseSupplierCsv('الهاتف,المدينة\n0500000001,الرياض\n')).toThrow(/الهاتف/)
  })

  it('refuses an empty file and a header-only file separately', () => {
    expect(() => parseSupplierCsv('   ')).toThrow(/فارغ/)
    expect(() => parseSupplierCsv(`${HEADERS}\n`)).toThrow(/بعد العناوين/)
  })
})
