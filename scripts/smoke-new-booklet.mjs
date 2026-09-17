/**
 * One unfamiliar booklet, end to end, on the deployed link with a real session.
 * Measures wall clock, what was read, and what the screen claims — it asserts
 * nothing, so the parser cannot grade its own homework.
 *
 *   FARQ_EMAIL=… FARQ_PASSWORD=… node scripts/smoke-new-booklet.mjs <url> <pdf>
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2]
const PDF = process.argv[3]
const SHOTS = process.env.SHOT_DIR || '/tmp'
const WATCHDOG_MS = 180_000

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 3000 } })

const calls = []
const started = new Map()
page.on('request', (r) => started.set(r, Date.now()))
page.on('response', (r) => {
  const u = r.url()
  if (!u.includes('/api/construction/')) return
  calls.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} — ${Date.now() - (started.get(r.request()) ?? Date.now())}ms`)
})

await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', process.env.FARQ_EMAIL)
await page.fill('input[type=password]', process.env.FARQ_PASSWORD)
await page.getByRole('button').first().click()
await page.waitForTimeout(8000)

await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'اختر ملفًا' }).first().click()
await page.waitForTimeout(1200)

const t0 = Date.now()
await page.setInputFiles('input[type=file]', PDF)
let outcome = 'still running'
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText()
  if (/اكتملت القراءة/.test(body)) { outcome = 'completed'; break }
  if (/تعذّرت|توقفت قراءة الكراسة/.test(body)) { outcome = 'failed/watchdog'; break }
  if (Date.now() - t0 > WATCHDOG_MS + 30_000) { outcome = 'no terminal state'; break }
}
const readMs = Date.now() - t0
console.log(`\nWALL CLOCK TO READ: ${(readMs / 1000).toFixed(1)}s  (watchdog ${WATCHDOG_MS / 1000}s)`)
console.log(`OUTCOME: ${outcome}`)
console.log(`WATCHDOG TRIPPED: ${outcome === 'failed/watchdog' || readMs > WATCHDOG_MS}`)

const upload = await page.locator('body').innerText()
console.log('\n=== UPLOAD SCREEN NOTES ===')
for (const l of upload.split('\n')) {
  if (/المواصفات|تعذر|لم نقرأ|بندًا|مورد|قرأنا|لم تصل|جزئ/.test(l) && l.trim().length > 6) {
    console.log('  ' + l.trim())
  }
}
await page.screenshot({ path: `${SHOTS}/newbooklet-upload.png`, fullPage: false })

await page.getByText(/عرض الموردين/).first().click()
await page.waitForTimeout(15000)

const cards = page.locator('div.bg-white.rounded-2xl')
const n = await cards.count()
const items = []
for (let i = 0; i < n; i++) {
  const t = (await cards.nth(i).innerText().catch(() => '')).trim()
  if (!/بلا مورد مؤكد|مادة غير محدّدة|وجد فرق/.test(t)) continue
  const lines = t.split('\n').map((x) => x.trim())
  const m = t.match(/وجد فرق (\d+) موردًا/)
  items.push({
    id: lines[0],
    unresolved: /مادة غير محدّدة/.test(t),
    suppliers: m ? Number(m[1]) : 0,
    text: lines.slice(0, 5).join(' | '),
  })
}
writeFileSync(`${SHOTS}/newbooklet-items.json`, JSON.stringify(items, null, 1))

const withSup = items.filter((i) => i.suppliers > 0)
const unres = items.filter((i) => i.unresolved)
console.log('\n=== PROPOSALS SCREEN ===')
console.log(`  cards rendered        : ${items.length}`)
console.log(`  with suppliers        : ${withSup.length}  (total placements ${withSup.reduce((a, b) => a + b.suppliers, 0)})`)
console.log(`  «مادة غير محدّدة»     : ${unres.length}  (${((unres.length / Math.max(1, items.length)) * 100).toFixed(0)}% of rendered)`)
console.log(`  «بلا مورد مؤكد»       : ${items.filter((i) => !i.unresolved && i.suppliers === 0).length}`)
console.log('\n  first 12 rendered:')
for (const it of items.slice(0, 12)) console.log('   ' + it.text)
console.log('\n=== API CALLS ===')
console.log(calls.join('\n') || '(none)')
await page.screenshot({ path: `${SHOTS}/newbooklet-proposals.png`, fullPage: false })
await browser.close()
