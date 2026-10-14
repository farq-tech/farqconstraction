/**
 * Signed-in half of the deployed journey, in real Chrome.
 *
 * Credentials come from FARQ_EMAIL and FARQ_PASSWORD in the environment and are
 * never written down here. Nothing in this file prints them.
 *
 *   FARQ_EMAIL=… FARQ_PASSWORD=… node scripts/smoke-signed-in.mjs <url> <pdf>
 */
import { chromium } from 'playwright-core'
import { CONSTRUCTION_APP_URL } from './app-url.mjs'

const URL = process.argv[2] || CONSTRUCTION_APP_URL
const PDF = process.argv[3]
const EMAIL = process.env.FARQ_EMAIL
const PASSWORD = process.env.FARQ_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('set FARQ_EMAIL and FARQ_PASSWORD in the environment')
  process.exit(2)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } })

/** Header evidence, recorded per construction call. Values are never stored. */
const seen = []
page.on('request', (r) => {
  const u = r.url()
  if (!u.includes('/api/')) return
  const h = r.headers()
  seen.push({
    call: `${r.method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`,
    auth: Boolean(h['authorization']),
    demo: Boolean(h['x-construction-demo-user']),
  })
})
const blocked = []
page.on('requestfailed', (r) => {
  if (r.url().includes('/api/')) blocked.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`)
})
const statuses = []
page.on('response', (r) => {
  if (r.url().includes('/api/')) statuses.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`)
})

// ── 1. sign in ────────────────────────────────────────────────────────────
await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle', timeout: 60_000 })
const gotLoginScreen = (await page.locator('input[type=email]').count()) > 0
console.log(`1. sign-in screen reachable: ${gotLoginScreen}`)
if (!gotLoginScreen) { console.log('STOP — no sign-in screen'); await browser.close(); process.exit(1) }

await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', PASSWORD)
await page.getByRole('button').first().click()
await page.waitForTimeout(9000)

const signedIn = await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && /farq|session/i.test(k) && /access|token/i.test(localStorage.getItem(k) || '')) return true
  }
  return false
})
const bodyAfterLogin = await page.locator('body').innerText()
console.log(`   session stored: ${signedIn}`)
console.log(`   still on login screen: ${(await page.locator('input[type=password]').count()) > 0}`)
const err = bodyAfterLogin.split('\n').filter((l) => /خطأ|فشل|غير صحيح|تعذّر/.test(l)).slice(0, 2)
if (err.length) console.log(`   message on screen: ${err.join(' | ')}`)

// ── 2. upload ─────────────────────────────────────────────────────────────
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const entry = page.getByRole('button', { name: 'اختر ملفًا' }).first()
if (await entry.count()) await entry.click()
await page.waitForTimeout(1500)
console.log(`\n2. upload screen: ${(await page.locator('input[type=file]').count()) > 0}`)
await page.setInputFiles('input[type=file]', PDF)

let t = ''
for (let i = 1; i <= 60; i++) {
  await page.waitForTimeout(4000)
  t = await page.locator('body').innerText()
  if (/اكتملت القراءة|توقفت القراءة|تعذّرت القراءة/.test(t)) { console.log(`   settled ~${i * 4}s`); break }
}
console.log(`   complete=${/اكتملت القراءة/.test(t)} partial=${/توقفت القراءة/.test(t)} failed=${/تعذّرت القراءة/.test(t)}`)

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('div.px-4.py-3')].map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean))
const itemRows = rows.filter((r) => /^\d+\s/.test(r))
console.log(`   item rows: ${itemRows.length}`)
console.log(itemRows.slice(0, 5).join('\n'))

// ── 3. specification join ─────────────────────────────────────────────────
const specLine = t.split('\n').find((l) => /المواصفات الفنية/.test(l))
console.log(`\n3. specification join: ${specLine ? specLine.trim() : '(no shortfall line — specs may be complete)'}`)
const withSpec = itemRows.filter((r) => (r.match(/·/g) || []).length >= 2).length
console.log(`   item rows carrying an extra spec segment: ${withSpec} / ${itemRows.length}`)
console.log(`   server match failed banner: ${/مطابقة الموردين لم تعمل على الخادم/.test(t)}`)

await page.screenshot({ path: '/tmp/signed-items.png', fullPage: true })

// ── 4. supplier matching ──────────────────────────────────────────────────
const nx = page.getByText(/عرض الموردين/).first()
if (await nx.count()) {
  console.log(`\n4. next: ${(await nx.innerText()).trim()}`)
  await nx.click()
  await page.waitForTimeout(15000)
  const s = await page.locator('body').innerText()
  console.log(s.split('\n').filter((l) => /بندًا|جاهزة|يحتاج موردين|قرأ فرق/.test(l)).slice(0, 6).join('\n'))
  const counts = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('div')) {
      const m = el.innerText?.match(/وجدنا\s+(\S+)\s+مورد/)
      if (m && el.children.length < 6) out.push(m[0])
    }
    return out
  })
  console.log(`   per-item supplier phrases (first 12): ${counts.slice(0, 12).join(' | ') || '(none)'}`)
  console.log(`   items still searching: ${(s.match(/فرق يبحث عنها/g) || []).length}`)
  await page.screenshot({ path: '/tmp/signed-suppliers.png', fullPage: true })
} else {
  console.log('\n4. suppliers: NEXT BUTTON NOT RENDERED')
}

// ── header evidence ───────────────────────────────────────────────────────
const construction = seen.filter((s) => s.call.includes('/api/construction'))
console.log(`\n=== HEADERS on ${construction.length} construction calls ===`)
console.log(`   with Authorization: ${construction.filter((s) => s.auth).length}`)
console.log(`   with x-construction-demo-user: ${construction.filter((s) => s.demo).length}`)
console.log('\n=== STATUSES ===\n' + [...new Set(statuses)].join('\n'))
console.log('\n=== BLOCKED ===\n' + ([...new Set(blocked)].join('\n') || '(none)'))

await browser.close()
