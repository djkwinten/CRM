import { Booking } from '../types/booking'
import { Venue, VenueSuggestion, VenueBooking } from '../types/venue'
import { BookingContractInfo } from '../features/event-workspace/types'
import { createLocalBooking, deleteLocalBooking, deriveContractInfo, findLocalBooking, localBookings, localContractInfo, localVenues, mergeBookings, saveLocalContractInfo, updateLocalBooking, createLocalVenue, updateLocalVenue, deleteLocalVenue, venueBookings, venueSuggestions } from './localStore'
import { calculateBookingPricing } from './bookingPricing'

const BASE = `/api/bookings`

export async function initDb() {
  const res = await fetch(`${BASE}/init`, { method: 'POST' })
  return res.json()
}

export async function getBookings(): Promise<Booking[]> {
  try {
    const res = await fetch(BASE)
    const data = await res.json() as { bookings: Booking[] }
    return mergeBookings(data.bookings || [])
  } catch {
    return localBookings()
  }
}

export async function getBooking(id: string): Promise<Booking | null> {
  try {
    const res = await fetch(`${BASE}/${id}`)
    if (res.ok) {
      const data = await res.json() as { booking: Booking }
      return data.booking
    }
  } catch {}
  return findLocalBooking(id)
}

export async function createBooking(payload: Partial<Booking>): Promise<{ id: number; slug: string; access_token: string }> {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json() as { id?: number; slug?: string; access_token?: string }
    // When the Worker has no D1 binding, the backend currently returns id: 0.
    // In that case persist locally so the CRM remains usable.
    if (data.id && data.id > 0 && data.slug && data.access_token) {
      return data as { id: number; slug: string; access_token: string }
    }
  } catch {}
  return createLocalBooking(payload)
}

