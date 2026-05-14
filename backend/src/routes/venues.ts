import { Hono } from 'hono'
import { query, queryOne, execute } from '../lib/db'

type Bindings = {
  DB?: D1Database
  STORAGE?: R2Bucket
}

export const venuesRoutes = new Hono<{ Bindings: Bindings }>()

interface VenueRow {
  id: number
  naam: string
  adres?: string | null
  capaciteit?: number | null
  contact_naam?: string | null
  contact_telefoon?: string | null
  website?: string | null
  geluidsbeperking: number
  geluidsbeperking_db?: number | null
  speakers_aanwezig: number
  licht_aanwezig: number
  micro_aanwezig: number
  dj_booth_aanwezig: number
  uplights_aanwezig: number
  speakers_buiten: number
  parkeren_info?: string | null
  gelijkvloers: number
  wifi_code?: string | null
  fotos?: string | null
  notities?: string | null
  afstand_km?: number | null
  rijtijd_min?: number | null
  created_at?: string
  updated_at?: string
  booking_count?: number
}

// ── GET /api/venues — lijst met booking_count ──────────────────────────────

venuesRoutes.get('/', async (c) => {
  const venues = await query<VenueRow>(c.env, `
    SELECT v.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.venue_id = v.id) as booking_count
    FROM venues v
    ORDER BY v.naam ASC
  `)
  return c.json({ venues })
})

// ── GET /api/venues/suggest?q= — autocomplete ─────────────────────────────
// BELANGRIJK: moet vóór /:id geregistreerd worden!

venuesRoutes.get('/suggest', async (c) => {
  const q = c.req.query('q') || ''
  if (!q.trim()) return c.json({ venues: [] })
  const venues = await query<{ id: number; naam: string; adres: string | null; booking_count: number }>(
    c.env,
    `SELECT v.id, v.naam, v.adres,
       (SELECT COUNT(*) FROM bookings b WHERE b.venue_id = v.id) as booking_count
     FROM venues v
     WHERE v.naam LIKE ?
     ORDER BY v.naam ASC
     LIMIT 8`,
    [`%${q}%`]
  )
  return c.json({ venues })
})

// ── GET /api/venues/:id — detail ──────────────────────────────────────────

venuesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const venue = await queryOne<VenueRow>(c.env, `
    SELECT v.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.venue_id = v.id) as booking_count
    FROM venues v
    WHERE v.id = ?
  `, [id])
  if (!venue) return c.json({ error: 'Zaal niet gevonden' }, 404)
  return c.json({ venue })
})

// ── GET /api/venues/:id/bookings — gekoppelde boekingen ───────────────────

venuesRoutes.get('/:id/bookings', async (c) => {
  const id = c.req.param('id')
  const bookings = await query<{
    id: number
    feest_datum: string
    type_feest: string
    naam_organisator: string
    naam_partner1: string | null
    naam_partner2: string | null
    is_aanvraag: number
    slug: string | null
  }>(c.env, `
    SELECT id, feest_datum, type_feest, naam_organisator, naam_partner1, naam_partner2, is_aanvraag, slug
    FROM bookings
    WHERE venue_id = ?
    ORDER BY feest_datum DESC
  `, [id])
  return c.json({ bookings })
})

// ── POST /api/venues — aanmaken ───────────────────────────────────────────

venuesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.naam?.trim()) return c.json({ error: 'Naam is verplicht' }, 400)

  const bool = (v: unknown) => (v ? 1 : 0)

  const result = await execute(c.env, `
    INSERT INTO venues (
      naam, adres, capaciteit,
      contact_naam, contact_telefoon, website,
      geluidsbeperking, geluidsbeperking_db,
      speakers_aanwezig, licht_aanwezig, micro_aanwezig, dj_booth_aanwezig, uplights_aanwezig, speakers_buiten,
      parkeren_info, gelijkvloers, wifi_code,
      fotos, notities
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    body.naam.trim(),
    body.adres ?? null,
    body.capaciteit ?? null,
    body.contact_naam ?? null,
    body.contact_telefoon ?? null,
    body.website ?? null,
    bool(body.geluidsbeperking),
    body.geluidsbeperking_db ?? null,
    bool(body.speakers_aanwezig),
    bool(body.licht_aanwezig),
    bool(body.micro_aanwezig),
    bool(body.dj_booth_aanwezig),
    bool(body.uplights_aanwezig),
    bool(body.speakers_buiten),
    body.parkeren_info ?? null,
    body.gelijkvloers !== undefined ? bool(body.gelijkvloers) : 1,
    body.wifi_code ?? null,
    body.fotos ?? null,
    body.notities ?? null,
  ])

  return c.json({ success: true, id: result.lastRowId })
})

// ── POST /api/venues/populate — auto-import vanuit boekingen ─────────────

venuesRoutes.post('/populate', async (c) => {
  // Haal unieke locatienamen op die nog niet gekoppeld zijn
  const rows = await query<{
    locatie_naam: string
    locatie_adres: string | null
    zaal_contact: string | null
    geluidsbeperking_info: string | null
    wifi_code: string | null
    parkeren_info: string | null
    gelijkvloers: number
    speakers_aanwezig: number
    licht_aanwezig: number
    micro_aanwezig: number
    dj_booth_aanwezig: number
    uplights_aanwezig: number
    speakers_buiten: number
    zaal_fotos: string | null
  }>(c.env, `
    SELECT locatie_naam, locatie_adres, zaal_contact, geluidsbeperking_info,
           wifi_code, parkeren_info, gelijkvloers,
           speakers_aanwezig, licht_aanwezig, micro_aanwezig, dj_booth_aanwezig,
           uplights_aanwezig, speakers_buiten, zaal_fotos
    FROM bookings
    WHERE locatie_naam IS NOT NULL AND locatie_naam != '' AND venue_id IS NULL
    GROUP BY locatie_naam
    ORDER BY MAX(created_at) DESC
  `)

  let created = 0
  let linked = 0
  let skipped = 0

  for (const row of rows) {
    // Check of venue al bestaat (case-insensitive)
    const existing = await queryOne<{ id: number }>(
      c.env,
      `SELECT id FROM venues WHERE LOWER(naam) = LOWER(?) LIMIT 1`,
      [row.locatie_naam]
    )

    let venueId: number
    if (existing) {
      venueId = existing.id
      skipped++
    } else {
      // Foto's migreren: zaal_fotos (enkelvoudige key) → fotos (JSON array)
      const fotosJson = row.zaal_fotos ? JSON.stringify([row.zaal_fotos]) : null

      const result = await execute(c.env, `
        INSERT INTO venues (
          naam, adres, contact_naam,
          wifi_code, parkeren_info, gelijkvloers,
          speakers_aanwezig, licht_aanwezig, micro_aanwezig, dj_booth_aanwezig,
          uplights_aanwezig, speakers_buiten, fotos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.locatie_naam,
        row.locatie_adres ?? null,
        row.zaal_contact ?? null,
        row.wifi_code ?? null,
        row.parkeren_info ?? null,
        row.gelijkvloers ?? 1,
        row.speakers_aanwezig ?? 0,
        row.licht_aanwezig ?? 0,
        row.micro_aanwezig ?? 0,
        row.dj_booth_aanwezig ?? 0,
        row.uplights_aanwezig ?? 0,
        row.speakers_buiten ?? 0,
        fotosJson,
      ])
      venueId = result.lastRowId as number
      created++
    }

    // Koppel alle boekingen met deze locatienaam
    const updateResult = await execute(c.env,
      `UPDATE bookings SET venue_id = ? WHERE LOWER(locatie_naam) = LOWER(?) AND venue_id IS NULL`,
      [venueId, row.locatie_naam]
    )
    linked += (updateResult.changes ?? 0)
  }

  return c.json({ success: true, created, linked, skipped })
})

// ── PATCH /api/venues/:id — bijwerken ─────────────────────────────────────

venuesRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const bool = (v: unknown) => (v ? 1 : 0)
  const fields: string[] = []
  const values: unknown[] = []

  if (body.naam !== undefined) { fields.push('naam = ?'); values.push(body.naam?.trim() || null) }
  if (body.adres !== undefined) { fields.push('adres = ?'); values.push(body.adres ?? null) }
  if (body.capaciteit !== undefined) { fields.push('capaciteit = ?'); values.push(body.capaciteit ?? null) }
  if (body.contact_naam !== undefined) { fields.push('contact_naam = ?'); values.push(body.contact_naam ?? null) }
  if (body.contact_telefoon !== undefined) { fields.push('contact_telefoon = ?'); values.push(body.contact_telefoon ?? null) }
  if (body.website !== undefined) { fields.push('website = ?'); values.push(body.website ?? null) }
  if (body.geluidsbeperking !== undefined) { fields.push('geluidsbeperking = ?'); values.push(bool(body.geluidsbeperking)) }
  if (body.geluidsbeperking_db !== undefined) { fields.push('geluidsbeperking_db = ?'); values.push(body.geluidsbeperking_db ?? null) }
  if (body.speakers_aanwezig !== undefined) { fields.push('speakers_aanwezig = ?'); values.push(bool(body.speakers_aanwezig)) }
  if (body.licht_aanwezig !== undefined) { fields.push('licht_aanwezig = ?'); values.push(bool(body.licht_aanwezig)) }
  if (body.micro_aanwezig !== undefined) { fields.push('micro_aanwezig = ?'); values.push(bool(body.micro_aanwezig)) }
  if (body.dj_booth_aanwezig !== undefined) { fields.push('dj_booth_aanwezig = ?'); values.push(bool(body.dj_booth_aanwezig)) }
  if (body.uplights_aanwezig !== undefined) { fields.push('uplights_aanwezig = ?'); values.push(bool(body.uplights_aanwezig)) }
  if (body.speakers_buiten !== undefined) { fields.push('speakers_buiten = ?'); values.push(bool(body.speakers_buiten)) }
  if (body.parkeren_info !== undefined) { fields.push('parkeren_info = ?'); values.push(body.parkeren_info ?? null) }
  if (body.gelijkvloers !== undefined) { fields.push('gelijkvloers = ?'); values.push(bool(body.gelijkvloers)) }
  if (body.wifi_code !== undefined) { fields.push('wifi_code = ?'); values.push(body.wifi_code ?? null) }
  if (body.fotos !== undefined) { fields.push('fotos = ?'); values.push(body.fotos ?? null) }
  if (body.notities !== undefined) { fields.push('notities = ?'); values.push(body.notities ?? null) }
  if (body.afstand_km !== undefined) { fields.push('afstand_km = ?'); values.push(body.afstand_km ?? null) }
  if (body.rijtijd_min !== undefined) { fields.push('rijtijd_min = ?'); values.push(body.rijtijd_min ?? null) }

  if (fields.length === 0) return c.json({ error: 'Geen velden om bij te werken' }, 400)

  fields.push("updated_at = datetime('now')")
  values.push(id)

  await execute(c.env, `UPDATE venues SET ${fields.join(', ')} WHERE id = ?`, values)
  return c.json({ success: true })
})

// ── DELETE /api/venues/:id — verwijderen ──────────────────────────────────

venuesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const force = c.req.query('force') === 'true'

  // Check gekoppelde boekingen
  const count = await queryOne<{ cnt: number }>(
    c.env,
    `SELECT COUNT(*) as cnt FROM bookings WHERE venue_id = ?`,
    [id]
  )
  if ((count?.cnt ?? 0) > 0 && !force) {
    return c.json({
      error: `Kan niet verwijderen: ${count?.cnt} boeking(en) gekoppeld aan deze zaal.`,
      booking_count: count?.cnt
    }, 409)
  }

  // Ontkoppel boekingen als force=true
  if (force) {
    await execute(c.env, `UPDATE bookings SET venue_id = NULL WHERE venue_id = ?`, [id])
  }

  await execute(c.env, `DELETE FROM venues WHERE id = ?`, [id])
  return c.json({ success: true })
})
