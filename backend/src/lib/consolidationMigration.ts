type MigrationDatabase = Pick<D1Database, 'prepare'>

type ColumnDefinition = {
  name: string
  definition: string
}

type TableDefinition = {
  name: string
  createSql: string
  columns: ColumnDefinition[]
}

export type ConsolidationMigrationReport = {
  createdOrVerifiedTables: string[]
  addedColumns: string[]
}

/**
 * Columns added to the canonical bookings schema during repository consolidation.
 * The migration checks PRAGMA table_info before issuing ALTER TABLE, making it
 * safe to run repeatedly and safe for partially upgraded databases.
 */
export const CONSOLIDATION_BOOKING_COLUMNS: ColumnDefinition[] = [
  { name: 'aanvraag_reminder_sent_at', definition: 'TEXT' },
  { name: 'review_sent_at', definition: 'TEXT' },
  { name: 'feest_herinnering_sent_at', definition: 'TEXT' },
  { name: 'vragenlijst_updated_at', definition: 'TEXT' },
  { name: 'vragenlijst_first_submitted_at', definition: 'TEXT' },
  { name: 'vragenlijst_diff', definition: 'TEXT' },
  { name: 'venue_id', definition: 'INTEGER' },
  { name: 'feedback_vragenlijst', definition: 'TEXT' },
  { name: 'feedback_herkomst', definition: 'TEXT' },
  { name: 'is_afgewezen', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'afgewezen_reden', definition: 'TEXT' },
  { name: 'portal_title', definition: 'TEXT' },
  { name: 'vroeger_aanwezig_receptie', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'vroeger_aanwezig_receptie_na_contract', definition: 'INTEGER NOT NULL DEFAULT 0' },
]

