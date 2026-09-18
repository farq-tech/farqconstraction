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

/**
 * What Farq says about a supplier's standing on one line. These labels are
 * RENDERINGS of a grade Farq sent — never a decision made here.
 *
 * «دليل منتج» used to be the fourth label and it is gone, because nothing ever
 * earned it: the screen handed «نشاط متطابق» to the first three suppliers in the
 * array and «دليل منتج» to the rest, in three separate places, by index. A
 * supplier Farq has not graded is «مورد محتمل» and nothing stronger.
 */
export type EvidenceType = 'دليل مباشر' | 'نشاط متطابق' | 'مورد محتمل' | 'اختيارك'
export type ChannelType = 'بريد' | 'واتساب' | 'حراج'

/** Farq's grade for this supplier against this material. */
export type SupplierGrade = 'DIRECT' | 'TAXONOMY' | 'REVIEW'

/** Which of Farq's answers produced this supplier. */
export type SupplierOrigin =
  /** Evidenced against the named material. */
  | 'material'
  /** From Farq's intent→supplier map. Review-only. */
  | 'intent_map'
  /** From the material's family, or its trade. Review-only. */
  | 'family'
  /** From the model. Review-only. */
  | 'ai'
  /** Found by keyword while Farq's matching was unreachable. Unverified. */
  | 'degraded_search'
  /** The buyer added him by hand. */
  | 'manual'

export interface Supplier {
  id: string
  name: string
  city: string
  evidence: EvidenceType
  channel: ChannelType
  /** Farq's grade, absent when Farq sent none. Never inferred locally. */
  grade?: SupplierGrade
  origin: SupplierOrigin
  /** True only where Farq listed him as contactable without human review. */
  autoSelectable?: boolean
}

/**
 * EVERY extracted row ends in exactly one of these. There is no silent drop.
 *
 * The old model was `'ready' | 'searching'`, where `searching` meant «zero
 * suppliers, matching finished» — and the screen rendered it as an ongoing
 * search, claimed one supplier had been found, and then excluded the line from
 * the RFQ without saying so.
 */
export type LineCoverageState =
  /** Confirmed suppliers, at or above the target. */
  | 'SUPPLYABLE_MATCHED'
  /** Some suppliers, short of the target. */
  | 'SUPPLYABLE_PARTIAL_COVERAGE'
  /** Farq searched and honestly found nobody. */
  | 'SUPPLYABLE_NO_SUPPLIER'
  /** Farq classified the row as not a supply line. */
  | 'NON_SUPPLYABLE'
  /** Read from the booklet but not usable as a priceable row. */
  | 'INVALID_FOR_PRICING'
  /** Farq's matching failed for this line's batch. NOT «no supplier». */
  | 'MATCH_FAILED'
  /** Extracted and shown; its batch has not returned yet. */
  | 'MATCH_PENDING'

/** Farq's per-line coverage answer, carried whole instead of flattened. */
export interface BoqSupplierCoverage {
  lineKey: string
  state: LineCoverageState
  resolvedMaterial?: string | null
  resolvedMaterialName?: string | null
  resolvedFamily?: string | null
  resolvedIntent?: string | null
  resolution: 'material' | 'intent_map' | 'family' | 'ai' | 'degraded_search' | 'none'
  confirmedCount: number
  potentialCount: number
  totalCount: number
  targetCount: number
  /** Farq's verdict on who may be contacted without review. */
  autoSelectedSupplierIds: string[]
  /** Farq's own words for why the line is short or empty. */
  gapReason?: string | null
  /** True when these suppliers came from the degraded keyword path. */
  degraded?: boolean
}

export interface BOQItem {
  id: number
  name: string
  qty: string
  unit: string
  spec?: string
  /** Kept for existing screens: derived from `state`, never set on its own. */
  status: 'ready' | 'searching'
  state: LineCoverageState
  supplierCount: number
  suppliers: Supplier[]
  coverage?: BoqSupplierCoverage
  /** Matched Farq catalog spec when available */
  farqSpecId?: string
  lineKey?: string
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
