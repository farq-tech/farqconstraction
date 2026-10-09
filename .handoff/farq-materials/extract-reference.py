import json,re,html,urllib.request,concurrent.futures
from pathlib import Path
rows=json.loads(Path('.handoff/almabsat-catalog/products.json').read_text())
mapfam={'cement':('cement_binders','الأسمنت والمواد الرابطة'),'sand':('aggregates_fill','الركام ومواد الردم'),'blocks':('masonry_blocks','البلوك ومواد المباني')}
fields={'cement':['المصنع','نوع الأسمنت','وزن الكيس','المواصفة','الكمية ووحدتها'],'sand':['نوع المادة','المقاس أو التدرج','الكمية ووحدتها','سائب أو أكياس','موقع التسليم'],'blocks':['نوع البلك','الأبعاد','مقاومة الضغط','الكثافة','مصمت أو مفرغ','مادة العزل','الكمية']}
def fetch(pair):
 i,r=pair
 family,label=mapfam[r['category']]
 p=dict(id='farq-material-'+str(i+1).zfill(3),name=r['name'],family_id=family,family_label=label,sector_id='CIVIL_CONCRETE',source_url=r['source'],reference_image_url=r['image'],reference_image_license='unverified',image_kind='family_illustration',image='images/'+r['category']+'.png',price=None,availability='unknown',required_fields=fields[r['category']],specifications=[],record_type='product' if '/sku/' in r['image'] else 'group')
 try:
  req=urllib.request.Request(r['source'],headers={'User-Agent':'Farq-Catalog-Reference/1.0'})
  s=urllib.request.urlopen(req,timeout=20).read().decode()
  for k,v in re.findall(r'class="specs-box-label">(.*?)</span>\s*<span class="specs-box-value">(.*?)</span>',s,re.S):
   k=html.unescape(re.sub('<[^>]+>','',k)).strip();v=html.unescape(re.sub('<[^>]+>','',v)).strip()
   # Keep compact factual values, never copy sales prose or retailer delivery promises.
   if k in ['نوع الأسمنت','الوزن','المواصفات','مادة البلك','المقاسات','مقاومة الضغط','الكثافة','مصمت أو مفرغ','مادة العزل'] and len(v)<100 and not any(w in v for w in ['حسب','تتوفر','يتوفر']): p['specifications'].append({'field':k,'value':v,'verification':'reference_only','source_url':r['source']})
  p['source_status']='read'
 except Exception as e:p['source_status']='unavailable';p['source_error']=type(e).__name__
 return p
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: products=list(pool.map(fetch,enumerate(rows)))
out={'version':1,'brand':'Farq','reference_only':True,'families':[{'id':v[0],'name':v[1],'sector_id':'CIVIL_CONCRETE'} for v in mapfam.values()],'products':products}
Path('public/catalog/farq-materials/catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps({'cards':len(products),'products':sum(x['record_type']=='product' for x in products),'groups':sum(x['record_type']=='group' for x in products),'sources_read':sum(x['source_status']=='read' for x in products),'factual_fields':sum(len(x['specifications']) for x in products)},ensure_ascii=False))
