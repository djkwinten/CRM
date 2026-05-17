import { Hono } from 'hono'
import { query, queryOne, execute } from '../lib/db'
import { sendContractInfoNotification, sendUpdateNotification, SmtpConfig } from '../lib/mailer'
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

const bookingListColumns: Record<string, string> = {
  id: '0',
  feest_datum: "''",
  type_feest: "'Algemeen'",
  status_contract: '0',
  status_voorschot: '0',
  status_vragenlijst: '0',
  naam_organisator: "''",
  naam_partner1: 'NULL',
  naam_partner2: 'NULL',
  email: "''",
  telefoon: "''",
  locatie_naam: 'NULL',
  aantal_gasten: 'NULL',
  thema: 'NULL',
  einduur: 'NULL',
  slug: 'NULL',
  access_token: 'NULL',
  portal_title: 'NULL',
  contract_info_unlocked: '0',
  is_aanvraag: '0',
  is_afgewezen: '0',
  afgewezen_reden: 'NULL',
  created_at: 'NULL',
  vragenlijst_updated_at: 'NULL',
  vragenlijst_first_submitted_at: 'NULL',
  aanvraag_reminder_sent_at: 'NULL',
  review_sent_at: 'NULL',
  feest_herinnering_sent_at: 'NULL',
  vragenlijst_diff: 'NULL',
}

async function bookingColumnSet(env: Bindings) {
  const rows = await query<{ name: string }>(env, 'PRAGMA table_info(bookings)')
  return new Set(rows.map(r => r.name))
}

async function bookingListSelectSql(env: Bindings) {
  const existing = await bookingColumnSet(env)
  const fields = Object.entries(bookingListColumns).map(([name, fallback]) =>
    existing.has(name) ? name : `${fallback} AS ${name}`
  )
  const orderBy = existing.has('feest_datum') ? 'ORDER BY feest_datum ASC' : 'ORDER BY id ASC'
  return `SELECT ${fields.join(', ')} FROM bookings ${orderBy}`
}

const bookingDetailColumns: Record<string, string> = {
  ...bookingListColumns,
  bedrijfsnaam: 'NULL',
  btw_nr: 'NULL',
  adres_organisator: 'NULL',
  locatie_adres: 'NULL',
  publiek_leeftijd: 'NULL',
  parkeren_info: 'NULL',
  gelijkvloers: '1',
  backup_contact_naam: 'NULL',
  backup_contact_telefoon: 'NULL',
  verzoeknummers: "'Ja'",
  uur_ceremonie: 'NULL',
  uur_receptie: 'NULL',
  uur_receptie_einde: 'NULL',
  uur_receptie2: 'NULL',
  uur_receptie2_einde: 'NULL',
  uur_diner: 'NULL',
  uur_dessert: 'NULL',
  uur_dansfeest: 'NULL',
  uur_midnightsnack: 'NULL',
  planning_extra: 'NULL',
  einde_feest: 'NULL',
  top_genres: 'NULL',
  top_genres_extra: 'NULL',
  flop_genres: 'NULL',
  flop_genres_extra: 'NULL',
  must_play: 'NULL',
  do_not_play: 'NULL',
  spotify_link: 'NULL',
  muziek_receptie: 'NULL',
  muziek_receptie_extra: 'NULL',
  muziek_diner: 'NULL',
  muziek_diner_extra: 'NULL',
  intrede_zaal_nummer: 'NULL',
  intrede_eretafel_nummer: 'NULL',
  intrede_bridesmaids_nummer: 'NULL',
  intrede_groomsmen_nummer: 'NULL',
  intrede_koppel_nummer: 'NULL',
  intrede_anders_nummer: 'NULL',
  intrede_taart_nummer: 'NULL',
  openingsdans_nummer: 'NULL',
  tweede_dans_nummer: 'NULL',
  boeket_werpen_nummer: 'NULL',
  verjaardag_naam_leeftijd: 'NULL',
  zaal_contact: 'NULL',
  leveranciers_info: 'NULL',
  geluidsbeperking_info: 'NULL',
  wifi_code: 'NULL',
  speakers_aanwezig: '0',
  licht_aanwezig: '0',
  micro_aanwezig: '0',
  dj_booth_aanwezig: '0',
  uplights_aanwezig: '0',
  speakers_buiten: '0',
  ceremonie_set: '0',
  digital_booth: '0',
  retro_booth: '0',
  draadloze_speaker: '0',
  karaoke: '0',
  toestemming_foto: 'NULL',
  opmerkingen: 'NULL',
  zaal_fotos: 'NULL',
  uitnodiging_files: 'NULL',
  handtekening_klant: 'NULL',
  totaalprijs: '0',
  basisprijs: '0',
  extra_prijzen: 'NULL',
  voorschot_instructies: 'NULL',
  billit_factuur_naam: 'NULL',
  venue_id: 'NULL',
  feedback_vragenlijst: 'NULL',
  feedback_herkomst: 'NULL',
  updated_at: 'NULL',
}

