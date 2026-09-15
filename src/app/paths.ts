import type { AppView } from "@/types"

/** Canonical production routes for Farq Construction. */
export const paths = {
  login: "/login",
  projects: "/projects",
  project: (projectId: string) => `/projects/${projectId}`,
  projectBoq: (projectId: string) => `/projects/${projectId}/boq`,
  projectSuppliers: (projectId: string) => `/projects/${projectId}/suppliers`,
  projectRfq: (projectId: string) => `/projects/${projectId}/rfq`,
  rfqs: "/rfqs",
  rfq: (rfqId: string) => `/rfqs/${rfqId}`,
  rfqOffers: (rfqId: string) => `/rfqs/${rfqId}/offers`,
  rfqOfferDetail: (rfqId: string, offerId: string) => `/rfqs/${rfqId}/offers/${offerId}`,
  rfqComparison: (rfqId: string) => `/rfqs/${rfqId}/comparison`,
  rfqAward: (rfqId: string) => `/rfqs/${rfqId}/award`,
  rfqAwardSuccess: (rfqId: string) => `/rfqs/${rfqId}/award/success`,
  rfqSent: (rfqId: string) => `/rfqs/${rfqId}/sent`,
  rfqSendFailure: (rfqId: string) => `/rfqs/${rfqId}/send-failure`,
  rfqClosed: (rfqId: string) => `/rfqs/${rfqId}/closed`,
  suppliers: "/suppliers",
  supplier: (supplierId: string) => `/suppliers/${supplierId}`,
  settings: "/settings",
  accessDenied: "/access-denied",
  supplierPortal: "/supplier-portal",
} as const

const PLACEHOLDER_PROJECT = "current"
const PLACEHOLDER_RFQ = "current"
const PLACEHOLDER_OFFER = "current"
const PLACEHOLDER_SUPPLIER = "current"

/** Bridge legacy prototype view ids → durable URLs during strangler migration. */
export function viewToPath(view: AppView): string {
  switch (view) {
    case "login":
      return paths.login
    case "home":
      return paths.projects
    case "create-upload":
      return paths.projectBoq(PLACEHOLDER_PROJECT)
    case "create-proposals":
      return paths.projectSuppliers(PLACEHOLDER_PROJECT)
    case "sent":
      return paths.rfqSent(PLACEHOLDER_RFQ)
    case "sent-failure":
      return paths.rfqSendFailure(PLACEHOLDER_RFQ)
    case "rfq-list":
      return paths.rfqs
    case "rfq-detail":
      return paths.rfq(PLACEHOLDER_RFQ)
    case "rfq-closed":
      return paths.rfqClosed(PLACEHOLDER_RFQ)
    case "offers":
      return paths.rfqOffers(PLACEHOLDER_RFQ)
    case "offer-detail":
      return paths.rfqOfferDetail(PLACEHOLDER_RFQ, PLACEHOLDER_OFFER)
    case "comparison":
      return paths.rfqComparison(PLACEHOLDER_RFQ)
    case "award":
      return paths.rfqAward(PLACEHOLDER_RFQ)
    case "award-success":
      return paths.rfqAwardSuccess(PLACEHOLDER_RFQ)
    case "supplier-management":
      return paths.suppliers
    case "supplier-detail":
      return paths.supplier(PLACEHOLDER_SUPPLIER)
    case "settings":
      return paths.settings
    case "access-denied":
      return paths.accessDenied
    case "supplier":
      return paths.supplierPortal
    default:
      return paths.projects
  }
}

export function pathToView(pathname: string): AppView {
  if (pathname.startsWith("/login")) return "login"
  if (pathname.startsWith("/supplier-portal")) return "supplier"
  if (pathname.startsWith("/access-denied")) return "access-denied"
  if (pathname.startsWith("/settings")) return "settings"
  if (pathname.match(/^\/suppliers\/[^/]+/)) return "supplier-detail"
  if (pathname.startsWith("/suppliers")) return "supplier-management"
  if (pathname.includes("/boq")) return "create-upload"
  if (pathname.includes("/suppliers") && pathname.startsWith("/projects")) return "create-proposals"
  if (pathname.includes("/send-failure")) return "sent-failure"
  if (pathname.includes("/sent")) return "sent"
  if (pathname.includes("/closed")) return "rfq-closed"
  if (pathname.includes("/award/success")) return "award-success"
  if (pathname.includes("/award")) return "award"
  if (pathname.includes("/comparison")) return "comparison"
  if (pathname.match(/\/offers\/[^/]+/)) return "offer-detail"
  if (pathname.includes("/offers")) return "offers"
  if (pathname.match(/^\/rfqs\/[^/]+/)) return "rfq-detail"
  if (pathname.startsWith("/rfqs")) return "rfq-list"
  if (pathname.startsWith("/projects")) return "home"
  return "home"
}
