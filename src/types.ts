export type AppView =
  | 'login'
  | 'home'
  | 'material-prices'
  | 'create-upload'
  | 'create-proposals'
  | 'sent'
  | 'sent-failure'
  | 'rfq-list'
  | 'booklets'
  | 'booklet-detail'
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
  | 'reports'
  | 'learning-review'
  | 'access-denied'
  | 'supplier'
  | 'inbox'
  | 'inbox-thread'
  | 'invite'

/**
 * Where a supplier on a line came from. «من الكتالوج» is the neutral value: the
 * catalog returned the supplier and nothing says how strong the link is.
 */
export type EvidenceType = 'دليل مباشر' | 'نشاط متطابق' | 'دليل منتج' | 'من الكتالوج' | 'على مستوى النشاط' | 'اختيارك' | 'تسمية آلية' | 'خريطة فرق'
export type ChannelType = 'بريد' | 'واتساب' | 'محادثة'

export interface Supplier {
  id: string
  name: string
  city: string
  evidence: EvidenceType
  channel: ChannelType
  /** The buyer chose this supplier for this material before. */
  learned?: boolean
  /**
   * «مقدّم عروض سابقاً»: he priced this material (or its line, or its trade)
   * for this company before — the number of requests he priced. The API ranks
   * him first inside the line's own list; the auto-pick takes him by default.
   */
  priorQuotes?: number
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
  /** Suppliers the buyer dismissed for this material on this page (also stored server side). */
  rejectedSupplierIds?: string[]
  /** Trade known, material not in the list: suppliers of that trade, unconfirmed. */
  familySuggestion?: { family: string; suppliers: Supplier[] }
  /** Suppliers the buyer picked for this same line in an earlier booklet. Never preselected. */
  learnedSuggestion?: { suppliers: Supplier[] }
  /** Pure work (excavation, backfill…): nothing to buy, so no supplier is sought. */
  workOnly?: boolean
  /** The item code the booklet prints for this row. */
  itemCode?: string
  /**
   * «الاسم الدارج بالسوق (اقتراح)»: the reader's suggestion, which the buyer may
   * edit or clear before sending. Sent beside the booklet text (`name`), never
   * instead of it. Undefined: the reader had none. '': the buyer cleared it.
   */
  marketName?: string
  /**
   * 'memory': `marketName` came from the market-name memory (a name a buyer
   * sent, or the reader proposed, for the same booklet wording before) — shown
   * as «محفوظ من طلب سابق». Absent: the reader's own suggestion, or none.
   */
  marketNameSource?: 'memory'
  /**
   * «بطاقة المواصفة»: brand, size, sale unit, photo link… filled by the buyer
   * before sending. Sent as the line's `spec_card`; undefined sends nothing.
   */
  specCard?: import('./lib/specCard').SpecCard
  /**
   * How the line entered the request: read from a booklet (absent means the
   * same), found with «ابحث عن منتج», pasted as a product link, or typed.
   * All of them sit in one cart and go through one send.
   */
  origin?: 'booklet' | 'search' | 'url' | 'manual'
  /** Added or edited since the last supplier match; matched on «متابعة لاختيار الموردين». */
  needsMatch?: boolean
  /**
   * What the internet said the product IS — for the buyer's cart only, never
   * sent and never a price. The line's name, spec and spec card carry what
   * the supplier reads.
   */
  productRef?: {
    brand?: string
    model?: string
    imageUrl?: string
    sourceName?: string
    sourceUrl?: string
    /** «استخدم مواصفاته فقط»: the brand is not required. */
    genericOnly?: boolean
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
  /** Short reference suppliers see, e.g. CIV-RFQ-51D17AF6. */
  reference?: string
  /** Department · city, under the project name. */
  subtitle?: string
  /** Suppliers the request reached, and those who answered. */
  sent?: number
  replied?: number
  /** When quotes close, as «يغلق بعد 3 أيام»; urgent inside two days. */
  closesLabel?: string
  closesUrgent?: boolean
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
  /** Other directory rows on the same WhatsApp number (a link, never a merge). */
  phoneDuplicates?: SupplierPhoneDuplicates | null
}

export interface SupplierPhoneDuplicates {
  /** This row stands for the number; the others are linked to it. */
  isCanonical: boolean
  others: Array<{ id: string; name: string; city: string | null; canonical: boolean }>
}

export interface NavProps {
  navigate: (v: AppView) => void
  selectedSupplierId?: string | null
  setSelectedSupplierId?: (id: string | null) => void
}
