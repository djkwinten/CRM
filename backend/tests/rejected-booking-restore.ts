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
const env = { DB: new MockD1Database(sqlite) as unknown as D1Database, ENVIRONMENT: 'test' }

async function restore(booking: Record<string, unknown>) {
  const response = await app.fetch(new Request('https://crm.test/api/export/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookings: [booking] }),
  }), env)
  assert(response.ok, `Import mislukte: ${await response.text()}`)
}

const aanvraag = {
  id: 42,
  access_token: 'synthetic-rejected-token',
  slug: 'synthetic-rejected-request',
  feest_datum: '2031-06-14',
  type_feest: 'Algemeen',
  naam_organisator: 'Synthetische aanvraag',
  is_aanvraag: 1,
  is_afgewezen: 0,
  afgewezen_reden: null,
}

await restore(aanvraag)
await restore({ ...aanvraag, is_afgewezen: 1, afgewezen_reden: 'datum' })

const rows = sqlite.prepare(`
  SELECT id, is_aanvraag, is_afgewezen, afgewezen_reden
  FROM bookings
  WHERE access_token = ?
`).all(aanvraag.access_token) as Array<{
  id: number
  is_aanvraag: number
  is_afgewezen: number
  afgewezen_reden: string | null
}>

assert(rows.length === 1, 'Herimport maakte een dubbele aanvraag')
assert(rows[0].is_aanvraag === 1, 'Het record is niet als aanvraag bewaard')
assert(rows[0].is_afgewezen === 1, 'De afgewezen status werd niet hersteld')
assert(rows[0].afgewezen_reden === 'datum', 'De afwijsreden werd niet hersteld')

console.log(JSON.stringify({
  success: true,
  rows: rows.length,
  rejected: rows[0].is_afgewezen,
  reason: rows[0].afgewezen_reden,
}))

sqlite.close()
