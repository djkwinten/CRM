import { Hono } from 'hono'
import { query, execute } from '../lib/db'

type Bindings = {
  DB?: D1Database
}

export const exportRoutes = new Hono<{ Bindings: Bindings }>()

// GET /api/export/bookings.json — volledige backup van alle boekingen
exportRoutes.get('/bookings.json', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database niet geconfigureerd. Koppel eerst een D1 database aan deze Worker.' }, 500)
  }

  const bookings = await query(c.env, `SELECT * FROM bookings ORDER BY feest_datum ASC`)
  const exportData = {
    exported_at: new Date().toISOString(),
    version: 1,
    count: bookings.length,
    bookings,
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
  if (!c.env.DB) {
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

  let body: { bookings?: unknown[]; version?: number }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Ongeldig JSON-bestand' }, 400)
  }

  if (!Array.isArray(body.bookings) || body.bookings.length === 0) {
    return c.json({ success: false, error: 'Geen boekingen gevonden in het bestand' }, 400)
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of body.bookings) {
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

  return c.json({
    success: true,
    imported,
    skipped,
    errors: errors.slice(0, 10), // max 10 foutmeldingen teruggeven
    total: body.bookings.length,
  })
})
