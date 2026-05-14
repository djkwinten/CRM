import { Hono } from 'hono'
import { query, queryOne, execute } from '../lib/db'
import { sendUpdateNotification, SmtpConfig } from '../lib/mailer'
import { randomBytes } from 'crypto'

// ── Slug helpers ──────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(16).toString('hex') // 32-char hex, unguessable
}

function slugify(naam: string, datum: string, type: string): string {
  const prefix = type === 'Trouw' ? 'trouw' : 'feest'
  const namePart = naam
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/).slice(0, 3).join('-')
  const yearPart = datum ? datum.slice(0, 4) : new Date().getFullYear().toString()
  return `${prefix}-${namePart}-${yearPart}`
}

async function uniqueSlug(env: unknown, base: string): Promise<string> {
  let slug = base
  let attempt = 0
  while (true) {
    const existing = await queryOne(env as { DB?: D1Database }, 'SELECT id FROM bookings WHERE slug = ?', [slug])
    if (!existing) return slug
    attempt++
    slug = `${base}-${attempt}`
  }
}

type Bindings = {
  DB?: D1Database
  ENVIRONMENT: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  BREVO_API_KEY?: string
  SMTP_FROM?: string
  APP_URL?: string
}

export const bookingsRoutes = new Hono<{ Bindings: Bindings }>()

const bookingListColumnDefinitions: Record<string, string> = {
  naam_partner1: 'TEXT',
  naam_partner2: 'TEXT',
  slug: 'TEXT',
  access_token: 'TEXT',
  portal_title: 'TEXT',
  is_aanvraag: 'INTEGER DEFAULT 0',
  is_afgewezen: 'INTEGER DEFAULT 0',
  afgewezen_reden: 'TEXT',
  vragenlijst_updated_at: 'TEXT',
  vragenlijst_first_submitted_at: 'TEXT',
  aanvraag_reminder_sent_at: 'TEXT',
  review_sent_at: 'TEXT',
  feest_herinnering_sent_at: 'TEXT',
  vragenlijst_diff: 'TEXT',
}

async function ensureBookingListColumns(env: Bindings) {
  const rows = await query<{ name: string }>(env, 'PRAGMA table_info(bookings)')
  const existing = new Set(rows.map(r => r.name))
  for (const [name, definition] of Object.entries(bookingListColumnDefinitions)) {
    if (!existing.has(name)) {
      await execute(env, `ALTER TABLE bookings ADD COLUMN ${name} ${definition}`)
    }
  }
}

