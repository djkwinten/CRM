import { Booking } from '../types/booking'
import { BookingContractInfo } from '../features/event-workspace/types'

export type ContractPortalPhase = 'draft' | 'contract_completed' | 'contract_locked'

export function isContractInfoComplete(info: BookingContractInfo | null | undefined) {
  return !!(
    info?.naam?.trim() &&
    info?.email?.trim() &&
    info?.gsm?.trim() &&
    info?.klant_adres?.trim() &&
    info?.event_type?.trim() &&
    info?.event_datum?.trim() &&
    info?.locatie_naam?.trim() &&
    info?.locatie_adres?.trim()
  )
}

export function getContractGateState(
  booking: Booking | null | undefined,
  contractInfo: BookingContractInfo | null | undefined,
  locallyCompleted = false
) {
  const contractInfoComplete = isContractInfoComplete(contractInfo)
  const contractCreated = !!(booking?.status_contract || booking?.has_contract_pdf || booking?.contract_pdf)
  const contractLocked = !!(contractCreated && !booking?.contract_info_unlocked)
  const contractCompleted = !!(contractInfoComplete || contractCreated || locallyCompleted)
  const phase: ContractPortalPhase = contractLocked
    ? 'contract_locked'
    : contractCompleted
      ? 'contract_completed'
      : 'draft'

  return {
    phase,
    contractInfoComplete,
    contractCompleted,
    contractCreated,
    contractLocked,
    questionnaireUnlocked: phase !== 'draft',
    canAccessQuestionnaire: phase !== 'draft',
  }
}
