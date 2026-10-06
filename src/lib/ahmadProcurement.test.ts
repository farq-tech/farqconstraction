import type { ConstructionRfq } from '../api/constructionClient'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {completionRequest, requestPageContext, missingSpecifications,comparisonSummary,prepareDraftEdit,executeDraftEdit,documentSummary} from './ahmadProcurement'
import * as api from '../api/constructionClient'
import {farqSession} from '../api/farqSession'
vi.mock('../api/constructionClient',()=>({getConstructionRfq:vi.fn(),getConstructionComparison:vi.fn(),updateConstructionRfqDraft:vi.fn()}))
vi.mock('../api/farqSession',()=>({farqSession:{getUser:vi.fn(()=>({id:'owner'}))}}))
const line={line_key:'1:BEAD',farq_spec_id:'BEAD',name_ar:'Bead Mastic',quantity:12,uom:'كرتون',item_note:'يرجى تأكيد طول اللفة وعدد اللفات',spec_card:{thickness:'4.76 مم',material:'mastic',brand:'Brand'}}
const request={id:'rfq',status:'DRAFT_NOT_SENT',current_version:{id:'v1',payload:{lines:[line]}}} as unknown as api.ConstructionRfq
beforeEach(()=>{vi.clearAllMocks();vi.mocked(farqSession.getUser).mockReturnValue({id:'owner'} as never);vi.mocked(api.getConstructionRfq).mockResolvedValue(request)})
describe('Ahmad procurement review',()=>{
 it('asks for actual packing values even when the note says to confirm them',()=>{const result=missingSpecifications(request).join(' ');expect(result).toContain('طول اللفة');expect(result).toContain('عدد اللفات');expect(result).toContain('صورة فعلية')})
 it('prepares thickness change without writing or changing quantity, brand or supplier identity',async()=>{const result=await prepareDraftEdit('عدل السماكة إلى 5 مم','rfq');expect(result.action?.lines[0].spec_card).toEqual({...line.spec_card,thickness:'5 مم'});expect(result.action?.lines[0].quantity).toBe(12);expect(api.updateConstructionRfqDraft).not.toHaveBeenCalled();expect(result.text).toContain('4.76 مم')})
 it('refuses ambiguous line edits and sent request edits',async()=>{vi.mocked(api.getConstructionRfq).mockResolvedValue({...request,current_version:{...request.current_version,payload:{lines:[line,line]}}} as never);expect((await prepareDraftEdit('عدل السماكة إلى 5 مم','rfq')).action).toBeUndefined();vi.mocked(api.getConstructionRfq).mockResolvedValue({...request,status:'SENT'});expect((await prepareDraftEdit('عدل السماكة إلى 5 مم','rfq')).action).toBeUndefined()})
 it('checks approving identity and sends the exact version guard only after confirmation',async()=>{const result=await prepareDraftEdit('عدل السماكة إلى 5 مم','rfq');if(!result.action)throw Error('no action');vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('CustomEvent',class{constructor(public type:string,public options:unknown){}});await executeDraftEdit(result.action);expect(api.updateConstructionRfqDraft).toHaveBeenCalledWith('rfq','v1',result.action.lines);vi.mocked(farqSession.getUser).mockReturnValue({id:'other'} as never);await expect(executeDraftEdit(result.action)).rejects.toThrow('تغيّر الحساب');expect(api.updateConstructionRfqDraft).toHaveBeenCalledTimes(1);vi.unstubAllGlobals()})
 it('does not pick incomplete cheap offers as best or treat unknown shipping and tax as zero',()=>{const c={rfq:{...request,current_version:{...request.current_version,payload:{lines:[line,line]}}},supplier_responses:[{supplier:{id:'cheap',name_ar:'رخيص'},offer:{currency:'SAR',totals:{total:100}}},{supplier:{id:'full',name_ar:'كامل'},offer:{currency:'SAR',prices_include_tax:true,shipping_mode:'INCLUDED',delivery:0,unloading:0,mandatory_fees:0,lead_time_days:7,payment_status:'CONFIRMED',payment_terms:'عند التسليم',valid_until:'2099-12-31T00:00:00Z',declaration_accepted:true,lines:[{available:true,unit_price:100,quantity:12,available_quantity:12,compliance:'MATCH'},{available:true,unit_price:100,quantity:12,available_quantity:12,compliance:'MATCH'}],totals:{total:200,tax:0}}}],quote_matrix:{supplier_summaries:[{supplier_id:'cheap',coverage:{complete:false,priced:1,requested:2}},{supplier_id:'full',coverage:{complete:true,priced:2,requested:2}}]}} as unknown as api.ConstructionComparison;const result=comparisonSummary(c);expect(result).toContain('الأقل إجماليًا بين العروض مكتملة البنود وبعملة SAR وعلى نفس أساس الضريبة: كامل');expect(result).toContain('الضريبة غير معروفة');expect(result).toContain('الشحن غير معروف');expect(result).toContain('لا يمكن الجزم بالأنسب')})
 it('makes extraction uncertainty and no saving explicit',()=>{expect(documentSummary({summary:null,items:[{name:'steel',quantity:null,unit:null,unit_price:null,total:0,specification:null,uncertain:true}],tax:null,shipping:null,payment:null,delivery:null,review_required:true,uncertainties:[]})).toContain('استخراج آلي أولي');expect(documentSummary({items:[],uncertainties:[]} as never)).toContain('لم تُحفظ الأسعار')})
})

