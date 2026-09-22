/**
 * FARQ TASEER seller outreach — individuals, not Construction RFQ voice.
 */
export function offerLink(token: string, origin = 'http://127.0.0.1:5173'): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/s/${encodeURIComponent(token)}`
}

export function taseerSellerMessage(need: string, link: string): string {
  const product = need.replace(/\s+/g, ' ').trim()
  if (!product) throw new TypeError('need is required')
  if (!link.trim()) throw new TypeError('offer link is required')
  return [
    `السلام عليكم عزيزي البائع لدينا عميل يرغب في : ${product} في حال توفرها الرجاء الضغط على الرابط ادناه لتقديم العرض وفي حال عندكم استفسار الرجاء الرد على الرسالة وسوف يتم الرد عليك`,
    '',
    link.trim(),
  ].join('\n')
}