// Initialize tables
bookingsRoutes.post('/init', async (c) => {
  // Venues tabel aanmaken (vóór bookings zodat FK constraint klopt)
  const venuesSql = `
    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      adres TEXT,
      capaciteit INTEGER,
      contact_naam TEXT,
      contact_telefoon TEXT,
      geluidsbeperking INTEGER DEFAULT 0,
      geluidsbeperking_db INTEGER,
      speakers_aanwezig INTEGER DEFAULT 0,
      licht_aanwezig INTEGER DEFAULT 0,
      micro_aanwezig INTEGER DEFAULT 0,
      dj_booth_aanwezig INTEGER DEFAULT 0,
      uplights_aanwezig INTEGER DEFAULT 0,
      speakers_buiten INTEGER DEFAULT 0,
      parkeren_info TEXT,
      gelijkvloers INTEGER DEFAULT 1,
      wifi_code TEXT,
      fotos TEXT,
      notities TEXT,
      afstand_km REAL,
      rijtijd_min INTEGER,
      website TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `
  try { await execute(c.env, venuesSql) } catch { /* already exists */ }
  // Migraties voor bestaande venues tabel
  const venuesMigrations = [
    `ALTER TABLE venues ADD COLUMN afstand_km REAL`,
    `ALTER TABLE venues ADD COLUMN rijtijd_min INTEGER`,
    `ALTER TABLE venues ADD COLUMN website TEXT`,
  ]
  for (const m of venuesMigrations) {
    try { await execute(c.env, m) } catch { /* already exists */ }
  }

  const sql = `
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Toegang
      access_token TEXT UNIQUE,
      slug TEXT UNIQUE,
      -- Beheer
      feest_datum TEXT NOT NULL,
      type_feest TEXT NOT NULL DEFAULT 'Algemeen',
      status_contract INTEGER NOT NULL DEFAULT 0,
      status_voorschot INTEGER NOT NULL DEFAULT 0,
      status_vragenlijst INTEGER NOT NULL DEFAULT 0,
      -- Contact
      naam_organisator TEXT,
      bedrijfsnaam TEXT,
      email TEXT,
      telefoon TEXT,
      locatie_naam TEXT,
      aantal_gasten INTEGER,
      thema TEXT,
      -- Planning
      uur_ceremonie TEXT,
      uur_receptie TEXT,
      uur_diner TEXT,
      uur_dessert TEXT,
      uur_dansfeest TEXT,
      uur_midnightsnack TEXT,
      einduur TEXT,
      -- Muziek
      top_genres TEXT,
      flop_genres TEXT,
      must_play TEXT,
      do_not_play TEXT,
      spotify_link TEXT,
      muziek_diner TEXT,
      intrede_zaal_nummer TEXT,
      intrede_taart_nummer TEXT,
      openingsdans_nummer TEXT,
      tweede_dans_nummer TEXT,
      boeket_werpen_nummer TEXT,
      verjaardag_naam_leeftijd TEXT,
      -- Logistiek
      parkeren_info TEXT,
      gelijkvloers INTEGER DEFAULT 1,
      backup_contact_naam TEXT,
      backup_contact_telefoon TEXT,
      verzoeknummers TEXT DEFAULT 'Ja',
      -- Zaal & Techniek
      zaal_contact TEXT,
      geluidsbeperking_info TEXT,
      wifi_code TEXT,
      speakers_aanwezig INTEGER DEFAULT 0,
      licht_aanwezig INTEGER DEFAULT 0,
      micro_aanwezig INTEGER DEFAULT 0,
      dj_booth_aanwezig INTEGER DEFAULT 0,
      uplights_aanwezig INTEGER DEFAULT 0,
      speakers_buiten INTEGER DEFAULT 0,
      -- Extra's
      ceremonie_set INTEGER DEFAULT 0,
      digital_booth INTEGER DEFAULT 0,
      retro_booth INTEGER DEFAULT 0,
      draadloze_speaker INTEGER DEFAULT 0,
      karaoke INTEGER DEFAULT 0,
      -- Meta
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `
  try {
    await execute(c.env, sql)
    // Migrations: add new columns to existing databases (safe to re-run)
    const migrations = [
      `ALTER TABLE bookings ADD COLUMN parkeren_info TEXT`,
      `ALTER TABLE bookings ADD COLUMN gelijkvloers INTEGER DEFAULT 1`,
      `ALTER TABLE bookings ADD COLUMN backup_contact_naam TEXT`,
      `ALTER TABLE bookings ADD COLUMN backup_contact_telefoon TEXT`,
      `ALTER TABLE bookings ADD COLUMN verzoeknummers TEXT DEFAULT 'Ja'`,
      `ALTER TABLE bookings ADD COLUMN access_token TEXT`,
      `ALTER TABLE bookings ADD COLUMN slug TEXT`,
      `ALTER TABLE bookings ADD COLUMN totaalprijs REAL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN adres_organisator TEXT`,
      `ALTER TABLE bookings ADD COLUMN voorschot_instructies TEXT`,
      `ALTER TABLE bookings ADD COLUMN billit_factuur_pdf TEXT`,
      `ALTER TABLE bookings ADD COLUMN billit_factuur_naam TEXT`,
      `ALTER TABLE bookings ADD COLUMN locatie_adres TEXT`,
      `ALTER TABLE bookings ADD COLUMN opmerkingen TEXT`,
      `ALTER TABLE bookings ADD COLUMN contract_pdf TEXT`,
      `ALTER TABLE bookings ADD COLUMN zaal_fotos TEXT`,
      `ALTER TABLE bookings ADD COLUMN uitnodiging_files TEXT`,
      `ALTER TABLE bookings ADD COLUMN handtekening_klant TEXT`,
      `ALTER TABLE bookings ADD COLUMN basisprijs REAL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN extra_prijzen TEXT`,
      `ALTER TABLE bookings ADD COLUMN naam_partner1 TEXT`,
      `ALTER TABLE bookings ADD COLUMN naam_partner2 TEXT`,
      `ALTER TABLE bookings ADD COLUMN is_aanvraag INTEGER NOT NULL DEFAULT 0`,
      // Nieuwe velden — receptie tijden
      `ALTER TABLE bookings ADD COLUMN uur_receptie_einde TEXT`,
      `ALTER TABLE bookings ADD COLUMN uur_receptie2 TEXT`,
      `ALTER TABLE bookings ADD COLUMN uur_receptie2_einde TEXT`,
      // Muziek extra
      `ALTER TABLE bookings ADD COLUMN muziek_receptie TEXT`,
      `ALTER TABLE bookings ADD COLUMN muziek_receptie_extra TEXT`,
      `ALTER TABLE bookings ADD COLUMN muziek_diner_extra TEXT`,
      // Intredes
      `ALTER TABLE bookings ADD COLUMN intrede_eretafel_nummer TEXT`,
      `ALTER TABLE bookings ADD COLUMN intrede_bridesmaids_nummer TEXT`,
      `ALTER TABLE bookings ADD COLUMN intrede_groomsmen_nummer TEXT`,
      `ALTER TABLE bookings ADD COLUMN intrede_koppel_nummer TEXT`,
      `ALTER TABLE bookings ADD COLUMN intrede_anders_nummer TEXT`,
      // Planning & genres extra
      `ALTER TABLE bookings ADD COLUMN planning_extra TEXT`,
      `ALTER TABLE bookings ADD COLUMN top_genres_extra TEXT`,
      `ALTER TABLE bookings ADD COLUMN flop_genres_extra TEXT`,
      `ALTER TABLE bookings ADD COLUMN einde_feest TEXT`,
      `ALTER TABLE bookings ADD COLUMN publiek_leeftijd TEXT`,
      `ALTER TABLE bookings ADD COLUMN btw_nr TEXT`,
      `ALTER TABLE bookings ADD COLUMN toestemming_foto INTEGER DEFAULT NULL`,
      // Melding: tijdstip waarop klant de vragenlijst (opnieuw) indiende (alleen aanpassingen na eerste invulling)
      `ALTER TABLE bookings ADD COLUMN vragenlijst_updated_at TEXT`,
      // Tijdstip eerste invulling (eenmalig ingesteld, nooit overschreven)
      `ALTER TABLE bookings ADD COLUMN vragenlijst_first_submitted_at TEXT`,
      // Aanvraag herinnering
      `ALTER TABLE bookings ADD COLUMN aanvraag_reminder_sent_at TEXT`,
      // Review mail
      `ALTER TABLE bookings ADD COLUMN review_sent_at TEXT`,
      // Feest nadert herinnering
      `ALTER TABLE bookings ADD COLUMN feest_herinnering_sent_at TEXT`,
      // Vragenlijst diff — JSON met gewijzigde velden (oud → nieuw)
      `ALTER TABLE bookings ADD COLUMN vragenlijst_diff TEXT`,
      // Venue koppeling
      `ALTER TABLE bookings ADD COLUMN venue_id INTEGER`,
      // Klant feedback na vragenlijst
      `ALTER TABLE bookings ADD COLUMN feedback_vragenlijst TEXT`,
      `ALTER TABLE bookings ADD COLUMN feedback_herkomst TEXT`,
      // Afgewezen aanvragen
      `ALTER TABLE bookings ADD COLUMN is_afgewezen INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN afgewezen_reden TEXT`,
      // Klantportaal
      `ALTER TABLE bookings ADD COLUMN portal_title TEXT`,
    ]
    for (const m of migrations) {
      try { await execute(c.env, m) } catch { /* column already exists */ }
    }
    await ensureBookingListColumns(c.env)
    // Contract Info tabel — korte, aparte input voor contract/PDF/factuur flows
    await execute(c.env, `
      CREATE TABLE IF NOT EXISTS booking_contract_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL UNIQUE,
        naam TEXT,
        email TEXT,
        gsm TEXT,
        klant_adres TEXT,
        event_type TEXT,
        event_datum TEXT,
        locatie_naam TEXT,
        locatie_adres TEXT,
        geluid_voorzien INTEGER DEFAULT 0,
        licht_voorzien INTEGER DEFAULT 0,
        dj_booth_nodig INTEGER DEFAULT 0,
        afgesproken_prijs REAL,
        voorschot_bedrag REAL,
        contract_ready INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `)
    try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN klant_adres TEXT`) } catch { /* already exists */ }

    // Backfill access_token + slug for existing rows that don't have them yet
    const missing = await query<{ id: number; naam_organisator: string; feest_datum: string; type_feest: string }>(
      c.env,
      `SELECT id, naam_organisator, feest_datum, type_feest FROM bookings WHERE access_token IS NULL OR access_token = ''`
    )
    for (const row of missing) {
      const token = generateToken()
      const baseSlug = slugify(row.naam_organisator || `boeking-${row.id}`, row.feest_datum, row.type_feest)
      const finalSlug = await uniqueSlug(c.env, baseSlug)
      await execute(c.env, `UPDATE bookings SET access_token = ?, slug = ? WHERE id = ?`, [token, finalSlug, row.id])
    }
    return c.json({ success: true, message: 'Database initialized' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// Get all bookings
bookingsRoutes.get('/', async (c) => {
  try {
    await ensureBookingListColumns(c.env)
    const bookings = await query(c.env, `
      SELECT id, feest_datum, type_feest, status_contract, status_voorschot, status_vragenlijst,
             naam_organisator, naam_partner1, naam_partner2, email, telefoon, locatie_naam,
             aantal_gasten, thema, einduur, slug, access_token, portal_title, is_aanvraag, is_afgewezen, afgewezen_reden, created_at,
             vragenlijst_updated_at, vragenlijst_first_submitted_at, aanvraag_reminder_sent_at, review_sent_at, feest_herinnering_sent_at, vragenlijst_diff
      FROM bookings
      ORDER BY feest_datum ASC
    `)
    return c.json({ bookings })
  } catch (e: any) {
    return c.json({ bookings: [], error: e?.message || 'Database query failed' }, 500)
  }
})


// Contract Info workspace — apart van de uitgebreide vragenlijst
bookingsRoutes.get('/:id/contract-info', async (c) => {
  const id = c.req.param('id')
  await execute(c.env, `
    CREATE TABLE IF NOT EXISTS booking_contract_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      naam TEXT,
      email TEXT,
      gsm TEXT,
      klant_adres TEXT,
      event_type TEXT,
      event_datum TEXT,
      locatie_naam TEXT,
      locatie_adres TEXT,
      geluid_voorzien INTEGER DEFAULT 0,
      licht_voorzien INTEGER DEFAULT 0,
      dj_booth_nodig INTEGER DEFAULT 0,
      afgesproken_prijs REAL,
      voorschot_bedrag REAL,
      contract_ready INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `)
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN klant_adres TEXT`) } catch { /* already exists */ }

  const existing = await queryOne(c.env, `SELECT * FROM booking_contract_info WHERE booking_id = ?`, [id])
  if (existing) return c.json({ contract_info: existing })

  const b = await queryOne<{
    id: number
    naam_organisator: string | null
    naam_partner1: string | null
    naam_partner2: string | null
    email: string | null
    telefoon: string | null
    adres_organisator: string | null
    type_feest: string | null
    feest_datum: string | null
    locatie_naam: string | null
    locatie_adres: string | null
    speakers_aanwezig: number | null
    licht_aanwezig: number | null
    dj_booth_aanwezig: number | null
    totaalprijs: number | null
    basisprijs: number | null
  }>(c.env, `
    SELECT id, naam_organisator, naam_partner1, naam_partner2, email, telefoon, adres_organisator,
           type_feest, feest_datum, locatie_naam, locatie_adres,
           speakers_aanwezig, licht_aanwezig, dj_booth_aanwezig, totaalprijs, basisprijs
    FROM bookings WHERE id = ?
  `, [id])
  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)

  const naam = (b.naam_partner1 && b.naam_partner2)
    ? `${b.naam_partner1.split(' ')[0]} & ${b.naam_partner2.split(' ')[0]}`
    : b.naam_organisator || ''

  return c.json({
    contract_info: {
      booking_id: b.id,
      naam,
      email: b.email || '',
      gsm: b.telefoon || '',
      klant_adres: b.adres_organisator || '',
      event_type: b.type_feest || '',
      event_datum: b.feest_datum || '',
      locatie_naam: b.locatie_naam || '',
      locatie_adres: b.locatie_adres || '',
      geluid_voorzien: b.speakers_aanwezig ? 1 : 0,
      licht_voorzien: b.licht_aanwezig ? 1 : 0,
      dj_booth_nodig: b.dj_booth_aanwezig ? 1 : 0,
      afgesproken_prijs: b.totaalprijs || b.basisprijs || null,
      voorschot_bedrag: null,
      contract_ready: 0,
      notes: ''
    }
  })
})

