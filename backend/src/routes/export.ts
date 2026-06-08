import { Hono } from 'hono'
import { query, execute } from '../lib/db'
import { importCloudBookings, readCloudBookings } from '../lib/cloudBookings'
import { extractTemplatesFromBackupBody, importCloudTemplates, readCloudTemplates } from '../lib/cloudTemplates'

type Bindings = {
  DB?: D1Database
  STORAGE?: R2Bucket
}

function extractBookingsFromImportBody(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return null

  const obj = body as Record<string, unknown>

  // Current export format: { bookings: [...] }
  if (Array.isArray(obj.bookings)) return obj.bookings

  // Common older/alternate backup wrappers
  if (Array.isArray(obj.data)) return obj.data
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.records)) return obj.records
  if (Array.isArray(obj.rows)) return obj.rows

  // Nested wrappers: { data: { bookings: [...] } }, { backup: { bookings: [...] } }
  for (const key of ['data', 'backup', 'export', 'payload']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>
      if (Array.isArray(nestedObj.bookings)) return nestedObj.bookings
      if (Array.isArray(nestedObj.items)) return nestedObj.items
      if (Array.isArray(nestedObj.records)) return nestedObj.records
      if (Array.isArray(nestedObj.rows)) return nestedObj.rows
    }
  }

  return null
}

export const exportRoutes = new Hono<{ Bindings: Bindings }>()