const CONSOLIDATION_TABLES: TableDefinition[] = [
  {
    name: 'venues',
    createSql: `
      CREATE TABLE IF NOT EXISTS venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        naam TEXT NOT NULL,
        adres TEXT,
        capaciteit INTEGER,
        contact_naam TEXT,
        contact_telefoon TEXT,
        contact_email TEXT,
        website TEXT,
        geluidsbeperking INTEGER DEFAULT 0,
        geluidsbeperking_db INTEGER,
        speakers_aanwezig INTEGER DEFAULT 0,
        licht_aanwezig INTEGER DEFAULT 0,
        micro_aanwezig INTEGER DEFAULT 0,
        dj_booth_aanwezig INTEGER DEFAULT 0,
        uplights_aanwezig INTEGER DEFAULT 0,
        speakers_buiten INTEGER DEFAULT 0,
        parkeren_info TEXT,
        gelijkvloers INTEGER DEFAULT 1,
        wifi_code TEXT,
        fotos TEXT,
        notities TEXT,
        afstand_km REAL,
        rijtijd_min INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [
      { name: 'adres', definition: 'TEXT' },
      { name: 'capaciteit', definition: 'INTEGER' },
      { name: 'contact_naam', definition: 'TEXT' },
      { name: 'contact_telefoon', definition: 'TEXT' },
      { name: 'contact_email', definition: 'TEXT' },
      { name: 'website', definition: 'TEXT' },
      { name: 'geluidsbeperking', definition: 'INTEGER DEFAULT 0' },
      { name: 'geluidsbeperking_db', definition: 'INTEGER' },
      { name: 'speakers_aanwezig', definition: 'INTEGER DEFAULT 0' },
      { name: 'licht_aanwezig', definition: 'INTEGER DEFAULT 0' },
      { name: 'micro_aanwezig', definition: 'INTEGER DEFAULT 0' },
      { name: 'dj_booth_aanwezig', definition: 'INTEGER DEFAULT 0' },
      { name: 'uplights_aanwezig', definition: 'INTEGER DEFAULT 0' },
      { name: 'speakers_buiten', definition: 'INTEGER DEFAULT 0' },
      { name: 'parkeren_info', definition: 'TEXT' },
      { name: 'gelijkvloers', definition: 'INTEGER DEFAULT 1' },
      { name: 'wifi_code', definition: 'TEXT' },
      { name: 'fotos', definition: 'TEXT' },
      { name: 'notities', definition: 'TEXT' },
      { name: 'afstand_km', definition: 'REAL' },
      { name: 'rijtijd_min', definition: 'INTEGER' },
      { name: 'created_at', definition: 'TEXT' },
      { name: 'updated_at', definition: 'TEXT' },
    ],
  },
  {
    name: 'booking_contract_info',
    createSql: `
      CREATE TABLE IF NOT EXISTS booking_contract_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL UNIQUE,
        naam TEXT,
        email TEXT,
        gsm TEXT,
        klant_adres TEXT,
        event_type TEXT,
        event_datum TEXT,
        locatie_naam TEXT,
        locatie_adres TEXT,
        aantal_gasten INTEGER,
        uur_dansfeest TEXT,
        geluid_voorzien INTEGER DEFAULT 0,
        licht_voorzien INTEGER DEFAULT 0,
        dj_booth_nodig INTEGER DEFAULT 0,
        afgesproken_prijs REAL,
        voorschot_bedrag REAL,
        contract_ready INTEGER DEFAULT 0,
        contract_info_notified_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `,
    columns: [
      { name: 'naam', definition: 'TEXT' },
      { name: 'email', definition: 'TEXT' },
      { name: 'gsm', definition: 'TEXT' },
      { name: 'klant_adres', definition: 'TEXT' },
      { name: 'event_type', definition: 'TEXT' },
      { name: 'event_datum', definition: 'TEXT' },
      { name: 'locatie_naam', definition: 'TEXT' },
      { name: 'locatie_adres', definition: 'TEXT' },
      { name: 'aantal_gasten', definition: 'INTEGER' },
      { name: 'uur_dansfeest', definition: 'TEXT' },
      { name: 'geluid_voorzien', definition: 'INTEGER DEFAULT 0' },
      { name: 'licht_voorzien', definition: 'INTEGER DEFAULT 0' },
      { name: 'dj_booth_nodig', definition: 'INTEGER DEFAULT 0' },
      { name: 'afgesproken_prijs', definition: 'REAL' },
      { name: 'voorschot_bedrag', definition: 'REAL' },
      { name: 'contract_ready', definition: 'INTEGER DEFAULT 0' },
      { name: 'contract_info_notified_at', definition: 'TEXT' },
      { name: 'notes', definition: 'TEXT' },
      { name: 'created_at', definition: 'TEXT' },
      { name: 'updated_at', definition: 'TEXT' },
    ],
  },
  {
    name: 'wedding_meetings',
    createSql: `
      CREATE TABLE IF NOT EXISTS wedding_meetings (
        booking_id INTEGER PRIMARY KEY,
        meeting_at TEXT,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `,
    columns: [
      { name: 'meeting_at', definition: 'TEXT' },
      { name: 'note', definition: 'TEXT' },
      { name: 'created_at', definition: 'TEXT' },
      { name: 'updated_at', definition: 'TEXT' },
    ],
  },
  {
    name: 'booking_files',
    createSql: `
      CREATE TABLE IF NOT EXISTS booking_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        size INTEGER,
        data_base64 TEXT NOT NULL,
        visible_to_customer INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `,
    columns: [
      { name: 'name', definition: 'TEXT' },
      { name: 'type', definition: 'TEXT' },
      { name: 'size', definition: 'INTEGER' },
      { name: 'data_base64', definition: 'TEXT' },
      { name: 'visible_to_customer', definition: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'created_at', definition: 'TEXT' },
    ],
  },
  {
    name: 'email_templates',
    createSql: `
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `,
    columns: [
      { name: 'name', definition: 'TEXT' },
      { name: 'subject', definition: 'TEXT' },
      { name: 'body', definition: 'TEXT' },
      { name: 'created_at', definition: 'TEXT' },
      { name: 'updated_at', definition: 'TEXT' },
    ],
  },
]

async function run(db: MigrationDatabase, sql: string) {
  await db.prepare(sql).run()
}

async function columnNames(db: MigrationDatabase, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
  return new Set((result.results || []).map(row => row.name))
}

async function addMissingColumns(
  db: MigrationDatabase,
  table: string,
  columns: ColumnDefinition[],
  addedColumns: string[],
) {
  const existing = await columnNames(db, table)
  for (const column of columns) {
    if (existing.has(column.name)) continue
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.definition}`)
    existing.add(column.name)
    addedColumns.push(`${table}.${column.name}`)
  }
}

/**
 * Prepared migration only: this function is deliberately not called by the
 * Worker entrypoint or deployment script. It must be invoked explicitly after
 * backup approval. It never drops tables/columns and never updates/deletes rows.
 */
export async function runConsolidationMigration(db: MigrationDatabase): Promise<ConsolidationMigrationReport> {
  const bookingColumns = await columnNames(db, 'bookings')
  if (bookingColumns.size === 0) {
    throw new Error('De bestaande bookings-tabel ontbreekt; pas eerst het canonieke schema toe op een lege database.')
  }

  const addedColumns: string[] = []
  await addMissingColumns(db, 'bookings', CONSOLIDATION_BOOKING_COLUMNS, addedColumns)

  const createdOrVerifiedTables: string[] = []
  for (const table of CONSOLIDATION_TABLES) {
    await run(db, table.createSql)
    createdOrVerifiedTables.push(table.name)
    await addMissingColumns(db, table.name, table.columns, addedColumns)
  }

  return { createdOrVerifiedTables, addedColumns }
}
