import { useCallback, useRef, useState } from 'react'
import {
  commitSupplierImport,
  dryRunSupplierImport,
  SUPPLIER_IMPORT_CHUNK,
  type SupplierImportBatch,
  type SupplierImportInput,
  type SupplierImportOutcome,
  type SupplierImportResult,
} from '../api/constructionClient'
import { parseSupplierCsv, supplierCsvTemplate, SupplierCsvError } from '../lib/supplierImportCsv'
import { UploadIcon, XIcon } from '../icons'

/**
 * Upload a supplier list against a directory that already holds ~11.7k rows.
 *
 * The screen is deliberately two steps. Step one reads the file and asks the
 * API what it WOULD do; nothing is written. Step two commits exactly the plan
 * that was shown. Anything else — importing first and reporting after — makes a
 * bad list something the owner discovers rather than something he approves.
 */

type Stage = 'PICK' | 'PREVIEW' | 'DONE'

const OUTCOME_LABEL: Record<SupplierImportOutcome['outcome'], string> = {
  INSERT: 'جديد — سيُضاف',
  MATCH: 'موجود مسبقًا — لن يتغيّر',
  REJECT: 'مرفوض',
}

const MATCHED_ON_LABEL: Record<string, string> = {
  email: 'البريد الإلكتروني',
  whatsapp: 'رقم الواتساب',
  cr_number: 'السجل التجاري',
  name_city: 'الاسم والمدينة',
}

function outcomeStyle(outcome: SupplierImportOutcome['outcome']): string {
  if (outcome === 'INSERT') return 'bg-[#CFF5DC] text-[#1a7a45]'
  if (outcome === 'MATCH') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-700'
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size))
  return out
}

