import { ProcurementProvider, useProcurement } from './procurementContext'
import { isReadOnlyBuild } from './api/readOnlyMode'
import { Shell } from './components/Shell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginView } from './views/LoginView'
import { InviteView } from './views/InviteView'
import { HomeView } from './views/HomeView'
import { UploadView } from './views/UploadView'
import { ProposalsView } from './views/ProposalsView'
import { RFQListView } from './views/RFQListView'
import { RFQDetailView } from './views/RFQDetailView'
import { RFQClosedView } from './views/RFQClosedView'
import { OffersView } from './views/OffersView'
import { OfferDetailView } from './views/OfferDetailView'
import { ComparisonView } from './views/ComparisonView'
import { AwardView } from './views/AwardView'
import { AwardSuccessView } from './views/AwardSuccessView'
import { SupplierManagementView } from './views/SupplierManagementView'
import { SupplierDetailView } from './views/SupplierDetailView'
import { SettingsView } from './views/SettingsView'
import { AccessDeniedView } from './views/AccessDeniedView'
import { SupplierPortalView } from './views/SupplierPortalView'
import { InboxView } from './views/InboxView'
import { InboxThreadView } from './views/InboxThreadView'
import { useEffect, useRef } from 'react'
import { useFarqSession } from './api/useFarqSession'
import { restoreSession } from './store/session'
import { LearningReviewView } from './views/LearningReviewView'

function AppRoutes() {
  const {
    view,
    navigate,
    selectedSupplierId,
    setSelectedSupplierId,
  } = useProcurement()
  const session = useFarqSession()
  const restored = useRef(false)

  /*
   * Bring the booklet back after a refresh.
   *
   * Restoring once per signed-in identity, and only into an empty session, so a
   * restore can never land on top of an upload the buyer has just started.
   */
  useEffect(() => {
    // Signed out (a lapsed session included): the next sign-in restores again.
    if (!session.isAuthenticated) {
      restored.current = false
      return
    }
    if (restored.current) return
    restored.current = true
    void restoreSession()
  }, [session.isAuthenticated])

  if (view === 'supplier') return <SupplierPortalView navigate={navigate} />
  // An invited colleague arrives signed out; the page creates the session.
  if (view === 'invite') return <InviteView navigate={navigate} />
  // A production build has no demo identity, so without a session every screen
  // behind this line can only fail to load. The visitor meets the sign-in form
  // instead of an app-shaped page of errors. Suppliers are exempt above: they
  // carry a one-use token, never a buyer session.
  // Signed in already: «?view=login» left in the address bar after signing in
  // must not send a refresh back to the sign-in form.
  if (view === 'login' && session.isAuthenticated) {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash)
    } catch {
      /* ignore */
    }
    queueMicrotask(() => navigate('home'))
  }
  if ((view === 'login' && !session.isAuthenticated) || (import.meta.env.PROD && !session.isAuthenticated)) {
    return <LoginView navigate={navigate} />
  }

  return (
    <Shell view={view} navigate={navigate}>
      <ErrorBoundary resetKey={view}>
      {view === 'home' && <HomeView navigate={navigate} />}
      {view === 'create-upload' && <UploadView navigate={navigate} />}
      {view === 'create-proposals' && <ProposalsView navigate={navigate} />}
      {view === 'rfq-list' && <RFQListView navigate={navigate} />}
      {view === 'rfq-detail' && <RFQDetailView navigate={navigate} />}
      {view === 'rfq-closed' && <RFQClosedView navigate={navigate} />}
      {view === 'offers' && <OffersView navigate={navigate} />}
      {view === 'offer-detail' && <OfferDetailView navigate={navigate} />}
      {view === 'comparison' && <ComparisonView navigate={navigate} />}
      {view === 'award' && <AwardView navigate={navigate} />}
      {view === 'award-success' && <AwardSuccessView navigate={navigate} />}
      {view === 'supplier-management' && (
        <SupplierManagementView
          navigate={navigate}
          selectedSupplierId={selectedSupplierId}
          setSelectedSupplierId={setSelectedSupplierId}
        />
      )}
      {view === 'supplier-detail' && (
        <SupplierDetailView
          navigate={navigate}
          selectedSupplierId={selectedSupplierId}
          setSelectedSupplierId={setSelectedSupplierId}
        />
      )}
      {view === 'settings' && <SettingsView navigate={navigate} />}
      {view === 'learning-review' && <LearningReviewView navigate={navigate} />}
      {view === 'inbox' && <InboxView navigate={navigate} />}
      {view === 'inbox-thread' && <InboxThreadView navigate={navigate} />}
      {view === 'access-denied' && <AccessDeniedView navigate={navigate} />}
      </ErrorBoundary>
    </Shell>
  )
}

/** Says out loud what the choke point in `constructionClient` already enforces. */
function ReadOnlyBanner() {
  if (!isReadOnlyBuild()) return null
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-xs font-bold text-amber-900"
    >
      نسخة تجريبية للقراءة فقط — الإرسال للموردين معطّل ولن يصل بريد إلى أي مورد.
    </div>
  )
}

export default function App() {
  return (
    <ProcurementProvider>
      <ReadOnlyBanner />
      <AppRoutes />
    </ProcurementProvider>
  )
}
