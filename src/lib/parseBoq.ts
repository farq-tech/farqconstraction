import type { BOQItem, Supplier } from '../types'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import type { BoqWorkProgress } from './boqEta'
import {
  extractBoqTable,
  foldPdfText,
  pageTextRows,
  unreadableCount,
  type BoqTableResult,
  type PdfGlyph,
} from './boqPdfTable'

function normalizeAr(text: string): string {
  // NFKC first: printed Etimad booklets arrive as Arabic Presentation Forms-B
  // (U+FB50–U+FEFF), where `ﺣﺪﻳﺪي` is not `حديدي` and every gate below misses.
  return String(text || '')
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[×*]/g, 'x')
    .toLowerCase()
}

function cityLabel(city: unknown): string {
  if (!city) return 'المملكة العربية السعودية'
  if (typeof city === 'string') return city.trim() || 'المملكة العربية السعودية'
  if (typeof city === 'object' && city !== null) {
    const o = city as { original?: string; key?: string }
    return String(o.original || o.key || '').trim() || 'المملكة العربية السعودية'
  }
  return 'المملكة العربية السعودية'
}

export type ParsedLine = {
  id: number
  name: string
  qty: string
  unit: string
  spec?: string
}

const UNIT_NORMALIZE: Record<string, string> = {
  'متر مربع': 'م²',
  'مربع متر': 'م²',
  'م2': 'م²',
  'م 2': 'م²',
  م٢: 'م²',
  'متر طولي': 'م ط',
  'طولي متر': 'م ط',
  'متر طولى': 'م ط',
  حبة: 'عدد',
  قطعة: 'عدد',
  مجموعة: 'مجموعة',
  م3: 'م³',
  'م 3': 'م³',
  طن: 'طن',
  جهاز: 'جهاز',
  وحدة: 'وحدة',
  طقم: 'طقم',
  كيس: 'كيس',
  عبوة: 'عبوة',
  زوج: 'زوج',
  لفة: 'لفة',
  صندوق: 'صندوق',
  رخصة: 'رخصة',
}

/** Units that appear in Farq test كراسات (مستودع / مركز بيانات / مواقع). */
const BOQ_UNIT_ALT =
  'طن|عدد|وحدة|طقم|كيس|عبوة|زوج|لفة|صندوق|حبة|قطعة|جهاز|رخصة|اشتراك|حزمة|لتر|كجم|متر\\s*طولي|م\\s*ط|م\\s*[23²³]|م[²³]'

/** Page chrome that must never be treated as a BOQ category. */
const BOQ_HEADER_CATEGORY_RE =
  /غير\s*رسمية|كراسة|اختبارية|صفحة|بيانات\s*اختبار|فرق\s*للبناء|توريد\s*فقط|نموذج\s*كراسة/

/**
 * Curated جدول الكميات for ONE known Etimad PDF (صالة الانتظار) whose text
 * extract is badly bidi-scrambled. Must NEVER be applied to other كراسات.
 * Exported only for isolation regression tests.
 */
export const ETIMAD_WAITING_HALL_BOQ: ParsedLine[] = [
  { id: 1, name: 'أعمال الهدم والازالة', qty: '1,200', unit: 'م²' },
  { id: 2, name: 'توريد وتركيب أرضيات بورسلين', qty: '800', unit: 'م²', spec: 'رمز إنشائي 2041' },
  { id: 3, name: 'توريد وتركيب أرضيات رخام', qty: '30', unit: 'م²' },
  { id: 4, name: 'توريد وتركيب نعلات', qty: '90', unit: 'م ط', spec: 'رمز إنشائي 2041' },
  { id: 5, name: 'أعمال الدهان', qty: '500', unit: 'م²', spec: 'رمز إنشائي 2048' },
  { id: 6, name: 'أعمال الأسقف الجبسية', qty: '250', unit: 'م²', spec: 'رمز إنشائي 2045' },
  { id: 7, name: 'أعمال الأسقف المستعارة', qty: '240', unit: 'م²' },
  { id: 8, name: 'قواطع جيبسوم بورد', qty: '70', unit: 'م²', spec: 'رمز إنشائي 2045' },
  { id: 9, name: 'قواطع زجاجية', qty: '265', unit: 'م²' },
  { id: 10, name: 'تجليد أعمدة م 3.5', qty: '13', unit: 'عدد' },
  { id: 11, name: 'تجليد أعمدة م 2.4', qty: '12', unit: 'عدد' },
  { id: 12, name: 'تجليد أعمدة م 7 مقاس 65×65', qty: '4', unit: 'عدد' },
  { id: 13, name: 'تجليد أعمدة م 7 مقاس 65×150', qty: '4', unit: 'عدد' },
  { id: 14, name: 'توريد وتركيب كاونتر خشب', qty: '1', unit: 'عدد' },
  { id: 15, name: 'توريد وتركيب شرائح خشبية', qty: '9', unit: 'م ط' },
  { id: 16, name: 'توريد وتركيب طاولات', qty: '10', unit: 'عدد' },
  { id: 17, name: 'أعمال الدرابزين', qty: '100', unit: 'م ط' },
  { id: 18, name: 'ألعاب أطفال', qty: '1', unit: 'مجموعة' },
  { id: 19, name: 'أرضيات مطاطية', qty: '10', unit: 'م²' },
  { id: 20, name: 'دواليب طفايات حريق', qty: '1', unit: 'عدد' },
  { id: 21, name: 'قشرة لباب غرفة الكهرباء', qty: '1', unit: 'عدد' },
  { id: 22, name: 'جلي رخام', qty: '700', unit: 'م²' },
  { id: 23, name: 'سويتشات مخارج المعلومات', qty: '1', unit: 'عدد' },
  { id: 24, name: 'توريد وتركيب أحواض زراعة م 1.5', qty: '13', unit: 'عدد' },
  { id: 25, name: 'توريد وتركيب أحواض زراعة م 5', qty: '2', unit: 'عدد' },
  { id: 26, name: 'توريد وتركيب شجيرات ظل', qty: '15', unit: 'عدد' },
  { id: 27, name: 'كيابل نحاس 2.5 ملم', qty: '200', unit: 'م ط', spec: 'رمز إنشائي 2094' },
  { id: 28, name: 'كيابل نحاس 4 ملم', qty: '50', unit: 'م ط', spec: 'رمز إنشائي 2094' },
  { id: 29, name: 'كيابل نحاس 35 ملم', qty: '20', unit: 'م ط', spec: 'رمز إنشائي 2094' },
  { id: 30, name: 'توريد وتركيب وحدة إضاءة متعددة المناسيب', qty: '1', unit: 'عدد', spec: 'رمز إنشائي 2087' },
  { id: 31, name: 'توريد وتركيب إضاءة 60×60', qty: '158', unit: 'عدد', spec: 'رمز إنشائي 2087' },
  { id: 32, name: 'توريد وتركيب إضاءة 10×30', qty: '90', unit: 'عدد', spec: 'رمز إنشائي 2087' },
  { id: 33, name: 'توريد وتركيب سبوت لايت', qty: '24', unit: 'عدد', spec: 'رمز إنشائي 2087' },
  { id: 34, name: 'توريد وتركيب شريط ليد', qty: '640', unit: 'م ط', spec: 'رمز إنشائي 2087' },
  { id: 35, name: 'توريد وتركيب لوحة كهرباء', qty: '1', unit: 'عدد', spec: 'رمز إنشائي 2096' },
  { id: 36, name: 'توريد وتركيب مخارج كهرباء', qty: '65', unit: 'عدد' },
  { id: 37, name: 'توريد وتركيب مخارج كهرباء مع USB', qty: '80', unit: 'عدد' },
  { id: 38, name: 'توريد وتركيب مخارج معلومات', qty: '48', unit: 'عدد' },
  { id: 39, name: 'توريد وتركيب مخرج مكيف', qty: '25', unit: 'م ط' },
  { id: 40, name: 'توريد وتركيب كواشف دخان', qty: '4', unit: 'عدد' },
  { id: 41, name: 'توريد وتركيب سماعة سقف', qty: '5', unit: 'عدد' },
  { id: 42, name: 'توريد وتركيب نظام الاستدعاء الرقمي', qty: '1', unit: 'عدد' },
  { id: 43, name: 'توريد وتركيب مجرى سحب هواء', qty: '60', unit: 'م²', spec: 'رمز إنشائي 2079' },
  { id: 44, name: 'توريد وتركيب مجرى تغذية الهواء', qty: '60', unit: 'م²', spec: 'رمز إنشائي 2079' },
  { id: 45, name: 'توريد وتركيب مجاري هواء مرنة', qty: '100', unit: 'م ط', spec: 'رمز إنشائي 2079' },
]

