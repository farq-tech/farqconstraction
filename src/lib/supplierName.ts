/**
 * A supplier's name as the buyer should read it. Names arrive from scraped
 * sources with their residue: the channel they came from («مورد حراج»), the
 * «— الرقم البديل» suffix, HTML entities («&quot;»), a Google-Maps category
 * after a comma («, paint shop») and member placeholders («عضو 6 2772183»).
 * The site never names a channel, so all of that goes. Pure.
 */

/** Words a Google-Maps category is made of; a comma segment of only these is dropped. */
const CATEGORY_WORDS = new Set([
  'shop', 'shops', 'store', 'stores', 'company', 'co', 'corp', 'corporation', 'trading', 'trader', 'traders',
  'workshop', 'paint', 'paints', 'building', 'materials', 'material', 'supplier', 'suppliers', 'supply',
  'supplies', 'establishment', 'est', 'factory', 'hardware', 'contractor', 'contractors', 'electrical',
  'electric', 'electronics', 'plumbing', 'plumber', 'wholesaler', 'wholesale', 'retail', 'retailer', 'center',
  'centre', 'market', 'supermarket', 'home', 'goods', 'improvement', 'tool', 'tools', 'equipment', 'lighting',
  'construction', 'agency', 'office', 'warehouse', 'dealer', 'distributor', 'manufacturer', 'service',
  'services', 'and', 'of', 'the', 'general', 'business', 'industrial', 'sanitary', 'ware', 'tile', 'tiles',
  'ceramic', 'steel', 'glass', 'aluminum', 'aluminium', 'wood', 'furniture', 'decor', 'interior', 'designer',
  'fabrication', 'engineering', 'cement', 'concrete', 'lumber', 'yard', 'mall', 'outlet', 'showroom',
])

const DASHES = '\\-\u2010\u2011\u2012\u2013\u2014\u2015\u2212'
const EDGE_PUNCT = new RegExp(`^[\\s,\u060C${DASHES}.:;&"'\u00AB\u00BB|/]+|[\\s,\u060C${DASHES}.:;&"'\u00AB\u00BB|/]+$`, 'g')

function isCategory(segment: string): boolean {
  const s = segment.trim()
  if (!s || !/^[A-Za-z&.\s]+$/.test(s)) return false
  const words = s.toLowerCase().split(/[\s&.]+/).filter(Boolean)
  return words.length > 0 && words.every((w) => CATEGORY_WORDS.has(w))
}

/** Unbalanced or empty parentheses at the edges go; a real «(Easier Supply)» stays. */
function trimEdges(value: string): string {
  let s = value
  for (let i = 0; i < 10; i++) {
    const before = s
    s = s.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(EDGE_PUNCT, '')
    const open = (s.match(/\(/g) || []).length
    const close = (s.match(/\)/g) || []).length
    if (close > open && s.endsWith(')')) s = s.slice(0, -1)
    else if (open > close && s.startsWith('(')) s = s.slice(1)
    else if (open > close && s.endsWith('(')) s = s.slice(0, -1)
    else if (close > open && s.startsWith(')')) s = s.slice(1)
    if (s === before) break
  }
  return s.trim()
}

export function cleanSupplierName(raw: string | null | undefined): string | null {
  let s = String(raw ?? '')
  if (!s.trim()) return null

  // HTML-entity residue: «&quot;», «&amp;», and the bare «quot» / «amp» left behind.
  s = s
    .replace(/&amp;/gi, ' & ')
    .replace(/&(?:quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);?/gi, ' ')
    .replace(/(^|[^A-Za-z])(?:quot|amp)(?=$|[^A-Za-z])/gi, '$1 ')

  // «— الرقم البديل» (any dash before it), then the channel's name.
  s = s.replace(new RegExp(`\\s*[${DASHES}]?\\s*الرقم\\s+البديل`, 'g'), ' ')
  s = s.replace(/مورد\s+حراج/g, ' ')
  s = s.replace(/(^|[\s(,\u060C\-\u2013\u2014:])حراج(?=$|[\s),\u060C\-\u2013\u2014:])/g, '$1 ')

  s = s.replace(/\s+/g, ' ').trim()

  // A trailing English category after a comma: «لمسة فخامة, trading company».
  for (let i = 0; i < 3; i++) {
    const m = s.match(/^(.*\S)\s*[,\u060C]\s*([^,\u060C]*)$/)
    if (!m || !isCategory(m[2]!) || !/[\p{L}\p{N}]/u.test(m[1]!)) break
    s = m[1]!.trim()
  }

  // Commas in Arabic text read as «،».
  s = s.replace(/([\u0600-\u06FF])\s*,\s*/g, '$1، ')

  s = trimEdges(s)

  // Member placeholders: «عضو 6 2772183» → «مورد محادثة 2183»; «عضو ابو فاطمه» → «ابو فاطمه».
  const member = s.match(/^عضو\s*([\d\s\u0660-\u0669]+)$/)
  if (member) {
    const digits = member[1]!.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '')
    return digits ? `مورد محادثة ${digits.slice(-4)}` : null
  }
  s = s.replace(/^عضو\s+(?=\D)/, '')

  s = trimEdges(s)
  s = s.replace(/^[-–—\s]*\d+[-–—\s]+(?=[\p{L}])/u, '')
  if (/^\d{3,}[،,\s]/u.test(s)) return null
  if (!/[\p{L}]/u.test(s)) return null
  if (s === 'مورد' || s === 'عضو') return null
  return s
}
