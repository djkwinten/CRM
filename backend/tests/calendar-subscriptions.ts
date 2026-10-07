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
  prepare(sql: string) { return new MockStatement(this.database, sql) }
}

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
const insert = sqlite.prepare(`
  INSERT INTO bookings (
    feest_datum, type_feest, naam_organisator, is_aanvraag, is_afgewezen,
    uur_dansfeest, einduur, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
insert.run('2035-06-10', 'Algemeen', 'Rode boeking', 0, 0, '22:00', '04:00', '2035-01-02 03:04:05')
insert.run('2035-06-11', 'Algemeen', 'Oranje aanvraag', 1, 0, null, null, '2035-01-03 03:04:05')
insert.run('2035-06-12', 'Algemeen', 'Afgewezen aanvraag', 1, 1, '20:00', '23:00', '2035-01-04 03:04:05')

const env = { DB: new MockD1Database(sqlite) as unknown as D1Database }
async function feed(path: string) {
  const response = await app.fetch(new Request(`https://crm.test${path}`), env)
  assert(response.ok, `${path} gaf geen geldige kalenderfeed`)
  assert(response.headers.get('content-type')?.startsWith('text/calendar'), `${path} heeft een onjuist inhoudstype`)
  assert(response.headers.get('content-disposition')?.startsWith('inline;'), `${path} wordt ten onrechte als download geforceerd`)
  const text = await response.text()
  assert(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'), `${path} is geen geldige iCalendar-feed`)
  assert(text.endsWith('END:VCALENDAR\r\n'), `${path} mist het kalender-einde`)
  return text
}

const confirmed = await feed('/api/calendar/confirmed.ics')
assert(confirmed.includes('X-WR-CALNAME:DJ Kwinten Boekingen'), 'De boekingenfeed heeft geen vaste naam')
assert(confirmed.includes('COLOR:red'), 'De boekingenfeed mist rood als kalenderkleur')
assert(confirmed.includes('X-APPLE-CALENDAR-COLOR:#FF3B30'), 'De boekingenfeed mist de Apple-kleurhint')
assert(confirmed.includes('SUMMARY:🎉 Rode boeking'), 'De bevestigde boeking ontbreekt')
assert(!confirmed.includes('Oranje aanvraag'), 'Een aanvraag staat ten onrechte in de boekingenfeed')
assert(!confirmed.includes('Afgewezen aanvraag'), 'Een afgewezen aanvraag staat ten onrechte in de boekingenfeed')
assert(confirmed.includes('DTSTAMP:20350102T030405Z'), 'DTSTAMP is niet RFC-conform')
assert(confirmed.includes('DTSTART;TZID=Europe/Brussels:20350610T220000'), 'De starttijd is niet RFC-conform')
assert(confirmed.includes('DTEND;TZID=Europe/Brussels:20350611T040000'), 'Een nachtfeest eindigt niet op de volgende dag')

const requests = await feed('/api/calendar/requests.ics')
assert(requests.includes('X-WR-CALNAME:DJ Kwinten Aanvragen'), 'De aanvragenfeed heeft geen vaste naam')
assert(requests.includes('COLOR:orange'), 'De aanvragenfeed mist oranje als kalenderkleur')
assert(requests.includes('X-APPLE-CALENDAR-COLOR:#FF9500'), 'De aanvragenfeed mist de Apple-kleurhint')
assert(requests.includes('Oranje aanvraag'), 'De open aanvraag ontbreekt')
assert(!requests.includes('Rode boeking'), 'Een boeking staat ten onrechte in de aanvragenfeed')
assert(!requests.includes('Afgewezen aanvraag'), 'Een afgewezen aanvraag staat ten onrechte in de aanvragenfeed')
assert(requests.includes('DTSTART;VALUE=DATE:20350611'), 'De dagafspraak heeft geen geldige startdatum')
assert(requests.includes('DTEND;VALUE=DATE:20350612'), 'De dagafspraak heeft geen exclusieve volgende einddatum')
assert(requests.includes('STATUS:TENTATIVE'), 'De aanvraag is niet als voorlopig gemarkeerd')

const combined = await feed('/api/calendar/bookings.ics')
assert(combined.includes('Rode boeking') && combined.includes('Oranje aanvraag'), 'De bestaande gecombineerde feed verloor actieve afspraken')
assert(!combined.includes('Afgewezen aanvraag'), 'De bestaande gecombineerde feed bevat nog een afgewezen aanvraag')

console.log(JSON.stringify({
  success: true,
  absoluteSubscriptionFeeds: 2,
  confirmedColor: 'red',
  requestColor: 'orange',
  rejectedRequestsExcluded: true,
  overnightEventValid: true,
  allDayEventValid: true,
}))
