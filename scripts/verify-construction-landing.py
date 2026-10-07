from playwright.sync_api import sync_playwright
from pathlib import Path
import json
out=Path(__file__).resolve().parents[1]/'artifacts'/'landing';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 for name,width,height in [('desktop',1440,1000),('tablet',768,1024),('mobile',390,844),('small-mobile',320,640)]:
  page=b.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8765/how-it-works/',wait_until='networkidle')
  page.wait_for_timeout(800)
  print(name,'font',page.evaluate('document.fonts.check("900 24px Cairo")'),'pageheight',page.evaluate('document.body.scrollHeight'))
  page.screenshot(path=str(out/(name+'-hero.png')))
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),name+' overflow top'
  stages=[]
  for i in range(5):
   step=page.locator('.story-step').nth(i)
   page.evaluate('(el)=>scrollTo(0,scrollY+el.getBoundingClientRect().top-'+str(height*.3)+')',step.element_handle())
   page.wait_for_timeout(700)
   active=page.locator('#story-screen').get_attribute('data-active');stages.append(active)
   if i in [2,4]:page.screenshot(path=str(out/(name+'-story-'+str(i)+'.png')))
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),name+' story overflow'
  print(name,'story states',stages)
  assert stages==['0','1','2','3','4'],name+' failed scroll storytelling'
  page.locator('#demo-start').scroll_into_view_if_needed();page.locator('#demo-start').click()
  page.wait_for_timeout(2900)
  assert page.locator('#demo-results').is_visible()
  assert any(x.get('event')=='demo_started' for x in page.evaluate('window.dataLayer'))
  page.screenshot(path=str(out/(name+'-demo.png')))
  page.locator('#demo-reset').click();assert page.locator('#demo-start').is_enabled()
  page.locator('[data-supplier-open]').first.scroll_into_view_if_needed();page.locator('[data-supplier-open]').first.click()
  assert page.locator('#supplier-dialog').is_visible()
  page.keyboard.press('Escape');assert not page.locator('#supplier-dialog').is_visible()
  page.wait_for_function('!document.querySelector("main").inert')
  page.wait_for_function('document.activeElement.hasAttribute("data-supplier-open")')
  faq=page.locator('.faq-item').first;faq.locator('summary').scroll_into_view_if_needed();faq.locator('summary').click();page.wait_for_timeout(400)
  assert faq.get_attribute('open') is not None
  assert any(x.get('event')=='faq_opened' for x in page.evaluate('window.dataLayer'))
  faq.locator('summary').click();page.wait_for_timeout(450);assert faq.get_attribute('open') is None
  page.evaluate('scrollTo(0,document.body.scrollHeight)');page.wait_for_timeout(600)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),name+' bottom overflow'
  assert not errors,errors
  print(name,'PASS','errors',errors)
  page.close()
 page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 page.goto('http://127.0.0.1:8765/how-it-works/',wait_until='networkidle')
 assert page.locator('#hero-stage').get_attribute('data-stage')=='5'
 assert not page.locator('#hero-motion').is_visible()
 page.locator('#demo-start').scroll_into_view_if_needed();page.locator('#demo-start').click();assert page.locator('#demo-results').is_visible()
 print('reduced motion PASS')
 page.close()
 page=b.new_page(viewport={'width':1440,'height':1000})
 page.goto('http://127.0.0.1:8765/how-it-works/',wait_until='networkidle');page.wait_for_timeout(7200)
 print('hero completion stage',page.locator('#hero-stage').get_attribute('data-stage'))
 assert page.locator('#hero-stage').get_attribute('data-stage')=='5'
 page.screenshot(path=str(out/'desktop-hero-complete.png'))
 page.locator('#hero-motion').click();assert page.locator('#hero-stage').get_attribute('data-stage')=='0'
 print('hero replay PASS')
 b.close()
