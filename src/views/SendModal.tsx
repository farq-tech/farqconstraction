import { useState } from 'react'
import { XIcon } from '../icons'

interface SendModalProps {
  readyItems: number
  totalSuppliers: number
  searchingItems: number
  onSend: () => void
  onClose: () => void
}

export function SendModal({ readyItems, totalSuppliers, searchingItems, onSend, onClose }: SendModalProps) {
  const [deadline, setDeadline] = useState('16 سبتمبر 2026')
  const [editingDeadline, setEditingDeadline] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl animate-fade-up mx-auto">
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-[#0D1F1D]">جاهز للإرسال</h2>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Summary */}
          <div className="bg-[#f0faf7] rounded-2xl p-4 mb-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-black text-[#123F3A]">{readyItems}</div>
                <div className="text-xs text-neutral-500 mt-0.5">بندًا</div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#123F3A]">{totalSuppliers}</div>
                <div className="text-xs text-neutral-500 mt-0.5">موردًا</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-600">{searchingItems}</div>
                <div className="text-xs text-neutral-500 mt-0.5">قيد البحث</div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500">موقع التسليم</span>
              <span className="text-sm font-semibold text-[#0D1F1D]">الرياض</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500">موعد الاستلام</span>
              {editingDeadline ? (
                <input
                  type="text"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  onBlur={() => setEditingDeadline(false)}
                  className="text-sm font-semibold text-[#0D1F1D] border-b border-[#123F3A] outline-none text-right bg-transparent"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditingDeadline(true)}
                  className="text-sm font-semibold text-[#0D1F1D] hover:text-[#123F3A] transition-colors"
                >
                  {deadline} <span className="text-[#123F3A] text-xs font-medium">(تعديل)</span>
                </button>
              )}
            </div>
          </div>

          {searchingItems > 0 && (
            <div className="bg-amber-50 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
              {searchingItems} بنود سيواصل فرق البحث عنها ولن تُرسل الآن.
            </div>
          )}

          {/* Actions */}
          <button
            onClick={onSend}
            className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm mb-2"
          >
            إرسال الآن
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-neutral-500 font-semibold text-sm hover:text-neutral-700 transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