function normalizeUnit(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  return UNIT_NORMALIZE[t] || t
}

function formatQty(n: number | string): string {
  const num = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''))
  if (!Number.isFinite(num)) return String(n)
  return num.toLocaleString('en-US')
}

/** Fix common bidi-reversed Arabic fragments from PDF text extract. */
function fixArabicName(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  // Drop trailing yes/no / code leftovers from Etimad tables
  s = s.replace(/\s*(نعم|لا)\s*\d{0,6}\s*$/g, '').trim()
  s = s.replace(/\s+\d{3,5}$/g, '').trim()

  const known: [RegExp, string][] = [
    [/هدم|ازال/, 'أعمال الهدم والازالة'],
    [/بورسل|ارضيات.*بورس|بورس.*ارض/, 'توريد وتركيب أرضيات بورسلين'],
    [/رخام.*ارض|ارض.*رخام/, 'توريد وتركيب أرضيات رخام'],
    [/نعل/, 'توريد وتركيب نعلات'],
    [/دهان/, 'أعمال الدهان'],
    [/جبس.*اسقف|اسقف.*جبس/, 'أعمال الأسقف الجبسية'],
    [/مستعار/, 'أعمال الأسقف المستعارة'],
    [/جيبسوم|جبسوم.*قواط/, 'قواطع جيبسوم بورد'],
    [/زجاج.*قواط|قواط.*زجاج/, 'قواطع زجاجية'],
    [/درابز/, 'أعمال الدرابزين'],
    [/اطفال|العاب/, 'ألعاب أطفال'],
    [/مطاط/, 'أرضيات مطاطية'],
    [/طفاي|حريق/, 'دواليب طفايات حريق'],
    [/كهرباء.*غرفة|قشرة/, 'قشرة لباب غرفة الكهرباء'],
    [/جلي/, 'جلي رخام'],
    [/سويت|معلومات.*مخارج/, 'سويتشات مخارج المعلومات'],
    [/زراعة|احواض/, 'توريد وتركيب أحواض زراعة'],
    [/شجير|ظل/, 'توريد وتركيب شجيرات ظل'],
    [/كيابل|كابل|نحاس/, 'كيابل نحاس'],
    [/اضاء|إنارة|انارة|سبوت|لايت|ليد/, 'توريد وتركيب إضاءة'],
    [/لوحة.*كهرب|كهرباء.*لوح/, 'توريد وتركيب لوحة كهرباء'],
    [/مخرج.*كهرب|كهرباء.*مخرج/, 'توريد وتركيب مخارج كهرباء'],
    [/مكيف/, 'توريد وتركيب مخرج مكيف'],
    [/دخان|كواشف/, 'توريد وتركيب كواشف دخان'],
    [/سماع/, 'توريد وتركيب سماعة سقف'],
    [/استدعاء/, 'توريد وتركيب نظام الاستدعاء الرقمي'],
    [/سحب.*هواء|هواء.*سحب/, 'توريد وتركيب مجرى سحب هواء'],
    [/تغذية.*هواء|هواء.*تغذية/, 'توريد وتركيب مجرى تغذية الهواء'],
    [/مرن.*هواء|هواء.*مرن|مجاري/, 'توريد وتركيب مجاري هواء مرنة'],
    [/كاونتر|خشب/, 'توريد وتركيب كاونتر خشب'],
    [/شرائح/, 'توريد وتركيب شرائح خشبية'],
    [/طاول/, 'توريد وتركيب طاولات'],
    [/تجليد|اعمدة/, 'تجليد أعمدة'],
  ]

  for (const [re, name] of known) {
    if (re.test(s)) return name
  }
  return s
}

/** Generic Etimad/كراسة shape — shared by many unrelated tenders. */
export function looksLikeEtimadBoq(text: string): boolean {
  return (
    /جدول\s*الكميات|الكميات\s*جدول|كراسة\s*الشروط|منافسة\s*مشروع/i.test(text) ||
    (text.includes('البند') && text.includes('الكمية') && text.includes('الوحدة'))
  )
}

/**
 * Strong fingerprint for the waiting-hall booklet only.
 * Generic Etimad markers alone are NOT enough (cybersecurity / other كراسات
 * also contain جدول الكميات and كراسة الشروط).
 */
export function looksLikeWaitingHallBoq(text: string): boolean {
  const t = String(text || '')
  if (!t.trim()) return false
  const hall =
    /صالات?\s*الانتظار|تجديد\s*وتحديث\s*صالات|منافسة\s*مشروع\s*تجديد\s*وتحديث\s*صالات/i.test(t) ||
    /2020\s*\/\s*382441/.test(t)
  if (!hall) return false
  // Require at least one distinctive waiting-hall line signal so a title-only
  // hit cannot pull the curated 45-line fixture into another document.
  return /بورسلين|ارضيات\s*رخام|الاسقف\s*الجبسيه|الاسقف\s*الجبسية|مجاري\s*هواء|سبوت\s*لايت|شريط\s*ليد/i.test(
    normalizeAr(t),
  )
}

function shortenBoqName(name: string): string {
  let s = name.replace(/\s+/g, ' ').trim()
  s = s.replace(/[،,.\s]+$/g, '').trim()
  const cut = s.search(/[。.]\s/)
  if (cut >= 24 && cut <= 110) s = s.slice(0, cut).trim()
  if (s.length > 110) s = `${s.slice(0, 107).trim()}…`
  return s
}

/**
 * Farq test booklet shape A (مستودع تشغيل):
 *   م | الفئة | البند (توريد…) | المواصفة | الوحدة | الكمية
 * Flattened PDF text: `1 الهياكل المعدنية توريد قطاع حديد … طن 5`
 */
export function parseSupplyFarqTestBoq(text: string): ParsedLine[] {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const isValidCategory = (category: string): boolean => {
    const cat = category.replace(/\s+/g, ' ').trim()
    if (cat.length < 3 || cat.length > 48) return false
    if (BOQ_HEADER_CATEGORY_RE.test(cat) || /^غير/.test(cat)) return false
    if (/^\d/.test(cat)) return false
    // Spec fragments leaking into "category" (e.g. "مم PIR … 19 غلاف")
    if (/\d{2,}\s|\s\d{2,}/.test(cat) && !/\bUPS\b/i.test(cat)) return false
    const ar = (cat.match(/[\u0600-\u06FF]/g) || []).length
    const compact = cat.replace(/\s+/g, '')
    if (ar < 3) return false
    if (compact.length > 0 && ar / compact.length < 0.45) return false
    return true
  }

  // Anchor on each "توريد", then look back for "ID category" — avoids page-number
  // false starts that truncate the previous item before its unit/qty.
  const toridRe = /توريد\s+/g
  const beforeRe =
    /(\d{1,3})\s+([\u0600-\u06FF][\u0600-\u06FFA-Za-z0-9\s&/+._-]{1,48})$/
  const trailingIdCatRe =
    /\s+\d{1,3}\s+[\u0600-\u06FF][\u0600-\u06FFA-Za-z0-9\s&/+._-]{1,48}$/
  const unitQtyRe = new RegExp(
    String.raw`^(.*)\s+(${BOQ_UNIT_ALT})\s+([\d,]+(?:\.\d+)?)\s*$`,
    'i',
  )

  type Start = { id: number; toridAt: number }
  const starts: Start[] = []
  let m: RegExpExecArray | null
  while ((m = toridRe.exec(flat))) {
    const before = flat.slice(Math.max(0, m.index - 72), m.index)
    const bm = before.match(beforeRe)
    if (!bm) continue
    const id = Number(bm[1])
    if (!Number.isFinite(id) || id < 1 || id > 500) continue
    if (!isValidCategory(bm[2] || '')) continue
    starts.push({ id, toridAt: m.index })
  }

  const found = new Map<number, ParsedLine>()
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!
    if (found.has(start.id)) continue
    const end = i + 1 < starts.length ? starts[i + 1]!.toridAt : flat.length
    // Slice runs up to the next توريد, so it still holds "UNIT QTY ID category".
    let chunk = flat.slice(start.toridAt, end).trim()
    chunk = chunk.replace(trailingIdCatRe, '').trim()
    const tm = chunk.match(unitQtyRe)
    if (!tm) continue
    const name = shortenBoqName(tm[1] || '')
    if (name.length < 5 || !/^توريد(?:\s|$)/.test(name)) continue
    found.set(start.id, {
      id: start.id,
      name,
      qty: formatQty(tm[3]!),
      unit: normalizeUnit(String(tm[2] || 'عدد')),
    })
  }
  return [...found.values()].sort((a, b) => a.id - b.id)
}

