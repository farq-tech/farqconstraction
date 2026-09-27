/**
 * The supplier portal's frame, as in the Figma «Supplier / المورد» page:
 * PortalHeader (home / back), RequestTabs, BottomSheet, the small chips and
 * the outline icons (stroke 1.8, currentColor).
 */
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AccountIcon } from '../../icons'

type IconProps = { className?: string }

function Svg({ className = 'w-4 h-4', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Points right: «back» in a right-to-left screen. */
export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)
export const ChevronStartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)
export const PaperclipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 11.5l-8.1 8.1a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
  </Svg>
)
export const RetryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
  </Svg>
)
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Svg>
)
export const CheckDoubleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12.5l4.5 4.5L15 8.5M11 16l1 1 8.5-8.5" />
  </Svg>
)
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
  </Svg>
)
export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
)
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1115.1 3.7L20 20l-4.3-.9A8 8 0 014 12z" />
  </Svg>
)
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 118 0v3" />
  </Svg>
)
export const WifiOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.9a10 10 0 015.2-2.8M19 12.9a10 10 0 00-3-2M2 9a15 15 0 015-2.9M22 9a15 15 0 00-9.5-3.9M12 20h.01" />
  </Svg>
)
export const XSmallIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

// ─── Header ──────────────────────────────────────────────────────────────

type PortalHeaderProps = {
  title: string
  subtitle?: string | null
  /** `home`: the mint «ف» logo. `back`: an arrow that calls onBack. */
  kind: 'home' | 'back'
  onBack?: () => void
  /** Hidden after «ليس حسابي» (no account left to open). */
  onAccount?: (() => void) | null
}

export function PortalHeader({ title, subtitle, kind, onBack, onAccount }: PortalHeaderProps) {
  return (
    <header className="bg-[#123F3A] pt-[env(safe-area-inset-top)] sticky top-0 z-20">
      <div className="flex items-center justify-between gap-3 px-4 py-3 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          {kind === 'back' ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="-ms-1 w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <BackIcon className="w-[22px] h-[22px]" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#CFF5DC] flex items-center justify-center flex-shrink-0">
              <span className="text-[#123F3A] font-black text-sm">ف</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white font-bold text-[15px] truncate">{title}</div>
            {subtitle ? <div className="text-white/60 text-[11px] font-medium truncate">{subtitle}</div> : null}
          </div>
        </div>
        {onAccount ? (
          <button
            type="button"
            onClick={onAccount}
            aria-label="حسابي"
            className="w-9 h-9 flex-shrink-0 rounded-full bg-white/[0.14] text-white flex items-center justify-center hover:bg-white/20"
          >
            <AccountIcon className="w-5 h-5" />
          </button>
        ) : null}
      </div>
    </header>
  )
}

// ─── Tabs inside one request ─────────────────────────────────────────────

export type RequestTab = 'quote' | 'chat' | 'status'

const TABS: Array<{ key: RequestTab; label: string }> = [
  { key: 'quote', label: 'العرض' },
  { key: 'chat', label: 'المحادثة' },
  { key: 'status', label: 'حالة العرض' },
]

export function RequestTabs({
  active,
  onChange,
  unread,
  hidden = [],
}: {
  active: RequestTab
  onChange: (tab: RequestTab) => void
  unread: number
  hidden?: RequestTab[]
}) {
  return (
    <nav className="bg-white border-b border-neutral-100 sticky top-[calc(env(safe-area-inset-top)+60px)] z-10" role="tablist">
      <div className="flex h-11 items-end px-4 max-w-2xl mx-auto">
        {TABS.filter((tab) => !hidden.includes(tab.key)).map((tab) => {
          const on = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab.key)}
              className="flex-1 flex flex-col items-center gap-2 pt-2.5"
            >
              <span className="flex items-center gap-1.5">
                <span className={`text-[13px] ${on ? 'font-bold text-[#123F3A]' : 'font-semibold text-neutral-500'}`}>
                  {tab.label}
                </span>
                {tab.key === 'chat' && unread > 0 && (
                  <span className="rounded-full bg-[#123F3A] px-1.5 text-[10px] font-bold text-white" aria-label={`${unread} غير مقروءة`}>
                    {unread}
                  </span>
                )}
              </span>
              <span className={`h-[2.5px] w-full rounded-sm ${on ? 'bg-[#123F3A]' : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ─── Bottom sheet ────────────────────────────────────────────────────────

export function BottomSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-[#0D1F1D]/45" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-2xl bg-white px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+24px)] animate-fade-up">
        <div className="flex justify-center mb-3">
          <span className="h-1 w-10 rounded-full bg-neutral-200" />
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}

// ─── Buttons & chips ─────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full py-3.5 px-5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  className = '',
  small = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={
        small
          ? `px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-[#123F3A] disabled:opacity-40 ${className}`
          : `w-full py-3.5 px-5 bg-white border border-neutral-200 rounded-xl text-sm font-semibold text-neutral-600 disabled:opacity-40 ${className}`
      }
    >
      {children}
    </button>
  )
}

const CHIP_TONE = {
  mint: 'bg-[#DCF2E4] text-[#1a7a45]',
  farq: 'bg-[#e0efec] text-[#123F3A]',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  grey: 'bg-neutral-100 text-neutral-600',
} as const

export function Chip({
  tone,
  children,
  icon,
}: {
  tone: keyof typeof CHIP_TONE
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP_TONE[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border border-neutral-100 rounded-2xl p-4 ${className}`}>{children}</div>
}

export function Notice({ tone, children }: { tone: 'mint' | 'grey' | 'amber'; children: ReactNode }) {
  const cls =
    tone === 'mint'
      ? 'bg-[#F1FBF5] border-[#CFF5DC] text-[#1a7a45]'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-100 text-amber-800'
        : 'bg-white border-neutral-200 text-neutral-600'
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-[12px] font-semibold leading-relaxed ${cls}`}>
      <InfoIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
