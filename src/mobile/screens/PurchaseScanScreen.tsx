import PurchaseScanReader from '../../components/PurchaseScanReader'
import type { Nav } from '../MobileApp'
import { saveDraft } from '../purchaseRequests'
export default function PurchaseScanScreen({ nav }: { nav: Nav }) {
  return <PurchaseScanReader onClose={nav.back} onDraft={data => {
    const draft = saveDraft(data)
    nav.back()
    nav.switchTab('requests', { kind: 'new', draftId: draft.id })
  }} />
}
