import asyncio,json,time
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [1440,390,320]:
   page=await browser.new_page(viewport={'width':width,'height':900})
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   await page.route('**/api/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'data':{}})))
   captured=[]
   async def signup(route):
    captured.append(route.request.post_data_json)
    await route.fulfill(status=200,content_type='application/json',body=json.dumps({'data':{'access_token':'mock-session','refresh_token':'mock-refresh','expires_at':int(time.time())+3600,'expires_in':3600,'user':{'id':'11111111-1111-4111-8111-111111111111','email':'test@example.sa','email_verified':False}}}))
   await page.route('**/api/auth/signup',signup)
   await page.goto('http://localhost:8765/?view=signup')
   await page.get_by_role('heading',name='إنشاء حساب مقاول').wait_for()
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
   for key,value in {'companyName':'شركة الاختبار','contactName':'مسؤول الاختبار','city':'الرياض','phone':'0551234567','email':'test@example.sa','password':'long-password','confirm':'wrong-password'}.items():await page.locator('#signup-'+key).fill(value)
   await page.get_by_role('checkbox').check()
   await page.get_by_role('button',name='أنشئ حساب المنشأة').click()
   await page.get_by_role('alert').wait_for()
   assert not captured
   await page.locator('#signup-confirm').fill('long-password')
   await page.screenshot(path=f'/tmp/registration-{width}.png',full_page=True)
   await page.get_by_role('button',name='أنشئ حساب المنشأة').click()
   await page.get_by_role('heading',name='حساب منشأتك جاهز').wait_for()
   assert len(captured)==1 and captured[0]['contractor']['contactConsent']==True
   assert not errors,errors
   print('passed',width,'validation, submission, success, no overflow or JS errors')
   await page.close()
  await browser.close()
asyncio.run(main())
