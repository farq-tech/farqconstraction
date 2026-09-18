import type {
  BOQItem,
  BoqSupplierCoverage,
  ChannelType,
  EvidenceType,
  LineCoverageState,
  Supplier,
  SupplierGrade,
  SupplierOrigin,
} from '../types'
import type { BoqCatalogMatchRow } from '../api/constructionClient'
import { listConstructionSuppliers } from '../api/constructionSuppliers'

function normalizeAr(text: string): string {
  return String(text || '')
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

async function extractPdfText(file: File): Promise<string> {
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
  ): Promise<{ text: string; empty: boolean }> => {
    // Fresh clone per attempt so a prior worker transfer cannot break the next engine.
    const data = master.slice()
    const doc = await getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0,
    }).promise
    const parts: string[] = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const strs = content.items
        .map((item) =>
          item && typeof item === 'object' && 'str' in item ? String((item as { str: unknown }).str) : '',
        )
        .filter(Boolean)
      parts.push(strs.join(' '))
      parts.push(strs.join('\t'))
    }
    const text = parts.join('\n')
    return { text, empty: !text.trim() }
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
    return result.text
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
    return result.text
  } catch (e) {
    if (isPdfScanNoTextError(e)) throw e
    errors.push(`pdfjs-legacy: ${e instanceof Error ? e.message : String(e)}`)
  }

  throw new Error(`تعذّر استخراج نص PDF (${errors.join(' | ')})`)
}

async function extractPlainText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file)
  }
  // Excel/CSV fallback: read as text (works for simple CSV exports)
  return file.text()
}

/**
 * Display cap per card. Farq decides WHO; this only decides how many fit before
 * «اعرض الكل». It is not a coverage limit: `coverage.totalCount` reports what
 * Farq actually found, whether or not every one is rendered.
 */
const MATCH_SUPPLIERS_PER_LINE = 8

/** How many /boq/match requests may be in flight at once. */
const MATCH_BATCH_CONCURRENCY = 3

/**
 * The degraded keyword path scores against this many directory rows — and ONLY
 * when Farq's matching failed for a batch. It used to run on every upload as the
 * primary source of proposals, which meant the first 2,500 contactable rows of a
 * 10k+ directory decided coverage for the whole booklet, while the per-line
 * search box beside it queried the entire directory and found suppliers the
 * automatic path could not reach.
 */
const DEGRADED_CATALOG_SCORE_CAP = 2_500

function lineKeyFor(line: ParsedLine): string {
  return `line-${line.id}`
}

/**
 * The ONE place a supplier's Arabic label is chosen, and it is chosen from the
 * grade Farq sent. Three separate places used to assign «نشاط متطابق» to the
 * first three suppliers of an array and «دليل منتج» to the rest, by index, with
 * no evidence behind either word.
 */
function evidenceForGrade(
  grade: SupplierGrade | undefined,
  origin: SupplierOrigin,
): EvidenceType {
  if (origin === 'manual') return 'اختيارك'
  if (grade === 'DIRECT') return 'دليل مباشر'
  if (grade === 'TAXONOMY') return 'نشاط متطابق'
  // REVIEW, or a supplier Farq graded not at all. Claim nothing.
  return 'مورد محتمل'
}

function channelFor(raw: string | undefined): ChannelType {
  return raw === 'واتساب' ? 'واتساب' : raw === 'حراج' ? 'حراج' : 'بريد'
}

function toUiSupplier(
  row: {
    id: string
    name_ar?: string
    name_en?: string
    city?: string
    grade?: SupplierGrade
    channel?: string
    rfq_eligible?: boolean
    origin: string
  },
  autoSelectedIds: Set<string>,
): Supplier {
  const origin: SupplierOrigin =
    row.origin === 'material'
      ? 'material'
      : row.origin === 'intent_map'
        ? 'intent_map'
        : row.origin === 'ai'
          ? 'ai'
          : row.origin === 'directory'
            ? 'degraded_search'
            : 'family'
  return {
    id: row.id,
    name: String(row.name_ar || row.name_en || row.id).trim(),
    city: cityLabel(row.city),
    evidence: evidenceForGrade(row.grade, origin),
    channel: channelFor(row.channel),
    grade: row.grade,
    origin,
    autoSelectable: autoSelectedIds.has(row.id),
  }
}

