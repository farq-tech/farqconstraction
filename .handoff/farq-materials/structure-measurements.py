"""Extract only explicitly stated measurements; never infer sale units or stock."""
import json,re
from pathlib import Path
path=Path(__file__).resolve().parents[2]/'public/catalog/farq-materials/catalog.json'
d=json.loads(path.read_text())
translate=str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')
for p in d['products']:
    attributes=[]
    for s in p.get('specifications',[]):
        text=s['value'].translate(translate)
        if s['field']=='الوزن':
            m=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(كجم|كغ|kg)\s*',text,re.I)
            if m:attributes.append({'key':'weight','label':'الوزن','value':float(m[1]),'unit':'kg','original':s['value'],'source_url':s['source_url'],'verification':'reference_only'})
    p['structured_attributes']=attributes
    p['sale_unit']=None
    p['units_per_pack']=None
    p['minimum_order_quantity']=None
    p['requested_quantity']=None
    if p['record_type']=='product':
        for label in ['وحدة البيع','الكمية المطلوبة','عدد الوحدات في العبوة']:
            if label not in p['required_fields']:p['required_fields'].append(label)
        if p['family_id']=='masonry_blocks':
            for label in ['الطول × العرض × الارتفاع مع الوحدة']:
                if label not in p['required_fields']:p['required_fields'].append(label)
        elif p['family_id']=='aggregates_fill':
            for label in ['تدرج وحجم الحبيبات','أساس القياس: طن أو متر مكعب']:
                if label not in p['required_fields']:p['required_fields'].append(label)
d['measurement_policy']={'version':1,'missing_values':None,'supplier_match':'family identifies candidates; dimensions, material, standard and confirmed supplier capability establish product compatibility','quantity_policy':'requested quantity, package count and available stock are separate; no automatic mass-volume conversion without documented density'}
path.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'products':sum(p['record_type']=='product' for p in d['products']),'explicit_weight_records':sum(bool(p['structured_attributes']) for p in d['products'])}))
