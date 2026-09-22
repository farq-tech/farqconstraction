const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹'
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g

export function toAsciiDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch)
    if (ai >= 0) {
      out += String(ai)
      continue
    }
    const pi = EXT_ARABIC_INDIC.indexOf(ch)
    if (pi >= 0) {
      out += String(pi)
      continue
    }
    out += ch
  }
  return out
}

export function normalize(input: string): string {
  if (!input) return ''
  return toAsciiDigits(input)
    .replace(DIACRITICS, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