export type MatchProgress = {
  /** Lines whose batch has come back, successfully or not. */
  matched: number
  /** Lines that will be sent in total. */
  total: number
  /** Batches that failed outright. */
  failedBatches: number
}

/**
 * Sends EVERY supplyable line to Farq, in batches of the server's real limit.
 *
 * The cap this replaces was 80 lines, once, with no batching and no second
 * request — on a 1,514-line booklet that is 5% of the tender reaching the engine
 * and 95% of it silently keyword-matched in the browser. The server validates
 * 1..200 rows per request and 400s outside that, so 200 is the batch size and
 * nothing is dropped to fit.
 *
 * A batch that fails marks ONLY its own lines. It never fails the upload, and it
 * never reads as «no supplier».
 */
async function matchAllLinesViaFarq(
  lines: ParsedLine[],
  onProgress?: (progress: MatchProgress) => void,
): Promise<{
  byKey: Map<string, BoqCatalogMatchRow>
  failedKeys: Set<string>
  failedBatches: number
  batchCount: number
  lastError?: string
}> {
  const byKey = new Map<string, BoqCatalogMatchRow>()
  const failedKeys = new Set<string>()
  if (!lines.length) return { byKey, failedKeys, failedBatches: 0, batchCount: 0 }

  const { matchConstructionBoqCatalog, CONSTRUCTION_BOQ_MATCH_MAX_ROWS } = await import(
    '../api/constructionClient'
  )

  const batches: ParsedLine[][] = []
  for (let i = 0; i < lines.length; i += CONSTRUCTION_BOQ_MATCH_MAX_ROWS) {
    batches.push(lines.slice(i, i + CONSTRUCTION_BOQ_MATCH_MAX_ROWS))
  }

  let matched = 0
  let failedBatches = 0
  let lastError: string | undefined
  const report = () =>
    onProgress?.({ matched, total: lines.length, failedBatches })

  const runBatch = async (batch: ParsedLine[]) => {
    try {
      const result = await matchConstructionBoqCatalog({
        lines: batch.map((line) => ({
          line_key: lineKeyFor(line),
          name_ar: line.name,
          quantity: Number(String(line.qty).replace(/,/g, '')) || 1,
          uom: line.unit || 'عدد',
          spec: line.spec,
        })),
      })
      const rows = result.rows || []
      for (const row of rows) byKey.set(row.line_key, row)
      // A row Farq did not answer for is not a silent success.
      for (const line of batch) {
        const key = lineKeyFor(line)
        if (!byKey.has(key)) failedKeys.add(key)
      }
    } catch (error) {
      failedBatches += 1
      lastError = error instanceof Error ? error.message : String(error)
      for (const line of batch) failedKeys.add(lineKeyFor(line))
    } finally {
      matched += batch.length
      report()
    }
  }

  // Bounded concurrency: enough to hide latency, not enough to trip the
  // per-IP construction limiter that the inbox shares.
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(MATCH_BATCH_CONCURRENCY, batches.length) },
    async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++]
        if (batch) await runBatch(batch)
      }
    },
  )
  await Promise.all(workers)

  return { byKey, failedKeys, failedBatches, batchCount: batches.length, lastError }
}

/**
 * Keyword search over the directory, for lines whose batch failed only.
 *
 * Everything it returns is «مورد محتمل» with no grade and no auto-selection:
 * a token overlap is not evidence, and the screen must not dress it as one.
 */