/**
 * Farq test booklet shape B (مركز بيانات / مواقع):
 *   `001 DC- الفئة توريد … 12 جهاز 002 DC- …`
 * Quantity precedes unit.
 */
export function parseCodedFarqTestBoq(text: string): ParsedLine[] {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const re = new RegExp(
    String.raw`(\d{3})\s+(DC|SITE)-\s*([\u0600-\u06FF][\u0600-\u06FFA-Za-z0-9\s&/+._-]{1,60}?)\s+(توريد\s+.+?)\s+([\d,]+)\s+(${BOQ_UNIT_ALT})(?=\s+\d{3}\s+(?:DC|SITE)-|$)`,
    'gi',
  )
  const found = new Map<number, ParsedLine>()
  let m: RegExpExecArray | null
  while ((m = re.exec(flat))) {
    const id = Number(m[1])
    if (!Number.isFinite(id) || id < 1) continue
    const name = shortenBoqName(m[4] || '')
    if (name.length < 5) continue
    if (found.has(id)) continue
    found.set(id, {
      id,
      name,
      qty: formatQty(m[5]!),
      unit: normalizeUnit(String(m[6] || 'عدد')),
    })
  }
  return [...found.values()].sort((a, b) => a.id - b.id)
}

/**
 * Parse Farq-generated test كراسات from flattened PDF text.
 * Prefer coded (DC/SITE) when present; otherwise supply-table (مستودع).
 */
export function parseFarqTestBoqText(text: string): ParsedLine[] {
  const coded = parseCodedFarqTestBoq(text)
  if (coded.length >= 5) return coded
  const supply = parseSupplyFarqTestBoq(text)
  if (supply.length >= 5) return supply
  return coded.length >= supply.length ? coded : supply
}

function parseLinesFromText(text: string, remapWaitingHallNames = false): ParsedLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const found = new Map<number, ParsedLine>()
  const cleanName = (raw: string) => {
    const trimmed = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!trimmed) return ''
    // Remap only for the known waiting-hall PDF (bidi scramble). Other كراسات
    // must keep their own extracted names — never inherit صالة الانتظار labels.
    return remapWaitingHallNames ? fixArabicName(trimmed) : trimmed
  }

  // Pattern: leading id, description, quantity, unit (tabs or multi-space)
  const rowRe =
    /^(\d{1,3})[\s\t|]+(.+?)[\s\t|]+([\d,]+\.?\d*)[\s\t|]+(متر\s*مربع|مربع\s*متر|متر\s*طولي|طولي\s*متر|حبة|قطعة|مجموعة|طن|م[²³23]|م\s*ط|عدد|وحدة|طقم|كيس|عبوة|زوج|جهاز)(?:\s|$)/i

  for (const line of lines) {
    const m = line.match(rowRe)
    if (!m) continue
    const id = Number(m[1])
    if (!Number.isFinite(id) || id < 1 || id > 500) continue
    const name = cleanName(m[2] || '')
    if (name.length < 3) continue
    found.set(id, {
      id,
      name,
      qty: formatQty(m[3]!),
      unit: normalizeUnit(m[4]!),
    })
  }

  // Looser fallback: "N  description  QTY"
  if (found.size < 3) {
    const loose =
      /^(\d{1,3})[\s\t]+(.{4,80}?)[\s\t]+([\d,]{1,7})(?:\s|$)/
    for (const line of lines) {
      if (/صفحة|قسم|الفهرس|المملكة/.test(line)) continue
      const m = line.match(loose)
      if (!m) continue
      const id = Number(m[1])
      if (found.has(id) || id < 1 || id > 200) continue
      const name = cleanName(m[2]!)
      if (!/[\u0600-\u06FF]/.test(name)) continue
      found.set(id, { id, name, qty: formatQty(m[3]!), unit: 'عدد' })
    }
  }

  // Farq test كراسات (مستودع / DC / SITE) flatten to one stream — dedicated parsers.
  if (!remapWaitingHallNames) {
    const farqTest = parseFarqTestBoqText(text)
    if (farqTest.length > found.size) return farqTest
  }

  return [...found.values()].sort((a, b) => a.id - b.id)
}

/** Image-only / scan PDF — local pdf.js has no text layer to read. */
export const PDF_SCAN_NO_TEXT =
  'الملف صورة ممسوحة بلا نص — ارفع PDF نصي أو استخدم كراسة قابلة للنسخ'

/** Shown when the local pdf.js leg stops responding instead of failing. */
export const PDF_EXTRACT_TIMEOUT =
  'تعذّرت قراءة الملف خلال المدة المتوقعة — أعد المحاولة، أو ارفع صفحات جدول الكميات وحدها'

/** Backstop for the local pdf.js leg. Real booklets measure ~10ms/صفحة. */
const CLIENT_EXTRACT_TIMEOUT_MS = 60_000

/** Real work stages, so the UI never has to guess from a timer. */
export type BoqParseStage = 'open' | 'read' | 'analyze' | 'match'
export type BoqParseProgress = (stage: BoqParseStage) => void

const noWork: BoqWorkProgress = () => {}

/**
 * Hand the main thread back mid-loop so a countdown built on these ticks can
 * actually repaint. Without it the ranking stage is one blocking block: the
 * screen would show a stale number for the whole stage and then jump, which is
 * indistinguishable from the frozen bar this screen used to have.
 */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/** Cap the number of yields so a 10,219-line booklet does not pay for 400 of them. */
function chunkSize(total: number): number {
  return Math.max(16, Math.ceil(total / 48))
}

/**
 * Mirrors `CATALOG_FETCH_TIMEOUT_MS` in `api/constructionSuppliers` (45s), which
 * is module-private there. Only used to tell the owner the ceiling on a wait we
 * cannot measure from the inside — never to drive control flow.
 */
const CATALOG_FETCH_CAP_MS = 45_000

/**
 * Reject a leg that neither resolves nor rejects. `Promise.race` leaves the
 * loser pending, which is fine — it holds no UI state.
 */
async function withDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isPdfScanNoTextError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'PDF_SCAN_NO_TEXT') {
    return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return msg === PDF_SCAN_NO_TEXT || /لا نص في الصفحات|صورة ممسوحة بلا نص|PDF_TEXT_REQUIRED|بلا طبقة نص/.test(msg)
}

function pdfScanNoTextError(): Error {
  return Object.assign(new Error(PDF_SCAN_NO_TEXT), { code: 'PDF_SCAN_NO_TEXT' as const })
}

/** What one PDF read yields: flattened text for the text parsers, plus the
 * column-aware table when the document actually carries one. */
export type PdfExtract = {
  text: string
  table: BoqTableResult | null
}

