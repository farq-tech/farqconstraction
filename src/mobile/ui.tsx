import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Brand tokens for the iPhone surface. */
export const BRAND = '#123F3A'
export const INK = '#0D1F1D'

/** Load once, reload on demand; the last good data stays while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fn()
      if (alive.current) setData(next)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'تعذّر التحميل.')
    } finally {
      if (alive.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    alive.current = true
    void run()
    return () => {
      alive.current = false
    }
  }, [run])
  return { data, error, loading, reload: run, setData }
}

/** A screen with an iOS-style header: large title at the root, compact with a back button when pushed. */
export function Screen({
  title,
  subtitle,
  onBack,
  action,
  children,
  footer,
  large = !onBack,
}: {
  title: string
  subtitle?: ReactNode
  onBack?: () => void
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  large?: boolean
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-30 bg-[#f2f3ef]/90 backdrop-blur-xl border-b border-black/[0.04] m-safe-top">
        <div className="h-12 px-2 flex items-center gap-1">
          {onBack ? (
            <button onClick={onBack} className="h-10 px-2 flex items-center gap-1 text-[#123F3A] font-semibold text-[16px]" aria-label="رجوع">
              <span className="text-[26px] leading-none -mt-0.5">›</span>
              <span>رجوع</span>
            </button>
          ) : (
            <span className="w-2" />
          )}
          <div className={`flex-1 min-w-0 text-center font-bold text-[16px] text-[#0D1F1D] truncate ${large ? 'invisible' : ''}`}>{title}</div>
          <div className="min-w-[60px] flex justify-end px-2">{action}</div>
        </div>
      </header>
      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] m-fade">
        {large && (
          <div className="pt-1 pb-4">
            <h1 className="text-[30px] font-black text-[#0D1F1D] leading-tight">{title}</h1>
            {subtitle && <div className="text-[14px] text-neutral-500 mt-1">{subtitle}</div>}
          </div>
        )}
        {!large && subtitle && <div className="pt-3 pb-1 text-[13px] text-neutral-500">{subtitle}</div>}
        {children}
      </main>
      {footer}
    </div>
  )
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const cls = `bg-white rounded-2xl shadow-[0_1px_2px_rgba(13,31,29,0.06)] ${className}`
  return onClick ? (
    <button onClick={onClick} className={`${cls} block w-full text-right m-press active:bg-neutral-50`}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mt-6 mb-2 px-1">
      <h2 className="text-[13px] font-bold text-neutral-500">{children}</h2>
      {action}
    </div>
  )
}

/** A tappable row inside a grouped list. */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  chevron = Boolean(onClick),
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  chevron?: boolean
}) {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
      {leading}
      <div className="flex-1 min-w-0 text-right">
        <div className="text-[15px] font-semibold text-[#0D1F1D] leading-snug">{title}</div>
        {subtitle && <div className="text-[13px] text-neutral-500 mt-0.5 leading-snug">{subtitle}</div>}
      </div>
      {trailing}
      {chevron && <span className="text-neutral-300 text-[22px] leading-none">‹</span>}
    </div>
  )
  return onClick ? (
    <button onClick={onClick} className="block w-full active:bg-neutral-100 transition-colors">
      {body}
    </button>
  ) : (
    body
  )
}

export function Group({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-2xl overflow-hidden divide-y divide-neutral-100 shadow-[0_1px_2px_rgba(13,31,29,0.06)]">{children}</div>
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  // The first letter of the first meaningful word, without «ال»: «الجزيرة» → «ج».
  const words = (name || '').trim().split(/\s+/).filter((w) => !/^(مؤسسة|شركة|مصنع|محل|مكتب|مجموعة|مبسط)$/.test(w))
  const word = (words[0] || name || '؟').replace(/^ال(?=..)/, '')
  const letter = word.charAt(0) || '؟'
  const palette = ['#E3F1EA', '#E8EEF8', '#F6EEDF', '#F3E6EE', '#E6F0F0']
  const ink = ['#1a7a45', '#2f5aa8', '#9a6a12', '#9b3b6c', '#2b6d6d']
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const i = h % palette.length
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center font-bold"
      style={{ width: size, height: size, background: palette[i], color: ink[i], fontSize: size * 0.42 }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' }) {
  const cls = {
    neutral: 'bg-neutral-100 text-neutral-600',
    brand: 'bg-[#e0efec] text-[#123F3A]',
    good: 'bg-[#CFF5DC] text-[#1a7a45]',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-700',
  }[tone]
  return <span className={`inline-flex items-center shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' | 'good' }) {
  const color = tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-[#1a7a45]' : 'text-[#0D1F1D]'
  return (
    <div className="min-w-0">
      <div className={`text-[17px] font-black tabular-nums leading-tight ${color}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">{label}</div>
    </div>
  )
}

export function Progress({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${p}%` }} />
      </div>
      <span className="text-[12px] font-bold text-[#0D1F1D] tabular-nums w-10 text-left">{label ?? `${p}%`}</span>
    </div>
  )
}

/** Horizontal, swipeable segmented chips. */
export function Chips<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 m-scroll-x">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`shrink-0 whitespace-nowrap px-4 h-9 rounded-full text-[13px] font-bold transition-colors ${
            value === v ? 'bg-[#123F3A] text-white' : 'bg-white text-neutral-600 shadow-[0_1px_2px_rgba(13,31,29,0.06)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="py-16 px-6 text-center">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-[#123F3A] text-2xl shadow-[0_1px_2px_rgba(13,31,29,0.06)]">◌</div>
      <div className="font-bold text-[16px] text-[#0D1F1D]">{title}</div>
      {body && <p className="text-[14px] text-neutral-500 mt-1 leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 my-3">
      <div className="text-[14px] font-bold text-amber-900">تعذّر التحميل</div>
      <p className="text-[13px] text-amber-800 mt-0.5 leading-relaxed">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-[13px] font-bold text-[#123F3A]">
          إعادة المحاولة
        </button>
      )}
    </div>
  )
}

export function Skeleton({ rows = 4, height = 72 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white/70 rounded-2xl" style={{ height }} />
      ))}
    </div>
  )
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-12 rounded-2xl bg-[#123F3A] text-white font-bold text-[16px] px-5 disabled:opacity-40 m-press ${className}`}
    >
      {children}
    </button>
  )
}

/** Bottom sheet. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 inset-x-0 bg-white rounded-t-[28px] max-h-[85dvh] overflow-y-auto m-sheet"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white pt-2 pb-3 px-5">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-neutral-200" />
          {title && <div className="mt-3 font-black text-[18px] text-[#0D1F1D]">{title}</div>}
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>
  )
}

export function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function sar(value: unknown): string {
  return `${num(value).toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`
}

/** «منذ ٥ د» style relative time for lists. */
export function ago(value?: string | null): string {
  if (!value) return ''
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} د`
  const h = Math.round(m / 60)
  if (h < 24) return `قبل ${h} س`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'أمس' : `قبل ${d} أيام`
  return new Date(t).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' })
}

/** Hours → «ساعتان و١٠ د»; «—» when nothing was measured. */
export function duration(hours?: string | number | null): string {
  const h = Number(hours)
  if (hours == null || !Number.isFinite(h) || h < 0) return '—'
  const minutes = Math.round(h * 60)
  if (minutes < 60) return `${minutes} د`
  if (minutes < 1440) return `${Math.round(minutes / 60)} س`
  return `${Math.round(minutes / 1440)} يوم`
}
