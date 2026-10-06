import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askAhmadAgent, executeAhmadReply, loadAhmadThreads, prepareAhmadReply } from './ahmadAgent'
import * as api from '../api/constructionClient'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { farqSession } from '../api/farqSession'

vi.mock('../api/constructionClient', () => ({
  getAhmadMemory: vi.fn(), askAhmad: vi.fn(), getAhmadBooklets: vi.fn(), listBuyerRfqs: vi.fn(), getConstructionReports: vi.fn(),
  getConstructionRfq: vi.fn(), getConstructionComparison: vi.fn(), getConstructionBooklet: vi.fn(),
  listConstructionInboxThreads: vi.fn(), getConstructionInboxThread: vi.fn(), replyToConstructionInboxThread: vi.fn(),
}))
vi.mock('../api/constructionSuppliers', () => ({ listConstructionSuppliers: vi.fn() }))
vi.mock('../api/farqSession', () => ({ farqSession: { getUser: vi.fn(() => ({ id: 'buyer-1' })) } }))
beforeEach(() => { vi.clearAllMocks(); vi.mocked(farqSession.getUser).mockReturnValue({ id: 'buyer-1' } as never) })

describe('Ahmad data and actions', () => {
  it('answers booklet count from authenticated data even if the AI endpoint is absent', async () => {
    vi.mocked(api.getAhmadBooklets).mockResolvedValue({ booklets: [{ id: 'a' }, { id: 'b' }] } as never)
    expect((await askAhmadAgent('كم كراسة فيه', [])).text).toContain('2 كراسة')
    expect(api.askAhmad).not.toHaveBeenCalled()
  })
  it('uses directory total rather than the sampled suppliers', async () => {
    vi.mocked(listConstructionSuppliers).mockResolvedValue({ suppliers: [], total: 106000 } as never)
    expect((await askAhmadAgent('كم مورد موجود', [])).text).toContain('106,000')
  })
  it('does not claim an unavailable source contains zero booklets', async () => {
    vi.mocked(api.getAhmadBooklets).mockRejectedValue(new Error('الكراسات غير متاحة'))
    await expect(askAhmadAgent('كم كراسة', [])).rejects.toThrow('غير متاحة')
  })
  it('follows correspondence pagination and de-duplicates repeated threads', async () => {
    vi.mocked(api.listConstructionInboxThreads)
      .mockResolvedValueOnce({ threads: [{ invite_id: '1' }], next_cursor: 'next' })
      .mockResolvedValueOnce({ threads: [{ invite_id: '1' }, { invite_id: '2' }] })
    expect(await loadAhmadThreads()).toHaveLength(2)
    expect(api.listConstructionInboxThreads).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next' }))
  })
  it('never sends while preparing, and binds approval to account, thread and parent message', async () => {
    vi.mocked(api.listConstructionInboxThreads).mockResolvedValue({ threads: [{ invite_id: 'i-1', supplier_name_ar: 'شركة البناء' }] })
    vi.mocked(api.getConstructionInboxThread).mockResolvedValue({ can_reply: true, reply_channel: 'EMAIL', reply_recipient: 'supplier@example.com', last_message_id: 'm-1', messages: [] })
    const answer = await prepareAhmadReply('شركة البناء', 'نرجو إرسال العرض', {})
    expect(api.replyToConstructionInboxThread).not.toHaveBeenCalled()
    expect(answer.action?.kind).toBe('reply')
    if (answer.action?.kind !== 'reply') throw new Error('expected reply')
    vi.mocked(api.replyToConstructionInboxThread).mockResolvedValue({ id: 'reply', state: 'SENT' })
    await executeAhmadReply(answer.action)
    expect(api.replyToConstructionInboxThread).toHaveBeenCalledWith('i-1', expect.objectContaining({ text: 'نرجو إرسال العرض', parent_message_id: 'm-1', channel: 'EMAIL', idempotency_key: answer.action.idempotencyKey }))
    vi.mocked(farqSession.getUser).mockReturnValue({ id: 'buyer-2' } as never)
    await expect(executeAhmadReply(answer.action)).rejects.toThrow('تغيّر الحساب')
    expect(api.replyToConstructionInboxThread).toHaveBeenCalledTimes(1)
  })
  it('asks to disambiguate a supplier with multiple request threads', async () => {
    vi.mocked(api.listConstructionInboxThreads).mockResolvedValue({ threads: [{ invite_id: '1', supplier_name_ar: 'شركة البناء' }, { invite_id: '2', supplier_name_ar: 'شركة البناء' }] })
    const answer = await prepareAhmadReply('شركة البناء', 'السلام عليكم', {})
    expect(answer.action).toBeUndefined()
    expect(answer.text).toContain('أكثر من محادثة')
    expect(api.replyToConstructionInboxThread).not.toHaveBeenCalled()
  })
  it('refuses a reply when the server says the user cannot reply', async () => {
    vi.mocked(api.listConstructionInboxThreads).mockResolvedValue({ threads: [{ invite_id: '1', supplier_name_ar: 'شركة البناء' }] })
    vi.mocked(api.getConstructionInboxThread).mockResolvedValue({ can_reply: false, messages: [] })
    expect((await prepareAhmadReply('شركة البناء', 'السلام عليكم', {})).action).toBeUndefined()
  })
})

it('uses the open conversation to resolve request and supplier before preparing a discount review',async()=>{
  vi.mocked(api.getConstructionInboxThread).mockResolvedValue({supplier_id:'supplier',request_context:{rfq_id:'request'},messages:[]} as never)
  vi.mocked(api.getConstructionComparison).mockResolvedValue({supplier_responses:[{supplier:{id:'supplier',name_ar:'المورد المحدد'},offer:{inviteId:'thread',quoteVersionId:'quote'}}]} as never)
  const result=await askAhmadAgent('جهز طلب تخفيض',[],{threadId:'thread',view:'thread'})
  expect(api.getConstructionComparison).toHaveBeenCalledWith('request')
  expect(result.action).toMatchObject({kind:'discount',inviteId:'thread',quoteVersionId:'quote',supplierName:'المورد المحدد'})
  expect(api.replyToConstructionInboxThread).not.toHaveBeenCalled()
})
it('never treats request history as approved company preferences',async()=>{
  vi.mocked(api.getAhmadMemory).mockResolvedValue({text:'',revision:null,updated_at:null,can_edit:true})
  const result=await askAhmadAgent('وش ذاكرة الشركة؟',[])
  expect(result.text).toContain('لا توجد معلومات معتمدة')
  expect(api.askAhmad).not.toHaveBeenCalled()
})
