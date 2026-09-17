/**
 * Gate B: genuinely attempt a disallowed send with a real signed-in session,
 * and record exactly what the user sees and what reaches the network.
 */
import { chromium } from 'playwright-core'
const URL = process.argv[2], PDF = process.argv[3]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })

const wire = []
page.on('request', (r) => {
  const m = r.method()
  if (m === 'GET' || m === 'HEAD' || !r.url().includes('/api/')) return
  const p = r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (/auth\/(login|refresh)|boq\/match|suppliers\/match|boq\/parse-pdf/.test(p)) return
  wire.push(`${m} ${p}`)
})
page.on('response', async (r) => {
  const p = r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (/rfqs$|invites|awards/.test(p) && r.request().method() !== 'GET') {
    console.log(`  [server] ${r.status()} ${r.request().method()} ${p}`)
  }
})

await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', process.env.FARQ_EMAIL)
await page.fill('input[type=password]', process.env.FARQ_PASSWORD)
await page.getByRole('button').first().click()
await page.waitForTimeout(8000)

await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'اختر ملفًا' }).first().click()
await page.waitForTimeout(1200)
await page.setInputFiles('input[type=file]', PDF)
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000)
  if (/اكتملت القراءة|تعذّرت/.test(await page.locator('body').innerText())) break
}
await page.getByText(/عرض الموردين/).first().click()
await page.waitForTimeout(15000)

const bar = await page.locator('text=موردًا محددًا').first().innerText().catch(() => '(n/a)')
console.log(`state before send: ${bar.replace(/\s+/g, ' ')}`)

// ── the genuine attempt ───────────────────────────────────────────────────
const open = page.getByRole('button', { name: 'إرسال طلب التسعير' })
console.log(`\n1. send button present: ${await open.count() > 0}, enabled: ${await open.first().isEnabled().catch(() => false)}`)
await open.first().click()
await page.waitForTimeout(2500)
const modalOpen = await page.getByRole('button', { name: /إنشاء وإرسال/ }).count()
console.log(`2. modal opened, confirm button present: ${modalOpen > 0}`)
await page.screenshot({ path: (process.env.SHOT_DIR||'/tmp')+'/gateb-modal.png' })

const before = await page.locator('body').innerText()
await page.getByRole('button', { name: /إنشاء وإرسال/ }).first().click()
console.log('3. pressed confirm — waiting')
await page.waitForTimeout(12000)
const after = await page.locator('body').innerText()

console.log('\n=== WHAT CHANGED ON SCREEN ===')
const newLines = after.split('\n').filter((l) => l.trim() && !before.includes(l.trim()))
console.log(newLines.slice(0, 20).join('\n') || '(NOTHING CHANGED — click did nothing)')

console.log('\n=== SUCCESS-LOOKING SIGNALS (must be none) ===')
for (const s of ['تم الإرسال', 'أُرسل', 'نجح', 'تم إنشاء', 'بريد · قبول']) {
  if (after.includes(s)) console.log(`  PRESENT: ${s}`)
}
console.log('  (end)')

console.log('\n=== REFUSAL MESSAGE VISIBLE? ===')
const refusal = after.split('\n').filter((l) => /للقراءة فقط|معطّل|لن يصل|تجريبية/.test(l))
console.log(refusal.join('\n') || '(none)')

await page.screenshot({ path: (process.env.SHOT_DIR||'/tmp')+'/gateb-after.png' })
console.log('\n=== WRITES THAT REACHED THE NETWORK ===')
console.log(wire.length ? wire.join('\n') : '(none)')
await browser.close()