bookingsRoutes.put('/:id/contract-info', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const bool = (v: unknown) => (v ? 1 : 0)

  await execute(c.env, `
    CREATE TABLE IF NOT EXISTS booking_contract_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      naam TEXT,
      email TEXT,
      gsm TEXT,
      klant_adres TEXT,
      event_type TEXT,
      event_datum TEXT,
      locatie_naam TEXT,
      locatie_adres TEXT,
      geluid_voorzien INTEGER DEFAULT 0,
      licht_voorzien INTEGER DEFAULT 0,
      dj_booth_nodig INTEGER DEFAULT 0,
      afgesproken_prijs REAL,
      voorschot_bedrag REAL,
      contract_ready INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `)
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN klant_adres TEXT`) } catch { /* already exists */ }

  await execute(c.env, `
    INSERT INTO booking_contract_info (
      booking_id, naam, email, gsm, klant_adres, event_type, event_datum, locatie_naam, locatie_adres,
      geluid_voorzien, licht_voorzien, dj_booth_nodig, afgesproken_prijs, voorschot_bedrag,
      contract_ready, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(booking_id) DO UPDATE SET
      naam = excluded.naam,
      email = excluded.email,
      gsm = excluded.gsm,
      klant_adres = excluded.klant_adres,
      event_type = excluded.event_type,
      event_datum = excluded.event_datum,
      locatie_naam = excluded.locatie_naam,
      locatie_adres = excluded.locatie_adres,
      geluid_voorzien = excluded.geluid_voorzien,
      licht_voorzien = excluded.licht_voorzien,
      dj_booth_nodig = excluded.dj_booth_nodig,
      afgesproken_prijs = excluded.afgesproken_prijs,
      voorschot_bedrag = excluded.voorschot_bedrag,
      contract_ready = excluded.contract_ready,
      notes = excluded.notes,
      updated_at = datetime('now')
  `, [
    id,
    body.naam ?? null,
    body.email ?? null,
    body.gsm ?? null,
    body.klant_adres ?? null,
    body.event_type ?? null,
    body.event_datum ?? null,
    body.locatie_naam ?? null,
    body.locatie_adres ?? null,
    bool(body.geluid_voorzien),
    bool(body.licht_voorzien),
    bool(body.dj_booth_nodig),
    body.afgesproken_prijs === '' || body.afgesproken_prijs == null ? null : Number(body.afgesproken_prijs),
    body.voorschot_bedrag === '' || body.voorschot_bedrag == null ? null : Number(body.voorschot_bedrag),
    body.contract_ready ? 1 : 0,
    body.notes ?? null,
  ])

  // Sync veilige basisvelden naar bookings, zodat de bestaande vragenlijst deze info overneemt.
  const syncFields: string[] = []
  const syncValues: unknown[] = []
  const addText = (field: string, value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') {
      syncFields.push(`${field} = ?`)
      syncValues.push(value.trim())
    }
  }
  addText('naam_organisator', body.naam)
  addText('email', body.email)
  addText('telefoon', body.gsm)
  addText('adres_organisator', body.klant_adres)
  addText('type_feest', body.event_type)
  addText('feest_datum', body.event_datum)
  addText('locatie_naam', body.locatie_naam)
  addText('locatie_adres', body.locatie_adres)
  if (body.geluid_voorzien !== undefined) { syncFields.push('speakers_aanwezig = ?'); syncValues.push(bool(body.geluid_voorzien)) }
  if (body.licht_voorzien !== undefined) { syncFields.push('licht_aanwezig = ?'); syncValues.push(bool(body.licht_voorzien)) }
  if (body.dj_booth_nodig !== undefined) { syncFields.push('dj_booth_aanwezig = ?'); syncValues.push(bool(body.dj_booth_nodig)) }
  if (syncFields.length > 0) {
    syncFields.push("updated_at = datetime('now')")
    syncValues.push(id)
    await execute(c.env, `UPDATE bookings SET ${syncFields.join(', ')} WHERE id = ?`, syncValues)
  }

  return c.json({ success: true })
})

// Get single booking — accepts either numeric id OR slug OR access_token
bookingsRoutes.get('/:ref', async (c) => {
  const ref = c.req.param('ref')
  // Try numeric id first, then slug, then access_token
  const isNumeric = /^\d+$/.test(ref)
  // Kolommen zonder grote PDF blobs
  const BOOKING_COLS = `id, access_token, slug, portal_title, feest_datum, type_feest, is_aanvraag,
    status_contract, status_voorschot, status_vragenlijst,
    naam_organisator, naam_partner1, naam_partner2, bedrijfsnaam, btw_nr, email, telefoon,
    adres_organisator, locatie_naam, locatie_adres, aantal_gasten, thema, publiek_leeftijd,
    parkeren_info, gelijkvloers, backup_contact_naam, backup_contact_telefoon, verzoeknummers,
    uur_ceremonie, uur_receptie, uur_receptie_einde, uur_receptie2, uur_receptie2_einde,
    uur_diner, uur_dessert, uur_dansfeest, uur_midnightsnack, einduur, planning_extra, einde_feest,
    top_genres, top_genres_extra, flop_genres, flop_genres_extra,
    must_play, do_not_play, spotify_link,
    muziek_receptie, muziek_receptie_extra, muziek_diner, muziek_diner_extra,
    intrede_zaal_nummer, intrede_eretafel_nummer, intrede_bridesmaids_nummer,
    intrede_groomsmen_nummer, intrede_koppel_nummer, intrede_anders_nummer, intrede_taart_nummer,
    openingsdans_nummer, tweede_dans_nummer, boeket_werpen_nummer, verjaardag_naam_leeftijd,
    zaal_contact, geluidsbeperking_info, wifi_code,
    speakers_aanwezig, licht_aanwezig, micro_aanwezig, dj_booth_aanwezig, uplights_aanwezig, speakers_buiten,
    ceremonie_set, digital_booth, retro_booth, draadloze_speaker, karaoke,
    toestemming_foto, opmerkingen, zaal_fotos, uitnodiging_files, handtekening_klant,
    totaalprijs, basisprijs, extra_prijzen, voorschot_instructies, billit_factuur_naam,
    venue_id, feedback_vragenlijst, feedback_herkomst,
    created_at, updated_at, vragenlijst_updated_at, vragenlijst_first_submitted_at,
    aanvraag_reminder_sent_at, review_sent_at, feest_herinnering_sent_at, vragenlijst_diff,
    CASE WHEN contract_pdf IS NOT NULL AND contract_pdf != '' THEN 1 ELSE 0 END as has_contract_pdf,
    CASE WHEN billit_factuur_pdf IS NOT NULL AND billit_factuur_pdf != '' THEN 1 ELSE 0 END as has_billit_factuur_pdf`

  let booking = null
  if (isNumeric) {
    booking = await queryOne(c.env, `SELECT ${BOOKING_COLS} FROM bookings WHERE id = ?`, [ref])
  } else {
    booking = await queryOne(c.env, `SELECT ${BOOKING_COLS} FROM bookings WHERE slug = ? OR access_token = ?`, [ref, ref])
  }
  if (!booking) return c.json({ error: 'Not found' }, 404)
  return c.json({ booking })
})

// Get PDF on demand (by numeric id, slug or access_token) — returns base64
bookingsRoutes.get('/:ref/pdf/:type', async (c) => {
  const ref = c.req.param('ref')
  const type = c.req.param('type') // 'contract' or 'factuur'
  const col = type === 'contract' ? 'contract_pdf' : 'billit_factuur_pdf'
  const isNumeric = /^\d+$/.test(ref)
  const row = isNumeric
    ? await queryOne(c.env, `SELECT ${col} as pdf FROM bookings WHERE id = ?`, [ref])
    : await queryOne(c.env, `SELECT ${col} as pdf FROM bookings WHERE slug = ? OR access_token = ?`, [ref, ref])
  if (!row || !row.pdf) return c.json({ error: 'Not found' }, 404)
  return c.json({ pdf: row.pdf })
})

// Create booking (DJ side)
bookingsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const naam = body.naam_organisator || ''
  const type = body.type_feest || 'Algemeen'
  const datum = body.feest_datum || ''
  const token = generateToken()
  // For weddings, use partner names for the slug if available
  const p1 = (body.naam_partner1 || '').split(' ')[0]
  const p2 = (body.naam_partner2 || '').split(' ')[0]
  const slugNaam = (type === 'Trouw' && (p1 || p2))
    ? [p1, p2].filter(Boolean).join('-en-')
    : naam || 'boeking'
  const baseSlug = slugify(slugNaam, datum, type)
  const finalSlug = await uniqueSlug(c.env, baseSlug)
  const isAanvraag = body.is_aanvraag ? 1 : 0
  // Auto-resolve venue_id: gebruik meegegeven id of zoek op naam
  let venueId: number | null = body.venue_id ?? null
  if (!venueId && body.locatie_naam) {
    const match = await queryOne<{ id: number }>(c.env,
      `SELECT id FROM venues WHERE LOWER(naam) = LOWER(?) LIMIT 1`, [body.locatie_naam])
    if (match) venueId = match.id
  }
  const result = await execute(c.env, `
    INSERT INTO bookings (feest_datum, type_feest, naam_organisator, naam_partner1, naam_partner2, email, telefoon, adres_organisator, access_token, slug, basisprijs, verjaardag_naam_leeftijd, is_aanvraag, locatie_naam, locatie_adres, speakers_aanwezig, licht_aanwezig, dj_booth_aanwezig, opmerkingen, venue_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [datum, type, naam, body.naam_partner1 ?? null, body.naam_partner2 ?? null, body.email || '', body.telefoon || '', body.adres_organisator ?? null, token, finalSlug, body.basisprijs ?? null, body.verjaardag_naam_leeftijd ?? null, isAanvraag, body.locatie_naam ?? null, body.locatie_adres ?? null, body.speakers_aanwezig ? 1 : 0, body.licht_aanwezig ? 1 : 0, body.dj_booth_aanwezig ? 1 : 0, body.opmerkingen ?? null, venueId])
  return c.json({ success: true, id: result.lastRowId, slug: finalSlug, access_token: token })
})