async function bookingDetailSelectFields(env: Bindings) {
  const existing = await bookingColumnSet(env)
  const fields = Object.entries(bookingDetailColumns).map(([name, fallback]) =>
    existing.has(name) ? name : `${fallback} AS ${name}`
  )
  fields.push(existing.has('contract_pdf')
    ? `CASE WHEN contract_pdf IS NOT NULL AND contract_pdf != '' THEN 1 ELSE 0 END as has_contract_pdf`
    : `0 as has_contract_pdf`)
  fields.push(existing.has('billit_factuur_pdf')
    ? `CASE WHEN billit_factuur_pdf IS NOT NULL AND billit_factuur_pdf != '' THEN 1 ELSE 0 END as has_billit_factuur_pdf`
    : `0 as has_billit_factuur_pdf`)
  return { fields, existing }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
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
      contact_email TEXT,
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
    `ALTER TABLE venues ADD COLUMN contact_email TEXT`,
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
      leveranciers_info TEXT,
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
      // Laat DJ tijdelijk Contract Info opnieuw openzetten ondanks bestaand contract/PDF
      `ALTER TABLE bookings ADD COLUMN contract_info_unlocked INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE bookings ADD COLUMN leveranciers_info TEXT`,
    ]
    for (const m of migrations) {
      try { await execute(c.env, m) } catch { /* column already exists */ }
    }
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
        contract_info_notified_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `)
    try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN klant_adres TEXT`) } catch { /* already exists */ }
    try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN contract_info_notified_at TEXT`) } catch { /* already exists */ }

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
    const sql = await bookingListSelectSql(c.env)
    const bookings = await query(c.env, sql)
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
      aantal_gasten INTEGER,
      uur_dansfeest TEXT,
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
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN aantal_gasten INTEGER`) } catch { /* already exists */ }
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN uur_dansfeest TEXT`) } catch { /* already exists */ }
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN contract_info_notified_at TEXT`) } catch { /* already exists */ }

  const existing = await queryOne<Record<string, unknown>>(c.env, `SELECT * FROM booking_contract_info WHERE booking_id = ?`, [id])
  if (existing) {
    const bookingFinancial = await queryOne<Record<string, unknown>>(c.env, `
      SELECT basisprijs, extra_prijzen, ceremonie_set, digital_booth, retro_booth, draadloze_speaker, karaoke
      FROM bookings WHERE id = ?
    `, [id])
    return c.json({ contract_info: { ...(bookingFinancial || {}), ...existing } })
  }

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
    aantal_gasten: number | null
    uur_dansfeest: string | null
    totaalprijs: number | null
    basisprijs: number | null
    extra_prijzen: string | null
    ceremonie_set: number | null
    digital_booth: number | null
    retro_booth: number | null
    draadloze_speaker: number | null
    karaoke: number | null
  }>(c.env, `
    SELECT id, naam_organisator, naam_partner1, naam_partner2, email, telefoon, adres_organisator,
           type_feest, feest_datum, locatie_naam, locatie_adres,
           speakers_aanwezig, licht_aanwezig, dj_booth_aanwezig, aantal_gasten, uur_dansfeest, totaalprijs, basisprijs, extra_prijzen,
           ceremonie_set, digital_booth, retro_booth, draadloze_speaker, karaoke
    FROM bookings WHERE id = ?
  `, [id])
  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)

  const naam = (b.naam_partner1 || b.naam_partner2)
    ? [b.naam_partner1, b.naam_partner2].filter(Boolean).join(' & ')
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
      aantal_gasten: b.aantal_gasten || null,
      uur_dansfeest: b.uur_dansfeest || '',
      geluid_voorzien: b.speakers_aanwezig ? 1 : 0,
      licht_voorzien: b.licht_aanwezig ? 1 : 0,
      dj_booth_nodig: b.dj_booth_aanwezig ? 1 : 0,
      afgesproken_prijs: b.totaalprijs || b.basisprijs || null,
      voorschot_bedrag: null,
      basisprijs: b.basisprijs || null,
      extra_prijzen: b.extra_prijzen || '{}',
      ceremonie_set: b.ceremonie_set ? 1 : 0,
      digital_booth: b.digital_booth ? 1 : 0,
      retro_booth: b.retro_booth ? 1 : 0,
      draadloze_speaker: b.draadloze_speaker ? 1 : 0,
      karaoke: b.karaoke ? 1 : 0,
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
      aantal_gasten INTEGER,
      uur_dansfeest TEXT,
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
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN aantal_gasten INTEGER`) } catch { /* already exists */ }
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN uur_dansfeest TEXT`) } catch { /* already exists */ }
  try { await execute(c.env, `ALTER TABLE booking_contract_info ADD COLUMN contract_info_notified_at TEXT`) } catch { /* already exists */ }

  const existingBeforeSave = await queryOne<{ contract_info_notified_at?: string | null }>(
    c.env,
    `SELECT contract_info_notified_at FROM booking_contract_info WHERE booking_id = ?`,
    [id]
  )

  await execute(c.env, `
    INSERT INTO booking_contract_info (
      booking_id, naam, email, gsm, klant_adres, event_type, event_datum, locatie_naam, locatie_adres,
      aantal_gasten, uur_dansfeest, geluid_voorzien, licht_voorzien, dj_booth_nodig, afgesproken_prijs, voorschot_bedrag,
      contract_ready, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(booking_id) DO UPDATE SET
      naam = excluded.naam,
      email = excluded.email,
      gsm = excluded.gsm,
      klant_adres = excluded.klant_adres,
      event_type = excluded.event_type,
      event_datum = excluded.event_datum,
      locatie_naam = excluded.locatie_naam,
      locatie_adres = excluded.locatie_adres,
      aantal_gasten = excluded.aantal_gasten,
      uur_dansfeest = excluded.uur_dansfeest,
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
    body.aantal_gasten === '' || body.aantal_gasten == null ? null : Number(body.aantal_gasten),
    body.uur_dansfeest ?? null,
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
  addText('uur_dansfeest', body.uur_dansfeest)
  if (body.aantal_gasten !== undefined) { syncFields.push('aantal_gasten = ?'); syncValues.push(body.aantal_gasten === '' || body.aantal_gasten == null ? null : Number(body.aantal_gasten)) }
  if (body.geluid_voorzien !== undefined) { syncFields.push('speakers_aanwezig = ?'); syncValues.push(bool(body.geluid_voorzien)) }
  if (body.licht_voorzien !== undefined) { syncFields.push('licht_aanwezig = ?'); syncValues.push(bool(body.licht_voorzien)) }
  if (body.dj_booth_nodig !== undefined) { syncFields.push('dj_booth_aanwezig = ?'); syncValues.push(bool(body.dj_booth_nodig)) }
  if (body.ceremonie_set !== undefined) { syncFields.push('ceremonie_set = ?'); syncValues.push(bool(body.ceremonie_set)) }
  if (body.digital_booth !== undefined) { syncFields.push('digital_booth = ?'); syncValues.push(bool(body.digital_booth)) }
  if (body.retro_booth !== undefined) { syncFields.push('retro_booth = ?'); syncValues.push(bool(body.retro_booth)) }
  if (body.draadloze_speaker !== undefined) { syncFields.push('draadloze_speaker = ?'); syncValues.push(bool(body.draadloze_speaker)) }
  if (body.karaoke !== undefined) { syncFields.push('karaoke = ?'); syncValues.push(bool(body.karaoke)) }
  if (body.basisprijs !== undefined) { syncFields.push('basisprijs = ?'); syncValues.push(body.basisprijs === '' || body.basisprijs == null ? null : Number(body.basisprijs)) }
  if (body.extra_prijzen !== undefined) { syncFields.push('extra_prijzen = ?'); syncValues.push(body.extra_prijzen || '{}') }
  if (syncFields.length > 0) {
    syncFields.push("updated_at = datetime('now')")
    syncValues.push(id)
    await execute(c.env, `UPDATE bookings SET ${syncFields.join(', ')} WHERE id = ?`, syncValues)
  }

  // Stuur één automatische mail naar DJ zodra het contractformulier volledig is ingevuld.
  // Belangrijk: ContractInfoForm autosavet na volledige invulling; daarom bewaren we
  // contract_info_notified_at zodat dezelfde boeking niet bij elke latere autosave opnieuw mailt.
  const requiredComplete = !!(
    String(body.naam || '').trim() &&
    String(body.email || '').trim() &&
    String(body.gsm || '').trim() &&
    String(body.klant_adres || '').trim() &&
    String(body.event_type || '').trim() &&
    String(body.event_datum || '').trim() &&
    String(body.locatie_naam || '').trim() &&
    String(body.locatie_adres || '').trim()
  )

  const brevoApiKey = c.env.BREVO_API_KEY || c.env.SMTP_PASS
  const shouldNotifyContractComplete = body._notify_contract_complete === 1 || body._notify_contract_complete === true
  if (shouldNotifyContractComplete && requiredComplete && !existingBeforeSave?.contract_info_notified_at && c.env.SMTP_USER && brevoApiKey) {
    try {
      const cfg: SmtpConfig = {
        host: c.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(c.env.SMTP_PORT || '587'),
        user: c.env.SMTP_USER,
        pass: brevoApiKey,
        from: c.env.SMTP_FROM || c.env.SMTP_USER,
        brevoApiKey,
      }
      const appUrl = (c.env.APP_URL || 'https://crm.dentandtkwinten.workers.dev').replace(/\/$/, '')
      await sendContractInfoNotification(cfg, {
        naam: String(body.naam || 'Klant'),
        email: String(body.email || ''),
        gsm: String(body.gsm || ''),
        eventType: String(body.event_type || ''),
        eventDatum: String(body.event_datum || ''),
        locatieNaam: String(body.locatie_naam || ''),
        locatieAdres: String(body.locatie_adres || ''),
        appUrl,
        bookingUrl: `${appUrl}/boeking/${id}`,
      })
      await execute(c.env, `UPDATE booking_contract_info SET contract_info_notified_at = datetime('now') WHERE booking_id = ?`, [id])
    } catch (e) {
      console.error('Contract Info notificatie e-mail mislukt:', e)
    }
  }

  return c.json({ success: true })
})

// Get single booking — accepts either numeric id OR slug OR access_token
bookingsRoutes.get('/:ref', async (c) => {
  const ref = c.req.param('ref')
  const isNumeric = /^\d+$/.test(ref)
  try {
    const { fields, existing } = await bookingDetailSelectFields(c.env)
    let where = ''
    let params: unknown[] = []
    if (isNumeric) {
      where = 'id = ?'
      params = [ref]
    } else if (existing.has('slug') && existing.has('access_token')) {
      where = 'slug = ? OR access_token = ?'
      params = [ref, ref]
    } else if (existing.has('slug')) {
      where = 'slug = ?'
      params = [ref]
    } else if (existing.has('access_token')) {
      where = 'access_token = ?'
      params = [ref]
    } else {
      return c.json({ error: 'Not found' }, 404)
    }

    // D1/SQLite can reject very wide result sets. Fetch details in smaller
    // chunks and merge them into one object, so old wide CRM databases still open.
    const chunks = chunkArray(fields, 55)
    let booking: Record<string, unknown> | null = null
    for (const chunk of chunks) {
      const row = await queryOne<Record<string, unknown>>(c.env, `SELECT ${chunk.join(', ')} FROM bookings WHERE ${where}`, params)
      if (!row) return c.json({ error: 'Not found' }, 404)
      booking = { ...(booking || {}), ...row }
    }
    return c.json({ booking })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Database query failed' }, 500)
  }
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
    INSERT INTO bookings (feest_datum, type_feest, naam_organisator, naam_partner1, naam_partner2, email, telefoon, adres_organisator, btw_nr, access_token, slug, basisprijs, verjaardag_naam_leeftijd, is_aanvraag, locatie_naam, locatie_adres, speakers_aanwezig, licht_aanwezig, dj_booth_aanwezig, opmerkingen, venue_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [datum, type, naam, body.naam_partner1 ?? null, body.naam_partner2 ?? null, body.email || '', body.telefoon || '', body.adres_organisator ?? null, body.btw_nr ?? null, token, finalSlug, body.basisprijs ?? null, body.verjaardag_naam_leeftijd ?? null, isAanvraag, body.locatie_naam ?? null, body.locatie_adres ?? null, body.speakers_aanwezig ? 1 : 0, body.licht_aanwezig ? 1 : 0, body.dj_booth_aanwezig ? 1 : 0, body.opmerkingen ?? null, venueId])
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
// Ensure columns used by questionnaire submissions exist, even when /init was not run after a deploy.
async function ensureQuestionnaireColumns(env: Bindings) {
  const migrations = [
    `ALTER TABLE bookings ADD COLUMN zaal_fotos TEXT`,
    `ALTER TABLE bookings ADD COLUMN uitnodiging_files TEXT`,
    `ALTER TABLE bookings ADD COLUMN toestemming_foto INTEGER DEFAULT NULL`,
    `ALTER TABLE bookings ADD COLUMN handtekening_klant TEXT`,
    `ALTER TABLE bookings ADD COLUMN vragenlijst_updated_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN vragenlijst_first_submitted_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN vragenlijst_diff TEXT`,
    `ALTER TABLE bookings ADD COLUMN feedback_vragenlijst TEXT`,
    `ALTER TABLE bookings ADD COLUMN feedback_herkomst TEXT`,
    `ALTER TABLE bookings ADD COLUMN contract_info_unlocked INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE bookings ADD COLUMN leveranciers_info TEXT`,
  ]
  for (const m of migrations) {
    try { await execute(env, m) } catch { /* column already exists */ }
  }
}

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
  if (body.contract_info_unlocked !== undefined) { fields.push('contract_info_unlocked = ?'); values.push(body.contract_info_unlocked ? 1 : 0) }
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
  await ensureQuestionnaireColumns(c.env)
  const questionnaireColumns = await bookingColumnSet(c.env)
  const hasLeveranciersInfo = questionnaireColumns.has('leveranciers_info')

  const hasBodyField = (field: string) => Object.prototype.hasOwnProperty.call(body, field)
  const boolField = (v: unknown) => (v ? 1 : 0)
  const optionalBool = (field: string) => hasBodyField(field) ? boolField(body[field]) : null
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
    'zaal_contact', ...(hasLeveranciersInfo ? ['leveranciers_info'] : []), 'geluidsbeperking_info','wifi_code',
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
      naam_organisator = COALESCE(?, naam_organisator), naam_partner1 = COALESCE(?, naam_partner1), naam_partner2 = COALESCE(?, naam_partner2), bedrijfsnaam = COALESCE(?, bedrijfsnaam), btw_nr = COALESCE(?, btw_nr), email = COALESCE(?, email), telefoon = COALESCE(?, telefoon),
      adres_organisator = COALESCE(?, adres_organisator),
      locatie_naam = COALESCE(?, locatie_naam), locatie_adres = COALESCE(?, locatie_adres), aantal_gasten = COALESCE(?, aantal_gasten), thema = COALESCE(?, thema), publiek_leeftijd = COALESCE(?, publiek_leeftijd),
      parkeren_info = COALESCE(?, parkeren_info), gelijkvloers = COALESCE(?, gelijkvloers),
      backup_contact_naam = COALESCE(?, backup_contact_naam), backup_contact_telefoon = COALESCE(?, backup_contact_telefoon),
      verzoeknummers = COALESCE(?, verzoeknummers),
      uur_ceremonie = COALESCE(?, uur_ceremonie), uur_receptie = COALESCE(?, uur_receptie), uur_receptie_einde = COALESCE(?, uur_receptie_einde),
      uur_receptie2 = COALESCE(?, uur_receptie2), uur_receptie2_einde = COALESCE(?, uur_receptie2_einde),
      uur_diner = COALESCE(?, uur_diner), uur_dessert = COALESCE(?, uur_dessert),
      uur_dansfeest = COALESCE(?, uur_dansfeest), uur_midnightsnack = COALESCE(?, uur_midnightsnack), einduur = COALESCE(?, einduur),
      top_genres = COALESCE(?, top_genres), flop_genres = COALESCE(?, flop_genres), must_play = COALESCE(?, must_play), do_not_play = COALESCE(?, do_not_play),
      spotify_link = COALESCE(?, spotify_link), muziek_receptie = COALESCE(?, muziek_receptie), muziek_receptie_extra = COALESCE(?, muziek_receptie_extra), muziek_diner = COALESCE(?, muziek_diner), muziek_diner_extra = COALESCE(?, muziek_diner_extra),
      top_genres_extra = COALESCE(?, top_genres_extra), flop_genres_extra = COALESCE(?, flop_genres_extra),
      intrede_zaal_nummer = COALESCE(?, intrede_zaal_nummer),
      intrede_eretafel_nummer = COALESCE(?, intrede_eretafel_nummer), intrede_bridesmaids_nummer = COALESCE(?, intrede_bridesmaids_nummer),
      intrede_groomsmen_nummer = COALESCE(?, intrede_groomsmen_nummer), intrede_koppel_nummer = COALESCE(?, intrede_koppel_nummer),
      intrede_anders_nummer = COALESCE(?, intrede_anders_nummer), intrede_taart_nummer = COALESCE(?, intrede_taart_nummer),
      openingsdans_nummer = COALESCE(?, openingsdans_nummer), tweede_dans_nummer = COALESCE(?, tweede_dans_nummer),
      boeket_werpen_nummer = COALESCE(?, boeket_werpen_nummer), verjaardag_naam_leeftijd = COALESCE(?, verjaardag_naam_leeftijd),
      planning_extra = COALESCE(?, planning_extra),
      einde_feest = COALESCE(?, einde_feest),
      zaal_contact = COALESCE(?, zaal_contact), ${hasLeveranciersInfo ? 'leveranciers_info = COALESCE(?, leveranciers_info),' : ''} geluidsbeperking_info = COALESCE(?, geluidsbeperking_info), wifi_code = COALESCE(?, wifi_code),
      speakers_aanwezig = COALESCE(?, speakers_aanwezig), licht_aanwezig = COALESCE(?, licht_aanwezig), micro_aanwezig = COALESCE(?, micro_aanwezig),
      dj_booth_aanwezig = COALESCE(?, dj_booth_aanwezig), uplights_aanwezig = COALESCE(?, uplights_aanwezig), speakers_buiten = COALESCE(?, speakers_buiten),
      ceremonie_set = COALESCE(?, ceremonie_set), digital_booth = COALESCE(?, digital_booth), retro_booth = COALESCE(?, retro_booth),
      draadloze_speaker = COALESCE(?, draadloze_speaker), karaoke = COALESCE(?, karaoke),
      toestemming_foto = COALESCE(?, toestemming_foto),
      opmerkingen = COALESCE(?, opmerkingen),
      zaal_fotos = COALESCE(?, zaal_fotos),
      handtekening_klant = COALESCE(?, handtekening_klant),
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
    body.parkeren_info ?? null, hasBodyField('gelijkvloers') ? boolField(body.gelijkvloers) : null,
    body.backup_contact_naam ?? null, body.backup_contact_telefoon ?? null,
    hasBodyField('verzoeknummers') ? (body.verzoeknummers ?? 'Ja') : null,
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
    body.zaal_contact ?? null, ...(hasLeveranciersInfo ? [body.leveranciers_info ?? null] : []), body.geluidsbeperking_info ?? null, body.wifi_code ?? null,
    optionalBool('speakers_aanwezig'), optionalBool('licht_aanwezig'), optionalBool('micro_aanwezig'),
    optionalBool('dj_booth_aanwezig'), optionalBool('uplights_aanwezig'), optionalBool('speakers_buiten'),
    optionalBool('ceremonie_set'), optionalBool('digital_booth'), optionalBool('retro_booth'),
    optionalBool('draadloze_speaker'), optionalBool('karaoke'),
    hasBodyField('toestemming_foto') && body.toestemming_foto != null ? Number(body.toestemming_foto) : null,
    body.opmerkingen ?? null,
    body.zaal_fotos ?? null,
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
      verzoeknummers: hasBodyField('verzoeknummers') ? (body.verzoeknummers ?? 'Ja') : null,
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
      zaal_contact: body.zaal_contact ?? null, ...(hasLeveranciersInfo ? { leveranciers_info: body.leveranciers_info ?? null } : {}), geluidsbeperking_info: body.geluidsbeperking_info ?? null, wifi_code: body.wifi_code ?? null,
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
  try { await execute(c.env, `ALTER TABLE bookings ADD COLUMN contract_info_unlocked INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
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
  if (body.contract_info_unlocked !== undefined) { fields.push('contract_info_unlocked = ?'); values.push(body.contract_info_unlocked ? 1 : 0) }
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
  // Ruim gekoppelde records eerst op, zodat oude D1 databases met FK constraints niet falen.
  try { await execute(c.env, 'DELETE FROM booking_files WHERE booking_id = ?', [id]) } catch { /* table may not exist */ }
  try { await execute(c.env, 'DELETE FROM booking_contract_info WHERE booking_id = ?', [id]) } catch { /* table may not exist */ }
  await execute(c.env, 'DELETE FROM bookings WHERE id = ?', [id])
  return c.json({ success: true })
})
