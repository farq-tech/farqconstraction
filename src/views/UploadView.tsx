import { useState, useRef } from 'react'
import type { NavProps } from '../types'
import { UploadIcon, CheckIcon } from '../icons'

const STAGES = [
  { id: 'open',    label: 'فتح الملف',          delay: 600 },
  { id: 'read',    label: 'قراءة البنود',         delay: 1600 },
  { id: 'analyze', label: 'فهم المواصفات',        delay: 2800 },
  { id: 'match',   label: 'البحث عن الموردين',   delay: 4200 },
]

type Phase = 'idle' | 'processing' | 'done' | 'error' | 'partial-error'

export function UploadView({ navigate }: NavProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [fileName, setFileName] = useState('')
  const [completedStages, setCompletedStages] = useState<string[]>([])
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [recognized, setRecognized] = useState(0)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const runProcessing = (name: string, outcome: Phase = 'done') => {
    setFileName(name)
    setPhase('processing')
    setCompletedStages([])
    setActiveStage(STAGES[0].id)
    setRecognized(0)
    setProgress(0)

    STAGES.forEach((stage, i) => {
      setTimeout(() => {
        setActiveStage(stage.id)
        if (i > 0) setCompletedStages(prev => [...prev, STAGES[i - 1].id])
      }, stage.delay)
    })

    const countTarget = outcome === 'partial-error' ? 61 : 65
    const countInterval = setInterval(() => {
      setRecognized(prev => {
        if (prev >= countTarget) { clearInterval(countInterval); return countTarget }
        return prev + Math.floor(Math.random() * 4) + 1
      })
    }, 180)

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const limit = outcome === 'error' ? 35 : 90
        if (prev >= limit) { clearInterval(progressInterval); return limit }
        return prev + 2
      })
    }, 120)

    const finalDelay = outcome === 'error' ? 2800 : 5600
    setTimeout(() => {
      clearInterval(countInterval)
      clearInterval(progressInterval)
      if (outcome === 'error') {
        setProgress(35)
        setPhase('error')
      } else {
        setCompletedStages(STAGES.map(s => s.id))
        setActiveStage(null)
        setRecognized(countTarget)
        setProgress(100)
        setPhase(outcome)
      }
    }, finalDelay)
  }

  const reset = () => {
    setPhase('idle')
    setFileName('')
    setCompletedStages([])
    setActiveStage(null)
    setRecognized(0)
    setProgress(0)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#0D1F1D] mb-2">ارفع الكراسة</h1>
        <p className="text-neutral-500">ارفع ملف الكراسة وسيقرأ فرق البنود تلقائيًا</p>
      </div>

      {/* Idle: Upload zone */}
      {phase === 'idle' && (
        <>
          <div
            className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
              dragging ? 'border-[#123F3A] bg-[#f0faf7]' : 'border-neutral-200 bg-white hover:border-[#123F3A]/40'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) runProcessing(f.name) }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) runProcessing(f.name) }}
            />
            <div className="flex flex-col items-center py-20 px-8">
              <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
                <UploadIcon className="w-8 h-8 text-[#123F3A]" />
              </div>
              <div className="text-xl font-bold mb-2 text-[#0D1F1D]">اختر ملفًا</div>
              <p className="text-neutral-400 text-sm mb-6 text-center">اسحب الملف أو اضغط للاختيار</p>
              <div className="flex gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">PDF</span>
                <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">Excel</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 items-center">
            <button onClick={() => runProcessing('كراسة مشروع تجديد مبنى إداري.pdf')} className="text-sm text-[#123F3A] font-semibold hover:underline">
              أو جرب كراسة تجريبية
            </button>
            <div className="flex gap-4">
              <button onClick={() => runProcessing('كراسة_ناقصة.xlsx', 'partial-error')} className="text-xs text-neutral-400 hover:text-amber-600 transition-colors">
                جرب خطأ جزئي
              </button>
              <button onClick={() => runProcessing('ملف_تالف.pdf', 'error')} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">
                جرب خطأ كامل
              </button>
            </div>
          </div>
        </>
      )}

      {/* Processing / Done / Partial-error */}
      {(phase === 'processing' || phase === 'done' || phase === 'partial-error') && (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden animate-fade-up">
          {/* File info */}
          <div className="px-6 pt-6 pb-4 border-b border-neutral-50 flex items-center gap-4">
            <div className="w-10 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-xs font-bold">{fileName.endsWith('.xlsx') ? 'XLS' : 'PDF'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0D1F1D] text-sm truncate">{fileName}</div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {phase === 'processing' ? 'جاري المعالجة…' : phase === 'done' ? 'اكتملت المعالجة' : 'اكتملت المعالجة مع تحذيرات'}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-[#0D1F1D]">
                {phase === 'processing' ? 'فرق يقرأ الكراسة…' : phase === 'done' ? 'تمت قراءة الكراسة' : 'تمت القراءة — بعض البنود تحتاج مراجعة'}
              </span>
              <span className="text-sm font-bold text-[#123F3A]">{progress}%</span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all duration-300 ${phase === 'partial-error' ? 'bg-amber-500' : 'bg-[#123F3A]'}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-3">
              {STAGES.map(stage => {
                const done = completedStages.includes(stage.id)
                const active = activeStage === stage.id
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      done ? 'bg-[#123F3A]' : active ? 'border-2 border-[#123F3A]' : 'border-2 border-neutral-200'
                    }`}>
                      {done && <CheckIcon className="w-3 h-3 text-white" />}
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-[#123F3A] animate-pulse-dot" />}
                    </div>
                    <span className={`text-sm ${
                      done ? 'text-[#0D1F1D] font-medium' : active ? 'text-[#123F3A] font-semibold' : 'text-neutral-400'
                    }`}>{stage.label}</span>
                  </div>
                )
              })}
            </div>

            {phase === 'processing' && recognized > 0 && (
              <div className="mt-4 text-sm text-neutral-500 animate-fade-up">
                تم التعرف على <span className="font-bold text-[#123F3A]">{Math.min(recognized, 37)}</span> بندًا
              </div>
            )}
          </div>

          {/* Done summary */}
          {phase === 'done' && (
            <div className="px-6 pb-6 animate-fade-up">
              <div className="bg-[#f0faf7] rounded-xl p-4 mb-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">65</div>
                    <div className="text-xs text-neutral-500 mt-0.5">بندًا قابلًا للتوريد</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-amber-600">4</div>
                    <div className="text-xs text-neutral-500 mt-0.5">تحتاج مراجعة</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">92</div>
                    <div className="text-xs text-neutral-500 mt-0.5">موردًا وجدهم فرق</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('create-proposals')}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
              >
                عرض الموردين المقترحين
              </button>
            </div>
          )}

          {/* Partial error summary */}
          {phase === 'partial-error' && (
            <div className="px-6 pb-6 animate-fade-up">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-2 mb-3">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                  <span className="text-xs font-bold text-amber-700">تعذّر قراءة 4 بنود من 65</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">61</div>
                    <div className="text-xs text-neutral-600 mt-0.5">بند تمت قراءته</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-amber-600">4</div>
                    <div className="text-xs text-neutral-600 mt-0.5">بنود يدوية</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">86</div>
                    <div className="text-xs text-neutral-600 mt-0.5">موردًا وجدهم فرق</div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('create-proposals')}
                  className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
                >
                  المتابعة مع 61 بندًا
                </button>
                <button
                  onClick={reset}
                  className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
                >
                  رفع ملف آخر
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full error */}
      {phase === 'error' && (
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden animate-fade-up">
          <div className="px-6 pt-6 pb-4 border-b border-neutral-50 flex items-center gap-4">
            <div className="w-10 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-xs font-bold">{fileName.endsWith('.xlsx') ? 'XLS' : 'PDF'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0D1F1D] text-sm truncate">{fileName}</div>
              <div className="text-xs text-red-500 mt-0.5">تعذّرت القراءة</div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-5">
              <div className="h-full bg-red-400 rounded-full" style={{ width: '35%' }} />
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-4 mb-5">
              <div className="text-sm font-bold text-red-700 mb-1">تعذّرت قراءة الملف</div>
              <div className="text-xs text-red-600 leading-relaxed">
                يبدو أن الملف تالف أو بصيغة غير مدعومة. يرجى التحقق من أن الملف بصيغة PDF أو Excel ويمكن فتحه.
              </div>
            </div>
            <div className="space-y-2">
              <button
                onClick={reset}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
              >
                رفع ملف آخر
              </button>
              <button
                onClick={() => navigate('home')}
                className="w-full py-3 border border-neutral-200 text-neutral-600 font-semibold rounded-xl hover:bg-neutral-50 transition-colors text-sm"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