async function degradedSupplierSearch(
  lines: ParsedLine[],
): Promise<{ byKey: Map<string, Supplier[]>; catalogLoaded: boolean }> {
  const byKey = new Map<string, Supplier[]>()
  if (!lines.length) return { byKey, catalogLoaded: false }

  let catalog: Awaited<ReturnType<typeof listConstructionSuppliers>>['suppliers'] = []
  try {
    const result = await listConstructionSuppliers({
      limit: DEGRADED_CATALOG_SCORE_CAP,
      offset: 0,
      contactableOnly: true,
    })
    catalog = result.suppliers
  } catch {
    return { byKey, catalogLoaded: false }
  }
  if (!catalog.length) return { byKey, catalogLoaded: false }

  const haystacks = catalog.map(
    (s) => `${s.name} ${s.category} ${s.activity || ''} ${s.city}`,
  )

  for (const line of lines) {
    const needles = normalizeAr(line.name)
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .slice(0, 4)
    if (!needles.length) {
      byKey.set(lineKeyFor(line), [])
      continue
    }
    const scored: Array<{ index: number; score: number }> = []
    for (let i = 0; i < catalog.length; i++) {
      let score = 0
      const hay = normalizeAr(haystacks[i] || '')
      for (const needle of needles) {
        const nn = normalizeAr(needle)
        if (nn && hay.includes(nn)) score += 2
      }
      if (score > 0) scored.push({ index: i, score })
    }
    scored.sort((a, b) => b.score - a.score)
    byKey.set(
      lineKeyFor(line),
      scored.slice(0, MATCH_SUPPLIERS_PER_LINE).map(({ index }) => {
        const s = catalog[index]!
        return {
          id: s.id,
          name: s.name,
          city: s.city,
          // No grade: nobody graded him. No auto-selection either.
          evidence: 'مورد محتمل' as EvidenceType,
          channel: (s.hasEmail ? 'بريد' : 'واتساب') as ChannelType,
          origin: 'degraded_search' as SupplierOrigin,
          autoSelectable: false,
        }
      }),
    )
  }
  return { byKey, catalogLoaded: true }
}

/** The state a line lands in, from Farq's own answer. */
function stateForRow(
  row: BoqCatalogMatchRow | undefined,
  supplierCount: number,
  degraded: boolean,
  failed: boolean,
): LineCoverageState {
  if (failed && !degraded) return 'MATCH_FAILED'
  if (row?.kind === 'REJECT_NOT_SUPPLY') return 'NON_SUPPLYABLE'
  if (supplierCount === 0) return failed ? 'MATCH_FAILED' : 'SUPPLYABLE_NO_SUPPLIER'
  const target = row?.coverage?.target ?? COVERAGE_TARGET
  const total = row?.coverage?.total ?? supplierCount
  return total >= target ? 'SUPPLYABLE_MATCHED' : 'SUPPLYABLE_PARTIAL_COVERAGE'
}

/** The five-supplier floor, as Farq reports it. */
const COVERAGE_TARGET = 5

