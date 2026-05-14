export interface Venue {
  id: number
  naam: string
  adres?: string
  capaciteit?: number
  // Contact
  contact_naam?: string
  contact_telefoon?: string
  website?: string
  // Geluid
  geluidsbeperking?: number
  geluidsbeperking_db?: number
  // Apparatuur
  speakers_aanwezig?: number
  licht_aanwezig?: number
  micro_aanwezig?: number
  dj_booth_aanwezig?: number
  uplights_aanwezig?: number
  speakers_buiten?: number
  // Logistiek
  parkeren_info?: string
  gelijkvloers?: number
  wifi_code?: string
  // Overig
  fotos?: string   // JSON-array string van R2 keys
  notities?: string
  // Afstand vanuit Deinze
  afstand_km?: number | null
  rijtijd_min?: number | null
  // Meta
  created_at?: string
  updated_at?: string
  // Computed
  booking_count?: number
}

export interface VenueSuggestion {
  id: number
  naam: string
  adres?: string | null
  booking_count?: number
}

export interface VenueBooking {
  id: number
  feest_datum: string
  type_feest: string
  naam_organisator: string
  naam_partner1?: string | null
  naam_partner2?: string | null
  is_aanvraag: number
  slug?: string | null
}
