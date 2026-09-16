import { ProcurementProvider, useProcurement } from './procurementContext'
import { Shell } from './components/Shell'
import { LoginView } from './views/LoginView'
import { HomeView } from './views/HomeView'
import { UploadView } from './views/UploadView'
import { ProposalsView } from './views/ProposalsView'
import { SuccessView } from './views/SuccessView'
import { SendFailureView } from './views/SendFailureView'
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

function AppRoutes() {
  const {
    view,
    navigate,
    selectedSupplierId,
    setSelectedSupplierId,
  } = useProcurement()

  // Login kept reachable for demos that want to show the gate; default entry is home (no-login).
  if (view === 'login') return <LoginView navigate={navigate} />
  if (view === 'supplier') return <SupplierPortalView navigate={navigate} />

  return (
    <Shell view={view} navigate={navigate}>
      {view === 'home' && <HomeView navigate={navigate} />}
      {view === 'create-upload' && <UploadView navigate={navigate} />}
      {view === 'create-proposals' && <ProposalsView navigate={navigate} />}
      {view === 'sent' && <SuccessView navigate={navigate} />}
      {view === 'sent-failure' && <SendFailureView navigate={navigate} />}
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
      {view === 'inbox' && <InboxView navigate={navigate} />}
      {view === 'inbox-thread' && <InboxThreadView navigate={navigate} />}
      {view === 'access-denied' && <AccessDeniedView navigate={navigate} />}
    </Shell>
  )
}

export default function App() {
  return (
    <ProcurementProvider>
      <AppRoutes />
    </ProcurementProvider>
  )
}
