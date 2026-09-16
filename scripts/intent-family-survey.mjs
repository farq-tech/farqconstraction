/**
 * Taxonomy engineering aid — survey the RECURRING FAMILIES in real booklets.
 *
 * This is deliberately NOT an alias generator. It extracts the head concept of
 * every parsed BOQ line (the noun the buyer is actually procuring) and groups by
 * frequency, so a small number of correct families + facets can be designed to
 * cover hundreds of lines.
 *
 * Usage:
 *   node scripts/intent-family-survey.mjs
 *   node scripts/intent-family-survey.mjs --heads 120
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createServer } from 'vite'

const DEFAULT_FIXTURES = [
  'fixtures/boq/warehouse-ops-02.flat.txt',
  'fixtures/boq/site-safety-02.flat.txt',
  'fixtures/boq/datacenter-cyber-01.flat.txt',
]

const args = process.argv.slice(2)
const headLimit = Number(
  (args.find((a) => a.startsWith('--heads')) || '--heads=80').split('=')[1] || 80,
)
const fixtures = DEFAULT_FIXTURES.filter((p) => existsSync(resolve(p)))

/** Boilerplate tails the generated booklets append after the product name. */
const TAIL_MARKERS = [
  'واجهة تشغيل رقمية',
  'ملحقات التشغيل الأساسية',
  'ملائم لأعمال ضبط الجودة',
  'دقة مناسبة للاستخدام المهني',
  'مطابقة لمواصفات الشركة المصنعة',
  'نسخة مختبرية',
  'نسخة مؤسسية',
  'مطابق لمعايير التشغيل',
  'مخصص لبيئات مؤسسية',
  'مزود بخصائص التكرار',
  'واجهة إدارة آمنة',
  'دعم 6 IPv',
  'أطوال تجارية',
  'عرض قياسي',
]

const LEAD = /^(?:و?توريد|وتوريد|توريد\s+وتركيب|تركيب|تنفيذ|اعمال|أعمال|عمل)\s+/

function cutTail(text) {
  let out = text
  for (const marker of TAIL_MARKERS) {
    const at = out.indexOf(marker)
    if (at > 0) out = out.slice(0, at)
  }
  return out.trim()
}

/** Head concept = first 1-3 content words after the supply verb, specs removed. */
function headConcept(name) {
  const head = cutTail(String(name || ''))
    .replace(LEAD, '')
    .replace(/[×xX*]/g, ' ')
    .replace(/[0-9٠-٩.,/\\()\-–_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = head.split(' ').filter((w) => w.length > 1)
  return {
    w1: words.slice(0, 1).join(' '),
    w2: words.slice(0, 2).join(' '),
    w3: words.slice(0, 3).join(' '),
  }
}

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')
  const report = { fixtures: [], heads: {} }
  const w1 = new Map()
  const w2 = new Map()
  const samples = new Map()

  for (const fixture of fixtures) {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines } = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    const clean = parse.sanitizeBoqLines(lines)
    report.fixtures.push({ fixture, lines: clean.length })

    for (const line of clean) {
      const h = headConcept(line.name)
      if (h.w1) w1.set(h.w1, (w1.get(h.w1) || 0) + 1)
      if (h.w2) {
        w2.set(h.w2, (w2.get(h.w2) || 0) + 1)
        if (!samples.has(h.w2)) samples.set(h.w2, cutTail(line.name).slice(0, 90))
      }
    }
  }

  const top1 = [...w1].sort((a, b) => b[1] - a[1]).slice(0, headLimit)
  const top2 = [...w2].sort((a, b) => b[1] - a[1]).slice(0, headLimit)

  console.log('=== fixtures ===')
  for (const f of report.fixtures) console.log(`${f.lines}\t${f.fixture}`)

  console.log('\n=== head word (1) frequency ===')
  for (const [k, v] of top1) console.log(`${String(v).padStart(4)}  ${k}`)

  console.log('\n=== head concept (2 words) frequency ===')
  for (const [k, v] of top2) {
    console.log(`${String(v).padStart(4)}  ${k}   ⟵ ${samples.get(k)}`)
  }

  report.heads = {
    by_word: Object.fromEntries(top1),
    by_concept: Object.fromEntries(top2),
  }
  writeFileSync('fixtures/boq/last-family-survey.json', JSON.stringify(report, null, 2))
} finally {
  await server.close()
}
