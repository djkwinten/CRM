import Database from 'better-sqlite3'
import {
  CONSOLIDATION_BOOKING_COLUMNS,
  runConsolidationMigration,
} from '../src/lib/consolidationMigration'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

class TestD1Database {
  constructor(private readonly sqlite: Database.Database) {}

  prepare(sql: string) {
    const statement = this.sqlite.prepare(sql)
    return {
      bind: (...params: unknown[]) => ({
        run: async () => {
          const result = statement.run(...params)
          return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }
        },
        all: async <T>() => ({ success: true, results: statement.all(...params) as T[] }),
        first: async <T>() => (statement.get(...params) as T | undefined) ?? null,
      }),
      run: async () => {
        const result = statement.run()
        return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }
      },
      all: async <T>() => ({ success: true, results: statement.all() as T[] }),
      first: async <T>() => (statement.get() as T | undefined) ?? null,
    }
  }
}

const sqlite = new Database(':memory:')
sqlite.exec(`
  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feest_datum TEXT NOT NULL,
    naam_organisator TEXT
  );
  INSERT INTO bookings (feest_datum, naam_organisator)
  VALUES ('2031-08-23', 'Bestaande klant');

  CREATE TABLE venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naam TEXT NOT NULL
  );
  INSERT INTO venues (naam) VALUES ('Bestaande zaal');

  CREATE TABLE booking_contract_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL UNIQUE
  );
  INSERT INTO booking_contract_info (booking_id) VALUES (1);
`)

const db = new TestD1Database(sqlite) as unknown as D1Database
const first = await runConsolidationMigration(db)
const second = await runConsolidationMigration(db)

assert(first.addedColumns.length > 0, 'Eerste migratie voegde geen ontbrekende kolommen toe')
assert(second.addedColumns.length === 0, 'Tweede migratie was niet idempotent')

const bookingColumns = new Set(
  (sqlite.prepare('PRAGMA table_info(bookings)').all() as { name: string }[]).map(row => row.name),
)
for (const column of CONSOLIDATION_BOOKING_COLUMNS) {
  assert(bookingColumns.has(column.name), `Ontbrekende bookings-kolom: ${column.name}`)
}

for (const table of ['venues', 'booking_contract_info', 'wedding_meetings', 'booking_files', 'email_templates']) {
  const row = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)
  assert(row, `Ontbrekende tabel na migratie: ${table}`)
}

const booking = sqlite.prepare('SELECT id, feest_datum, naam_organisator FROM bookings WHERE id = 1').get() as {
  id: number
  feest_datum: string
  naam_organisator: string
}
assert(booking.id === 1, 'Primaire sleutel van bestaande boeking is gewijzigd')
assert(booking.feest_datum === '2031-08-23', 'Datum van bestaande boeking is gewijzigd')
assert(booking.naam_organisator === 'Bestaande klant', 'Naam van bestaande boeking is gewijzigd')

const venue = sqlite.prepare('SELECT id, naam FROM venues WHERE id = 1').get() as { id: number; naam: string }
assert(venue.id === 1 && venue.naam === 'Bestaande zaal', 'Bestaande zaal is gewijzigd')

const contract = sqlite.prepare('SELECT id, booking_id FROM booking_contract_info WHERE id = 1').get() as {
  id: number
  booking_id: number
}
assert(contract.id === 1 && contract.booking_id === 1, 'Bestaande contractinformatie is gewijzigd')

console.log(JSON.stringify({
  success: true,
  firstRunAddedColumns: first.addedColumns.length,
  secondRunAddedColumns: second.addedColumns.length,
  existingRowsPreserved: true,
}))
