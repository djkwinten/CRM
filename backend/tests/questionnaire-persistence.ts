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
    email, telefoon, is_aanvraag, status_vragenlijst, basisprijs, extra_prijzen
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  850,
  JSON.stringify({ _trouw_formule: 'avondfeest', digital_booth: 200, _km_vergoeding: 10, _korting: 50 }),
)

sqlite.prepare(`
  INSERT INTO bookings (
    access_token, slug, feest_datum, type_feest, naam_organisator,
    email, telefoon, is_aanvraag, status_vragenlijst, basisprijs, extra_prijzen
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'synthetic-unconfirmed-upgrade-token',
  'synthetic-unconfirmed-upgrade',
  '2033-05-15',
  'Trouw',
  'Synthetische onbevestigde klant',
  'synthetic-unconfirmed@example.invalid',
  '0000000000',
  0,
  0,
  850,
  JSON.stringify({ _trouw_formule: 'avondfeest' }),
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
  intrede_zaal_nummer: 'Ja',
  digital_booth: 1,
  totaalprijs: 999999,
}

const saveResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-questionnaire-token/questionnaire', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...submitted, _formula_upgrade_reason: 'intrede_zaal' }),
}), env)
if (!saveResponse.ok) throw new Error(`Vragenlijst opslaan mislukte: ${await saveResponse.text()}`)
const saveResult = await saveResponse.json() as { success?: boolean }
assert(saveResult.success === true, 'Server bevestigde de opslag niet')

const readResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-questionnaire-token'), env)
if (!readResponse.ok) throw new Error(`Vragenlijst herlezen mislukte: ${await readResponse.text()}`)
const { booking } = await readResponse.json() as { booking: Record<string, unknown> }
for (const [field, expected] of Object.entries(submitted).filter(([field]) => field !== 'totaalprijs')) {
  assert(String(booking[field] ?? '') === String(expected), `${field} bleef niet bewaard na herlezen`)
}
assert(Number(booking.basisprijs) === 950, 'De bevestigde zaalintrede verhoogde de basisprijs niet naar €950')
assert(JSON.parse(String(booking.extra_prijzen))._trouw_formule === 'receptie_avondfeest', 'De bevestigde zaalintrede bewaarde niet de juiste formulecode')
assert(Number(booking.totaalprijs) === 1110, 'De server herberekende het totaal niet uit de opgewaardeerde CRM-prijzen')
assert(Number(booking.totaalprijs) !== submitted.totaalprijs, 'Een klant kon zelf de totaalprijs bepalen')
assert(Number(booking.status_vragenlijst) === 1, 'Vragenlijststatus werd niet als ingediend bewaard')
assert(Boolean(booking.vragenlijst_first_submitted_at), 'Eerste indieningstijdstip ontbreekt')

const noDowngradeResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-questionnaire-token/questionnaire', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ intrede_zaal_nummer: 'Nee', _formula_upgrade_reason: 'hall_entrance' }),
}), env)
assert(noDowngradeResponse.ok, 'Tweede vragenlijstopslag mislukte')
const afterNo = sqlite.prepare('SELECT basisprijs, extra_prijzen, totaalprijs FROM bookings WHERE id = 1').get() as Record<string, unknown>
assert(Number(afterNo.basisprijs) === 950, 'Intrede “Nee” verlaagde de formule ten onrechte')
assert(JSON.parse(String(afterNo.extra_prijzen))._trouw_formule === 'receptie_avondfeest', 'Intrede “Nee” wijzigde de formulecode ten onrechte')
assert(Number(afterNo.totaalprijs) === 1110, 'Intrede “Nee” wijzigde het totaal ten onrechte')

const unconfirmedResponse = await app.fetch(new Request('https://crm.test/api/bookings/synthetic-unconfirmed-upgrade-token/questionnaire', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ intrede_zaal_nummer: 'Ja', basisprijs: 950, totaalprijs: 950 }),
}), env)
assert(unconfirmedResponse.ok, 'Opslag zonder formulebevestiging mislukte')
const unconfirmed = sqlite.prepare('SELECT basisprijs, extra_prijzen, totaalprijs FROM bookings WHERE id = 2').get() as Record<string, unknown>
assert(Number(unconfirmed.basisprijs) === 850, 'Een onbevestigde zaalintrede wijzigde de basisprijs')
assert(JSON.parse(String(unconfirmed.extra_prijzen))._trouw_formule === 'avondfeest', 'Een onbevestigde zaalintrede wijzigde de formulecode')
assert(Number(unconfirmed.totaalprijs) === 850, 'Een onbevestigde zaalintrede wijzigde het totaal')

const contractResponse = await app.fetch(new Request('https://crm.test/api/bookings/1/contract', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    basisprijs: 900,
    extra_prijzen: JSON.stringify({ digital_booth: 225, _km_vergoeding: 20, _korting: 25 }),
    totaalprijs: 999999,
  }),
}), env)
assert(contractResponse.ok, 'CRM-prijsopslag mislukte')
const storedPrice = sqlite.prepare('SELECT basisprijs, extra_prijzen, totaalprijs FROM bookings WHERE id = 1').get() as Record<string, unknown>
assert(Number(storedPrice.basisprijs) === 900, 'De nieuwe CRM-basisprijs werd niet opgeslagen')
assert(Number(storedPrice.totaalprijs) === 1120, 'De CRM-opslag gebruikte niet de autoritatieve serverberekening')
assert(Number(storedPrice.totaalprijs) !== 999999, 'Het meegestuurde handmatige totaal werd ten onrechte vertrouwd')

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