// GET /api/export/bookings.json — volledige backup van alle boekingen
exportRoutes.get('/bookings.json', async (c) => {
  if (!c.env.DB) {
    if (c.env.STORAGE) {
      const bookings = await readCloudBookings(c.env)
      const emailTemplates = await readCloudTemplates(c.env)
      const exportData = {
        exported_at: new Date().toISOString(),
        version: 2,
        storage: 'r2',
        count: bookings.length,
        template_count: emailTemplates.length,
        bookings,
        email_templates: emailTemplates,
      }
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="djkwinten-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-cache',
        }
      })
    }
    return c.json({ success: false, error: 'Database niet geconfigureerd. Koppel eerst een D1 database aan deze Worker.' }, 500)
  }

  await execute(c.env, `
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  const bookings = await query(c.env, `SELECT * FROM bookings ORDER BY feest_datum ASC`)
  const emailTemplates = await query(c.env, `SELECT * FROM email_templates ORDER BY id ASC`)
  const exportData = {
    exported_at: new Date().toISOString(),
    version: 2,
    count: bookings.length,
    template_count: emailTemplates.length,
    bookings,
    email_templates: emailTemplates,
  }
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="djkwinten-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-cache',
    }
  })
})

// GET /api/export/bookings.csv — CSV voor Excel/Numbers
exportRoutes.get('/bookings.csv', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database niet geconfigureerd. Koppel eerst een D1 database aan deze Worker.' }, 500)
  }

  const bookings = await query(c.env, `
    SELECT id, feest_datum, type_feest, is_aanvraag,
           naam_organisator, naam_partner1, naam_partner2,
           email, telefoon, locatie_naam, locatie_adres,
           aantal_gasten, thema,
           status_contract, status_voorschot, status_vragenlijst,
           basisprijs, totaalprijs,
           uur_ceremonie, uur_receptie, uur_diner, uur_dansfeest, einduur,
           top_genres, flop_genres, must_play, do_not_play,
           opmerkingen, created_at, updated_at
    FROM bookings ORDER BY feest_datum ASC
  `)

  if (bookings.length === 0) {
    return new Response('Geen boekingen gevonden', { status: 404 })
  }

  const headers = Object.keys(bookings[0] as Record<string, unknown>)

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = [
    headers.join(','),
    ...bookings.map(row =>
      headers.map(h => escape((row as Record<string, unknown>)[h])).join(',')
    )
  ]

  return new Response(rows.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="djkwinten-backup-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-cache',
    }
  })
})

// POST /api/export/import — herstel database vanuit JSON-backup
exportRoutes.post('/import', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Ongeldig JSON-bestand' }, 400)
  }

  const bookingsToImport = extractBookingsFromImportBody(body) || []
  const templatesToImport = extractTemplatesFromBackupBody(body) || []

  if (bookingsToImport.length === 0 && templatesToImport.length === 0) {
    return c.json({
      success: false,
      error: 'Geen boekingen of e-mailtemplates gevonden in het bestand. Ondersteunde velden: "bookings" en "email_templates".',
    }, 400)
  }

  if (!c.env.DB) {
    if (c.env.STORAGE) {
      const bookingResult = bookingsToImport.length ? await importCloudBookings(c.env, bookingsToImport) : { imported: 0, skipped: 0, total: 0, errors: [] as string[] }
      const templateResult = await importCloudTemplates(c.env, templatesToImport)
      return c.json({
        success: true,
        storage: 'r2',
        imported: bookingResult.imported,
        skipped: bookingResult.skipped,
        total: bookingResult.total,
        template_imported: templateResult.imported,
        template_skipped: templateResult.skipped,
        template_total: templateResult.total,
        errors: [...bookingResult.errors, ...templateResult.errors].slice(0, 10),
      })
    }
    return c.json({
      success: false,
      error: 'Database niet geconfigureerd. De import kan niet worden opgeslagen. Koppel eerst een D1 database aan deze Worker.',
    }, 500)
  }

  // Alle geldige kolomnamen (whitelist — voorkomt SQL-injectie via kolomnamen)
  const ALLOWED_COLUMNS = new Set([
    'id', 'access_token', 'slug', 'feest_datum', 'type_feest', 'is_aanvraag',
    'status_contract', 'status_voorschot', 'status_vragenlijst',
    'naam_organisator', 'naam_partner1', 'naam_partner2', 'bedrijfsnaam', 'btw_nr',
    'email', 'telefoon', 'adres_organisator', 'locatie_naam', 'locatie_adres',
    'aantal_gasten', 'thema', 'publiek_leeftijd',
    'parkeren_info', 'gelijkvloers', 'backup_contact_naam', 'backup_contact_telefoon',
    'verzoeknummers',
    'uur_ceremonie', 'uur_receptie', 'uur_receptie_einde', 'uur_receptie2', 'uur_receptie2_einde',
    'uur_diner', 'uur_dessert', 'uur_dansfeest', 'uur_midnightsnack', 'einduur',
    'planning_extra',
    'top_genres', 'top_genres_extra', 'flop_genres', 'flop_genres_extra',
    'must_play', 'do_not_play', 'spotify_link',
    'muziek_receptie', 'muziek_receptie_extra', 'muziek_diner', 'muziek_diner_extra',
    'einde_feest',
    'intrede_zaal_nummer', 'intrede_eretafel_nummer', 'intrede_bridesmaids_nummer',
    'intrede_groomsmen_nummer', 'intrede_koppel_nummer', 'intrede_anders_nummer',
    'intrede_taart_nummer', 'openingsdans_nummer', 'tweede_dans_nummer',
    'boeket_werpen_nummer', 'verjaardag_naam_leeftijd',
    'zaal_contact', 'geluidsbeperking_info', 'wifi_code',
    'speakers_aanwezig', 'licht_aanwezig', 'micro_aanwezig', 'dj_booth_aanwezig',
    'uplights_aanwezig', 'speakers_buiten',
    'ceremonie_set', 'digital_booth', 'retro_booth', 'draadloze_speaker', 'karaoke',
    'toestemming_foto', 'opmerkingen', 'zaal_fotos', 'handtekening_klant',
    'totaalprijs', 'basisprijs', 'extra_prijzen',
    'voorschot_instructies', 'billit_factuur_pdf', 'billit_factuur_naam', 'contract_pdf',
    'created_at', 'updated_at',
  ])

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of bookingsToImport) {
    const booking = raw as Record<string, unknown>

    if (!booking.feest_datum) {
      skipped++
      continue
    }

    // Filter enkel toegestane kolommen
    const cols = Object.keys(booking).filter(k => ALLOWED_COLUMNS.has(k) && k !== 'id')
    if (cols.length === 0) { skipped++; continue }

    const vals = cols.map(k => booking[k] ?? null)
    const placeholders = cols.map(() => '?').join(', ')
    const colList = cols.join(', ')

    try {
      // INSERT OR REPLACE: bij bestaande slug/token wordt de rij vervangen
      await execute(c.env,
        `INSERT OR REPLACE INTO bookings (${colList}) VALUES (${placeholders})`,
        vals
      )
      imported++
    } catch (e: unknown) {
      errors.push(`Boeking ${booking.feest_datum} (${booking.naam_organisator ?? '?'}): ${String(e)}`)
    }
  }

  let templateImported = 0
  let templateSkipped = 0
  if (templatesToImport.length > 0) {
    await execute(c.env, `
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    for (const raw of templatesToImport) {
      if (!raw || typeof raw !== 'object') { templateSkipped++; continue }
      const template = raw as Record<string, unknown>
      if (!template.key || !template.subject || !template.body) { templateSkipped++; continue }
      try {
        await execute(c.env, `
          INSERT INTO email_templates (key, name, subject, body, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET
            name = excluded.name,
            subject = excluded.subject,
            body = excluded.body,
            updated_at = datetime('now')
        `, [template.key, template.name || template.key, template.subject, template.body])
        templateImported++
      } catch (e: unknown) {
        templateSkipped++
        errors.push(`Template ${template.key ?? '?'}: ${String(e)}`)
      }
    }
  }

  return c.json({
    success: true,
    imported,
    skipped,
    errors: errors.slice(0, 10), // max 10 foutmeldingen teruggeven
    total: bookingsToImport.length,
    template_imported: templateImported,
    template_skipped: templateSkipped,
    template_total: templatesToImport.length,
  })
})