export async function matchSuppliersForItems(
  lines: ParsedLine[],
  options: {
    onProgress?: (progress: MatchProgress) => void
    /** Called with a snapshot each time a batch lands, for progressive render. */
    onPartial?: (items: BOQItem[]) => void
  } = {},
): Promise<{
  items: BOQItem[]
  catalogLoaded: boolean
  /** True when any line's suppliers came from the degraded keyword path. */
  degraded: boolean
  /** Lines Farq never answered for, even after the degraded attempt. */
  unmatchedLineCount: number
  matchWarning?: string
}> {
  const cleanLines = sanitizeBoqLines(lines)

  // Every line is shown immediately, in an explicit pending state. Nothing waits
  // for the last batch to be readable, and nothing is invented while it waits.
  const pendingItems: BOQItem[] = cleanLines.map((line) => ({
    id: line.id,
    name: line.name,
    qty: line.qty,
    unit: line.unit,
    spec: line.spec,
    status: 'searching' as const,
    state: 'MATCH_PENDING' as LineCoverageState,
    supplierCount: 0,
    suppliers: [],
    lineKey: lineKeyFor(line),
  }))
  options.onPartial?.(pendingItems.map((item) => ({ ...item })))

  const matched = await matchAllLinesViaFarq(cleanLines, options.onProgress)

  // Degraded keyword search ONLY for the lines Farq could not answer. On a
  // healthy upload this never runs, so the 6 MB directory is never downloaded.
  const failedLines = cleanLines.filter((line) => matched.failedKeys.has(lineKeyFor(line)))
  const degradedResult = failedLines.length
    ? await degradedSupplierSearch(failedLines)
    : { byKey: new Map<string, Supplier[]>(), catalogLoaded: false }

  const items: BOQItem[] = cleanLines.map((line) => {
    const key = lineKeyFor(line)
    const row = matched.byKey.get(key)
    const failed = matched.failedKeys.has(key)
    const degradedSuppliers = degradedResult.byKey.get(key)
    const isDegraded = Boolean(degradedSuppliers && degradedSuppliers.length > 0)

    const autoSelectedIds = new Set(
      (row?.auto_selected_supplier_ids || []).map((id) => String(id)),
    )
    const confirmed = (row?.suppliers || []).map((s) => toUiSupplier(s, autoSelectedIds))
    const potential = (row?.potential_suppliers || []).map((s) =>
      // A suggestion supplier is never auto-selectable, whatever else is true.
      ({ ...toUiSupplier(s, new Set<string>()), autoSelectable: false }),
    )
    const fromFarq = [...confirmed, ...potential]
    const suppliers = (fromFarq.length ? fromFarq : degradedSuppliers || []).slice(
      0,
      MATCH_SUPPLIERS_PER_LINE,
    )

    const confirmedCount = row?.coverage?.confirmed ?? confirmed.length
    const potentialCount =
      row?.coverage?.potential ?? (potential.length || (degradedSuppliers?.length ?? 0))
    const totalCount = row?.coverage?.total ?? confirmedCount + potentialCount
    const state = stateForRow(row, confirmedCount + potentialCount || suppliers.length, isDegraded, failed)

    const coverage: BoqSupplierCoverage = {
      lineKey: key,
      state,
      resolvedMaterial: row?.resolution?.material ?? row?.farq_spec_id ?? null,
      resolvedMaterialName: row?.resolution?.material_name_ar ?? row?.name_ar ?? null,
      resolvedFamily: row?.resolution?.family ?? null,
      resolvedIntent: row?.resolution?.intent ?? null,
      resolution: isDegraded
        ? 'degraded_search'
        : row?.resolution?.source === 'MATERIAL'
          ? 'material'
          : row?.resolution?.source === 'INTENT_MAP'
            ? 'intent_map'
            : row?.resolution?.source === 'FAMILY'
              ? 'family'
              : row?.resolution?.source === 'AI'
                ? 'ai'
                : 'none',
      confirmedCount,
      potentialCount,
      totalCount,
      targetCount: row?.coverage?.target ?? COVERAGE_TARGET,
      // Farq's verdict, copied. Never widened to reach the target.
      autoSelectedSupplierIds: confirmed.filter((s) => s.autoSelectable).map((s) => s.id),
      gapReason: failed && !isDegraded ? 'MATCH_REQUEST_FAILED' : (row?.gap_reason ?? null),
      degraded: isDegraded,
    }

    return {
      id: line.id,
      name: line.name,
      qty: line.qty,
      unit: line.unit,
      spec: line.spec,
      // Derived, so the two cannot disagree.
      status: state === 'SUPPLYABLE_MATCHED' || state === 'SUPPLYABLE_PARTIAL_COVERAGE'
        ? ('ready' as const)
        : ('searching' as const),
      state,
      supplierCount: suppliers.length,
      suppliers,
      coverage,
      farqSpecId: row?.farq_spec_id || undefined,
      lineKey: key,
    }
  })

  options.onPartial?.(items.map((item) => ({ ...item })))

  const unmatchedLineCount = items.filter((item) => item.state === 'MATCH_FAILED').length
  const degraded = items.some((item) => item.coverage?.degraded)

  let matchWarning: string | undefined
  if (matched.failedBatches > 0 && unmatchedLineCount > 0) {
    matchWarning = `تعذّر ترشيح الموردين لـ ${unmatchedLineCount} بندًا (${matched.failedBatches} من ${matched.batchCount} دفعات فشلت). البنود ظاهرة ويمكن إعادة المحاولة — لا نعرض هذه البنود كأنها بلا مورد.`
  } else if (degraded) {
    matchWarning =
      'تعذّر الوصول إلى محرك المطابقة في فرق لبعض البنود، فعرضنا مرشحين بالبحث النصي فقط. هؤلاء «موردون محتملون» ولم نتحقق من أنهم يوردون هذه المادة.'
  }

  return {
    items,
    catalogLoaded: matched.byKey.size > 0 || degradedResult.catalogLoaded,
    degraded,
    unmatchedLineCount,
    matchWarning,
  }
}