it('maps the open invitation to its actual supplier and clears conversation context outside messages',()=>{
 const r={invitations:[{id:'invite-1',supplier_id:'supplier-1',supplier:{id:'supplier-1'}}]} as unknown as ConstructionRfq
 expect(requestPageContext(r,'rfq-1','messages','invite-1')).toMatchObject({threadId:'invite-1',supplierId:'supplier-1'})
 expect(requestPageContext(r,'rfq-1','items','invite-1').threadId).toBeUndefined()
 expect(requestPageContext(r,'rfq-1','messages','missing').supplierId).toBeUndefined()
})

it('does not label a complete targeted subset as a complete RFQ offer and reports known VAT basis',()=>{
 const c={rfq:{current_version:{payload:{lines:[{},{}]}}},supplier_responses:[{supplier:{id:'s',name_ar:'جزئي'},offer:{currency:'SAR',prices_include_tax:true,totals:{total:10},lines:[]}}],quote_matrix:{supplier_summaries:[{supplier_id:'s',coverage:{complete:true,priced:1,requested:1}}]}} as any
 const answer=comparisonSummary(c)
 expect(answer).toContain('السعر شامل الضريبة')
 expect(answer).toContain('1/2 من بنود الطلب الكامل')
 expect(answer).not.toContain('الأقل إجماليًا بين العروض مكتملة')
})

it('does not rank gross and net prices together even when both offers cover the whole request',()=>{
 const c={rfq:request,supplier_responses:[true,false].map((vat,i)=>({supplier:{id:String(i)},offer:{currency:'SAR',prices_include_tax:vat,totals:{total:100+i}}})),quote_matrix:{supplier_summaries:[0,1].map(i=>({supplier_id:String(i),coverage:{complete:true,priced:1,requested:1}}))}} as any
 expect(comparisonSummary(c)).not.toContain('الأقل إجماليًا بين العروض مكتملة')
})

it('prepares one scoped completion message and never sends it',()=>{
 const c={supplier_responses:[{supplier:{id:'a',name_ar:'المورد أ'},offer:{quoteVersionId:'qa',lines:[]}},{supplier:{id:'b'},offer:{quoteVersionId:'qb',lines:[]}}]} as unknown as api.ConstructionComparison
 expect(completionRequest(c)).toContain('حدد عرض مورد واحد')
 const draft=completionRequest(c,'a','qa');expect(draft).toContain('المورد أ');expect(draft).toContain('شروط الدفع');expect(draft).toContain('لم تُرسل');expect(draft).not.toContain('المورد ب')
})
