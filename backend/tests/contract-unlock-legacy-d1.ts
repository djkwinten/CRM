import Database from 'better-sqlite3'
import worker from '../src/index'

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
    return {
      success: true,
      results: [],
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
    }
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.params)
    return { success: true, results, meta: { changes: 0, last_row_id: 0 } }
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
sqlite.exec(`
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY,
    status_contract INTEGER NOT NULL DEFAULT 1,
    contract_pdf TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO bookings (id, status_contract, contract_pdf) VALUES (42, 1, 'bestaand-contract');
`)

const bookingColumnsBefore = sqlite.prepare('PRAGMA table_info(bookings)').all() as Array<{ name: string }>
assert(!bookingColumnsBefore.some(column => column.name === 'contract_info_unlocked'), 'De legacyfixture mag de nieuwe kolom niet bevatten')

const env = {
  DB: new MockD1Database(sqlite) as unknown as D1Database,
  ENVIRONMENT: 'test',
}
const request = (path: string, init?: RequestInit) => worker.fetch(
  new Request(`https://test.local${path}`, init),
  env as never,
  {} as ExecutionContext,
)

async function setUnlocked(value: number) {
  const response = await request('/api/bookings/42/contract', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract_info_unlocked: value }),
  })
  const body = await response.json() as { success?: boolean; error?: string }
  assert(response.status === 200 && body.success, `Openzetactie faalde: ${body.error || response.status}`)
}

async function readDetail() {
  const response = await request('/api/bookings/42')
  const body = await response.json() as { booking?: Record<string, unknown>; error?: string }
  assert(response.status === 200 && body.booking, `Detail ophalen faalde: ${body.error || response.status}`)
  return body.booking
}

await setUnlocked(1)
assert(Number((await readDetail()).contract_info_unlocked) === 1, 'Detailroute leest de geopende status niet terug')

const listResponse = await request('/api/bookings')
const listBody = await listResponse.json() as { bookings?: Array<Record<string, unknown>>; error?: string }
assert(listResponse.status === 200 && listBody.bookings, `Lijst ophalen faalde: ${listBody.error || listResponse.status}`)
assert(Number(listBody.bookings[0]?.contract_info_unlocked) === 1, 'Lijstroute leest de geopende status niet terug')

await setUnlocked(0)
assert(Number((await readDetail()).contract_info_unlocked) === 0, 'Opnieuw sluiten wordt niet teruggelezen')

const bookingColumnsAfter = sqlite.prepare('PRAGMA table_info(bookings)').all() as Array<{ name: string }>
assert(!bookingColumnsAfter.some(column => column.name === 'contract_info_unlocked'), 'De boekingstabel werd onverwacht gewijzigd')
const unlockRow = sqlite.prepare('SELECT unlocked FROM booking_contract_unlocks WHERE booking_id = 42').get() as { unlocked: number }
assert(unlockRow.unlocked === 0, 'De aparte ontgrendelstatus is niet correct opgeslagen')

console.log(JSON.stringify({
  success: true,
  legacyBookingTableUnchanged: true,
  openedAndReadViaDetail: true,
  openedAndReadViaList: true,
  closedAgain: true,
}, null, 2))