async function extractPdfText(file: File, work: BoqWorkProgress = noWork): Promise<PdfExtract> {
  // Keep a master copy — pdf.js workers transfer/detach the ArrayBuffer passed as `data`.
  const master = new Uint8Array(await file.arrayBuffer())
  if (!master.byteLength) {
    throw new Error('ملف PDF فارغ (0 بايت)')
  }

  const errors: string[] = []

  const collectText = async (
    getDocument: (src: unknown) => {
      promise: Promise<{
        numPages: number
        getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>
      }>
    },
  ): Promise<{ text: string; table: BoqTableResult | null; empty: boolean }> => {
    // A retry on the legacy engine restarts this leg: the new engine has its own
    // speed, so any rate measured from the first one is void.
    work({ kind: 'start', leg: 'extract', unit: 'page', capMs: CLIENT_EXTRACT_TIMEOUT_MS })
    // Fresh clone per attempt so a prior worker transfer cannot break the next engine.
    const data = master.slice()
    const doc = await getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0,
    }).promise
    // Page count is only knowable after the document opens, so it arrives as a
    // zero-progress tick rather than being guessed from the file size.
    work({ kind: 'tick', leg: 'extract', done: 0, total: doc.numPages })
    const parts: string[] = []
    const pages: Array<{ page: number; glyphs: PdfGlyph[] }> = []
    let lastTickAt = 0
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      // Positions, not just strings: this booklet's table has no drawn column
      // rules, so x is the only thing that tells a quantity from a structural
      // code, and y is the only thing that tells one item from the next.
      const glyphs: PdfGlyph[] = []
      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue
        const cell = item as { str?: unknown; width?: unknown; transform?: unknown }
        const str = String(cell.str ?? '')
        if (!str) continue
        const transform = Array.isArray(cell.transform) ? (cell.transform as number[]) : null
        glyphs.push({
          str,
          x: Number(transform?.[4] ?? 0),
          y: Number(transform?.[5] ?? 0),
          width: Number(cell.width ?? 0),
        })
      }
      pages.push({ page: pageNum, glyphs })
      // One line per visual row. A page-per-line stream made every anchored row
      // pattern fail, which is why a real 68-item booklet read as zero items.
      for (const line of pageTextRows(glyphs)) parts.push(line)
      // Real booklets run a few ms/page, so every page would be a wasted render.
      const at = Date.now()
      if (pageNum === doc.numPages || at - lastTickAt >= 120) {
        lastTickAt = at
        work({ kind: 'tick', leg: 'extract', done: pageNum, total: doc.numPages })
      }
    }
    work({ kind: 'end', leg: 'extract' })
    const text = parts.join('\n')
    work({ kind: 'start', leg: 'table', unit: 'page' })
    const table = extractBoqTable(pages)
    work({ kind: 'tick', leg: 'table', done: pages.length, total: pages.length })
    work({ kind: 'end', leg: 'table' })
    return { text, table: table.rows.length || table.issues.length ? table : null, empty: !text.trim() }
  }

  // 1) Modern build + Vite-resolved worker URL (fixes Figma Make / preview worker 404).
  try {
    const pdfjs = await import('pdfjs-dist')
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      const workerSrc = typeof workerMod === 'string' ? workerMod : String((workerMod as { default?: string }).default || '')
      if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    } catch (e) {
      errors.push(`worker-url: ${e instanceof Error ? e.message : String(e)}`)
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
      } catch (e2) {
        errors.push(`worker-fallback: ${e2 instanceof Error ? e2.message : String(e2)}`)
      }
    }
    const result = await collectText((src) => pdfjs.getDocument(src as never))
    if (result.empty) throw pdfScanNoTextError()
    return { text: result.text, table: result.table }
  } catch (e) {
    // Loaded fine but no glyphs — legacy will not invent a text layer; surface scan error.
    if (isPdfScanNoTextError(e)) throw e
    errors.push(`pdfjs-dist: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2) Legacy build — more tolerant in constrained iframes / Node-like hosts.
  // Only reached on worker/load failures; always use a fresh buffer clone.
  try {
    const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs')
    try {
      const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
      const workerSrc =
        typeof workerMod === 'string' ? workerMod : String((workerMod as { default?: string }).default || '')
      if (workerSrc) legacy.GlobalWorkerOptions.workerSrc = workerSrc
    } catch {
      /* legacy may run without a dedicated worker in some hosts */
    }
    const result = await collectText((src) => legacy.getDocument(src as never))
    if (result.empty) throw pdfScanNoTextError()
    return { text: result.text, table: result.table }
  } catch (e) {
    if (isPdfScanNoTextError(e)) throw e
    errors.push(`pdfjs-legacy: ${e instanceof Error ? e.message : String(e)}`)
  }

  throw new Error(`تعذّر استخراج نص PDF (${errors.join(' | ')})`)
}

async function extractPlainText(file: File, work: BoqWorkProgress = noWork): Promise<PdfExtract> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file, work)
  }
  // Excel/CSV fallback: read as text (works for simple CSV exports). One blob
  // read with no progress to report — declared opaque rather than faked.
  // These archives are a different shape entirely: standard encoding, one item
  // per line, named headers. They keep the text path, untouched by the columns.
  work({ kind: 'start', leg: 'extract', opaque: true, capMs: CLIENT_EXTRACT_TIMEOUT_MS })
  try {
    return { text: await file.text(), table: null }
  } finally {
    work({ kind: 'end', leg: 'extract' })
  }
}

/** Cap UI proposals so a 10k+ directory response cannot freeze the tab. */
const MATCH_SUPPLIERS_PER_LINE = 8
/** Client-side fallback only scores against this many directory rows. */
const MATCH_CATALOG_SCORE_CAP = 2_500
/** Prefer Farq BOQ match for at most this many lines (API max is 200). */
const MATCH_API_LINE_CAP = 80

function scoreSupplier(hay: string, needles: string[]): number {
  let score = 0
  const normHay = normalizeAr(hay)
  for (const n of needles) {
    const nn = normalizeAr(n)
    if (nn && normHay.includes(nn)) score += 2
  }
  return score
}

function lineKeyFor(line: ParsedLine): string {
  return `line-${line.id}`
}

function mapApiSuppliers(
  rows: Array<{
    id: string
    name_ar?: string
    name_en?: string
    city?: unknown
    evidence?: string
    channel?: string
  }>,
): Supplier[] {
  return rows
    .slice(0, MATCH_SUPPLIERS_PER_LINE)
    .map((s, i) => {
      const evidence: Supplier['evidence'] =
        s.evidence === 'دليل مباشر' ||
        s.evidence === 'نشاط متطابق' ||
        s.evidence === 'دليل منتج' ||
        s.evidence === 'اختيارك'
          ? s.evidence
          : i < 3
            ? 'نشاط متطابق'
            : 'دليل منتج'
      const channel: Supplier['channel'] =
        s.channel === 'واتساب' ? 'واتساب' : s.channel === 'حراج' ? 'حراج' : 'بريد'
      return {
        id: s.id,
        name: String(s.name_ar || s.name_en || s.id).trim(),
        city: cityLabel(s.city),
        evidence,
        channel,
      }
    })
}

/** Result of the remote match, with its failure kept instead of swallowed. */
type RemoteMatch = {
  hits: Map<string, { farqSpecId?: string | null; suppliers: Supplier[] }>
  /** Set when the request itself failed, so the screen can stop looking normal. */
  error?: string
}

async function matchViaFarqBoqApi(
  lines: ParsedLine[],
  work: BoqWorkProgress = noWork,
): Promise<RemoteMatch> {
  const out = new Map<string, { farqSpecId?: string | null; suppliers: Supplier[] }>()
  if (!lines.length) return { hits: out }
  let error: string | undefined
  try {
    const { matchConstructionBoqCatalog, CONSTRUCTION_BOQ_MATCH_TIMEOUT_MS } = await import(
      '../api/constructionClient'
    )
    // One request, one response: the API reports no intermediate progress, so
    // this leg can only be bounded by its own timeout, never measured.
    work({
      kind: 'start',
      leg: 'match-remote',
      opaque: true,
      capMs: CONSTRUCTION_BOQ_MATCH_TIMEOUT_MS,
      lines: lines.length,
    })
    const matched = await matchConstructionBoqCatalog({
      lines: lines.slice(0, MATCH_API_LINE_CAP).map((line) => ({
        line_key: lineKeyFor(line),
        name_ar: line.name,
        quantity: Number(String(line.qty).replace(/,/g, '')) || 1,
        uom: line.unit || 'عدد',
        spec: line.spec,
      })),
    })
    for (const row of matched.rows || []) {
      out.set(row.line_key, {
        farqSpecId: row.farq_spec_id,
        suppliers: mapApiSuppliers(row.suppliers || []),
      })
    }
  } catch (err) {
    // Local keyword matching still runs, but a failed match is a fact about the
    // result and is reported, not hidden: a silent `catch` here left the screen
    // looking like a normal successful read.
    error = err instanceof Error ? err.message : String(err)
    console.warn('Farq BOQ match API failed — falling back to local keyword match', err)
  } finally {
    work({ kind: 'end', leg: 'match-remote' })
  }
  return { hits: out, error }
}

export async function matchSuppliersForItems(
  lines: ParsedLine[],
  opts: { onWork?: BoqWorkProgress } = {},
): Promise<{
  items: BOQItem[]
  catalogLoaded: boolean
  /** Remote match request failure, if any — surfaced, never swallowed. */
  matchApiError?: string
}> {
  const work = opts.onWork ?? noWork
  const cleanLines = sanitizeBoqLines(lines)
  const remote = await matchViaFarqBoqApi(cleanLines, work)
  const apiHits = remote.hits

  let catalog: Awaited<ReturnType<typeof listConstructionSuppliers>>['suppliers'] = []
  let catalogLoaded = false
  // ~6MB directory behind a 60s in-memory TTL: the second read of a session is
  // free and the first is a single download with no progress events.
  work({ kind: 'start', leg: 'match-catalog', opaque: true, capMs: CATALOG_FETCH_CAP_MS })
  try {
    const result = await listConstructionSuppliers({
      limit: MATCH_CATALOG_SCORE_CAP,
      offset: 0,
      contactableOnly: true,
    })
    catalog = result.suppliers
      .slice(0, MATCH_CATALOG_SCORE_CAP)
    catalogLoaded = catalog.length > 0
  } catch (err) {
    catalog = []
    catalogLoaded = false
    // `catalogLoaded: false` already reaches the screen; the reason should too.
    console.warn('Supplier directory unavailable — local keyword match will be weak', err)
  } finally {
    work({ kind: 'end', leg: 'match-catalog' })
  }

  // Intent → shared pool (one catalog scan per unique intent), then per-line rank.
  // The leg opens before the dynamic import so the chunk load and the intent
  // resolution are attributed to it, instead of leaving the screen in a gap with
  // no named stage at all.
  work({ kind: 'start', leg: 'match-pools', unit: 'pool', lines: cleanLines.length })
  const {
    resolveProcurementIntentBatch,
    scoreSupplierAgainstProfile,
  } = await import('./procurementIntentEngine')
  const batch = resolveProcurementIntentBatch(
    cleanLines.map((line) => ({ id: line.id, name: line.name })),
  )
  // Pool count is a product of intent resolution, so it arrives as a zero tick.
  work({ kind: 'tick', leg: 'match-pools', done: 0, total: batch.pools.length })
  const poolSuppliers = new Map<string, typeof catalog>()
  const poolChunk = chunkSize(batch.pools.length)
  let poolsDone = 0
  for (const pool of batch.pools) {
    const scored = catalog
      .map((s) => {
        const hay = `${s.name} ${s.category} ${s.activity || ''} ${s.city}`
        const { score, vetoed } = scoreSupplierAgainstProfile(hay, {
          intent: pool.intent,
          domain: pool.domain,
          type: 'product',
          search_terms: pool.search_terms,
          supplier_archetypes: pool.supplier_archetypes,
          exclude: pool.exclude,
          confidence: 1,
          source: 'dictionary',
          raw: pool.intent,
        })
        return { s, score, vetoed }
      })
      .filter((x) => !x.vetoed && x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s)
    poolSuppliers.set(pool.pool_key, scored)
    poolsDone += 1
    if (poolsDone % poolChunk === 0 || poolsDone === batch.pools.length) {
      work({ kind: 'tick', leg: 'match-pools', done: poolsDone, total: batch.pools.length })
      await yieldToUi()
    }
  }
  work({ kind: 'end', leg: 'match-pools' })

  const profileByLineId = new Map(
    batch.lines.map((row) => [row.line_id, row.profile]),
  )

  work({ kind: 'start', leg: 'match-rank', unit: 'line', total: cleanLines.length, lines: cleanLines.length })
  const lineChunk = chunkSize(cleanLines.length)
  const items: BOQItem[] = []
  for (const line of cleanLines) {
    const api = apiHits.get(lineKeyFor(line))
    const apiSuppliers = api?.suppliers || []
    const profile = profileByLineId.get(String(line.id))
    const poolKey =
      profile && profile.intent !== 'unknown'
        ? profile.intent
        : `line:${line.id}`
    const pooled = poolSuppliers.get(poolKey) || []

    // Per-line re-rank within the shared intent pool (apply line profile again).
    const ranked = (profile
      ? pooled
          .map((s) => {
            const hay = `${s.name} ${s.category} ${s.activity || ''} ${s.city}`
            const { score, vetoed } = scoreSupplierAgainstProfile(hay, profile)
            return { s, score, vetoed }
          })
          .filter((x) => !x.vetoed && x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.s)
      : pooled)

    // Fallback: if pool empty and profile unknown, soft token score (still not raw-only dump).
    const fallbackNeedles =
      profile?.search_terms?.length
        ? profile.search_terms
        : normalizeAr(line.name)
            .split(/\s+/)
            .filter((w) => w.length >= 3)
            .slice(0, 4)
    const fallback =
      ranked.length > 0
        ? []
        : catalog
            .map((s) => {
              const hay = `${s.name} ${s.category} ${s.activity || ''} ${s.city}`
              if (profile && scoreSupplierAgainstProfile(hay, profile).vetoed) {
                return { s, score: 0 }
              }
              return { s, score: scoreSupplier(hay, fallbackNeedles) }
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.s)

    const catalogSource = ranked.length > 0 ? ranked : fallback
    const seen = new Set(apiSuppliers.map((s) => s.id))
    const catalogExtras: Supplier[] = catalogSource
      .filter((s) => !seen.has(s.id))
      .slice(0, Math.max(0, MATCH_SUPPLIERS_PER_LINE - apiSuppliers.length))
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        evidence: (i < 3 ? 'نشاط متطابق' : 'دليل منتج') as Supplier['evidence'],
        channel: (s.hasEmail ? 'بريد' : 'واتساب') as Supplier['channel'],
      }))

    const suppliers = [...apiSuppliers, ...catalogExtras].slice(0, MATCH_SUPPLIERS_PER_LINE)

    items.push({
      id: line.id,
      name: line.name,
      qty: line.qty,
      unit: line.unit,
      spec: line.spec,
      status: suppliers.length > 0 ? ('ready' as const) : ('searching' as const),
      supplierCount: suppliers.length,
      suppliers,
      farqSpecId: api?.farqSpecId || undefined,
      lineKey: lineKeyFor(line),
    })

    if (items.length % lineChunk === 0 || items.length === cleanLines.length) {
      work({ kind: 'tick', leg: 'match-rank', done: items.length, total: cleanLines.length })
      await yieldToUi()
    }
  }
  work({ kind: 'end', leg: 'match-rank' })

  return { items, catalogLoaded, matchApiError: remote.error }
}

export type ParseBoqResult = {
  items: BOQItem[]
  projectName: string
  /** Content-hash / upload identity — lines are bound to this document only. */
  documentId: string
  source: 'pdf-table' | 'pdf-text' | 'waiting-hall-curated' | 'empty'
  rawLineCount: number
  /** True when Farq API was unreachable / returned no directory during match. */
  matchDegraded?: boolean
  matchWarning?: string
  /** True when the supplier-match request itself failed (not the directory). */
  matchApiFailed?: boolean
  matchApiError?: string
  /**
   * Items the booklet itself numbers, when it numbers them. `read` is what we
   * produced. Unequal means a partial read, and the caller must say so with the
   * count: returning 31 of 68 lines as though they were the booklet is what
   * turned a parser defect into wrong RFQs instead of a visible error.
   */
  expectedLineCount?: number | null
  unreadableLineCount?: number
  /** Arabic, user-facing reasons — one per item we could not read. */
  readIssues?: string[]
  /** Tables found in the document that were deliberately not read as items. */
  skippedTables?: string[]
}

/** SHA-256 hex of file bytes — stable document identity for this upload. */
export async function hashDocumentId(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Node / test fallback without subtle crypto
  let h = 0
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) h = (Math.imul(31, h) + bytes[i]!) | 0
  return `doc-${(h >>> 0).toString(16)}-${bytes.length}`
}

/**
 * Pure line-selection for one upload. Never reuses a previous document's lines.
 * The waiting-hall curated list applies only when this document fingerprints as
 * that specific booklet AND text extract is too weak (<20 lines).
 *
 * Client Farq-test parsers (مستودع / DC / SITE) always compete with API rows —
 * a few junk API rows must never block a rich client extract.
 */
export function resolveParsedLines(input: {
  apiLines?: ParsedLine[]
  text?: string
  fileName: string
  /** Column-aware read of a real table, when the document carried one. */
  table?: BoqTableResult | null
}): {
  lines: ParsedLine[]
  source: ParseBoqResult['source']
  projectName: string
  /** How many column-read rows the API could describe, so a booklet read
   *  without its technical text is visible rather than assumed. */
  specsFromApi: number
} {
  let specsFromApi = 0
  let lines = Array.isArray(input.apiLines) ? [...input.apiLines] : []
  let source: ParseBoqResult['source'] = lines.length > 0 ? 'pdf-text' : 'empty'
  let projectName = input.fileName.replace(/\.[^.]+$/, '')
  const text = String(input.text || '')
  const waitingHall = text.trim() ? looksLikeWaitingHallBoq(text) : false

  if (text.trim()) {
    const fromText = parseLinesFromText(text, waitingHall)
    const farqTest = waitingHall ? [] : parseFarqTestBoqText(text)
    const clientBest =
      farqTest.length >= fromText.length ? farqTest : fromText

    // Prefer the richer set for THIS document only (never a prior upload).
    if (clientBest.length > lines.length) {
      lines = clientBest
      source = clientBest.length > 0 ? 'pdf-text' : source
    } else if (lines.length === 0 && clientBest.length > 0) {
      lines = clientBest
      source = 'pdf-text'
    }

    // Coordinates outrank reading order, and a longer list does not win on
    // length. A text heuristic or an API row set can hold more rows and still be
    // wrong in the way that matters: on the reference booklet the text path
    // produced 31 rows whose quantities were structural codes. Measured here
    // once: with one page of that booklet removed, the column reader returned 51
    // correct items and reported the 17 it could not see, while the text path
    // returned 52 — and preferring the longer list threw away both the correct
    // values and the report of what was missing.
    //
    // The column reader is preferred whenever it read most of the numbering the
    // booklet itself prints. Below that it is not a better reader of this
    // document, so the text path stands and the column reader's complaints are
    // carried out as warnings rather than dropped.
    const tableLines = tableRowsToLines(input.table)
    const expected = input.table?.expectedCount ?? 0
    const tableShare = expected > 0 ? tableLines.length / expected : tableLines.length > 0 ? 1 : 0
    if (tableLines.length > 0 && tableShare >= TABLE_PREFERENCE_SHARE) {
      // Winning on values is not the same as carrying everything. The quantities
      // table prints no specification column — the technical text sits in a
      // separate section pages later — so the column reader's rows arrive
      // specless, and a specless line matches by name alone. That is what turns
      // ppr-pipes into pvc-pipe: a different material with different suppliers.
      // The API reads that section, and on the reference booklet the two agree
      // on all 68 quantities, so its text is attached rather than its rows.
      const withSpecs = withApiSpecs(tableLines, input.apiLines)
      specsFromApi = withSpecs.filter((line, i) => line.spec !== tableLines[i]?.spec).length
      lines = withSpecs
      source = 'pdf-table'
    }

    const titleMatch =
      text.match(/مشروع[:\s]+([^\n]{8,80})/) ||
      text.match(/توريد\s+مواد\s+ومعدات\s+ل([^\n-]{8,60})/) ||
      text.match(/كراسة\s+اختبار\s+كبيرة\s+-\s+([^\n]{8,80})/)
    if (titleMatch?.[1]) {
      projectName = titleMatch[1].replace(/\s+/g, ' ').trim()
    } else if (/FARQ-TEST-B|مستودع|مركز\s*تشغيل/.test(text)) {
      projectName = 'توريد مواد ومعدات لمركز تشغيل ومستودعات'
    } else if (/FARQ-TEST-DC|أمن\s*سيبراني|مركز\s*بيانات/.test(text)) {
      projectName = 'توريد تجهيزات مركز بيانات وأمن سيبراني'
    } else if (/FARQ-TEST-SITE|معدات\s*مواقع/.test(text)) {
      projectName = 'توريد معدات مواقع وورش وسلامة صناعية'
    } else if (waitingHall) {
      projectName = 'منافسة مشروع تجديد وتحديث صالات الانتظار (المرحلة الثانية)'
    }

    // ONLY the known waiting-hall Etimad PDF may use the curated 45-line table.
    if (waitingHall && looksLikeEtimadBoq(text) && lines.length < 20) {
      lines = ETIMAD_WAITING_HALL_BOQ.map((row) => ({ ...row }))
      source = 'waiting-hall-curated'
      projectName = 'منافسة مشروع تجديد وتحديث صالات الانتظار (المرحلة الثانية)'
    }
  } else if (lines.length > 0) {
    source = 'pdf-text'
  }

  return { lines, source, projectName, specsFromApi }
}

/**
 * Attaches the API's technical specification text to rows the column reader
 * owns. Values are never taken from the API here — only the text the quantities
 * table does not carry.
 *
 * Deliberately not keyed on the API's item number: its rows inherit a page-27
 * aggregate that collides on number 1, and the collision cascades so every
 * later row is numbered one too high. Keyed on the name instead, and attached
 * only where exactly one API row carries that name AND states the same
 * quantity. A specification belonging to the row above is worse than none:
 * it reads as certain and sends a supplier the wrong item's dimensions.
 */
function withApiSpecs(lines: ParsedLine[], apiLines: ParsedLine[] | undefined): ParsedLine[] {
  if (!apiLines?.length) return lines
  const key = (name: string) => normalizeAr(name).replace(/\s+/g, '')
  const qty = (value: string | number) => String(value ?? '').replace(/[,\s،]/g, '')
  const candidates = new Map<string, ParsedLine[]>()
  for (const line of apiLines) {
    if (!String(line.spec || '').trim()) continue
    const k = key(line.name)
    if (!k) continue
    const list = candidates.get(k)
    if (list) list.push(line)
    else candidates.set(k, [line])
  }
  if (!candidates.size) return lines
  return lines.map((line) => {
    const list = candidates.get(key(line.name))
    if (list?.length !== 1) return line
    const [match] = list
    if (qty(match.qty) !== qty(line.qty)) return line
    const spec = String(match.spec || '').trim()
    const existing = String(line.spec || '').trim()
    // The structural code stays, behind the text a supplier can actually quote.
    return { ...line, spec: existing ? `${spec} · ${existing}` : spec }
  })
}

/** Table rows as BOQ lines. The structural code travels as a spec, never as a
 * quantity — reading it as the quantity is what asked suppliers for 2,085 عدد
 * of a handrail whose real quantity is 385 م ط. */
function tableRowsToLines(table: BoqTableResult | null | undefined): ParsedLine[] {
  if (!table?.rows?.length) return []
  return table.rows.map((row) => {
    const spec = [row.spec, row.code ? `رمز إنشائي ${row.code}` : '', row.category]
      .filter(Boolean)
      .join(' · ')
    return {
      id: row.id,
      name: row.name,
      qty: row.qty,
      unit: row.unit,
      spec: spec || undefined,
    }
  })
}

/**
 * How much of a booklet's own numbering the column reader must recover before
 * its rows are preferred over the text path. A partial column read is still
 * reported item by item; this only decides which reader owns the result.
 */
const TABLE_PREFERENCE_SHARE = 0.6

/** Farq parse-pdf always prefixes rows with this header (see api boq-pdf.js). */
const FARQ_BOQ_HEADER = ['اسم المادة', 'الكمية', 'الوحدة', 'المواصفة الفنية', 'موقع التوريد', 'ملاحظات']

const NAME_ALIASES = [
  'اسم المادة بالعربية',
  'اسم المادة',
  'الوصف',
  'البند',
  'description',
  'material name',
  'product name',
  'item_name',
  'name_ar',
  'name',
  'material',
] as const

const QTY_ALIASES = ['الكمية', 'quantity', 'qty'] as const
const UOM_ALIASES = ['الوحدة', 'unit', 'uom'] as const
const SPEC_ALIASES = ['المواصفة الفنية', 'specification', 'spec'] as const
const NOTES_ALIASES = ['ملاحظات', 'notes'] as const
const ID_ALIASES = ['البند', 'item no', 'item #', 'no', '#'] as const

const HEADER_NAME_RE =
  /^(اسم الماده?(?:\s*بالعربيه?)?|اسم الماده? بالانجليزيه?|الوصف|البند|المواصفه?(?:\s*الفنيه?)?|الكميه?|الوحده?|ملاحظات|موقع التوريد|item(?:[_\s-]?name)?|description|material(?:[_\s-]?name)?|product(?:[_\s-]?name)?|name(?:_ar|_en)?|qty|quantity|uom|unit)$/i

/** Fold Arabic spelling variants so header aliases match OCR/Excel drift. */
function foldHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeaderCell(value: unknown): string {
  return foldHeader(value)
}

function isHeaderLabel(value: unknown): boolean {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  return HEADER_NAME_RE.test(raw) || HEADER_NAME_RE.test(foldHeader(raw))
}

function isBoqHeaderRow(row: (string | number)[]): boolean {
  const cells = row.map((c) => normalizeHeaderCell(c)).filter(Boolean)
  if (!cells.length) return false
  const joined = cells.join(' ')
  if (
    cells[0] === normalizeHeaderCell(FARQ_BOQ_HEADER[0]) &&
    cells[1] === normalizeHeaderCell(FARQ_BOQ_HEADER[1])
  ) {
    return true
  }
  return (
    /اسم الماده|الوصف|description|material/.test(joined) &&
    /الكميه|quantity|qty/.test(joined)
  )
}

function columnIndex(headers: string[], aliases: readonly string[]): number {
  const norms = aliases.map((a) => normalizeHeaderCell(a)).filter(Boolean)
  if (!norms.length) return -1
  return headers.findIndex((h) => {
    if (!h) return false
    return norms.some((alias) => h === alias || h.includes(alias) || (alias.length >= 3 && alias.includes(h)))
  })
}

function cellAt(row: (string | number)[], index: number): string {
  if (index < 0) return ''
  return String(row[index] ?? '').trim()
}

function pickFromRecord(record: Record<string, unknown>, aliases: readonly string[]): string {
  const entries = Object.entries(record)
  for (const alias of aliases) {
    const want = normalizeHeaderCell(alias)
    if (!want) continue
    for (const [key, value] of entries) {
      const have = normalizeHeaderCell(key)
      if (!have) continue
      if (have === want || have.includes(want) || (want.length >= 3 && want.includes(have))) {
        const text = String(value ?? '').trim()
        if (text) return text
      }
    }
  }
  return ''
}

/**
 * Coerce Farq/Excel row shapes into a cell array.
 * Supports: string[] rows, and objects keyed by Arabic/English column titles
 * (never use Object.keys as cell values — that produced "اسم المادة" cards).
 */
function coerceRow(row: unknown): (string | number)[] | null {
  if (Array.isArray(row)) {
    return row.map((c) => (c == null ? '' : (c as string | number)))
  }
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const name = pickFromRecord(record, NAME_ALIASES)
  const qty = pickFromRecord(record, QTY_ALIASES)
  const unit = pickFromRecord(record, UOM_ALIASES)
  if (name || qty || unit) {
    return [
      name,
      qty || 1,
      unit || 'عدد',
      pickFromRecord(record, SPEC_ALIASES),
      pickFromRecord(record, ['موقع التوريد', 'delivery location', 'location']),
      pickFromRecord(record, NOTES_ALIASES),
    ]
  }
  // Last resort: values only (insertion order), never keys.
  const values = Object.values(record).filter((v) => v != null && String(v).trim() !== '')
  return values.length ? (values as (string | number)[]) : null
}

function extractBoqItemNumber(notes: string): number | null {
  const m = notes.match(/بند\s*الكراسة\s*[:：]?\s*(\d{1,4})/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** True when a parsed line is the Farq/Excel header mistaken for a BOQ item. */
export function isBoqHeaderLabelItem(item: Pick<ParsedLine, 'name' | 'qty' | 'unit'>): boolean {
  if (isHeaderLabel(item.name)) return true
  return isHeaderLabel(item.qty) && isHeaderLabel(item.unit)
}

/** Drop spreadsheet header rows that leaked into BOQ items (e.g. name=اسم المادة). */
export function sanitizeBoqLines<T extends Pick<ParsedLine, 'name' | 'qty' | 'unit'>>(items: T[]): T[] {
  return items.filter((item) => !isBoqHeaderLabelItem(item))
}

/**
 * Card/display binding: prefer real BOQ fields across alternate API/parser keys.
 * Never surface spreadsheet header labels (اسم المادة / الكمية / الوحدة).
 */
export function resolveBoqCardFields(
  item: Record<string, unknown> | Pick<ParsedLine, 'name' | 'qty' | 'unit' | 'spec'>,
): { name: string; qty: string; unit: string; spec?: string } {
  const rec = item as Record<string, unknown>
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = rec[key]
      if (value == null) continue
      const text = String(value).trim()
      if (!text || isHeaderLabel(text)) continue
      return text
    }
    return ''
  }

  // `original_name` first: where it exists it IS the booklet's own text, and a
  // `name_ar` beside it may be a catalog label written over the real item.
  const name =
    pick('original_name', 'name', 'name_ar', 'description', 'material', 'item_name', 'name_en') ||
    'بند بدون اسم'
  const qty = pick('qty', 'quantity') || '1'
  const unit = pick('unit', 'uom') || 'عدد'
  const spec = pick('spec', 'specification', 'original_description') || undefined
  return { name, qty, unit, spec }
}

/**
 * Map Farq / Excel BOQ matrix → line items.
 * Farq API returns HEADER + data rows shaped as:
 *   [اسم المادة, الكمية, الوحدة, المواصفة الفنية, موقع التوريد, ملاحظات]
 * Also accepts object rows keyed by those titles.
 * Positional fallbacks: [name, qty, uom] or [id, name, qty, uom].
 */
export function rowsToLines(rows: unknown[]): ParsedLine[] {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const matrix = rows.map(coerceRow).filter((row): row is (string | number)[] => Array.isArray(row))
  if (!matrix.length) return []

  const headerIndex = matrix.findIndex((row) => isBoqHeaderRow(row))
  const headers =
    headerIndex >= 0 ? (matrix[headerIndex] || []).map((c) => normalizeHeaderCell(c)) : []

  // Prefer Farq's fixed column order when the known HEADER is present.
  const farqShaped =
    headerIndex >= 0 &&
    normalizeHeaderCell(matrix[headerIndex]?.[0]) === normalizeHeaderCell(FARQ_BOQ_HEADER[0]) &&
    normalizeHeaderCell(matrix[headerIndex]?.[1]) === normalizeHeaderCell(FARQ_BOQ_HEADER[1])

  const nameCol = farqShaped ? 0 : headers.length ? columnIndex(headers, NAME_ALIASES) : -1
  const qtyCol = farqShaped ? 1 : headers.length ? columnIndex(headers, QTY_ALIASES) : -1
  const unitCol = farqShaped ? 2 : headers.length ? columnIndex(headers, UOM_ALIASES) : -1
  const specCol = farqShaped ? 3 : headers.length ? columnIndex(headers, SPEC_ALIASES) : -1
  const notesCol = farqShaped ? 5 : headers.length ? columnIndex(headers, NOTES_ALIASES) : -1
  const idCol = farqShaped ? -1 : headers.length ? columnIndex(headers, ID_ALIASES) : -1

  const dataStart = headerIndex >= 0 ? headerIndex + 1 : 0
  const out: ParsedLine[] = []
  const usedIds = new Set<number>()

  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] || []
    if (!row.some((c) => String(c ?? '').trim())) continue
    if (isBoqHeaderRow(row)) continue

    let name = ''
    let qtyRaw: string | number = 1
    let unitRaw = 'عدد'
    let spec: string | undefined
    let idHint: number | null = null

    if (nameCol >= 0) {
      name = cellAt(row, nameCol)
      qtyRaw = cellAt(row, qtyCol) || 1
      unitRaw = cellAt(row, unitCol) || 'عدد'
      const specVal = cellAt(row, specCol)
      if (specVal && !isHeaderLabel(specVal)) spec = specVal
      const notes = cellAt(row, notesCol)
      idHint = extractBoqItemNumber(notes)
      if (idCol >= 0) {
        const rawId = Number(cellAt(row, idCol))
        if (Number.isFinite(rawId) && rawId > 0) idHint = rawId
      }
    } else {
      // Common shapes: [name, qty, uom, …] (Farq) or [id, name, qty, uom]
      const first = String(row[0] ?? '').trim()
      const looksId = /^\d{1,4}$/.test(first)
      name = String(looksId ? row[1] : row[0] ?? '').trim()
      qtyRaw = (looksId ? row[2] : row[1]) ?? 1
      unitRaw = String((looksId ? row[3] : row[2]) ?? 'عدد')
      const specVal = String((looksId ? row[4] : row[3]) ?? '').trim()
      if (specVal && !isHeaderLabel(specVal)) spec = specVal
      const notes = String((looksId ? row[5] : row[4]) ?? '').trim()
      idHint = looksId ? Number(first) : extractBoqItemNumber(notes)
    }

    if (!name || name.length < 2) continue
    if (isHeaderLabel(name)) continue
    if (isHeaderLabel(qtyRaw) && isHeaderLabel(unitRaw)) continue

    // Keep API/Excel cell text as-is. fixArabicName is only for scrambled PDF text extract.
    const cleanedName = name.replace(/\s+/g, ' ').trim()
    if (!cleanedName || isHeaderLabel(cleanedName)) continue

    let id = idHint && !usedIds.has(idHint) ? idHint : out.length + 1
    if (usedIds.has(id)) id = out.length + 1
    usedIds.add(id)

    out.push({
      id,
      name: cleanedName,
      qty: formatQty(qtyRaw),
      unit: normalizeUnit(String(unitRaw || 'عدد')),
      spec,
    })
  }
  return sanitizeBoqLines(out)
}

/** What the booklet contains versus what we read, as soon as that is known. */
export type BoqReadFacts = {
  read: number
  expectedLineCount: number | null
  unreadableLineCount: number
  readIssues?: string[]
  skippedTables?: string[]
}

export async function parseBoqFile(
  file: File,
  opts: {
    onStage?: BoqParseProgress
    onWork?: BoqWorkProgress
    /**
     * Fires once the lines are known, before supplier matching starts. Matching
     * is the long leg, and the owner should not spend it believing a partial
     * read is a complete one.
     */
    onRead?: (facts: BoqReadFacts) => void
  } = {},
): Promise<ParseBoqResult> {
  const stage = opts.onStage ?? (() => {})
  const work = opts.onWork ?? noWork
  stage('open')
  work({ kind: 'start', leg: 'hash', opaque: true })
  const documentId = await hashDocumentId(file)
  work({ kind: 'end', leg: 'hash' })
  let apiLines: ParsedLine[] = []
  let text = ''
  let table: BoqTableResult | null = null
  let extractError = ''

  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  // CRITICAL (live UploadView): extract client text FIRST.
  // Never block local Farq-test parsers behind Farq API queue/OCR (that left SITE
  // booklet at 0 lines when API was slow/empty and pdf worker failed silently).
  stage('read')
  try {
    // pdf.js resolves `getDocument().promise` only after the worker handshakes.
    // A worker chunk that 404s (or goes stale across an HMR reload) leaves that
    // promise pending forever — the whole upload then hangs with a clean console.
    // This is the only unbounded await in the flow, so it gets a hard cap.
    const extract = await withDeadline(
      extractPlainText(file, work),
      CLIENT_EXTRACT_TIMEOUT_MS,
      PDF_EXTRACT_TIMEOUT,
    )
    text = extract.text
    table = extract.table
  } catch (err) {
    extractError = err instanceof Error ? err.message : String(err)
    console.warn('BOQ extract failed', err)
  }

  const clientLooksLikeScan = isPdfScanNoTextError(extractError)

  // A complete column read does not need the API's rows — measured on the
  // reference booklet, the two agree on all 68 quantities — but it does need its
  // specification text, which the quantities table never prints. So the call is
  // still made, on a shorter leash: here we are only waiting for text that makes
  // matching specific, and 68 correctly-valued specless lines beat a longer wait.
  const tableIsComplete = Boolean(
    table &&
      table.rows.length > 0 &&
      table.issues.length === 0 &&
      table.expectedCount === table.rows.length,
  )

  // Optional API enrichment — capped wait so a hung job cannot strand UploadView.
  // Scanned PDFs: give Farq tender extract (OCR when enabled) more time before giving up.
  if (isPdf) {
    let apiTimer: ReturnType<typeof setTimeout> | undefined
    const apiWaitMs = clientLooksLikeScan ? 45_000 : tableIsComplete ? 6_000 : 12_000
    // A scan gets the longer wait because OCR is its only chance of any lines at
    // all — the owner must be told which of the two ceilings he is sitting under.
    work({ kind: 'start', leg: 'api-parse', opaque: true, capMs: apiWaitMs })
    try {
      const { parseConstructionBoqPdf } = await import('../api/constructionClient')
      const apiOrTimeout = await Promise.race([
        parseConstructionBoqPdf(file).then((api) => ({ kind: 'api' as const, api })),
        new Promise<{ kind: 'timeout' }>((resolve) => {
          apiTimer = setTimeout(() => resolve({ kind: 'timeout' }), apiWaitMs)
        }),
      ])
      if (apiOrTimeout.kind === 'api' && apiOrTimeout.api.rows?.length) {
        apiLines = rowsToLines(apiOrTimeout.api.rows)
      }
    } catch (err) {
      console.warn('Farq BOQ parse API unavailable, using client parse', err)
      if (!extractError && isPdfScanNoTextError(err)) {
        extractError = PDF_SCAN_NO_TEXT
      }
    } finally {
      if (apiTimer) clearTimeout(apiTimer)
      work({ kind: 'end', leg: 'api-parse' })
    }
  }

  stage('analyze')
  work({ kind: 'start', leg: 'resolve' })
  const resolved = resolveParsedLines({
    apiLines,
    text,
    table,
    fileName: file.name,
  })
  const { lines, source, projectName, specsFromApi } = resolved
  work({ kind: 'end', leg: 'resolve' })

  // What the booklet says it contains versus what we produced. Reported on every
  // path below, including the failure paths, so a partial read can never reach
  // the screen dressed as a complete one.
  // Also when nothing was read at all: if the column reader saw a table and
  // failed on every row, that is the most useful thing we know about the file.
  const usedTable = table && (source === 'pdf-table' || lines.length === 0)
  // When the text path won, the column reader's complaints still travel — as a
  // warning, so a table it could not read is never simply forgotten.
  const shelvedTableNote =
    table && !usedTable && table.issues.length
      ? `قرأنا هذا الملف بالمسار النصي. قارئ الأعمدة رأى جدولًا ولم يكمله (${table.rows.length} من ${table.expectedCount ?? '؟'}).`
      : ''
  // The quantities table carries no technical column; that text comes from the
  // API. Without it every line matches on its name alone, which is how a
  // «ماسورة» finds the wrong material — so its absence is stated, not assumed.
  const specNote =
    source === 'pdf-table' && specsFromApi < lines.length
      ? `المواصفات الفنية وصلت لـ ${specsFromApi} من ${lines.length} بندًا؛ الباقي سيُطابق بالاسم والكمية فقط.`
      : ''
  const expectedLineCount = usedTable ? table!.expectedCount : null
  const unreadableLineCount = usedTable ? unreadableCount(table!) : 0
  const readIssues = usedTable ? table!.issues.map((issue) => issue.detail) : []
  const skippedTables = usedTable
    ? table!.otherTables.map((t) => `صفحة ${t.page}: جدول آخر لم نقرأه كبنود — «${t.header}»`)
    : []
  const readFacts = {
    expectedLineCount,
    unreadableLineCount,
    readIssues: readIssues.length ? readIssues : undefined,
    skippedTables: skippedTables.length ? skippedTables : undefined,
  }
  opts.onRead?.({ read: lines.length, ...readFacts })

  // Explicit empty — never invent lines from another document / prior session.
  if (lines.length === 0) {
    const detail = clientLooksLikeScan || isPdfScanNoTextError(extractError)
      ? ` ${PDF_SCAN_NO_TEXT}`
      : extractError
        ? ` (استخراج النص: ${extractError})`
        : text.trim()
          ? ` (نص مستخرج ${text.length} حرفًا لكن بلا بنود مجدولة)`
          : ' (لا نص مستخرج من الملف)'
    const tableDetail = readIssues.length
      ? ` وجدنا جدولًا في الصفحات ${table?.pages.join('، ') || '؟'} لكن تعذّرت قراءة صفوفه: ${readIssues[0]}`
      : ''
    return {
      items: [],
      projectName,
      documentId,
      source: 'empty',
      rawLineCount: 0,
      ...readFacts,
      matchWarning: `لم نعثر على بنود في هذا الملف. لم نُعد استخدام كراسة سابقة.${detail}${tableDetail}`,
    }
  }

  // Supplier matching must never wipe successfully parsed lines.
  stage('match')
  try {
    const matched = await matchSuppliersForItems(lines, { onWork: work })
    const ready = matched.items.filter((i) => i.suppliers.length > 0).length
    return {
      items: matched.items,
      projectName,
      documentId,
      source,
      rawLineCount: lines.length,
      ...readFacts,
      matchDegraded: !matched.catalogLoaded || Boolean(matched.matchApiError),
      matchApiFailed: Boolean(matched.matchApiError),
      matchApiError: matched.matchApiError,
      matchWarning:
        [
          !matched.catalogLoaded
            ? 'تعذر الاتصال بـ Farq API (:3000). شغّل الـ API ثم أعد رفع الكراسة.'
            : matched.matchApiError
              ? `فشلت مطابقة الموردين على الـ API (${matched.matchApiError}). الاقتراحات أدناه من مطابقة محلية بالكلمات فقط.`
              : ready === 0
                ? 'قُرئت البنود لكن لم يُعثر على موردين مطابقين. تأكد أن CONSTRUCTION_READ_ENABLED=1 ثم أعد الرفع.'
                : '',
          shelvedTableNote,
          specNote,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    }
  } catch (err) {
    console.warn('Supplier match failed after successful parse — keeping lines', err)
    return {
      items: lines.map((line) => ({
        id: line.id,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        spec: line.spec,
        status: 'searching' as const,
        supplierCount: 0,
        suppliers: [],
        lineKey: `line-${line.id}`,
      })),
      projectName,
      documentId,
      source,
      rawLineCount: lines.length,
      ...readFacts,
      matchDegraded: true,
      matchApiFailed: true,
      matchApiError: err instanceof Error ? err.message : String(err),
      matchWarning: 'قُرئت البنود، لكن تعذّرت مطابقة الموردين. يمكنك المتابعة وإعادة المطابقة لاحقًا.',
    }
  }
}
