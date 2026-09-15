import { Suspense, lazy, type ReactNode } from "react"
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom"
import { Shell } from "@/components/Shell"
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary"
import LoadingState from "@/components/LoadingState"
import { useAuth } from "@/app/AuthProvider"
import { pathToView, paths, viewToPath } from "@/app/paths"
import type { AppView, NavProps } from "@/types"
import { env } from "@/lib/env"

const LoginView = lazy(() =>
  import("@/views/LoginView").then((m) => ({ default: m.LoginView })),
)
const HomeView = lazy(() =>
  import("@/views/HomeView").then((m) => ({ default: m.HomeView })),
)
const UploadView = lazy(() =>
  import("@/views/UploadView").then((m) => ({ default: m.UploadView })),
)
const ProposalsView = lazy(() =>
  import("@/views/ProposalsView").then((m) => ({ default: m.ProposalsView })),
)
const SuccessView = lazy(() =>
  import("@/views/SuccessView").then((m) => ({ default: m.SuccessView })),
)
const SendFailureView = lazy(() =>
  import("@/views/SendFailureView").then((m) => ({ default: m.SendFailureView })),
)
const RFQListView = lazy(() =>
  import("@/views/RFQListView").then((m) => ({ default: m.RFQListView })),
)
const RFQDetailView = lazy(() =>
  import("@/views/RFQDetailView").then((m) => ({ default: m.RFQDetailView })),
)
const RFQClosedView = lazy(() =>
  import("@/views/RFQClosedView").then((m) => ({ default: m.RFQClosedView })),
)
const OffersView = lazy(() =>
  import("@/views/OffersView").then((m) => ({ default: m.OffersView })),
)
const OfferDetailView = lazy(() =>
  import("@/views/OfferDetailView").then((m) => ({ default: m.OfferDetailView })),
)
const ComparisonView = lazy(() =>
  import("@/views/ComparisonView").then((m) => ({ default: m.ComparisonView })),
)
const AwardView = lazy(() =>
  import("@/views/AwardView").then((m) => ({ default: m.AwardView })),
)
const AwardSuccessView = lazy(() =>
  import("@/views/AwardSuccessView").then((m) => ({ default: m.AwardSuccessView })),
)
const SupplierManagementView = lazy(() =>
  import("@/views/SupplierManagementView").then((m) => ({
    default: m.SupplierManagementView,
  })),
)
const SupplierDetailView = lazy(() =>
  import("@/views/SupplierDetailView").then((m) => ({ default: m.SupplierDetailView })),
)
const SettingsView = lazy(() =>
  import("@/views/SettingsView").then((m) => ({ default: m.SettingsView })),
)
const AccessDeniedView = lazy(() =>
  import("@/views/AccessDeniedView").then((m) => ({ default: m.AccessDeniedView })),
)
const SupplierPortalView = lazy(() =>
  import("@/views/SupplierPortalView").then((m) => ({ default: m.SupplierPortalView })),
)

function useViewNavigate(): NavProps["navigate"] {
  const navigate = useNavigate()
  const params = useParams()
  return (view: AppView) => {
    const projectId = params.projectId || "current"
    const rfqId = params.rfqId || "current"
    const offerId = params.offerId || "current"
    const supplierId = params.supplierId || "current"

    const specialized = (() => {
      switch (view) {
        case "create-upload":
          return paths.projectBoq(projectId)
        case "create-proposals":
          return paths.projectSuppliers(projectId)
        case "rfq-detail":
          return paths.rfq(rfqId)
        case "rfq-closed":
          return paths.rfqClosed(rfqId)
        case "offers":
          return paths.rfqOffers(rfqId)
        case "offer-detail":
          return paths.rfqOfferDetail(rfqId, offerId)
        case "comparison":
          return paths.rfqComparison(rfqId)
        case "award":
          return paths.rfqAward(rfqId)
        case "award-success":
          return paths.rfqAwardSuccess(rfqId)
        case "sent":
          return paths.rfqSent(rfqId)
        case "sent-failure":
          return paths.rfqSendFailure(rfqId)
        case "supplier-detail":
          return paths.supplier(supplierId)
        default:
          return viewToPath(view)
      }
    })()

    navigate(specialized)
  }
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<LoadingState />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}

function ViewPage({ View }: { View: (props: NavProps) => ReactNode }) {
  const navigate = useViewNavigate()
  return (
    <LazyPage>
      <View navigate={navigate} />
    </LazyPage>
  )
}

function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === "loading") {
    return <LoadingState label="جاري استعادة الجلسة…" />
  }

  if (auth.status !== "authenticated") {
    return <Navigate to={paths.login} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

function AppShellLayout() {
  const location = useLocation()
  const navigate = useViewNavigate()
  const view = pathToView(location.pathname)

  return (
    <Shell view={view} navigate={navigate}>
      <Outlet />
    </Shell>
  )
}

function LoginRoute() {
  const auth = useAuth()
  if (auth.status === "authenticated") {
    return <Navigate to={paths.projects} replace />
  }
  return <ViewPage View={LoginView} />
}

function PrototypeBanner() {
  if (!env.allowPrototypeChrome) return null
  return (
    <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
      وضع واجهة تجريبي مفعّل — البيانات المعروضة ليست مصدر حقيقة إنتاجي
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: paths.login,
    element: <LoginRoute />,
  },
  {
    path: paths.supplierPortal,
    element: <ViewPage View={SupplierPortalView} />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: (
          <>
            <PrototypeBanner />
            <AppShellLayout />
          </>
        ),
        children: [
          { path: "/", element: <Navigate to={paths.projects} replace /> },
          { path: paths.projects, element: <ViewPage View={HomeView} /> },
          {
            path: "/projects/:projectId",
            element: <ViewPage View={HomeView} />,
          },
          {
            path: "/projects/:projectId/boq",
            element: <ViewPage View={UploadView} />,
          },
          {
            path: "/projects/:projectId/suppliers",
            element: <ViewPage View={ProposalsView} />,
          },
          {
            path: "/projects/:projectId/rfq",
            element: <ViewPage View={RFQListView} />,
          },
          { path: paths.rfqs, element: <ViewPage View={RFQListView} /> },
          {
            path: "/rfqs/:rfqId",
            element: <ViewPage View={RFQDetailView} />,
          },
          {
            path: "/rfqs/:rfqId/closed",
            element: <ViewPage View={RFQClosedView} />,
          },
          {
            path: "/rfqs/:rfqId/offers",
            element: <ViewPage View={OffersView} />,
          },
          {
            path: "/rfqs/:rfqId/offers/:offerId",
            element: <ViewPage View={OfferDetailView} />,
          },
          {
            path: "/rfqs/:rfqId/comparison",
            element: <ViewPage View={ComparisonView} />,
          },
          {
            path: "/rfqs/:rfqId/award",
            element: <ViewPage View={AwardView} />,
          },
          {
            path: "/rfqs/:rfqId/award/success",
            element: <ViewPage View={AwardSuccessView} />,
          },
          {
            path: "/rfqs/:rfqId/sent",
            element: <ViewPage View={SuccessView} />,
          },
          {
            path: "/rfqs/:rfqId/send-failure",
            element: <ViewPage View={SendFailureView} />,
          },
          {
            path: paths.suppliers,
            element: <ViewPage View={SupplierManagementView} />,
          },
          {
            path: "/suppliers/:supplierId",
            element: <ViewPage View={SupplierDetailView} />,
          },
          { path: paths.settings, element: <ViewPage View={SettingsView} /> },
          {
            path: paths.accessDenied,
            element: <ViewPage View={AccessDeniedView} />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to={paths.projects} replace />,
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
