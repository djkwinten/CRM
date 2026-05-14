import { Booking } from '../types/booking'
import { Venue, VenueSuggestion, VenueBooking } from '../types/venue'
import { BookingContractInfo } from '../features/event-workspace/types'

const API_ROOT = import.meta.env.VITE_API_URL || ''
const BASE = `${API_ROOT}/api/bookings`

export async function initDb() {
  const res = await fetch(`${BASE}/init`, { method: 'POST' })
  return res.json()
}

export async function getBookings(): Promise<Booking[]> {
  const res = await fetch(BASE)
  const data = await res.json() as { bookings: Booking[] }
  return data.bookings || []
}

export async function getBooking(id: string): Promise<Booking | null> {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) return null
  const data = await res.json() as { booking: Booking }
  return data.booking
}

export async function createBooking(payload: Partial<Booking>): Promise<{ id: number; slug: string; access_token: string }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function updateStatus(id: number, status: Partial<Pick<Booking, 'status_contract' | 'status_voorschot' | 'status_vragenlijst'>>) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(status)
  })
  return res.json()
}

export async function submitQuestionnaire(id: string, payload: Partial<Booking>) {
  const res = await fetch(`${BASE}/${id}/questionnaire`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
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
}) {
  const res = await fetch(`${BASE}/${id}/contract`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function updatePortalSettings(id: number, payload: { portal_title?: string }) {
  const res = await fetch(`${BASE}/${id}/portal`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
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
  const res = await fetch(`${BASE}/${id}/basisinfo`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function getContractInfo(id: number): Promise<BookingContractInfo | null> {
  const res = await fetch(`${BASE}/${id}/contract-info`)
  if (!res.ok) return null
  const data = await res.json() as { contract_info: BookingContractInfo }
  return data.contract_info
}

export async function saveContractInfo(id: number, payload: Partial<BookingContractInfo>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${BASE}/${id}/contract-info`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function getBookingPDF(ref: string, type: 'contract' | 'factuur'): Promise<string | null> {
  const res = await fetch(`${BASE}/${ref}/pdf/${type}`)
  if (!res.ok) return null
  const data = await res.json() as { pdf?: string }
  return data.pdf || null
}

export async function deleteBooking(id: number) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  return res.json()
}

export async function confirmBooking(id: number) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_aanvraag: 0 })
  })
  return res.json()
}

export async function rejectBooking(id: number, reden: string) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_afgewezen: 1, afgewezen_reden: reden })
  })
  return res.json()
}

export async function restoreBooking(id: number) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_afgewezen: 0, afgewezen_reden: '' })
  })
  return res.json()
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
  const res = await fetch(`${API_ROOT}/api/reminders/status`)
  const data = await res.json() as { statuses: ReminderStatus[] }
  return data.statuses || []
}

export async function runReminderCheck(): Promise<{ sent: number; checked: number; results: { id: number; naam: string; sent: boolean; reason?: string }[] }> {
  const res = await fetch(`${API_ROOT}/api/reminders/check`, { method: 'POST' })
  return res.json()
}

export async function sendReminder(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`${API_ROOT}/api/reminders/send/${id}`, { method: 'POST' })
  return res.json()
}

export async function testSmtp(): Promise<{ connected: boolean; message: string }> {
  const res = await fetch(`${API_ROOT}/api/reminders/smtp-test`, { method: 'POST' })
  return res.json()
}

export async function sendAanvraagReminder(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`${API_ROOT}/api/reminders/aanvraag-send/${id}`, { method: 'POST' })
  return res.json()
}

export async function sendReviewRequest(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`${API_ROOT}/api/reminders/review-send/${id}`, { method: 'POST' })
  return res.json()
}

export async function sendFeestHerinnering(id: number): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`${API_ROOT}/api/reminders/feest-herinnering-send/${id}`, { method: 'POST' })
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
  const res = await fetch(`${API_ROOT}/api/templates`)
  const data = await res.json() as { templates: EmailTemplate[] }
  return data.templates || []
}

export async function updateEmailTemplate(key: TemplateKey, payload: { name?: string; subject: string; body: string }) {
  const res = await fetch(`${API_ROOT}/api/templates/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function previewTemplate(key: TemplateKey, bookingId: number, payload?: { subject?: string; body?: string }): Promise<{ to: string; subject: string; body: string; html: string; error?: string }> {
  const res = await fetch(`${API_ROOT}/api/templates/${key}/preview/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  return res.json()
}

export async function sendTemplate(key: TemplateKey, bookingId: number, payload: { subject: string; body: string }): Promise<{ success: boolean; error?: string; sent_to?: string }> {
  const res = await fetch(`${API_ROOT}/api/templates/${key}/send/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

// ── Venues ──────────────────────────────────────────────────────────────────

const VENUES_BASE = `${API_ROOT}/api/venues`

export async function getVenues(): Promise<Venue[]> {
  const res = await fetch(VENUES_BASE)
  const data = await res.json() as { venues: Venue[] }
  return data.venues || []
}

export async function getVenue(id: number): Promise<Venue | null> {
  const res = await fetch(`${VENUES_BASE}/${id}`)
  if (!res.ok) return null
  const data = await res.json() as { venue: Venue }
  return data.venue
}

export async function getVenueBookings(id: number): Promise<VenueBooking[]> {
  const res = await fetch(`${VENUES_BASE}/${id}/bookings`)
  const data = await res.json() as { bookings: VenueBooking[] }
  return data.bookings || []
}

export async function createVenue(payload: Partial<Venue>): Promise<{ success: boolean; id: number }> {
  const res = await fetch(VENUES_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function updateVenue(id: number, payload: Partial<Venue>): Promise<{ success: boolean }> {
  const res = await fetch(`${VENUES_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function deleteVenue(id: number, force = false): Promise<{ success: boolean; error?: string; booking_count?: number }> {
  const res = await fetch(`${VENUES_BASE}/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })
  return res.json()
}

export async function populateVenuesFromBookings(): Promise<{ success: boolean; created: number; linked: number; skipped: number }> {
  const res = await fetch(`${VENUES_BASE}/populate`, { method: 'POST' })
  return res.json()
}

export async function suggestVenues(q: string): Promise<VenueSuggestion[]> {
  if (!q.trim()) return []
  const res = await fetch(`${VENUES_BASE}/suggest?q=${encodeURIComponent(q)}`)
  const data = await res.json() as { venues: VenueSuggestion[] }
  return data.venues || []
}
