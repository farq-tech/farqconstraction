/**
 * Reads back the three strings that were wrong, from the deployed build, in
 * real Chrome. It asserts nothing: it prints what the screen says so the
 * wording can be judged rather than trusted.
 *
 * With FARQ_EMAIL and FARQ_PASSWORD set it signs in first, which is the only
 * way to reach the «no confirmed supplier» half of the zero state — an
 * unsigned run cannot match suppliers, so every line comes back unresolved and
 * only one of the two wordings is reachable. Credentials are never printed.
 *
 *   [FARQ_EMAIL=… FARQ_PASSWORD=…] node scripts/smoke-strings.mjs <url> <pdf>
 */
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'https://farq-construction.vercel.app'
const PDF = process.argv[3] || 'fixtures/boq/reference-etimad-2020-48.pdf'
const EMAIL = process.env.FARQ_EMAIL
const PASSWORD = process.env.FARQ_PASSWORD

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } })
const out = (label, value) => console.log(`\n### ${label}\n${value}`)

await page.goto(URL, { waitUntil: 'networkidle' })

if (EMAIL && PASSWORD) {
  await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /دخول|تسجيل/ }).first().click()
  await page.waitForTimeout(6000)
  out('signed in?', String(!(await page.locator('input[type="password"]').count())))
} else {
  console.log('\n(no credentials in the environment — running unsigned)')
}

// 3. The sidebar account block, whatever it now says.
const sidebar = await page.locator('aside button').last().innerText().catch(() => '(not found)')
out('3. SIDEBAR ACCOUNT BLOCK', sidebar)

// Upload the booklet.
await page.getByRole('button', { name: /اختر ملفًا/ }).first().click().catch(() => {})
await page.waitForTimeout(1500)
await page.locator('input[type="file"]').first().setInputFiles(PDF)
await page.waitForTimeout(90000)

// 2. The specification note on the upload screen.
const body = await page.locator('body').innerText()
const specLine = body.split('\n').find((l) => l.includes('المواصفات الفنية')) || '(no specification note on screen)'
out('2. SPECIFICATION NOTE', specLine)

// 1. The zero state, on the proposals screen. Navigate by clicking: the parsed
// items live in an in-memory store, so any page reload throws them away and
// the screen then honestly reports having no items.
await page.getByRole('button', { name: /عرض الموردين/ }).first().click()
await page.waitForTimeout(10000)
// Cards only reveal the per-item note once expanded.
const toggles = page.locator('button.w-full.flex.items-start')
for (let i = 0; i < Math.min(await toggles.count(), 12); i++) {
  await toggles.nth(i).click().catch(() => {})
}
await page.waitForTimeout(1500)
const cards = page.locator('div.bg-white.rounded-2xl')
const n = await cards.count()
const zeros = []
const matched = []
for (let i = 0; i < n; i++) {
  const t = (await cards.nth(i).innerText().catch(() => '')).trim()
  if (/بلا مورد مؤكد|مادة غير محدّدة/.test(t)) zeros.push(t)
  else if (/وجد فرق/.test(t)) matched.push(t)
}
out('1. ZERO ITEMS (verbatim, first 3)', zeros.slice(0, 3).join('\n---\n') || '(none on screen)')
out('1b. MATCHED ITEMS (control, first 1)', matched.slice(0, 1).join('\n') || '(none on screen)')
out('counts', `zero-state cards: ${zeros.length} · matched cards: ${matched.length}`)

await page.screenshot({ path: '/tmp/strings-proposals.png', fullPage: false })
await browser.close()
