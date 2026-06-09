export interface CloudVenue {
  id?: number
  naam: string
  adres?: string | null
  capaciteit?: number | null
  contact_naam?: string | null
  contact_telefoon?: string | null
  contact_email?: string | null
  website?: string | null
  geluidsbeperking?: number
  geluidsbeperking_db?: number | null
  speakers_aanwezig?: number
  licht_aanwezig?: number
  micro_aanwezig?: number
  dj_booth_aanwezig?: number
  uplights_aanwezig?: number
  speakers_buiten?: number
  parkeren_info?: string | null
  gelijkvloers?: number
  wifi_code?: string | null
  fotos?: string | null
  notities?: string | null
  afstand_km?: number | null
  rijtijd_min?: number | null
  created_at?: string
  updated_at?: string
  booking_count?: number
  [key: string]: unknown
}

type CloudEnv = {
  STORAGE?: R2Bucket
}

const VENUES_KEY = 'data/venues.json'

function hasStorage(env: CloudEnv | null | undefined): env is { STORAGE: R2Bucket } {
  return !!env?.STORAGE
}

function bool(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback
  return v ? 1 : 0
}

function nextId(venues: CloudVenue[]): number {
  return Math.max(0, ...venues.map(v => Number(v.id) || 0)) + 1
}

function normalizeVenue(raw: Partial<CloudVenue>, venues: CloudVenue[], preserveId = true): CloudVenue {
  const now = new Date().toISOString()
  const id = preserveId && Number(raw.id) > 0 ? Number(raw.id) : nextId(venues)
  return {
    ...raw,
    id,
    naam: String(raw.naam || '').trim(),
    geluidsbeperking: bool(raw.geluidsbeperking),
    speakers_aanwezig: bool(raw.speakers_aanwezig),
    licht_aanwezig: bool(raw.licht_aanwezig),
    micro_aanwezig: bool(raw.micro_aanwezig),
    dj_booth_aanwezig: bool(raw.dj_booth_aanwezig),
    uplights_aanwezig: bool(raw.uplights_aanwezig),
    speakers_buiten: bool(raw.speakers_buiten),
    gelijkvloers: raw.gelijkvloers !== undefined ? bool(raw.gelijkvloers, 1) : 1,
    created_at: raw.created_at || now,
    updated_at: now,
  }
}

export async function readCloudVenues(env: CloudEnv | null | undefined): Promise<CloudVenue[]> {
  if (!hasStorage(env)) return []
  const obj = await env.STORAGE.get(VENUES_KEY)
  if (!obj) return []
  try {
    const body = await obj.json() as { venues?: CloudVenue[] } | CloudVenue[]
    const venues = Array.isArray(body) ? body : Array.isArray(body.venues) ? body.venues : []
    return venues.sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl'))
  } catch {
    return []
  }
}

export async function writeCloudVenues(env: CloudEnv | null | undefined, venues: CloudVenue[]): Promise<void> {
  if (!hasStorage(env)) throw new Error('Cloud storage niet geconfigureerd')
  const body = JSON.stringify({ updated_at: new Date().toISOString(), count: venues.length, venues }, null, 2)
  await env.STORAGE.put(VENUES_KEY, body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
}

export async function importCloudVenues(env: CloudEnv, rawVenues: unknown[] | null | undefined): Promise<{ imported: number; skipped: number; total: number; errors: string[] }> {
  if (!rawVenues?.length) return { imported: 0, skipped: 0, total: 0, errors: [] }
  const existing = await readCloudVenues(env)
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of rawVenues) {
    if (!raw || typeof raw !== 'object') { skipped++; continue }
    const venue = raw as Partial<CloudVenue>
    if (!String(venue.naam || '').trim()) { skipped++; continue }
    try {
      const index = existing.findIndex(v =>
        (venue.id && Number(v.id) === Number(venue.id)) ||
        String(v.naam || '').trim().toLowerCase() === String(venue.naam || '').trim().toLowerCase()
      )
      const normalized = normalizeVenue(index >= 0 ? { ...existing[index], ...venue } : venue, existing, true)
      if (index >= 0) existing[index] = normalized
      else existing.push(normalized)
      imported++
    } catch (e) {
      skipped++
      errors.push(`Zaal ${String(venue.naam || '?')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await writeCloudVenues(env, existing.sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl')))
  return { imported, skipped, total: rawVenues.length, errors: errors.slice(0, 10) }
}

export function extractVenuesFromBackupBody(body: unknown): unknown[] | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  for (const key of ['venues', 'zalen']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  for (const key of ['data', 'backup', 'export', 'payload']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>
      for (const nestedKey of ['venues', 'zalen']) {
        if (Array.isArray(nestedObj[nestedKey])) return nestedObj[nestedKey] as unknown[]
      }
    }
  }
  return null
}

export async function findCloudVenue(env: CloudEnv | null | undefined, id: string | number): Promise<CloudVenue | null> {
  const venues = await readCloudVenues(env)
  return venues.find(v => Number(v.id) === Number(id)) || null
}

export async function createCloudVenue(env: CloudEnv, payload: Partial<CloudVenue>): Promise<CloudVenue> {
  const venues = await readCloudVenues(env)
  const venue = normalizeVenue(payload, venues, false)
  if (!venue.naam) throw new Error('Naam is verplicht')
  const next = [...venues, venue].sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl'))
  await writeCloudVenues(env, next)
  return venue
}

export async function patchCloudVenue(env: CloudEnv, id: string | number, patch: Partial<CloudVenue>): Promise<CloudVenue | null> {
  const venues = await readCloudVenues(env)
  const idx = venues.findIndex(v => Number(v.id) === Number(id))
  if (idx < 0) return null
  const updated = normalizeVenue({ ...venues[idx], ...patch, id: venues[idx].id }, venues, true)
  venues[idx] = updated
  await writeCloudVenues(env, venues.sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl')))
  return updated
}

export async function deleteCloudVenue(env: CloudEnv, id: string | number): Promise<boolean> {
  const venues = await readCloudVenues(env)
  const next = venues.filter(v => Number(v.id) !== Number(id))
  if (next.length === venues.length) return false
  await writeCloudVenues(env, next)
  return true
}