export type ParseBoqResult = {
  items: BOQItem[]
  projectName: string
  /** Content-hash / upload identity — lines are bound to this document only. */
  documentId: string
  source: 'pdf-text' | 'waiting-hall-curated' | 'empty'
  rawLineCount: number
  /**
   * True when Farq's matching could not be reached for at least one line, so some
   * suppliers came from the degraded keyword path or some lines got no answer.
   * It used to be derived from the directory fetch alone, which meant a total
   * matching outage rendered as a confident result with no warning at all.
   */
  matchDegraded?: boolean
  matchWarning?: string
  /** Lines that went to Farq's matching. The invariant: === items.length. */
  supplyableLineCount?: number
  /** Lines Farq answered for. */
  matchedLineCount?: number
  /** Lines whose batch failed. Never counted as «no supplier». */
  unmatchedLineCount?: number
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
}): {
  lines: ParsedLine[]
  source: ParseBoqResult['source']
  projectName: string
} {
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

  return { lines, source, projectName }
}

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

export async function parseBoqFile(
  file: File,
  opts: {
    onStage?: BoqParseProgress
    /** Live «ترشيح الموردين 400/1514» counter, driven by real batch completion. */
    onMatchProgress?: (progress: MatchProgress) => void
    /** Snapshot after each batch, so cards fill in as answers arrive. */
    onPartialItems?: (items: BOQItem[]) => void
  } = {},
): Promise<ParseBoqResult> {
  const stage = opts.onStage ?? (() => {})
  const options = opts
  stage('open')
  const documentId = await hashDocumentId(file)
  let apiLines: ParsedLine[] = []
  let text = ''
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
    text = await withDeadline(extractPlainText(file), CLIENT_EXTRACT_TIMEOUT_MS, PDF_EXTRACT_TIMEOUT)
  } catch (err) {
    extractError = err instanceof Error ? err.message : String(err)
    console.warn('BOQ extract failed', err)
  }

  const clientLooksLikeScan = isPdfScanNoTextError(extractError)

  // Optional API enrichment — capped wait so a hung job cannot strand UploadView.
  // Scanned PDFs: give Farq tender extract (OCR when enabled) more time before giving up.
  if (isPdf) {
    let apiTimer: ReturnType<typeof setTimeout> | undefined
    const apiWaitMs = clientLooksLikeScan ? 45_000 : 12_000
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
    }
  }

  stage('analyze')
  const resolved = resolveParsedLines({
    apiLines,
    text,
    fileName: file.name,
  })
  const { lines, source, projectName } = resolved

  // Explicit empty — never invent lines from another document / prior session.
  if (lines.length === 0) {
    const detail = clientLooksLikeScan || isPdfScanNoTextError(extractError)
      ? ` ${PDF_SCAN_NO_TEXT}`
      : extractError
        ? ` (استخراج النص: ${extractError})`
        : text.trim()
          ? ` (نص مستخرج ${text.length} حرفًا لكن بلا بنود مجدولة)`
          : ' (لا نص مستخرج من الملف)'
    return {
      items: [],
      projectName,
      documentId,
      source: 'empty',
      rawLineCount: 0,
      matchWarning: `لم نعثر على بنود في هذا الملف. لم نُعد استخدام كراسة سابقة.${detail}`,
    }
  }

  // Supplier matching must never wipe successfully parsed lines.
  stage('match')
  try {
    const matched = await matchSuppliersForItems(lines, {
      onProgress: options.onMatchProgress,
      onPartial: options.onPartialItems,
    })
    return {
      items: matched.items,
      projectName,
      documentId,
      source,
      rawLineCount: lines.length,
      // Degraded means «we could not reach Farq's engine for some lines», not
      // «the directory was empty». A total matching outage used to be swallowed
      // by a bare catch and rendered as a normal, unwarned result built entirely
      // from browser keyword scoring.
      matchDegraded: matched.degraded || matched.unmatchedLineCount > 0,
      matchWarning: matched.matchWarning,
      supplyableLineCount: matched.items.length,
      matchedLineCount: matched.items.length - matched.unmatchedLineCount,
      unmatchedLineCount: matched.unmatchedLineCount,
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
        // Not «no supplier»: we never got an answer for this line.
        state: 'MATCH_FAILED' as LineCoverageState,
        supplierCount: 0,
        suppliers: [],
        lineKey: `line-${line.id}`,
      })),
      projectName,
      documentId,
      source,
      rawLineCount: lines.length,
      matchDegraded: true,
      matchWarning: 'قُرئت البنود، لكن تعذّرت مطابقة الموردين. البنود محفوظة — أعد المطابقة دون إعادة قراءة الملف.',
      supplyableLineCount: lines.length,
      matchedLineCount: 0,
      unmatchedLineCount: lines.length,
    }
  }
}
