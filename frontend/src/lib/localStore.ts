import { Booking } from '../types/booking'
import { Venue, VenueBooking, VenueSuggestion } from '../types/venue'
import { BookingContractInfo } from '../features/event-workspace/types'

const BOOKINGS_KEY = 'dj-crm-local-bookings-v1'
const VENUES_KEY = 'dj-crm-local-venues-v1'
const CONTRACT_KEY = 'dj-crm-local-contract-info-v1'

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function token(bytes = 16): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes)
    crypto.getRandomValues(arr)
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function slugify(name: string, date: string, type: string): string {
  const prefix = type === 'Trouw' ? 'trouw' : 'feest'
  const namePart = (name || 'boeking')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/).slice(0, 3).join('-') || 'boeking'
  const year = date ? date.slice(0, 4) : String(new Date().getFullYear())
  return `${prefix}-${namePart}-${year}`
}

function nextId<T extends { id: number }>(items: T[]): number {
  return Math.max(0, ...items.map(i => Number(i.id) || 0)) + 1
}

function uniqueSlug(base: string, bookings: Booking[]): string {
  let candidate = base
  let i = 1
  while (bookings.some(b => b.slug === candidate)) {
    candidate = `${base}-${i++}`
  }
  return candidate
}

export function localBookings(): Booking[] {
  return readJson<Booking[]>(BOOKINGS_KEY, [])
}

export function saveLocalBookings(bookings: Booking[]) {
  writeJson(BOOKINGS_KEY, bookings)
  // Keep the dashboard's older cache in sync too, otherwise it can show stale data for a few minutes.
  writeJson('dj-dashboard-bookings', { data: bookings, ts: Date.now() })
}

export function mergeBookings(remote: Booking[] = []): Booking[] {
  const local = localBookings()
  const map = new Map<string, Booking>()
  for (const b of remote) map.set(String(b.id), b)
  for (const b of local) map.set(String(b.id), b)
  return Array.from(map.values()).sort((a, b) => String(a.feest_datum || '').localeCompare(String(b.feest_datum || '')))
}

export function findLocalBooking(ref: string | number): Booking | null {
  const r = String(ref)
  return localBookings().find(b => String(b.id) === r || b.slug === r || b.access_token === r) || null
}

export function createLocalBooking(payload: Partial<Booking>): { id: number; slug: string; access_token: string } {
  const bookings = localBookings()
  const id = nextId(bookings)
  const type = payload.type_feest || 'Algemeen'
  const date = payload.feest_datum || ''
  const p1 = (payload.naam_partner1 || '').split(' ')[0]
  const p2 = (payload.naam_partner2 || '').split(' ')[0]
  const slugName = type === 'Trouw' && (p1 || p2)
    ? [p1, p2].filter(Boolean).join('-en-')
    : payload.naam_organisator || 'boeking'
  const slug = uniqueSlug(slugify(slugName, date, type), bookings)
  const access_token = token()
  const now = new Date().toISOString()
  const booking: Booking = {
    id,
    access_token,
    slug,
    portal_title: payload.portal_title,
    feest_datum: date,
    type_feest: type,
    is_aanvraag: payload.is_aanvraag ?? 1,
    status_contract: payload.status_contract ?? 0,
    status_voorschot: payload.status_voorschot ?? 0,
    status_vragenlijst: payload.status_vragenlijst ?? 0,
    naam_organisator: payload.naam_organisator || '',
    naam_partner1: payload.naam_partner1,
    naam_partner2: payload.naam_partner2,
    email: payload.email || '',
    telefoon: payload.telefoon || '',
    created_at: now,
    updated_at: now,
    ...payload,
  }
  saveLocalBookings([...bookings, booking])
  return { id, slug, access_token }
}

export function updateLocalBooking(ref: string | number, patch: Partial<Booking>): boolean {
  const bookings = localBookings()
  const r = String(ref)
  let changed = false
  const updated = bookings.map(b => {
    if (String(b.id) === r || b.slug === r || b.access_token === r) {
      changed = true
      return { ...b, ...patch, updated_at: new Date().toISOString() }
    }
    return b
  })
  if (changed) saveLocalBookings(updated)
  return changed
}

export function deleteLocalBooking(id: number): boolean {
  const before = localBookings()
  const after = before.filter(b => b.id !== id)
  saveLocalBookings(after)
  return after.length !== before.length
}

