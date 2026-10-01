import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import app from '../src/index'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

class MockStatement {
  constructor(
    private database: Database.Database,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new MockStatement(this.database, this.sql, params)
  }

  async run() {
    const info = this.database.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }
  }

  async all<T>() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.params) as T[], meta: {} }
  }

  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.params) as T | undefined) || null
  }
}

class MockD1Database {
  constructor(private database: Database.Database) {}

  prepare(sql: string) {
    return new MockStatement(this.database, sql)
  }
}

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
sqlite.prepare(`
  INSERT INTO bookings (
    access_token, slug, feest_datum, type_feest, naam_organisator,
    email, telefoon, is_aanvraag, status_vragenlijst
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'synthetic-questionnaire-token',
  'synthetic-questionnaire',
  '2033-05-14',
  'Trouw',
  'Synthetische klant',
  'synthetic@example.invalid',
  '0000000000',
  0,
  0,
)

const env = { DB: new MockD1Database(sqlite) as unknown as D1Database, ENVIRONMENT: 'test' }
const submitted = {
  werk_partner1: 'synthetisch beroep 1',
  werk_partner2: 'synthetisch beroep 2',
  hobbys_interesses: 'synthetische hobby',
  leeftijd_partner1: 34,
  leeftijd_partner2: 35,
  extra_koppel_info: 'synthetische extra informatie',
  anderstalige_gasten: 'Ja',
  anderstalige_talen: 'synthetische taal',
  opmerkingen: 'synthetische opmerking',
}

const saveResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-questionnaire-token/questionnaire', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(submitted),
}), env)
if (!saveResponse.ok) throw new Error(`Vragenlijst opslaan mislukte: ${await saveResponse.text()}`)
const saveResult = await saveResponse.json() as { success?: boolean }
assert(saveResult.success === true, 'Server bevestigde de opslag niet')

const readResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-questionnaire-token'), env)
if (!readResponse.ok) throw new Error(`Vragenlijst herlezen mislukte: ${await readResponse.text()}`)
const { booking } = await readResponse.json() as { booking: Record<string, unknown> }
for (const [field, expected] of Object.entries(submitted)) {
  assert(String(booking[field] ?? '') === String(expected), `${field} bleef niet bewaard na herlezen`)
}
assert(Number(booking.status_vragenlijst) === 1, 'Vragenlijststatus werd niet als ingediend bewaard')
assert(Boolean(booking.vragenlijst_first_submitted_at), 'Eerste indieningstijdstip ontbreekt')

const missingResponse = await app.fetch(new Request('https://crm.test/api/bookings/bestaat-niet/questionnaire', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ werk_partner1: 'mag nergens worden opgeslagen' }),
}), env)
assert(missingResponse.status === 404, 'Een onbekende boeking werd ten onrechte als opgeslagen gemeld')
const missingResult = await missingResponse.json() as { success?: boolean }
assert(missingResult.success === false, 'Een onbekende boeking gaf vals succes')

console.log(JSON.stringify({
  success: true,
  persistedFields: Object.keys(submitted).length,
  statusPersisted: true,
  missingBookingRejected: true,
}))
