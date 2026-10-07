from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 api=[];page.on('request',lambda r:api.append(r.url) if '/api/' in r.url or '/_api/' in r.url else None)
 page.goto('http://127.0.0.1:8765/how-it-works/',wait_until='networkidle')
 page.evaluate('document.querySelectorAll("a[data-event]").forEach(a=>a.addEventListener("click",e=>e.preventDefault()))')
 page.locator('[data-event=hero_start_rfq]').click()
 page.locator('[data-event=watch_how_it_works]').click()
 page.locator('[data-event=contractor_cta]').first.click()
 page.locator('#demo-start').scroll_into_view_if_needed();page.locator('#demo-start').click()
 page.locator('[data-supplier-open]').first.scroll_into_view_if_needed();page.locator('[data-supplier-open]').first.click()
 assert page.locator('#supplier-dialog').is_visible()
 assert page.locator('main').get_attribute('aria-hidden')=='true'
 page.keyboard.press('Escape');page.wait_for_function('document.querySelector("main").getAttribute("aria-hidden")===null')
 page.locator('.faq-item summary').first.scroll_into_view_if_needed();page.locator('.faq-item summary').first.click()
 names=page.evaluate('[...new Set(window.dataLayer.map(e=>e.event))]')
 expected={'hero_start_rfq','supplier_signup','watch_how_it_works','demo_started','contractor_cta','supplier_cta','faq_opened'}
 assert expected<=set(names),names
 assert not api,api
 print('ALL 7 EVENTS PASS',names,'demo procurement requests:',len(api))
 page.evaluate('document.querySelectorAll(".faq-item summary")[1].focus()');page.keyboard.press('Enter');assert page.locator('.faq-item').nth(1).get_attribute('open') is not None
 print('KEYBOARD FAQ PASS')
 b.close()
