/**
 * Reads, for one item, the suppliers the interface actually offers and the
 * evidence label it attaches to each — so «وجد فرق 8 موردًا» can be judged
 * against what those eight are, rather than taken at face value.
 *
 *   FARQ_EMAIL=… FARQ_PASSWORD=… node scripts/smoke-supplier-fit.mjs <url> <boq> [cardIndex]
 */
import { chromium } from 'playwright-core'

const URL = process.argv[2]
const BOQ = process.argv[3]
const ONLY = process.argv[4] ? Number(process.argv[4]) : null
const SHOTS = process.env.SHOT_DIR || '/tmp'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 2600 } })

await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', process.env.FARQ_EMAIL)
await page.fill('input[type=password]', process.env.FARQ_PASSWORD)
await page.getByRole('button').first().click()
await page.waitForTimeout(8000)

await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'اختر ملفًا' }).first().click()
await page.waitForTimeout(1200)
await page.setInputFiles('input[type=file]', BOQ)
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000)
  if (/اكتملت القراءة|تعذّرت/.test(await page.locator('body').innerText())) break
}
await page.getByText(/عرض الموردين/).first().click()
await page.waitForTimeout(12000)

const toggles = page.locator('button.w-full.flex.items-start')
const n = await toggles.count()
// Ready cards render expanded already — clicking would collapse them.
for (let i = 0; i < n; i++) {
  if (ONLY !== null && i + 1 !== ONLY) continue
  const card = toggles.nth(i).locator('xpath=..')
  console.log(`\n================ CARD ${i + 1}\n${(await card.innerText()).trim()}`)
}
await page.screenshot({ path: `${SHOTS}/supplier-fit.png`, fullPage: false })

const pulses = await page.locator('.animate-pulse-dot, .animate-pulse, .animate-spin').count()
console.log(`\nANIMATED ELEMENTS ON PROPOSALS SCREEN: ${pulses}`)
await browser.close()
