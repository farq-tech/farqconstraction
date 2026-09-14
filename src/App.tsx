import { useState } from 'react'
import type { AppView } from './types'
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

export default function App() {
  const [view, setView] = useState<AppView>('login')
  const navigate = (v: AppView) => setView(v)

  if (view === 'login') return <LoginView navigate={navigate} />
  if (view === 'supplier') return <SupplierPortalView navigate={navigate} />

  return (
    <Shell view={view} navigate={navigate}>
      {view === 'home'                && <HomeView navigate={navigate} />}
      {view === 'create-upload'       && <UploadView navigate={navigate} />}
      {view === 'create-proposals'    && <ProposalsView navigate={navigate} />}
      {view === 'sent'                && <SuccessView navigate={navigate} />}
      {view === 'sent-failure'        && <SendFailureView navigate={navigate} />}
      {view === 'rfq-list'            && <RFQListView navigate={navigate} />}
      {view === 'rfq-detail'          && <RFQDetailView navigate={navigate} />}
      {view === 'rfq-closed'          && <RFQClosedView navigate={navigate} />}
      {view === 'offers'              && <OffersView navigate={navigate} />}
      {view === 'offer-detail'        && <OfferDetailView navigate={navigate} />}
      {view === 'comparison'          && <ComparisonView navigate={navigate} />}
      {view === 'award'               && <AwardView navigate={navigate} />}
      {view === 'award-success'       && <AwardSuccessView navigate={navigate} />}
      {view === 'supplier-management' && <SupplierManagementView navigate={navigate} />}
      {view === 'supplier-detail'     && <SupplierDetailView navigate={navigate} />}
      {view === 'settings'            && <SettingsView navigate={navigate} />}
      {view === 'access-denied'       && <AccessDeniedView navigate={navigate} />}
    </Shell>
  )
}
