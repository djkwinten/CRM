import { Booking } from '../types/booking'
import { Venue, VenueSuggestion, VenueBooking } from '../types/venue'
import { BookingContractInfo } from '../features/event-workspace/types'
import { createLocalBooking, deleteLocalBooking, deriveContractInfo, findLocalBooking, localBookings, localContractInfo, localVenues, mergeBookings, saveLocalContractInfo, updateLocalBooking, createLocalVenue, updateLocalVenue, deleteLocalVenue, venueBookings, venueSuggestions } from './localStore'

const API_ROOT = import.meta.env.VITE_API_URL || ''
const BASE = `${API_ROOT}/api/bookings`

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

export async function updateStatus(id: number, status: Partial<Pick<Booking, 'status_contract' | 'status_voorschot' | 'status_vragenlijst' | 'is_aanvraag' | 'is_afgewezen' | 'afgewezen_reden'>>) {
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

export async function submitQuestionnaire(id: string, payload: Partial<Booking>) {
  updateLocalBooking(id, { ...payload, status_vragenlijst: 1, vragenlijst_first_submitted_at: new Date().toISOString() })
  try {
    const res = await fetch(`${BASE}/${id}/questionnaire`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return res.json()
  } catch {
    return { success: true, local: true }
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
  const local = localContractInfo(id)
  if (local) return local
  try {
    const res = await fetch(`${BASE}/${id}/contract-info`)
    if (res.ok) {
      const data = await res.json() as { contract_info: BookingContractInfo }
      if (data.contract_info) return data.contract_info
    }
  } catch {}
  const booking = findLocalBooking(id)
  return booking ? deriveContractInfo(booking) : null
}

export async function saveContractInfo(id: number, payload: Partial<BookingContractInfo>): Promise<{ success: boolean; error?: string }> {
  saveLocalContractInfo(id, payload)
  try {
    const res = await fetch(`${BASE}/${id}/contract-info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
    const res = await fetch(`${API_ROOT}/api/reminders/status`)
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
