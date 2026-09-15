interface RetryStateProps {
  title: string
  description?: string
  onRetry: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}

export default function RetryState({
  title,
  description,
  onRetry,
  secondaryLabel,
  onSecondary,
}: RetryStateProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-10" role="alert">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-right">
        <h2 className="text-base font-black text-amber-900 mb-1">{title}</h2>
        {description ? (
          <p className="text-sm text-amber-800/80 leading-relaxed mb-4">{description}</p>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm hover:bg-[#1a5c54] transition-colors"
          >
            إعادة المحاولة
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="px-4 py-2.5 border border-neutral-200 text-neutral-600 font-semibold rounded-xl text-sm hover:bg-white transition-colors"
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
