/* throwaway: what does bigram Dice actually score on the pairs that matter, and
   what does a root-consonant skeleton score on the pairs that must NOT match. */
const norm = (s) => s
const bigrams = (s) => {
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}
const dice = (a, b) => {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return (2 * inter) / (a.size + b.size)
}
const LONG_VOWEL = /[اويى]/g
const skeleton = (s) => s.replace(LONG_VOWEL, '')

const same = [
  ['حريق', 'حرايق'],
  ['لوح', 'الواح'],
  ['لوحه', 'لوحات'],
  ['كابل', 'كابلات'],
  ['ماسوره', 'مواسير'],
  ['عمود', 'اعمده'],
  ['خزان', 'خزانات'],
  ['باب', 'ابواب'],
  ['حجر', 'احجار'],
  ['طوب', 'اطواب'],
]
const different = [
  ['ارض', 'ارضيات'],
  ['بلاط', 'بلوط'],
  ['خزان', 'خزانه'],
  ['كبل', 'كابل'],
  ['حديد', 'حداد'],
  ['عزل', 'عازل'],
  ['مياه', 'ميه'],
  ['رشاش', 'رشح'],
  ['دهان', 'دهن'],
  ['بلك', 'بلوك'],
  ['سلك', 'سلوك'],
  ['قاطع', 'قطاع'],
  ['موتور', 'مواتر'],
  ['خشب', 'خشاب'],
]
const row = (a, b) => {
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  const d = dice(bigrams(short), bigrams(long))
  const sa = skeleton(a)
  const sb = skeleton(b)
  const skelEq = sa === sb && sa.length >= 2
  const skelDice = dice(bigrams(sa.length <= sb.length ? sa : sb), bigrams(sa.length <= sb.length ? sb : sa))
  return `${a} / ${b}\tdice ${d.toFixed(3)}\tskel ${sa}/${sb} eq=${skelEq ? 'Y' : 'n'} skeldice ${Number.isNaN(skelDice) ? '-' : skelDice.toFixed(3)}`
}
console.log('--- SAME LEXEME (want a match) ---')
for (const [a, b] of same) console.log(row(a, b))
console.log('\n--- DIFFERENT PRODUCT (must NOT match) ---')
for (const [a, b] of different) console.log(row(a, b))
