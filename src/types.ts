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
  | 'inbox'
  | 'inbox-thread'

export type EvidenceType = 'دليل مباشر' | 'نشاط متطابق' | 'دليل منتج' | 'اختيارك' | 'تسمية آلية' | 'خريطة فرق'
export type ChannelType = 'بريد' | 'واتساب' | 'حراج'

export interface Supplier {
  id: string
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
  /** Matched Farq catalog spec when available */
  farqSpecId?: string
  lineKey?: string
  /**
   * The model's NAME for a material the catalogue could not confirm. A review
   * suggestion, never a match: `farqSpecId` stays unset. Its suppliers come
   * from Farq's intent→supplier map for that name, not from the model.
   */
  aiSuggestion?: {
    intent: string
    family?: string | null
    supplierCount: number
    suppliers: Supplier[]
    zeroReason?: string | null
  }
  /**
   * The ontology NAMED this material and Farq's intent→supplier map was read
   * for that name. Not a catalogue match: `farqSpecId` stays unset and nothing
   * is preselected. `supplierCount: 0` means «معروف بلا مورد» — a fact about
   * the register, not about our understanding of the line.
   */
  mapSuggestion?: {
    intent: string
    family?: string | null
    /** SERVER_RESOLVED when the API named the line itself; WIRE_UNVERIFIED when it took this client's name. */
    answeredBy?: string | null
    supplierCount: number
    suppliers: Supplier[]
    zeroReason?: string | null
  }
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
  id: string
  name: string
  city: string
  category: string
  phone: string
  email: string
  interactions: number
  lastSeen: string
  manual?: boolean
  qualificationStatus?: string
  activity?: string
  hasEmail?: boolean
  hasWhatsapp?: boolean
  hasHaraj?: boolean
  sourceSystem?: string
  /** The upload that created this row — null for everything the sweeps found. */
  importBatchId?: string | null
}

export interface NavProps {
  navigate: (v: AppView) => void
  selectedSupplierId?: string | null
  setSelectedSupplierId?: (id: string | null) => void
}