// Update klantportaal titel
bookingsRoutes.patch('/:id/portal', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  await execute(c.env, `UPDATE bookings SET portal_title = ?, updated_at = datetime('now') WHERE id = ?`, [body.portal_title || null, id])
  return c.json({ success: true })
})

// Update booking status (DJ side - contract/voorschot)
bookingsRoutes.patch('/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const values: unknown[] = []
  if (body.status_contract !== undefined) { fields.push('status_contract = ?'); values.push(body.status_contract ? 1 : 0) }
  if (body.status_voorschot !== undefined) { fields.push('status_voorschot = ?'); values.push(body.status_voorschot ? 1 : 0) }
  if (body.status_vragenlijst !== undefined) { fields.push('status_vragenlijst = ?'); values.push(body.status_vragenlijst ? 1 : 0) }
  if (body.is_aanvraag !== undefined) { fields.push('is_aanvraag = ?'); values.push(body.is_aanvraag ? 1 : 0) }
  if (body.is_afgewezen !== undefined) { fields.push('is_afgewezen = ?'); values.push(body.is_afgewezen ? 1 : 0) }
  if (body.afgewezen_reden !== undefined) { fields.push('afgewezen_reden = ?'); values.push(body.afgewezen_reden || null) }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
  fields.push("updated_at = datetime('now')")
  values.push(id)
  await execute(c.env, `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`, values)
  return c.json({ success: true })
})