export async function updateStatus(id: number, status: Partial<Pick<Booking, 'status_contract' | 'status_voorschot' | 'status_vragenlijst' | 'is_aanvraag' | 'is_afgewezen' | 'afgewezen_reden' | 'contract_info_unlocked'>>) {
  updateLocalBooking(id, status)
  try {
    const res = await fetch(`${BASE}/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status)
    })
    return res.json()
  } catch {
    return { success: true, local: true }
  }
}

export async function submitQuestionnaire(id: string, payload: Partial<Booking>): Promise<{ success: boolean; error?: string }> {
  const {
    id: _bookingId,
    slug: _slug,
    access_token: _accessToken,
    basisprijs: _basisprijs,
    extra_prijzen: _extraPrijzen,
    totaalprijs: _totaalprijs,
    status_contract: _statusContract,
    status_voorschot: _statusVoorschot,
    is_aanvraag: _isAanvraag,
    is_afgewezen: _isAfgewezen,
    contract_pdf: _contractPdf,
    billit_factuur_pdf: _factuurPdf,
    billit_factuur_naam: _factuurNaam,
    contract_info_unlocked: _contractUnlocked,
    vroeger_aanwezig_receptie_na_contract: _earlyReceptionAfterContract,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...safePayload
  } = payload
  try {
    const res = await fetch(`${BASE}/${id}/questionnaire`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safePayload)
    })
    const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
    if (!res.ok || data.success !== true) {
      return { success: false, error: data.error || 'De vragenlijst kon niet op de server worden opgeslagen.' }
    }
    const existing = findLocalBooking(id)
    const localUpdate: Partial<Booking> = { ...safePayload, status_vragenlijst: 1, vragenlijst_first_submitted_at: new Date().toISOString() }
    if (!safePayload.vroeger_aanwezig_receptie) {
      localUpdate.vroeger_aanwezig_receptie_na_contract = 0
    } else if (existing) {
      localUpdate.vroeger_aanwezig_receptie_na_contract = existing.vroeger_aanwezig_receptie_na_contract
        || ((!existing.vroeger_aanwezig_receptie && (existing.status_contract || existing.has_contract_pdf || existing.contract_pdf)) ? 1 : 0)
    }
    if (existing) {
      localUpdate.totaalprijs = calculateBookingPricing({
        ...existing,
        ...safePayload,
        basisprijs: existing.basisprijs,
        extra_prijzen: existing.extra_prijzen,
      }).totaalprijs
    }
    updateLocalBooking(id, localUpdate)
    return { success: true }
  } catch {
    return { success: false, error: 'Geen verbinding met de server. Je invoer blijft op dit toestel bewaard; probeer opnieuw.' }
  }
}

export async function updateContractInfo(id: number, payload: {
  totaalprijs?: number
  basisprijs?: number
  extra_prijzen?: string
  adres_organisator?: string
  voorschot_instructies?: string
  billit_factuur_pdf?: string
  billit_factuur_naam?: string
  contract_pdf?: string
  contract_info_unlocked?: number
}) {
  updateLocalBooking(id, payload)
  try {
    const res = await fetch(`${BASE}/${id}/contract`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return res.json()
  } catch {
    return { success: true, local: true }
  }
}

export async function updatePortalSettings(id: number, payload: { portal_title?: string }) {
  updateLocalBooking(id, payload)
  try {
    const res = await fetch(`${BASE}/${id}/portal`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return res.json()
  } catch {
    return { success: true, local: true }
  }
}

export async function updateWeddingMeeting(id: number, payload: { wedding_meeting_at?: string | null; wedding_meeting_note?: string | null }) {
  try {
    const res = await fetch(`${BASE}/${id}/wedding-meeting`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!res.ok || data.success === false) throw new Error(data.error || 'Afspraak opslaan mislukt')
    updateLocalBooking(id, payload as Partial<Booking>)
    return data
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Afspraak opslaan mislukt' }
  }
}

export async function updateBasisInfo(id: number, payload: {
  naam_organisator?: string
  naam_partner1?: string
  naam_partner2?: string
  email?: string
  telefoon?: string
  feest_datum?: string
  created_at?: string
}) {
  updateLocalBooking(id, payload)
  try {
    const res = await fetch(`${BASE}/${id}/basisinfo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return res.json()
  } catch {
    return { success: true, local: true }
  }
}

export async function getContractInfo(id: number): Promise<BookingContractInfo | null> {
  try {
    const res = await fetch(`${BASE}/${id}/contract-info`)
    if (res.ok) {
      const data = await res.json() as { contract_info: BookingContractInfo }
      if (data.contract_info) {
        saveLocalContractInfo(id, data.contract_info)
        return data.contract_info
      }
    }
  } catch {}

  const booking = findLocalBooking(id)
  const local = localContractInfo(id)
  if (local && booking) {
    const currentPricing = deriveContractInfo(booking)
    return {
      ...local,
      basisprijs: currentPricing.basisprijs,
      extra_prijzen: currentPricing.extra_prijzen,
      afgesproken_prijs: currentPricing.afgesproken_prijs,
      ceremonie_set: currentPricing.ceremonie_set,
      digital_booth: currentPricing.digital_booth,
      retro_booth: currentPricing.retro_booth,
      draadloze_speaker: currentPricing.draadloze_speaker,
      karaoke: currentPricing.karaoke,
    }
  }
  return local || (booking ? deriveContractInfo(booking) : null)
}

export async function saveContractInfo(id: number, payload: Partial<BookingContractInfo>): Promise<{ success: boolean; error?: string }> {
  const {
    basisprijs: _basisprijs,
    extra_prijzen: _extraPrijzen,
    afgesproken_prijs: _afgesprokenPrijs,
    voorschot_bedrag: _voorschotBedrag,
    ceremonie_set: _ceremonieSet,
    digital_booth: _digitalBooth,
    retro_booth: _retroBooth,
    draadloze_speaker: _draadlozeSpeaker,
    karaoke: _karaoke,
    ...safePayload
  } = payload

  saveLocalContractInfo(id, safePayload)
  updateLocalBooking(id, {
    aantal_gasten: safePayload.aantal_gasten ?? undefined,
    uur_dansfeest: safePayload.uur_dansfeest ?? undefined,
    speakers_aanwezig: safePayload.geluid_voorzien,
    licht_aanwezig: safePayload.licht_voorzien,
    dj_booth_aanwezig: safePayload.dj_booth_nodig,
  })
  try {
    const res = await fetch(`${BASE}/${id}/contract-info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safePayload)
    })
    return res.json()
  } catch {
    return { success: true }
  }
}

export async function getBookingPDF(ref: string, type: 'contract' | 'factuur'): Promise<string | null> {
  const res = await fetch(`${BASE}/${ref}/pdf/${type}`)
  if (!res.ok) return null
  const data = await res.json() as { pdf?: string }
  return data.pdf || null
}

export async function deleteBooking(id: number) {
  deleteLocalBooking(id)
  try {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
    return res.json()
  } catch {
    return { success: true, local: true }
  }
}

export async function confirmBooking(id: number) {
  return updateStatus(id, { is_aanvraag: 0 })
}

export async function rejectBooking(id: number, reden: string) {
  return updateStatus(id, { is_afgewezen: 1, afgewezen_reden: reden })
}

export async function restoreBooking(id: number) {
  return updateStatus(id, { is_afgewezen: 0, afgewezen_reden: '' })
}

// ── Reminders ──────────────────────────────────────────────────────────────

export interface ReminderStatus {
  id: number
  naam: string
  feest_datum: string
  days_until: number
  is_aanvraag: number
  status_vragenlijst: number
  status_contract: number
  status_voorschot: number
  reminder_sent_at: string | null
  needs_reminder: boolean
  email: string | null
}

export async function getReminderStatuses(): Promise<ReminderStatus[]> {
  try {
    const res = await fetch(`/api/reminders/status`)
    const data = await res.json() as { statuses: ReminderStatus[] }
    if (data.statuses?.length) return data.statuses
  } catch {}
  const now = Date.now()
  return localBookings().map(b => {
    const days = b.feest_datum ? Math.ceil((new Date(b.feest_datum).getTime() - now) / 86400000) : 9999
    return {
      id: b.id, naam: b.naam_organisator || b.naam_partner1 || '—', feest_datum: b.feest_datum, days_until: days,
      is_aanvraag: b.is_aanvraag || 0, status_vragenlijst: b.status_vragenlijst || 0, status_contract: b.status_contract || 0, status_voorschot: b.status_voorschot || 0,
      reminder_sent_at: null, needs_reminder: days >= 0 && days <= 30 && !b.status_vragenlijst, email: b.email || null
    }
  })
}

export async function runReminderCheck(): Promise<{ sent: number; created?: number; checked: number; results: { id: number; naam: string; sent: boolean; reason?: string }[] }> {
  const res = await fetch(`/api/reminders/check`, { method: 'POST' })
  return res.json()
}

export async function sendReminder(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`/api/reminders/send/${id}`, { method: 'POST' })
  return res.json()
}


export interface InternalTodo {
  id: number
  booking_id?: number | null
  kind: string
  text: string
  due_date?: string | null
  done: number
  created_at?: string
}

export async function getInternalTodos(): Promise<InternalTodo[]> {
  try {
    const res = await fetch(`/api/reminders/todos`)
    const data = await res.json() as { todos: InternalTodo[] }
    return data.todos || []
  } catch {
    return []
  }
}

export async function createInternalTodo(text: string): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const res = await fetch(`/api/reminders/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    return res.json()
  } catch {
    return { success: false, error: 'Todo opslaan mislukt' }
  }
}

export async function updateInternalTodo(id: number, done: boolean): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`/api/reminders/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done })
    })
    return res.json()
  } catch {
    return { success: false }
  }
}

export async function deleteInternalTodo(id: number): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`/api/reminders/todos/${id}`, { method: 'DELETE' })
    return res.json()
  } catch {
    return { success: false }
  }
}

export async function testSmtp(): Promise<{ connected: boolean; message: string }> {
  const res = await fetch(`/api/reminders/smtp-test`, { method: 'POST' })
  return res.json()
}

export async function sendAanvraagReminder(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`/api/reminders/aanvraag-send/${id}`, { method: 'POST' })
  return res.json()
}

export async function sendReviewRequest(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`/api/reminders/review-send/${id}`, { method: 'POST' })
  return res.json()
}

export async function sendFeestHerinnering(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`/api/reminders/feest-herinnering-send/${id}`, { method: 'POST' })
  return res.json()
}

// ── Email templates ────────────────────────────────────────────────────────

export type TemplateKey = 'vragenlijst_reminder' | 'feest_nadert' | 'review_request' | 'aanvraag_followup' | 'afwijzing'

export interface EmailTemplate {
  id: number
  key: TemplateKey
  name: string
  subject: string
  body: string
  updated_at: string
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const res = await fetch(`/api/templates`)
  const data = await res.json() as { templates: EmailTemplate[] }
  return data.templates || []
}

export async function updateEmailTemplate(key: TemplateKey, payload: { name?: string; subject: string; body: string }) {
  const res = await fetch(`/api/templates/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function previewTemplate(key: TemplateKey, bookingId: number, payload?: { subject?: string; body?: string }): Promise<{ to: string; subject: string; body: string; html: string; error?: string }> {
  const res = await fetch(`/api/templates/${key}/preview/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  return res.json()
}

export async function sendTemplate(key: TemplateKey, bookingId: number, payload: { subject: string; body: string }): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`/api/templates/${key}/send/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

// ── Venues ──────────────────────────────────────────────────────────────────

const VENUES_BASE = `/api/venues`

export async function getVenues(): Promise<Venue[]> {
  try {
    const res = await fetch(VENUES_BASE)
    const data = await res.json() as { venues: Venue[] }
    const remote = data.venues || []
    const locals = localVenues()
    return [...remote, ...locals.filter(l => !remote.some(r => r.id === l.id))]
  } catch {
    return localVenues()
  }
}

export async function getVenue(id: number): Promise<Venue | null> {
  try {
    const res = await fetch(`${VENUES_BASE}/${id}`)
    if (res.ok) {
      const data = await res.json() as { venue: Venue }
      return data.venue
    }
  } catch {}
  return localVenues().find(v => v.id === id) || null
}

export async function getVenueBookings(id: number): Promise<VenueBooking[]> {
  try {
    const res = await fetch(`${VENUES_BASE}/${id}/bookings`)
    const data = await res.json() as { bookings: VenueBooking[] }
    if (data.bookings?.length) return data.bookings
  } catch {}
  return venueBookings(id)
}

export async function createVenue(payload: Partial<Venue>): Promise<{ success: boolean; id: number }> {
  try {
    const res = await fetch(VENUES_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json() as { success: boolean; id: number }
    if (data.id && data.id > 0) return data
  } catch {}
  return createLocalVenue(payload)
}

export async function updateVenue(id: number, payload: Partial<Venue>): Promise<{ success: boolean }> {
  updateLocalVenue(id, payload)
  try {
    const res = await fetch(`${VENUES_BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return res.json()
  } catch {
    return { success: true }
  }
}

export async function deleteVenue(id: number, force = false): Promise<{ success: boolean; error?: string; booking_count?: number }> {
  deleteLocalVenue(id)
  try {
    const res = await fetch(`${VENUES_BASE}/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })
    return res.json()
  } catch {
    return { success: true }
  }
}

export async function populateVenuesFromBookings(): Promise<{ success: boolean; created: number; linked: number; skipped: number }> {
  const res = await fetch(`${VENUES_BASE}/populate`, { method: 'POST' })
  return res.json()
}

export async function suggestVenues(q: string): Promise<VenueSuggestion[]> {
  if (!q.trim()) return []
  try {
    const res = await fetch(`${VENUES_BASE}/suggest?q=${encodeURIComponent(q)}`)
    const data = await res.json() as { venues: VenueSuggestion[] }
    const local = venueSuggestions(q)
    return [...(data.venues || []), ...local.filter(l => !(data.venues || []).some(r => r.id === l.id))]
  } catch {
    return venueSuggestions(q)
  }
}

// ── Booking files shown on customer portal ─────────────────────────────────

export interface BookingFile {
  id: number
  booking_id: number
  name: string
  type?: string | null
  size?: number | null
  visible_to_customer?: number
  created_at?: string
}

export async function getBookingFiles(bookingId: number): Promise<BookingFile[]> {
  try {
    const res = await fetch(`/api/files/${bookingId}`)
    const data = await res.json() as { files: BookingFile[] }
    return data.files || []
  } catch {
    return []
  }
}

export async function uploadBookingFile(bookingId: number, file: File): Promise<{ success: boolean; error?: string; file?: BookingFile }> {
  const form = new FormData()
  form.append('file', file)
  try {
    const res = await fetch(`/api/files/${bookingId}`, { method: 'POST', body: form })
    return res.json()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Upload mislukt' }
  }
}

export async function deleteBookingFile(fileId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' })
    return res.json()
  } catch {
    return { success: false, error: 'Verwijderen mislukt' }
  }
}

export function bookingFileDownloadUrl(fileId: number): string {
  return `/api/files/download/${fileId}`
}
