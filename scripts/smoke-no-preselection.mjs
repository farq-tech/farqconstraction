/**
 * No supplier may arrive selected. Expands an item, counts how many of its
 * supplier checkboxes are ticked on arrival, and checks the send path refuses
 * until the buyer chooses one.
 *
 *   FARQ_EMAIL=… FARQ_PASSWORD=… node scripts/smoke-no-preselection.mjs <url> <boq> [match]
 */
import { chromium } from 'playwright-core'

const URL = process.argv[2]
const BOQ = process.argv[3]
const MATCH = new RegExp(process.argv[4] || 'مرحاض')
const SHOTS = process.env.SHOT_DIR || '/tmp'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } })

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

const bar = page.locator('div.fixed.bottom-0')
console.log(`SEND BAR: ${(await bar.innerText()).replace(/\s+/g, ' ').trim()}`)
const send = page.getByRole('button', { name: 'إرسال طلب التسعير' })
console.log(`SEND BUTTON ENABLED WITH NOTHING CHOSEN: ${await send.first().isEnabled()}`)

// Find the card by its heading text, then click that heading to expand it.
const heading = page.getByText(MATCH).first()
await heading.scrollIntoViewIfNeeded()
await heading.click()
await page.waitForTimeout(3000)

const total = await page.locator('input[type=checkbox]').count()
let ticked = 0
for (let b = 0; b < total; b++) {
  if (await page.locator('input[type=checkbox]').nth(b).isChecked()) ticked++
}
console.log(`\nEXPANDED ITEM MATCHING /${MATCH.source}/`)
console.log(`  supplier checkboxes on screen: ${total}`)
console.log(`  TICKED ON ARRIVAL: ${ticked}`)
const counter = await page.getByText(/من .* محدد/).first().innerText().catch(() => '(n/a)')
console.log(`  per-item counter: ${counter.replace(/\s+/g, ' ').trim()}`)
const names = await page.locator('label input[type=checkbox] ~ div > div').allInnerTexts().catch(() => [])
console.log(`  suppliers listed: ${names.slice(0, 16).join(' | ')}`)
await page.screenshot({ path: `${SHOTS}/no-preselection.png`, fullPage: false })

// Now make an explicit choice and confirm the send path opens only then.
if (total > 0) {
  await page.locator('input[type=checkbox]').first().check()
  await page.waitForTimeout(1200)
  console.log(`\nAFTER CHOOSING ONE:`)
  console.log(`  send bar: ${(await bar.innerText()).replace(/\s+/g, ' ').trim()}`)
  console.log(`  send button enabled: ${await send.first().isEnabled()}`)
}
await browser.close()
