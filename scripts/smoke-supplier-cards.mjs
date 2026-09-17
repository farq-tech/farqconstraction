import { chromium } from 'playwright-core'
const URL = process.argv[2], PDF = process.argv[3]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', process.env.FARQ_EMAIL)
await page.fill('input[type=password]', process.env.FARQ_PASSWORD)
await page.getByRole('button').first().click()
await page.waitForTimeout(8000)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'اختر ملفًا' }).first().click()
await page.waitForTimeout(1200)
await page.setInputFiles('input[type=file]', PDF)
for (let i = 0; i < 40; i++) { await page.waitForTimeout(3000); if (/اكتملت القراءة|تعذّرت/.test(await page.locator('body').innerText())) break }
await page.getByText(/عرض الموردين/).first().click()
await page.waitForTimeout(15000)

// Every item card as the user reads it.
const cards = await page.evaluate(() => {
  const out = []
  for (const h of document.querySelectorAll('button')) {
    const t = (h.innerText || '').replace(/\s+/g, ' ').trim()
    if (/مورد|يبحث/.test(t) && t.length > 15 && t.length < 260) out.push(t)
  }
  return out
})
const zeros = cards.filter((c) => /يبحث عنها/.test(c))
const matched = cards.filter((c) => !/يبحث عنها/.test(c))
console.log(`item cards: ${cards.length} | matched: ${matched.length} | zero/searching: ${zeros.length}`)
console.log('\n=== ZERO-SUPPLIER ITEMS, VERBATIM ===')
zeros.forEach((z) => console.log('· ' + z))
console.log('\n=== MATCHED ITEMS (first 6) ===')
matched.slice(0, 6).forEach((m) => console.log('· ' + m))

// Open one matched item so a real supplier list is visible, then shoot it.
const target = page.locator('button').filter({ hasText: /مورد/ }).filter({ hasNotText: /يبحث عنها/ }).first()
if (await target.count()) {
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await page.waitForTimeout(3500)
  const box = await target.boundingBox()
  if (box) await page.screenshot({ path: '/tmp/matched-item.png', clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(1240, box.width + 40), height: 900 } })
  else await page.screenshot({ path: '/tmp/matched-item.png' })
  const detail = await page.evaluate(() => {
    const cb = document.querySelector('input[type=checkbox]')
    let n = cb; for (let i = 0; i < 9 && n; i++) n = n.parentElement
    return (n?.innerText || '(no supplier list rendered)').split('\n').filter(Boolean).slice(0, 26)
  })
  console.log('\n=== ONE MATCHED ITEM, EXPANDED ===')
  console.log(detail.join('\n'))
}
await browser.close()
