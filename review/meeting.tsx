import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import BookletQuickComparison from '../src/components/BookletQuickComparison'
import { buildBookletMatrix } from '../src/lib/booklet'
import { PR580 } from '../src/lib/homeOverview.fixture'
const example = structuredClone(PR580)
example.matrix[0].offers.forEach(o => { o.prices_include_tax = false })
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl p-4" dir="rtl"><div className="mb-4 rounded-xl bg-[#123F3A] p-5 text-white"><h1 className="text-2xl font-black">مقارنة عروض الكراسة</h1><p className="mt-2 text-sm">معاينة تصميم ببيانات اختبار — لا تنفذ إرسالًا أو ترسية</p></div><div className="rounded-xl bg-white border border-neutral-200"><BookletQuickComparison matrix={buildBookletMatrix(example)} onOpenRequest={() => { document.getElementById('result')!.textContent = 'انتقال مراجعة الطلب — لم تنفذ ترسية' }} /></div><div id="result" className="p-4 text-[#123F3A]" /></main>)
