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

// Every construction call with its status and how long the server took, so
// «matching ran on the server» is a set of status codes rather than a claim.
const calls = []
const started = new Map()
page.on('request', (r) => started.set(r, Date.now()))
page.on('response', (r) => {
  const u = r.url()
  if (!u.includes('/api/construction/')) return
  const ms = Date.now() - (started.get(r.request()) ?? Date.now())
  calls.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} — ${ms}ms`)
})
page.on('requestfailed', (r) => {
  if (r.url().includes('/api/construction/')) {
    calls.push(`BLOCKED ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]} — ${r.failure()?.errorText}`)
  }
})

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
for (let i = 0; i < await toggles.count(); i++) {
  await toggles.nth(i).click().catch(() => {})
}
await page.waitForTimeout(1500)
const cards = page.locator('div.bg-white.rounded-2xl')
const n = await cards.count()
const zeros = []
const unresolved = []
const matched = []
// Does the line carry technical text by this screen, or only the structural
// code the quantities table already printed? That is what decides whether the
// upload screen's «specifications have not arrived» count is a stale snapshot.
let withTechText = 0
const sanitary = []
for (let i = 0; i < n; i++) {
  const t = (await cards.nth(i).innerText().catch(() => '')).trim()
  const isCard = /بلا مورد مؤكد|مادة غير محدّدة|وجد فرق/.test(t)
  if (!isCard) continue
  if (/بلا مورد مؤكد/.test(t)) zeros.push(t)
  else if (/مادة غير محدّدة/.test(t)) unresolved.push(t)
  else matched.push(t)
  // The spec line is «<qty> <unit> · <spec>». Technical text is anything in
  // that slot beyond the bare «رمز إنشائي NNNN».
  const specSlot = (t.split('\n').find((l) => l.includes('·')) || '').split('·').slice(1).join('·').trim()
  if (specSlot && !/^رمز إنشائي\s*\d*$/.test(specSlot)) withTechText++
  if (/مرحاض|كرسي إفرنجي|قاعدة حمام/.test(t)) sanitary.push(t)
}
out('SPEC TEXT BY PROPOSALS SCREEN', `${withTechText} of ${zeros.length + unresolved.length + matched.length} cards carry technical text beyond «رمز إنشائي»`)
out('GATE A PROBE — wc_sanitaryware (مرحاض)', sanitary.join('\n---\n') || '(no sanitaryware line found on screen)')
out('1a. «بلا مورد مؤكد» ITEMS (verbatim, first 2)', zeros.slice(0, 2).join('\n---\n') || '(none on screen)')
out('1b. «مادة غير محدّدة» ITEMS (verbatim, first 1)', unresolved.slice(0, 1).join('\n') || '(none on screen)')
out('1c. MATCHED ITEMS (control, first 1)', matched.slice(0, 1).join('\n') || '(none on screen)')
out('counts', `«بلا مورد مؤكد»: ${zeros.length} · «مادة غير محدّدة»: ${unresolved.length} · matched: ${matched.length}`)
out('CONSTRUCTION API CALLS', calls.join('\n') || '(none)')

await page.screenshot({ path: (process.env.SHOT_DIR||'/tmp')+'/strings-proposals.png', fullPage: false })
await browser.close()
