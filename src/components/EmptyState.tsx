interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-black text-[#0D1F1D] mb-2">{title}</h2>
      {description ? (
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm hover:bg-[#1a5c54] transition-colors"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
