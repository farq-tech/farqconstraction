import { useState } from 'react'
import type { NavProps } from '../types'
import { SUPPLIER_LIST } from '../data'
import { SearchIcon, PlusIcon, XIcon } from '../icons'

export function SupplierManagementView({ navigate }: NavProps) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(false)
  const [form, setForm] = useState({ name: '', city: '', phone: '', email: '', category: '', notes: '' })

  const filtered = SUPPLIER_LIST.filter(s =>
    s.name.includes(search) || s.city.includes(search) || s.category.includes(search)
  )

  const handleAdd = () => {
    if (!form.name.trim()) return
    setShowModal(false)
    setForm({ name: '', city: '', phone: '', email: '', category: '', notes: '' })
    setToast(true)
    setTimeout(() => setToast(false), 3000)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الموردون</h1>
          <p className="text-neutral-500 text-sm mt-1">{SUPPLIER_LIST.length} مورد في قاعدة البيانات</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          إضافة مورد
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الفئة أو المدينة…"
          className="w-full border border-neutral-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(s => (
          <button
            key={s.id}
            onClick={() => navigate('supplier-detail')}
            className="w-full bg-white border border-neutral-100 rounded-2xl px-5 py-4 hover:border-[#123F3A]/30 hover:shadow-sm transition-all text-right"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#f0faf7] flex items-center justify-center flex-shrink-0">
                <span className="text-[#123F3A] font-black text-base">{s.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-black text-[#0D1F1D] text-sm">{s.name}</span>
                  {s.manual && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#CFF5DC] text-[#1a7a45] font-bold">اختيارك</span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">{s.city} · {s.category}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-bold text-[#0D1F1D]">{s.interactions} تعاملات</div>
                <div className="text-[10px] text-neutral-400">{s.lastSeen}</div>
              </div>
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-neutral-500 font-semibold text-sm">لا يوجد موردون مطابقون</div>
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-black text-[#0D1F1D]">إضافة مورد جديد</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
                <XIcon className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {([
                ['name', 'اسم الشركة *', 'text', 'rtl'],
                ['city', 'المدينة', 'text', 'rtl'],
                ['phone', 'رقم الجوال', 'tel', 'ltr'],
                ['email', 'البريد الإلكتروني', 'email', 'ltr'],
                ['category', 'الفئة / التخصص', 'text', 'rtl'],
              ] as [keyof typeof form, string, string, string][]).map(([key, label, type, dir]) => (
                <div key={key}>
                  <label className="text-xs font-bold text-neutral-600 mb-1.5 block">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    dir={dir}
                    className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-neutral-600 mb-1.5 block">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#123F3A] transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleAdd}
                disabled={!form.name.trim()}
                className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                إضافة المورد
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#123F3A] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg animate-fade-up z-50">
          تمت إضافة المورد بنجاح.
        </div>
      )}
    </div>
  )
}
