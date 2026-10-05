/**
 * The Farq wordmark as the brand file draws it, tinted by `bg-*`: the artwork is
 * a mask, so one file serves a light header and a dark one without a second
 * export and without ever re-drawing the letters.
 */
export default function FarqWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="فرق"
      className={`inline-block aspect-[1564/648] ${className}`}
      style={{
        WebkitMaskImage: 'url(/brand/farq-wordmark.png)',
        maskImage: 'url(/brand/farq-wordmark.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        // A mask prints as nothing unless the tint is forced into print.
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    />
  )
}
