/**
 * «الاسم الدارج بالسوق»: the name suppliers use for a booklet line. It is shown
 * BESIDE the booklet's own text and never replaces it. A line without one reads
 * exactly as before.
 */

const ARABIC = /[ء-ي]/

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/**
 * The booklet's own text for a request line. `original_name` is what the
 * booklet printed; when it has no Arabic letter and `name_ar` does (request 580
 * arrived with an English original_name), the Arabic text is the one shown.
 */
export function bookletText(line: Record<string, unknown> | null | undefined): string {
  const original = clean(line?.original_name)
  const arabic = clean(line?.name_ar)
  if (original && !ARABIC.test(original) && ARABIC.test(arabic)) return arabic
  return original || arabic
}

/** A request line's market name, or '' when it has none (or it only repeats the booklet text). */
export function lineMarketName(line: Record<string, unknown> | null | undefined): string {
  const market = clean(line?.market_name_ar)
  if (!market) return ''
  const booklet = clean(line?.booklet_name_ar) || bookletText(line)
  return market === booklet ? '' : market
}
