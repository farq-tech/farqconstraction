/**
 * Are the API calls being issued and answered, or not reaching the server at
 * all? Distinguishes an unreachable API from one that answers with a refusal,
 * because the interface reports both as «لا يمكن الوصول».
 *
 * Runs the same page twice: once with no session, once signed in.
 *
 *   FARQ_EMAIL=… FARQ_PASSWORD=… node scripts/probe-api-reachability.mjs <url>
 */
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'https://farq-construction.vercel.app'
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function probe(label, signIn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  const answered = []
  const failed = []
  page.on('response', (r) => {
    const u = r.url()
    if (!u.includes('/api/')) return
    const h = r.request().headers()
    answered.push(
      `${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}` +
        ` [auth:${h['authorization'] ? 'yes' : 'no'} demo:${h['x-construction-demo-user'] ? 'yes' : 'no'}]`,
    )
  })
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/api/')) return
    failed.push(
      `FAILED ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]}` +
        ` — ${r.failure()?.errorText || 'unknown'}`,
    )
  })

  if (signIn) {
    await page.goto(`${URL}/?view=login`, { waitUntil: 'networkidle' })
    await page.fill('input[type=email]', process.env.FARQ_EMAIL)
    await page.fill('input[type=password]', process.env.FARQ_PASSWORD)
    await page.getByRole('button').first().click()
    await page.waitForTimeout(7000)
  }
  // The supplier directory is the cheapest screen that must talk to the API.
  await page.goto(`${URL}/?view=suppliers`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(9000)

  console.log(`\n========== ${label}`)
  console.log('ANSWERED BY SERVER:')
  console.log(answered.length ? answered.map((a) => '  ' + a).join('\n') : '  (none)')
  console.log('NEVER REACHED SERVER:')
  console.log(failed.length ? failed.map((a) => '  ' + a).join('\n') : '  (none)')
  const body = await page.locator('body').innerText()
  const banner = body.split('\n').filter((l) => /لا يمكن الوصول|تعذر الاتصال|لم تعمل على الخادم/.test(l))
  console.log('BANNER ON SCREEN:')
  console.log(banner.length ? banner.map((b) => '  ' + b).join('\n') : '  (none)')
  await page.close()
}

await probe('NO SESSION', false)
if (process.env.FARQ_EMAIL) await probe('SIGNED IN', true)
await browser.close()
