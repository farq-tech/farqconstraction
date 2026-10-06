import {expect,it} from 'vitest'
import {mapInvitationsToOfferRows} from './constructionClient'
const rfq={current_version:{payload:{lines:[{}]}},invitations:[{id:'invite',supplier:{id:'supplier',name_ar:'مورد'},response_status:'QUOTED'}]}
const ready={prices_include_tax:true,shipping_mode:'INCLUDED',delivery:0,unloading:0,mandatory_fees:0,lead_time_days:7,payment_status:'CONFIRMED',payment_terms:'عند التسليم',valid_until:'2099-12-31T00:00:00Z',declaration_accepted:true,lines:[{available:true,unit_price:10,quantity:12,available_quantity:12,compliance:'MATCH'}]}
const comparison=(offer:unknown)=>({supplier_responses:[{supplier:{id:'supplier'},offer}],quote_matrix:{supplier_summaries:[{supplier_id:'supplier',coverage:{complete:true,priced:1,requested:1}}]}})
it('a received quote with no readable facts needs completion, not a green complete badge',()=>{expect(mapInvitationsToOfferRows(rfq as never,null)[0].status).toBe('needs_completion')})
it('pricing every line is insufficient when payment or shipping is unknown',()=>{expect(mapInvitationsToOfferRows(rfq as never,comparison({...ready,payment_status:'UNKNOWN'}) as never)[0].status).toBe('needs_completion')})
it('explicit complete facts and complete RFQ coverage can be complete',()=>{expect(mapInvitationsToOfferRows(rfq as never,comparison(ready) as never)[0].status).toBe('complete')})
it('partial available quantity is distinct from missing information',()=>{expect(mapInvitationsToOfferRows(rfq as never,comparison({...ready,lines:[{...ready.lines[0],available_quantity:6}]}) as never)[0].status).toBe('partial')})
