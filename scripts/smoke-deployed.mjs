import { chromium } from 'playwright-core'
const URL = process.argv[2], PDF = process.argv[3]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } })
const api = []
page.on('response', r => { if (r.url().includes('/api/construction')) api.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/,'')}`) })
page.on('requestfailed', r => { if (r.url().includes('/api/construction')) api.push(`BLOCKED ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/,'')} (${r.failure()?.errorText})`) })
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
console.log('banner:', await page.getByText('نسخة تجريبية للقراءة فقط').count() > 0)
// The home card's button navigates; the card itself only opens a picker.
await page.getByRole('button', { name: 'اختر ملفًا' }).first().click()
await page.waitForTimeout(1500)
console.log('on upload view:', await page.getByText('ارفع ملف الكراسة').count() > 0)
await page.setInputFiles('input[type=file]', PDF)
let t = ''
for (let i = 1; i <= 45; i++) { await page.waitForTimeout(4000); t = await page.locator('body').innerText()
  if (/اكتملت القراءة|توقفت القراءة|تعذّرت القراءة/.test(t)) { console.log(`settled ~${i*4}s`); break } }
console.log(`\ncomplete=${/اكتملت القراءة/.test(t)} partial=${/توقفت القراءة/.test(t)} failed=${/تعذّرت القراءة/.test(t)}`)
const rows = await page.evaluate(()=>[...document.querySelectorAll('div.px-4.py-3')].map(e=>e.innerText.trim().replace(/\s+/g,' ')).filter(Boolean))
console.log(`\n=== ITEM ROWS RENDERED: ${rows.length} ===`)
console.log(rows.slice(0,6).join('\n')+'\n  ...\n'+rows.slice(-2).join('\n'))
console.log('\n=== SUMMARY LINES ===\n'+t.split('\n').filter(l=>/بند|مورد|اكتملت|توقفت|المصدر/.test(l)).join('\n'))
await page.screenshot({ path:'/tmp/smoke-items.png', fullPage:true })
const nx = page.getByText(/عرض الموردين/).first()
if (await nx.count()) { console.log('\nNEXT:', (await nx.innerText()).trim()); await nx.click(); await page.waitForTimeout(10000)
  console.log('\n=== SUPPLIERS SCREEN ===\n'+(await page.locator('body').innerText()).slice(0,1000)); await page.screenshot({path:'/tmp/smoke-suppliers.png',fullPage:true}) }
else console.log('\nNEXT BUTTON NOT RENDERED')
console.log('\n=== API ===\n'+([...new Set(api)].join('\n')||'(none)'))
await browser.close()
