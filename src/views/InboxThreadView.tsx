import type { NavProps } from '../types'
import { useProcurement } from '../procurementContext'
import { InboxView } from './InboxView'

/**
 * The `'inbox-thread'` route — kept because `openInboxThread(inviteId)` (deep
 * links, notifications) still navigates here.
 *
 * It used to be a separate page. It now opens the same two-pane «المراسلات»
 * screen with the requested conversation already showing: on a wide screen the
 * list stays beside the chat, on a narrow one the chat fills the screen with a
 * back button to the list. With no thread selected it simply shows the list.
 */
export function InboxThreadView({ navigate }: NavProps) {
  const { selectedThreadId } = useProcurement()
  return <InboxView navigate={navigate} initialThreadId={selectedThreadId} />
}

export default InboxThreadView