// Public: Submit customer questionnaire (accepts numeric id, slug, or access_token)
bookingsRoutes.put('/:ref/questionnaire', async (c) => {
  const ref = c.req.param('ref')
  let body: Record<string, unknown>
  try {
    const raw = await c.req.json() as Record<string, unknown>
    // Vervang '__checked__' sentinel (aangevinkt maar leeg) door null
    body = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === '__checked__' ? null : v])
    )
  } catch (e: unknown) {
    return c.json({ success: false, error: 'Invalid JSON: ' + String(e) }, 400)
  }
  const boolField = (v: unknown) => (v ? 1 : 0)
  const isUpdate = body._is_update === 1

  // Resolve ref → WHERE clause
  const isNumeric = /^\d+$/.test(ref)
  const where = isNumeric ? 'id = ?' : '(slug = ? OR access_token = ?)'
  const whereParams = isNumeric ? [ref] : [ref, ref]

  // Haal huidige waarden op vóór de update zodat we een diff kunnen berekenen
  const diffFields = [
    'naam_organisator','naam_partner1','naam_partner2','email','telefoon','adres_organisator',
    'locatie_naam','locatie_adres','aantal_gasten','thema','publiek_leeftijd','parkeren_info',
    'backup_contact_naam','backup_contact_telefoon','verzoeknummers',
    'uur_ceremonie','uur_receptie','uur_receptie_einde','uur_receptie2','uur_receptie2_einde',
    'uur_diner','uur_dessert','uur_dansfeest','uur_midnightsnack','einduur','planning_extra','einde_feest',
    'top_genres','top_genres_extra','flop_genres','flop_genres_extra','must_play','do_not_play',
    'spotify_link','muziek_receptie','muziek_receptie_extra','muziek_diner','muziek_diner_extra',
    'intrede_zaal_nummer','intrede_eretafel_nummer','intrede_bridesmaids_nummer',
    'intrede_groomsmen_nummer','intrede_koppel_nummer','intrede_anders_nummer','intrede_taart_nummer',
    'openingsdans_nummer','tweede_dans_nummer','boeket_werpen_nummer','verjaardag_naam_leeftijd',
    'zaal_contact','geluidsbeperking_info','wifi_code',
    'speakers_aanwezig','licht_aanwezig','micro_aanwezig','dj_booth_aanwezig','uplights_aanwezig','speakers_buiten',
    'ceremonie_set','digital_booth','retro_booth','draadloze_speaker','karaoke',
    'toestemming_foto','opmerkingen'
  ]
  const oldRow = isUpdate
    ? await queryOne<Record<string, unknown>>(c.env, `SELECT ${diffFields.join(', ')} FROM bookings WHERE ${where}`, whereParams)
    : null

  try {
  await execute(c.env, `
    UPDATE bookings SET
      naam_organisator = ?, naam_partner1 = ?, naam_partner2 = ?, bedrijfsnaam = ?, btw_nr = ?, email = ?, telefoon = ?,
      adres_organisator = ?,
      locatie_naam = ?, locatie_adres = ?, aantal_gasten = ?, thema = ?, publiek_leeftijd = ?,
      parkeren_info = ?, gelijkvloers = ?,
      backup_contact_naam = ?, backup_contact_telefoon = ?,
      verzoeknummers = ?,
      uur_ceremonie = ?, uur_receptie = ?, uur_receptie_einde = ?,
      uur_receptie2 = ?, uur_receptie2_einde = ?,
      uur_diner = ?, uur_dessert = ?,
      uur_dansfeest = ?, uur_midnightsnack = ?, einduur = ?,
      top_genres = ?, flop_genres = ?, must_play = ?, do_not_play = ?,
      spotify_link = ?, muziek_receptie = ?, muziek_receptie_extra = ?, muziek_diner = ?, muziek_diner_extra = ?,
      top_genres_extra = ?, flop_genres_extra = ?,
      intrede_zaal_nummer = ?,
      intrede_eretafel_nummer = ?, intrede_bridesmaids_nummer = ?,
      intrede_groomsmen_nummer = ?, intrede_koppel_nummer = ?,
      intrede_anders_nummer = ?, intrede_taart_nummer = ?,
      openingsdans_nummer = ?, tweede_dans_nummer = ?,
      boeket_werpen_nummer = ?, verjaardag_naam_leeftijd = ?,
      planning_extra = ?,
      einde_feest = ?,
      zaal_contact = ?, geluidsbeperking_info = ?, wifi_code = ?,
      speakers_aanwezig = ?, licht_aanwezig = ?, micro_aanwezig = ?,
      dj_booth_aanwezig = ?, uplights_aanwezig = ?, speakers_buiten = ?,
      ceremonie_set = ?, digital_booth = ?, retro_booth = ?,
      draadloze_speaker = ?, karaoke = ?,
      toestemming_foto = ?,
      opmerkingen = ?,
      zaal_fotos = ?,
      uitnodiging_files = ?,
      handtekening_klant = ?,
      feedback_vragenlijst = COALESCE(?, feedback_vragenlijst),
      feedback_herkomst = COALESCE(?, feedback_herkomst),
      status_vragenlijst = 1,
      vragenlijst_updated_at = CASE WHEN status_vragenlijst = 1 THEN datetime('now') ELSE vragenlijst_updated_at END,
      vragenlijst_first_submitted_at = CASE WHEN vragenlijst_first_submitted_at IS NULL THEN datetime('now') ELSE vragenlijst_first_submitted_at END,
      updated_at = datetime('now')
    WHERE ${where}
  `, [
    body.naam_organisator ?? null, body.naam_partner1 ?? null, body.naam_partner2 ?? null, body.bedrijfsnaam ?? null, body.btw_nr ?? null, body.email ?? null, body.telefoon ?? null,
    body.adres_organisator ?? null,
    body.locatie_naam ?? null, body.locatie_adres ?? null, body.aantal_gasten ?? null, body.thema ?? null, body.publiek_leeftijd ?? null,
    body.parkeren_info ?? null, body.gelijkvloers ? 1 : 0,
    body.backup_contact_naam ?? null, body.backup_contact_telefoon ?? null,
    body.verzoeknummers ?? 'Ja',
    body.uur_ceremonie ?? null, body.uur_receptie ?? null, body.uur_receptie_einde ?? null,
    body.uur_receptie2 ?? null, body.uur_receptie2_einde ?? null,
    body.uur_diner ?? null, body.uur_dessert ?? null,
    body.uur_dansfeest ?? null, body.uur_midnightsnack ?? null, body.einduur ?? null,
    body.top_genres ?? null, body.flop_genres ?? null, body.must_play ?? null, body.do_not_play ?? null,
    body.spotify_link ?? null, body.muziek_receptie ?? null, body.muziek_receptie_extra ?? null, body.muziek_diner ?? null, body.muziek_diner_extra ?? null,
    body.top_genres_extra ?? null, body.flop_genres_extra ?? null,
    body.intrede_zaal_nummer ?? null,
    body.intrede_eretafel_nummer ?? null, body.intrede_bridesmaids_nummer ?? null,
    body.intrede_groomsmen_nummer ?? null, body.intrede_koppel_nummer ?? null,
    body.intrede_anders_nummer ?? null, body.intrede_taart_nummer ?? null,
    body.openingsdans_nummer ?? null, body.tweede_dans_nummer ?? null,
    body.boeket_werpen_nummer ?? null, body.verjaardag_naam_leeftijd ?? null,
    body.planning_extra ?? null,
    body.einde_feest ?? null,
    body.zaal_contact ?? null, body.geluidsbeperking_info ?? null, body.wifi_code ?? null,
    boolField(body.speakers_aanwezig), boolField(body.licht_aanwezig), boolField(body.micro_aanwezig),
    boolField(body.dj_booth_aanwezig), boolField(body.uplights_aanwezig), boolField(body.speakers_buiten),
    boolField(body.ceremonie_set), boolField(body.digital_booth), boolField(body.retro_booth),
    boolField(body.draadloze_speaker), boolField(body.karaoke),
    body.toestemming_foto != null ? Number(body.toestemming_foto) : null,
    body.opmerkingen ?? null,
    body.zaal_fotos ?? null,
    body.uitnodiging_files ?? null,
    body.handtekening_klant ?? null,
    (body as Record<string, unknown>).feedback_vragenlijst as string ?? null,
    (body as Record<string, unknown>).feedback_herkomst as string ?? null,
    ...whereParams
  ])
  } catch (e: unknown) {
    console.error('Questionnaire UPDATE error:', e)
    return c.json({ success: false, error: String(e) }, 500)
  }

  // Bereken en sla diff op (alleen bij updates)
  if (isUpdate && oldRow) {
    const newValues: Record<string, unknown> = {
      naam_organisator: body.naam_organisator ?? null, naam_partner1: body.naam_partner1 ?? null,
      naam_partner2: body.naam_partner2 ?? null, email: body.email ?? null, telefoon: body.telefoon ?? null,
      adres_organisator: body.adres_organisator ?? null,
      locatie_naam: body.locatie_naam ?? null, locatie_adres: body.locatie_adres ?? null,
      aantal_gasten: body.aantal_gasten ?? null, thema: body.thema ?? null, publiek_leeftijd: body.publiek_leeftijd ?? null,
      parkeren_info: body.parkeren_info ?? null,
      backup_contact_naam: body.backup_contact_naam ?? null, backup_contact_telefoon: body.backup_contact_telefoon ?? null,
      verzoeknummers: body.verzoeknummers ?? 'Ja',
      uur_ceremonie: body.uur_ceremonie ?? null, uur_receptie: body.uur_receptie ?? null,
      uur_receptie_einde: body.uur_receptie_einde ?? null, uur_receptie2: body.uur_receptie2 ?? null,
      uur_receptie2_einde: body.uur_receptie2_einde ?? null,
      uur_diner: body.uur_diner ?? null, uur_dessert: body.uur_dessert ?? null,
      uur_dansfeest: body.uur_dansfeest ?? null, uur_midnightsnack: body.uur_midnightsnack ?? null,
      einduur: body.einduur ?? null, planning_extra: body.planning_extra ?? null, einde_feest: body.einde_feest ?? null,
      top_genres: body.top_genres ?? null, top_genres_extra: body.top_genres_extra ?? null,
      flop_genres: body.flop_genres ?? null, flop_genres_extra: body.flop_genres_extra ?? null,
      must_play: body.must_play ?? null, do_not_play: body.do_not_play ?? null,
      spotify_link: body.spotify_link ?? null,
      muziek_receptie: body.muziek_receptie ?? null, muziek_receptie_extra: body.muziek_receptie_extra ?? null,
      muziek_diner: body.muziek_diner ?? null, muziek_diner_extra: body.muziek_diner_extra ?? null,
      intrede_zaal_nummer: body.intrede_zaal_nummer ?? null,
      intrede_eretafel_nummer: body.intrede_eretafel_nummer ?? null,
      intrede_bridesmaids_nummer: body.intrede_bridesmaids_nummer ?? null,
      intrede_groomsmen_nummer: body.intrede_groomsmen_nummer ?? null,
      intrede_koppel_nummer: body.intrede_koppel_nummer ?? null,
      intrede_anders_nummer: body.intrede_anders_nummer ?? null,
      intrede_taart_nummer: body.intrede_taart_nummer ?? null,
      openingsdans_nummer: body.openingsdans_nummer ?? null, tweede_dans_nummer: body.tweede_dans_nummer ?? null,
      boeket_werpen_nummer: body.boeket_werpen_nummer ?? null, verjaardag_naam_leeftijd: body.verjaardag_naam_leeftijd ?? null,
      zaal_contact: body.zaal_contact ?? null, geluidsbeperking_info: body.geluidsbeperking_info ?? null, wifi_code: body.wifi_code ?? null,
      speakers_aanwezig: boolField(body.speakers_aanwezig), licht_aanwezig: boolField(body.licht_aanwezig),
      micro_aanwezig: boolField(body.micro_aanwezig), dj_booth_aanwezig: boolField(body.dj_booth_aanwezig),
      uplights_aanwezig: boolField(body.uplights_aanwezig), speakers_buiten: boolField(body.speakers_buiten),
      ceremonie_set: boolField(body.ceremonie_set), digital_booth: boolField(body.digital_booth),
      retro_booth: boolField(body.retro_booth), draadloze_speaker: boolField(body.draadloze_speaker), karaoke: boolField(body.karaoke),
      toestemming_foto: body.toestemming_foto != null ? Number(body.toestemming_foto) : null,
      opmerkingen: body.opmerkingen ?? null,
    }

    const diff: Record<string, { oud: unknown; nieuw: unknown }> = {}
    for (const field of diffFields) {
      const oldVal = oldRow[field] ?? null
      const newVal = newValues[field] ?? null
      const oldStr = oldVal === null || oldVal === '' ? null : String(oldVal)
      const newStr = newVal === null || newVal === '' ? null : String(newVal)
      if (oldStr !== newStr) {
        diff[field] = { oud: oldStr, nieuw: newStr }
      }
    }

    try {
      await execute(c.env, `UPDATE bookings SET vragenlijst_diff = ? WHERE ${where}`, [JSON.stringify(diff), ...whereParams])
    } catch { /* ignore diff save errors */ }
  }

  // Stuur notificatie naar DJ bij elke indiening (eerste keer én aanpassingen)
  // Haal naam + datum op uit de DB zodat ze altijd correct zijn (body bevat geen feest_datum)
  const brevoApiKey = c.env.BREVO_API_KEY || c.env.SMTP_PASS
  if (c.env.SMTP_USER && brevoApiKey) {
    try {
      const cfg: SmtpConfig = {
        host: c.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(c.env.SMTP_PORT || '587'),
        user: c.env.SMTP_USER,
        pass: brevoApiKey,
        from: c.env.SMTP_FROM || c.env.SMTP_USER
      }
      const appUrl = c.env.APP_URL || 'https://thr-b114faeb-djkwinten-app.nxcode-io.workers.dev'
      const row = await queryOne<{ naam_organisator: string; naam_partner1: string; feest_datum: string }>(
        c.env,
        `SELECT naam_organisator, naam_partner1, feest_datum FROM bookings WHERE ${where}`,
        whereParams
      )
      const naam = String(row?.naam_organisator || row?.naam_partner1 || 'Klant')
      const datum = String(row?.feest_datum || '')
      await sendUpdateNotification(cfg, { naam, datum, appUrl, isUpdate })
    } catch (e) {
      console.error('Vragenlijst notificatie e-mail mislukt:', e)
    }
  }

  return c.json({ success: true })
})