export function importLocalBookings(items: unknown[]): { imported: number; skipped: number; errors: string[] } {
  const current = localBookings()
  const byKey = new Set(current.flatMap(b => [String(b.id), b.slug || '', b.access_token || '']).filter(Boolean))
  const imported: Booking[] = []
  const errors: string[] = []

  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('Ongeldige boeking overgeslagen')
      continue
    }
    const obj = raw as Partial<Booking>
    const duplicate = [String(obj.id || ''), obj.slug || '', obj.access_token || ''].some(k => k && byKey.has(k))
    if (duplicate) continue
    const result = createLocalBooking(obj)
    const created = findLocalBooking(result.id)
    if (created) {
      imported.push(created)
      byKey.add(String(created.id)); if (created.slug) byKey.add(created.slug); if (created.access_token) byKey.add(created.access_token)
    }
  }
  return { imported: imported.length, skipped: items.length - imported.length - errors.length, errors }
}

export function localContractInfo(id: number): BookingContractInfo | null {
  const all = readJson<Record<string, BookingContractInfo>>(CONTRACT_KEY, {})
  return all[String(id)] || null
}

export function saveLocalContractInfo(id: number, payload: Partial<BookingContractInfo>): { success: boolean } {
  const all = readJson<Record<string, BookingContractInfo>>(CONTRACT_KEY, {})
  const existing = all[String(id)] || { booking_id: id }
  all[String(id)] = { ...existing, ...payload, booking_id: id } as BookingContractInfo
  writeJson(CONTRACT_KEY, all)
  return { success: true }
}

export function deriveContractInfo(b: Booking): BookingContractInfo {
  const naam = b.naam_partner1 || b.naam_partner2
    ? [b.naam_partner1?.split(' ')[0], b.naam_partner2?.split(' ')[0]].filter(Boolean).join(' & ')
    : b.naam_organisator || ''
  return {
    booking_id: b.id,
    naam,
    email: b.email || '',
    gsm: b.telefoon || '',
    klant_adres: b.adres_organisator || '',
    event_type: b.type_feest || '',
    event_datum: b.feest_datum || '',
    locatie_naam: b.locatie_naam || '',
    locatie_adres: b.locatie_adres || '',
    aantal_gasten: b.aantal_gasten || null,
    uur_dansfeest: b.uur_dansfeest || '',
    geluid_voorzien: b.speakers_aanwezig ? 1 : 0,
    licht_voorzien: b.licht_aanwezig ? 1 : 0,
    dj_booth_nodig: b.dj_booth_aanwezig ? 1 : 0,
    afgesproken_prijs: b.totaalprijs || b.basisprijs || null,
    voorschot_bedrag: null,
    basisprijs: b.basisprijs || null,
    extra_prijzen: b.extra_prijzen || '{}',
    ceremonie_set: b.ceremonie_set || 0,
    digital_booth: b.digital_booth || 0,
    retro_booth: b.retro_booth || 0,
    draadloze_speaker: b.draadloze_speaker || 0,
    karaoke: b.karaoke || 0,
    contract_ready: 0,
    notes: ''
  } as BookingContractInfo
}

export function localVenues(): Venue[] {
  return readJson<Venue[]>(VENUES_KEY, [])
}

export function saveLocalVenues(venues: Venue[]) {
  writeJson(VENUES_KEY, venues)
}

export function createLocalVenue(payload: Partial<Venue>): { success: boolean; id: number } {
  const venues = localVenues()
  const id = nextId(venues)
  const now = new Date().toISOString()
  saveLocalVenues([...venues, { id, naam: payload.naam || 'Nieuwe zaal', created_at: now, updated_at: now, ...payload } as Venue])
  return { success: true, id }
}

export function updateLocalVenue(id: number, payload: Partial<Venue>): { success: boolean } {
  saveLocalVenues(localVenues().map(v => v.id === id ? { ...v, ...payload, updated_at: new Date().toISOString() } : v))
  return { success: true }
}

export function deleteLocalVenue(id: number): { success: boolean } {
  saveLocalVenues(localVenues().filter(v => v.id !== id))
  return { success: true }
}

export function venueSuggestions(q: string): VenueSuggestion[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  return localVenues()
    .filter(v => v.naam.toLowerCase().includes(query) || (v.adres || '').toLowerCase().includes(query))
    .map(v => ({ id: v.id, naam: v.naam, adres: v.adres, booking_count: localBookings().filter(b => (b as any).venue_id === v.id || b.locatie_naam === v.naam).length }))
}

export function venueBookings(id: number): VenueBooking[] {
  return localBookings()
    .filter(b => (b as any).venue_id === id)
    .map(b => ({ id: b.id, feest_datum: b.feest_datum, type_feest: b.type_feest, naam_organisator: b.naam_organisator, naam_partner1: b.naam_partner1, naam_partner2: b.naam_partner2, is_aanvraag: b.is_aanvraag, slug: b.slug }))
}