export function SupplierImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (batch: SupplierImportBatch | null) => void
}) {
  const [stage, setStage] = useState<Stage>('PICK')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [label, setLabel] = useState('')
  const [rows, setRows] = useState<SupplierImportInput[]>([])
  const [preview, setPreview] = useState<SupplierImportResult | null>(null)
  const [result, setResult] = useState<SupplierImportResult | null>(null)
  const [unreadable, setUnreadable] = useState<number[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const readFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        throw new SupplierCsvError(
          'ملفات Excel غير مدعومة هنا بعد. افتح الملف في Excel ثم «حفظ باسم» ← CSV UTF-8، وارفعه.',
        )
      }
      const parsed = parseSupplierCsv(await file.text())
      const mapped: SupplierImportInput[] = parsed.rows.map((row) => ({
        name_ar: row.name_ar || row.name_en,
        name_en: row.name_en || undefined,
        city: row.city || undefined,
        email: row.email || undefined,
        whatsapp: row.whatsapp || undefined,
        contact_name: row.contact_name || undefined,
        supplied_items: row.supplied_items || undefined,
        cr_number: row.cr_number || undefined,
      }))
      setFilename(file.name)
      setLabel((current) => current || file.name.replace(/\.[^.]+$/, ''))
      setRows(mapped)
      setUnreadable(parsed.unreadableRowNumbers)
      // Only the first chunk is previewed when a file exceeds the server cap;
      // saying so is better than silently planning part of the file.
      const plan = await dryRunSupplierImport(mapped.slice(0, SUPPLIER_IMPORT_CHUNK), {
        filename: file.name,
        label: file.name.replace(/\.[^.]+$/, ''),
      })
      setPreview(plan)
      setStage('PREVIEW')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة الملف.')
    } finally {
      setBusy(false)
    }
  }, [])

  const commit = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      let batchId: string | null = null
      let merged: SupplierImportResult | null = null
      for (const part of chunk(rows, SUPPLIER_IMPORT_CHUNK)) {
        const response = await commitSupplierImport(part, { filename, label, batchId })
        batchId = response.batch?.id || batchId
        merged = merged
          ? {
              ...response,
              row_count: merged.row_count + response.row_count,
              insert_count: merged.insert_count + response.insert_count,
              match_count: merged.match_count + response.match_count,
              reject_count: merged.reject_count + response.reject_count,
              rows: [...merged.rows, ...response.rows],
            }
          : response
      }
      setResult(merged)
      setStage('DONE')
      onImported(merged?.batch || null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الرفع.')
    } finally {
      setBusy(false)
    }
  }, [rows, filename, label, onImported])

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([supplierCsvTemplate()], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'نموذج-قائمة-موردين.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const shown = result || preview

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-black text-[#0D1F1D]">رفع قائمة موردين</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {stage === 'PICK'
                ? 'ملف CSV — سنعرض ما سيحدث قبل الحفظ'
                : stage === 'PREVIEW'
                  ? 'معاينة فقط — لم يُحفظ أي شيء بعد'
                  : 'تم الحفظ'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
            <XIcon className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {stage === 'PICK' && (
            <>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="w-full border-2 border-dashed border-neutral-200 rounded-2xl py-10 flex flex-col items-center gap-2 hover:border-[#123F3A]/40 hover:bg-[#f0faf7] transition-colors disabled:opacity-50"
              >
                <UploadIcon className="w-6 h-6 text-[#123F3A]" />
                <span className="font-bold text-sm text-[#0D1F1D]">
                  {busy ? 'جارٍ القراءة…' : 'اختر ملف CSV'}
                </span>
                <span className="text-[11px] text-neutral-400">
                  يدعم العربية وترميز UTF-8 وفواصل «,» و«؛»
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv,.tsv,.xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void readFile(file)
                }}
              />
              <div className="text-xs text-neutral-500 leading-relaxed">
                الأعمدة المقروءة: <span className="font-bold">اسم المورد</span> (مطلوب)، المدينة، النشاط
                (مطلوب)، البريد الإلكتروني، الجوال، اسم مسؤول التواصل، السجل التجاري. يلزم بريد أو جوال
                واحد على الأقل.
              </div>
              <button
                onClick={downloadTemplate}
                className="text-xs font-bold text-[#123F3A] hover:underline"
              >
                تنزيل نموذج جاهز
              </button>
            </>
          )}

          {(stage === 'PREVIEW' || stage === 'DONE') && shown && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['سيُضاف', shown.insert_count, 'text-[#1a7a45]'],
                  ['موجود مسبقًا', shown.match_count, 'text-amber-700'],
                  ['مرفوض', shown.reject_count, 'text-red-600'],
                ].map(([title, count, tone]) => (
                  <div key={String(title)} className="rounded-2xl bg-neutral-50 px-4 py-3 text-center">
                    <div className={`text-2xl font-black ${tone}`}>
                      {Number(count).toLocaleString('ar-SA')}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-semibold mt-0.5">{title}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-neutral-500">
                قرأنا {rows.length.toLocaleString('ar-SA')} صفًا من «{filename}». المطابقة تتم مقابل كل
                موردي حسابك، بعد توحيد الهمزة والألف والتاء المربوطة في الأسماء.
                {unreadable.length > 0 && (
                  <span className="text-amber-700 font-semibold">
                    {' '}
                    تعذّرت قراءة الصفوف: {unreadable.join('، ')}.
                  </span>
                )}
                {rows.length > SUPPLIER_IMPORT_CHUNK && stage === 'PREVIEW' && (
                  <span className="text-amber-700 font-semibold">
                    {' '}
                    المعاينة تغطي أول {SUPPLIER_IMPORT_CHUNK} صف؛ الحفظ يشمل الملف كاملًا ضمن نفس الدفعة.
                  </span>
                )}
              </div>

              {stage === 'DONE' && shown.batch && (
                <div className="rounded-2xl border border-[#CFF5DC] bg-[#f0faf7] px-4 py-3 text-sm">
                  <div className="font-black text-[#0D1F1D]">
                    الدفعة: {shown.batch.label || shown.batch.filename || shown.batch.id}
                  </div>
                  <div className="text-[11px] text-neutral-600 mt-1">
                    كل مورد أُضيف من هذا الملف يحمل علامة «مرفوع» ويمكن تصفيته أو التراجع عنه دفعة واحدة من
                    قائمة الدفعات.
                  </div>
                </div>
              )}

              <div className="border border-neutral-100 rounded-2xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto divide-y divide-neutral-50">
                  {shown.rows.map((row) => (
                    <div key={row.row_number} className="px-4 py-2.5 flex items-start gap-3">
                      <span className="text-[10px] text-neutral-400 font-mono pt-1 w-8 shrink-0">
                        {row.row_number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-[#0D1F1D] truncate">
                          {row.name || '—'}
                        </div>
                        {row.outcome === 'MATCH' && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            مطابق لـ «{row.matched_supplier_name}» عبر{' '}
                            {MATCHED_ON_LABEL[row.matched_on || ''] || row.matched_on}
                          </div>
                        )}
                        {row.outcome === 'REJECT' &&
                          (row.reasons || []).map((reason) => (
                            <div key={reason.code} className="text-[10px] text-red-600 mt-0.5">
                              {reason.message_ar}
                            </div>
                          ))}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${outcomeStyle(row.outcome)}`}
                      >
                        {OUTCOME_LABEL[row.outcome]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {stage === 'PREVIEW' && (
                <div>
                  <label className="text-xs font-bold text-neutral-600 mb-1.5 block">
                    اسم الدفعة (يظهر على كل مورد)
                  </label>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A]"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          {stage === 'PREVIEW' && (
            <>
              <button
                onClick={() => void commit()}
                disabled={busy || !preview || preview.insert_count + preview.match_count === 0}
                className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40"
              >
                {busy
                  ? 'جارٍ الحفظ…'
                  : `تأكيد وحفظ ${(preview?.insert_count || 0).toLocaleString('ar-SA')} مورد`}
              </button>
              <button
                onClick={() => {
                  setStage('PICK')
                  setPreview(null)
                  setRows([])
                }}
                className="px-5 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                ملف آخر
              </button>
            </>
          )}
          {stage !== 'PREVIEW' && (
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
            >
              {stage === 'DONE' ? 'تم' : 'إلغاء'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SupplierImportModal