// Update contract info (DJ side — price, factuur PDF, instructies)
bookingsRoutes.patch('/:id/contract', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const values: unknown[] = []
  if (body.totaalprijs !== undefined) { fields.push('totaalprijs = ?'); values.push(body.totaalprijs) }
  if (body.basisprijs !== undefined) { fields.push('basisprijs = ?'); values.push(body.basisprijs) }
  if (body.extra_prijzen !== undefined) { fields.push('extra_prijzen = ?'); values.push(body.extra_prijzen) }
  if (body.adres_organisator !== undefined) { fields.push('adres_organisator = ?'); values.push(body.adres_organisator) }
  if (body.voorschot_instructies !== undefined) { fields.push('voorschot_instructies = ?'); values.push(body.voorschot_instructies) }
  if (body.billit_factuur_pdf !== undefined) { fields.push('billit_factuur_pdf = ?'); values.push(body.billit_factuur_pdf) }
  if (body.billit_factuur_naam !== undefined) { fields.push('billit_factuur_naam = ?'); values.push(body.billit_factuur_naam) }
  if (body.contract_pdf !== undefined) { fields.push('contract_pdf = ?'); values.push(body.contract_pdf) }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
  fields.push("updated_at = datetime('now')")
  values.push(id)
  await execute(c.env, `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`, values)
  return c.json({ success: true })
})

