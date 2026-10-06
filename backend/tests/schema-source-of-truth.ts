import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const db = new Database(':memory:')

// The canonical schema must be safe for a clean install and safe to reapply.
db.exec(schema)
db.prepare(`INSERT INTO bookings (feest_datum, naam_organisator) VALUES (?, ?)`).run('2030-06-01', 'Bewaar mij')
db.exec(schema)

const expectedTables = [
  'bookings',
  'venues',
  'booking_contract_info',
  'booking_contract_unlocks',
  'booking_files',
  'wedding_meetings',
  'email_templates',
  'internal_todos',
  'gmail_intakes',
  'gmail_sync_state',
]

const tables = new Set(
  (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[])
    .map(row => row.name),
)
for (const table of expectedTables) assert(tables.has(table), `Canonical schema mist tabel ${table}`)

const expectedBookingColumns = [
  'access_token', 'slug', 'venue_id', 'vragenlijst_updated_at',
  'vragenlijst_first_submitted_at', 'vragenlijst_diff', 'feedback_vragenlijst',
  'feedback_herkomst', 'is_afgewezen', 'afgewezen_reden', 'portal_title',
  'aanvraag_reminder_sent_at', 'review_sent_at', 'feest_herinnering_sent_at',
  'vroeger_aanwezig_receptie', 'vroeger_aanwezig_receptie_na_contract',
]
const bookingColumns = new Set(
  (db.prepare(`PRAGMA table_info(bookings)`).all() as { name: string }[]).map(row => row.name),
)
for (const column of expectedBookingColumns) {
  assert(bookingColumns.has(column), `Canonical schema mist bookings.${column}`)
}

const preserved = db.prepare(`SELECT naam_organisator FROM bookings WHERE feest_datum = ?`).get('2030-06-01') as { naam_organisator?: string } | undefined
assert(preserved?.naam_organisator === 'Bewaar mij', 'Herhaald toepassen van het schema wijzigde bestaande data')

console.log(JSON.stringify({ success: true, tables: expectedTables.length, existingDataPreserved: true }))
