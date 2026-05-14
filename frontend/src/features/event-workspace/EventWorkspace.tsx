import { Booking } from '../../types/booking'
import { WorkspaceTab } from './types'
import { ContractInfoTab } from './tabs/ContractInfoTab'
import { QuestionnaireTab } from './tabs/QuestionnaireTab'
import { FilesTab } from './tabs/FilesTab'
import { CommunicationTab } from './tabs/CommunicationTab'

export function EventWorkspace({ booking, activeTab, onShowQuestionnaireChanges }: {
  booking: Booking
  activeTab: WorkspaceTab
  onShowQuestionnaireChanges: () => void
}) {
  if (activeTab === 'contract') return <ContractInfoTab booking={booking} />
  if (activeTab === 'vragenlijst') return <QuestionnaireTab booking={booking} onShowChanges={onShowQuestionnaireChanges} />
  if (activeTab === 'bestanden') return <FilesTab />
  if (activeTab === 'communicatie') return <CommunicationTab />
  return null
}