// Update basic booking info (DJ side - names, contact)
bookingsRoutes.patch('/:id/basisinfo', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const fields: string[] = []
  const values: unknown[] = []
  if (body.naam_organisator !== undefined) { fields.push('naam_organisator = ?'); values.push(body.naam_organisator || null) }
  if (body.naam_partner1 !== undefined) { fields.push('naam_partner1 = ?'); values.push(body.naam_partner1 || null) }
  if (body.naam_partner2 !== undefined) { fields.push('naam_partner2 = ?'); values.push(body.naam_partner2 || null) }
  if (body.email !== undefined) { fields.push('email = ?'); values.push(body.email || null) }
  if (body.telefoon !== undefined) { fields.push('telefoon = ?'); values.push(body.telefoon || null) }
  if (body.feest_datum !== undefined) { fields.push('feest_datum = ?'); values.push(body.feest_datum || null) }
  if (body.created_at !== undefined) { fields.push('created_at = ?'); values.push(body.created_at || null) }
  if (body.venue_id !== undefined) { fields.push('venue_id = ?'); values.push(body.venue_id ?? null) }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
  fields.push("updated_at = datetime('now')")
  values.push(id)
  await execute(c.env, `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`, values)
  return c.json({ success: true })
})

// Delete booking
bookingsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await execute(c.env, 'DELETE FROM bookings WHERE id = ?', [id])
  return c.json({ success: true })
})
