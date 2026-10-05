/** The market name under a booklet line, for the buyer's screens. Nothing when there is none. */
export default function MarketNameNote({ name, className = '' }: { name?: string | null; className?: string }) {
  const text = String(name || '').trim()
  if (!text) return null
  return (
    <div className={`text-[11px] leading-relaxed text-[#123F3A] break-words ${className}`}>
      <span className="text-neutral-500">الاسم الدارج بالسوق: </span>
      {text}
    </div>
  )
}
