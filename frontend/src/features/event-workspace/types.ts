export type WorkspaceTab = 'overzicht' | 'contract' | 'vragenlijst' | 'bestanden' | 'communicatie'

export interface BookingContractInfo {
  id?: number
  booking_id: number
  naam: string
  email: string
  gsm: string
  klant_adres: string
  event_type: string
  event_datum: string
  locatie_naam: string
  locatie_adres: string
  geluid_voorzien: number
  licht_voorzien: number
  dj_booth_nodig: number
  afgesproken_prijs: number | null
  voorschot_bedrag: number | null
  contract_ready?: number
  notes?: string
  created_at?: string
  updated_at?: string
}
