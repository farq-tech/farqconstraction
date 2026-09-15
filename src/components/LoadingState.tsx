interface LoadingStateProps {
  label?: string
}

export default function LoadingState({ label = "جاري التحميل…" }: LoadingStateProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16" role="status" aria-live="polite">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded-xl bg-neutral-200/80" />
        <div className="h-4 w-full rounded-lg bg-neutral-100" />
        <div className="h-4 w-5/6 rounded-lg bg-neutral-100" />
        <div className="mt-8 space-y-3">
          <div className="h-24 rounded-2xl bg-white border border-neutral-100" />
          <div className="h-24 rounded-2xl bg-white border border-neutral-100" />
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-neutral-500 font-medium">{label}</p>
    </div>
  )
}
