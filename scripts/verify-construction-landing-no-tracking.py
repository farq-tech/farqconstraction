from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ORIGIN='http://127.0.0.1:8765'
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 requests=[];page.on('request',lambda r:requests.append(r.url))
 page.goto(ORIGIN+'/how-it-works/',wait_until='networkidle')
 page.evaluate('document.querySelectorAll("a[href^=\'/?view\']").forEach(a=>a.addEventListener("click",e=>e.preventDefault()))')
 page.locator('.hero a[href="/?view=signup"]').first.click()
 page.locator('#demo-start').scroll_into_view_if_needed();page.locator('#demo-start').click()
 page.locator('[data-supplier-open]').first.scroll_into_view_if_needed();page.locator('[data-supplier-open]').first.click()
 assert page.locator('#supplier-dialog').is_visible()
 page.keyboard.press('Escape');page.wait_for_function('document.querySelector("main").getAttribute("aria-hidden")===null')
 page.locator('.faq-item summary').first.scroll_into_view_if_needed();page.locator('.faq-item summary').first.click()
 page.wait_for_load_state('networkidle')
 assert page.evaluate('typeof window.dataLayer==="undefined" && typeof window.gtag==="undefined"'),'tracking globals present'
 assert not page.locator('[data-event],[data-location]').count(),'tracking attributes present'
 external=[u for u in requests if not u.startswith(ORIGIN) and urlparse(u).scheme in ('http','https')]
 api=[u for u in requests if '/api/' in u or '/_api/' in u]
 assert not external,external
 assert not api,api
 print('NO TRACKING PASS: requests',len(requests),'external',len(external),'api',len(api))
 page.evaluate('document.querySelectorAll(".faq-item summary")[1].focus()');page.keyboard.press('Enter');assert page.locator('.faq-item').nth(1).get_attribute('open') is not None
 print('KEYBOARD FAQ PASS')
 b.close()
