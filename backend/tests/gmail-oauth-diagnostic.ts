import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { runGmailImportIfDue } from '../src/lib/gmailIntake'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

class MockStatement {
  constructor(private database: Database.Database, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) { return new MockStatement(this.database, this.sql, params) }
  async run() {
    const info = this.database.prepare(this.sql).run(...this.params)
    return { success: true, results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }
  }
  async first<T>() { return (this.database.prepare(this.sql).get(...this.params) as T | undefined) || null }
}

class MockD1Database {
  constructor(private database: Database.Database) {}
  prepare(sql: string) { return new MockStatement(this.database, sql) }
}

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
const originalFetch = globalThis.fetch
globalThis.fetch = (async () => Response.json(
  { error: 'invalid_client', error_description: 'sensitive provider detail that must not be stored' },
  { status: 401 },
)) as typeof fetch

try {
  const missingResult = await runGmailImportIfDue({
    DB: new MockD1Database(sqlite) as unknown as D1Database,
    GMAIL_CLIENT_SECRET: 'test-secret',
  }, 0)
  const missingRow = sqlite.prepare("SELECT value FROM gmail_sync_state WHERE key = 'gmail_import_last_error_code'").get() as { value?: string } | undefined
  assert(missingResult.status === 'not_configured', 'Ontbrekende bindingen werden niet veilig gestopt')
  assert(missingRow?.value === 'missing_client_id_and_refresh_token', 'Exacte ontbrekende bindingscode klopt niet')

  let rejected = false
  try {
    await runGmailImportIfDue({
      DB: new MockD1Database(sqlite) as unknown as D1Database,
      GMAIL_CLIENT_ID: 'test-id',
      GMAIL_CLIENT_SECRET: 'test-secret',
      GMAIL_REFRESH_TOKEN: 'test-refresh',
    }, 0)
  } catch {
    rejected = true
  }
  const row = sqlite.prepare("SELECT value FROM gmail_sync_state WHERE key = 'gmail_import_last_error_code'").get() as { value?: string } | undefined
  assert(rejected, 'OAuth-fout werd niet verder afgehandeld')
  assert(row?.value === 'oauth_invalid_client', 'Veilige OAuth-foutcategorie ontbreekt')
  assert(!row.value.includes('sensitive'), 'Providerdetail werd ten onrechte opgeslagen')
  console.log(JSON.stringify({ exactMissingBindingsStored: true, safeCategoryStored: true, originalFailurePreserved: true }))
} finally {
  globalThis.fetch = originalFetch
  sqlite.close()
}
