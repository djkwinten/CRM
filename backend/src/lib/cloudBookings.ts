type CloudEnv = {
  STORAGE?: R2Bucket
}

export type CloudBooking = Record<string, unknown> & {
  id?: number
  feest_datum?: string
  type_feest?: string
  naam_organisator?: string
  naam_partner1?: string
  naam_partner2?: string
  slug?: string
  access_token?: string
  updated_at?: string
  created_at?: string
}

const BOOKINGS_KEY = 'data/bookings.json'

function hasStorage(env: CloudEnv | null | undefined): env is { STORAGE: R2Bucket } {
  return !!env?.STORAGE
}

function token(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
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

function uniqueSlug(base: string, bookings: CloudBooking[], ignoreId?: number): string {
  let candidate = base
  let i = 1
  while (bookings.some(b => b.slug === candidate && Number(b.id) !== ignoreId)) {
    candidate = `${base}-${i++}`
  }
  return candidate
}

function nextId(bookings: CloudBooking[]): number {
  return Math.max(0, ...bookings.map(b => Number(b.id) || 0)) + 1
}

function bookingNameForSlug(booking: CloudBooking): string {
  if (booking.type_feest === 'Trouw') {
    const p1 = String(booking.naam_partner1 || '').split(' ')[0]
    const p2 = String(booking.naam_partner2 || '').split(' ')[0]
    const partners = [p1, p2].filter(Boolean).join('-en-')
    if (partners) return partners
  }
  return String(booking.naam_organisator || 'boeking')
}

function normalizeBooking(raw: CloudBooking, bookings: CloudBooking[], preserveId = true): CloudBooking {
  const now = new Date().toISOString()
  const id = preserveId && Number(raw.id) > 0 ? Number(raw.id) : nextId(bookings)
  const type = String(raw.type_feest || 'Algemeen')
  const date = String(raw.feest_datum || '')
  const baseSlug = raw.slug ? String(raw.slug) : slugify(bookingNameForSlug({ ...raw, type_feest: type }), date, type)
  return {
    status_contract: 0,
    status_voorschot: 0,
    status_vragenlijst: 0,
    is_aanvraag: 0,
    is_afgewezen: 0,
    ...raw,
    id,
    type_feest: type,
    access_token: raw.access_token ? String(raw.access_token) : token(),
    slug: uniqueSlug(baseSlug, bookings, id),
    created_at: raw.created_at ? String(raw.created_at) : now,
    updated_at: now,
  }
}

export async function readCloudBookings(env: CloudEnv | null | undefined): Promise<CloudBooking[]> {
  if (!hasStorage(env)) return []
  const obj = await env.STORAGE.get(BOOKINGS_KEY)
  if (!obj) return []
  try {
    const body = await obj.json() as { bookings?: CloudBooking[] } | CloudBooking[]
    const bookings = Array.isArray(body) ? body : Array.isArray(body.bookings) ? body.bookings : []
    return bookings.sort((a, b) => String(a.feest_datum || '').localeCompare(String(b.feest_datum || '')))
  } catch {
    return []
  }
}

export async function writeCloudBookings(env: CloudEnv | null | undefined, bookings: CloudBooking[]): Promise<void> {
  if (!hasStorage(env)) throw new Error('Cloud storage niet geconfigureerd')
  const body = JSON.stringify({ updated_at: new Date().toISOString(), count: bookings.length, bookings }, null, 2)
  await env.STORAGE.put(BOOKINGS_KEY, body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
}

export async function importCloudBookings(env: CloudEnv, rawBookings: unknown[]): Promise<{ imported: number; skipped: number; total: number; errors: string[] }> {
  const existing = await readCloudBookings(env)
  const byKey = new Map<string, CloudBooking>()
  for (const b of existing) {
    const key = String(b.slug || b.access_token || b.id || `${b.feest_datum}-${b.naam_organisator}`)
    byKey.set(key, b)
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []
  let current = [...existing]

  for (const raw of rawBookings) {
    if (!raw || typeof raw !== 'object') { skipped++; continue }
    const booking = raw as CloudBooking
    if (!booking.feest_datum) { skipped++; continue }
    try {
      const key = String(booking.slug || booking.access_token || booking.id || `${booking.feest_datum}-${booking.naam_organisator}`)
      const previous = byKey.get(key)
      const merged = normalizeBooking({ ...(previous || {}), ...booking }, current, true)
      if (previous) current = current.map(b => b === previous ? merged : b)
      else current.push(merged)
      byKey.set(key, merged)
      imported++
    } catch (e) {
      skipped++
      errors.push(`Boeking ${String(booking.feest_datum || '?')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await writeCloudBookings(env, current.sort((a, b) => String(a.feest_datum || '').localeCompare(String(b.feest_datum || ''))))
  return { imported, skipped, total: rawBookings.length, errors: errors.slice(0, 10) }
}

export async function findCloudBooking(env: CloudEnv | null | undefined, ref: string): Promise<CloudBooking | null> {
  const bookings = await readCloudBookings(env)
  const numeric = /^\d+$/.test(ref)
  return bookings.find(b => numeric ? Number(b.id) === Number(ref) : b.slug === ref || b.access_token === ref) || null
}

export async function createCloudBooking(env: CloudEnv, payload: CloudBooking): Promise<CloudBooking> {
  const bookings = await readCloudBookings(env)
  const booking = normalizeBooking(payload, bookings, false)
  const next = [...bookings, booking].sort((a, b) => String(a.feest_datum || '').localeCompare(String(b.feest_datum || '')))
  await writeCloudBookings(env, next)
  return booking
}

export async function patchCloudBooking(env: CloudEnv, ref: string | number, patch: CloudBooking): Promise<CloudBooking | null> {
  const bookings = await readCloudBookings(env)
  const refStr = String(ref)
  const numeric = /^\d+$/.test(refStr)
  const idx = bookings.findIndex(b => numeric ? Number(b.id) === Number(refStr) : b.slug === refStr || b.access_token === refStr)
  if (idx < 0) return null
  const nextBooking = { ...bookings[idx], ...patch, updated_at: new Date().toISOString() }
  const next = [...bookings]
  next[idx] = nextBooking
  await writeCloudBookings(env, next.sort((a, b) => String(a.feest_datum || '').localeCompare(String(b.feest_datum || ''))))
  return nextBooking
}

export async function deleteCloudBooking(env: CloudEnv, id: string | number): Promise<boolean> {
  const bookings = await readCloudBookings(env)
  const next = bookings.filter(b => Number(b.id) !== Number(id))
  if (next.length === bookings.length) return false
  await writeCloudBookings(env, next)
  return true
}
