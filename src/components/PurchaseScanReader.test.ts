import { describe, expect, it } from 'vitest'
import { readCsvDraftRows } from './PurchaseScanReader'

describe('PurchaseScanReader CSV intake', () => {
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
