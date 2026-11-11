import { describe, expect, it } from 'vitest'
import { purchaseScanFileKind, readCsvDraftRows } from './PurchaseScanReader'

describe('PurchaseScanReader CSV intake', () => {
  it('uses the shared BOQ file detection for CSV MIME aliases and parameters', () => {
    expect(purchaseScanFileKind({ name: 'attachment', type: 'application/csv' })).toBe('csv')
    expect(purchaseScanFileKind({ name: 'attachment', type: 'text/csv; charset=utf-8' })).toBe('csv')
  })

  it('preserves scan support for images and Excel downloads with generic MIME types', () => {
    expect(purchaseScanFileKind({ name: 'photo', type: 'image/jpeg' })).toBe('image')
    expect(purchaseScanFileKind({ name: 'materials.XLSX', type: 'application/octet-stream' })).toBe('xlsx')
    expect(purchaseScanFileKind({ name: 'spec.docx', type: 'application/octet-stream' })).toBe('unsupported')
  })

  it('reads CSV BOQ rows into the review draft shape', async () => {
    const file = new File(
      ['اسم البند,الكمية,الوحدة,المواصفة\nمواسير ضغط عالي,12,متر,PN16'],
      'مواد.csv',
      { type: 'text/csv' },
    )

    await expect(readCsvDraftRows(file)).resolves.toEqual([
      { name: 'مواسير ضغط عالي', qty: '12', unit: 'متر', spec: 'PN16' },
    ])
  })

  it('rejects an empty CSV instead of opening an empty request', async () => {
    const file = new File(['اسم البند,الكمية,الوحدة\n'], 'فارغ.csv', {
      type: 'text/csv',
    })

    await expect(readCsvDraftRows(file)).rejects.toThrow(
      'لم نجد بنودًا قابلة للقراءة في ملف CSV.',
    )
  })
})
