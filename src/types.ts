export type AppView =
  | 'login'
  | 'home'
  | 'create-upload'
  | 'create-proposals'
  | 'sent'
  | 'sent-failure'
  | 'rfq-list'
  | 'rfq-detail'
  | 'rfq-closed'
  | 'offers'
  | 'offer-detail'
  | 'comparison'
  | 'award'
  | 'award-success'
  | 'supplier-management'
  | 'supplier-detail'
  | 'settings'
  | 'access-denied'
  | 'supplier'

export type EvidenceType = 'دليل مباشر' | 'نشاط متطابق' | 'دليل منتج' | 'اختيارك'
export type ChannelType = 'بريد' | 'واتساب'

export interface Supplier {
  id: number
  name: string
  city: string
  evidence: EvidenceType
  channel: ChannelType
}

export interface BOQItem {
  id: number
  name: string
  qty: string
  unit: string
  spec?: string
  status: 'ready' | 'searching'
  supplierCount: number
  suppliers: Supplier[]
}

export interface RFQSummary {
  id: string
  name: string
  items: number
  offers: number
  suppliers: number
  status: 'draft' | 'active' | 'awarded' | 'closed'
  date: string
  deadline?: string
}

export interface SupplierEntry {
  id: number
  name: string
  city: string
  category: string
  phone: string
  email: string
  interactions: number
  lastSeen: string
  manual?: boolean
}

export interface NavProps {
  navigate: (v: AppView) => void
}
