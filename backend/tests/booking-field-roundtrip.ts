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

  batchResult() {
    const statement = this.database.prepare(this.sql)
    if (statement.reader) {
      return { success: true, results: statement.all(...this.params), meta: { changes: 0, last_row_id: 0 } }
    }
    const info = statement.run(...this.params)
    return { success: true, results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }
  }

  async run() {
    return this.batchResult()
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

  async batch(statements: MockStatement[]) {
    return this.database.transaction(() => statements.map(statement => statement.batchResult()))()
  }
}

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const source = new Database(':memory:')
const target = new Database(':memory:')
source.exec(schema)
target.exec(schema)
source.exec('ALTER TABLE bookings ADD COLUMN future_questionnaire_answer TEXT')
target.exec('ALTER TABLE bookings ADD COLUMN future_questionnaire_answer TEXT')

const questionnaireValues: Record<string, unknown> = {
  access_token: 'synthetic-full-roundtrip-token',
  slug: 'synthetic-full-roundtrip',
  feest_datum: '2032-08-21',
  type_feest: 'Trouw',
  is_aanvraag: 0,
  werk_partner1: 'synthetisch beroep 1',
  werk_partner2: 'synthetisch beroep 2',
  hobbys_interesses: 'synthetische hobby',
  leeftijd_partner1: 31,
  leeftijd_partner2: 32,
  extra_koppel_info: 'synthetische extra info',
  anderstalige_gasten: 'Ja',
  anderstalige_talen: 'synthetische taal',
  leveranciers_info: 'synthetische leverancier',
  uitnodiging_files: '[{"key":"synthetic/invitation.pdf"}]',
  vragenlijst_updated_at: '2031-01-02 10:11:12',
  vragenlijst_first_submitted_at: '2031-01-01 09:08:07',
  feedback_vragenlijst: 'synthetische feedback',
  feedback_herkomst: 'synthetische herkomst',
  future_questionnaire_answer: 'synthetisch toekomstig antwoord',
}

const columns = Object.keys(questionnaireValues)
source.prepare(`INSERT INTO bookings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
  .run(...columns.map(column => questionnaireValues[column]))

const sourceEnv = { DB: new MockD1Database(source) as unknown as D1Database }
const targetEnv = { DB: new MockD1Database(target) as unknown as D1Database }

const exportResponse = await app.fetch(new Request('https://crm.test/api/export/bookings.json'), sourceEnv)
if (!exportResponse.ok) throw new Error(`Export mislukte: ${await exportResponse.text()}`)
const backup = await exportResponse.json() as {
  backup_kind?: string
  booking_field_count?: number
  booking_fields?: string[]
  bookings?: Array<Record<string, unknown>>
}

assert(backup.backup_kind === 'database-export', 'Volledige-backupmarkering ontbreekt')
assert(backup.booking_fields?.includes('werk_partner1'), 'Werkveld ontbreekt in veldinventaris')
assert(backup.booking_fields?.includes('future_questionnaire_answer'), 'Toekomstig veld ontbreekt in veldinventaris')
assert(backup.booking_field_count === backup.booking_fields?.length, 'Veldtelling klopt niet')
assert(backup.bookings?.length === 1, 'Synthetische boeking ontbreekt in export')

const importResponse = await app.fetch(new Request('https://crm.test/api/export/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(backup),
}), targetEnv)
if (!importResponse.ok) throw new Error(`Import mislukte: ${await importResponse.text()}`)

const restored = target.prepare(`SELECT ${columns.join(', ')} FROM bookings WHERE access_token = ?`)
  .get(questionnaireValues.access_token) as Record<string, unknown> | undefined
assert(restored, 'Herstelde boeking ontbreekt')
for (const column of columns) {
  assert(
    String(restored[column] ?? '') === String(questionnaireValues[column] ?? ''),
    `Veld ${column} ging verloren tijdens export/import`,
  )
}

console.log(JSON.stringify({
  success: true,
  exportedFields: backup.booking_field_count,
  verifiedQuestionnaireFields: columns.length,
  futureFieldRestored: restored.future_questionnaire_answer === questionnaireValues.future_questionnaire_answer,
}))

source.close()
target.close()
