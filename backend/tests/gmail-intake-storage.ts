import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import app from '../src/index'
import { runGmailImport } from '../src/lib/gmailIntake'

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

  private statement() {
    return this.database.prepare(this.sql)
  }

  batchResult() {
    const statement = this.statement()
    if (statement.reader) {
      const results = statement.all(...this.params)
      return { success: true, results, meta: { changes: 0, last_row_id: 0 } }
    }
    const info = statement.run(...this.params)
    return {
      success: true,
      results: [],
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
    }
  }

  async run() {
    return this.batchResult()
  }

  async all() {
    const results = this.statement().all(...this.params)
    return { success: true, results, meta: { changes: 0, last_row_id: 0 } }
  }

  async first<T>() {
    return (this.statement().get(...this.params) as T | undefined) || null
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

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
const db = new MockD1Database(sqlite) as unknown as D1Database
const originalFetch = globalThis.fetch
const activationFloor = Date.now() + 60_000
let listCalls = 0

const message = {
  id: 'gmail-message-unique-001',
  threadId: 'thread-001',
  internalDate: String(activationFloor),
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: 'DJ Kwinten <info@djkwinten.be>' },
      { name: 'Subject', value: 'Bericht via contactformulier website' },
      { name: 'Message-ID', value: '<website-001@example.test>' },
    ],
    body: {
      data: base64url(`Bericht via contactformulier website:
Naam: Vanessa Van Parys
phone: 0478247883
E-mailadres: vanparysvanessa@gmail.com
Bericht:
Wij trouwen op zaterdag 3 juli 2026 in feestzaal De Sterre te Bachte-Maria-Leerne en kregen uw naam door als Deejay.`),
    },
  },
}

globalThis.fetch = async (input, init) => {
  const url = String(input)
  if (url === 'https://oauth2.googleapis.com/token') {
    assert(init?.method === 'POST', 'OAuth-tokenvernieuwing gebruikt geen POST')
    assert(new Headers(init.headers).get('Content-Type') === 'application/x-www-form-urlencoded', 'OAuth content-type wijkt af')
    return Response.json({ access_token: 'test-access-token', expires_in: 3600, token_type: 'Bearer' })
  }
  assert(new Headers(init?.headers).get('Authorization') === 'Bearer test-access-token', 'Gmail Bearer-token ontbreekt')
  if (url.endsWith('/labels')) return Response.json({ labels: [] })
  if (url.includes('/messages?')) {
    listCalls++
    const parsedUrl = new URL(url)
    assert(!parsedUrl.searchParams.has('labelIds'), 'Ontbrekend Gmail-label mag de import niet blokkeren')
    assert(parsedUrl.searchParams.get('q')?.includes('from:"info@djkwinten.be"'), 'Afzenderfilter ontbreekt')
    assert(parsedUrl.searchParams.get('q')?.includes('subject:"Bericht via contactformulier website"'), 'Onderwerpfilter ontbreekt')
    return Response.json({ messages: [{ id: message.id }], resultSizeEstimate: 1 })
  }
  if (url.includes(`/messages/${message.id}?format=full`)) return Response.json(message)
  return new Response('Niet verwacht', { status: 500 })
}

const env = {
  DB: db,
  GMAIL_CLIENT_ID: 'client-id',
  GMAIL_CLIENT_SECRET: 'client-secret',
  GMAIL_REFRESH_TOKEN: 'refresh-token',
  GMAIL_ACCOUNT: 'djkwinten@gmail.com',
  GMAIL_LABEL_NAME: 'DJ CRM Website-aanvragen',
  GMAIL_EXPECTED_FROM: 'info@djkwinten.be',
  GMAIL_EXPECTED_SUBJECT: 'Bericht via contactformulier website',
}

try {
  const runtimeEnv = { DB: db, ENVIRONMENT: 'test' }
  const initResponse = await app.fetch(new Request('https://crm.test/api/bookings/init', { method: 'POST' }), runtimeEnv)
  assert(initResponse.ok, 'CRM-testdatabase kon niet normaal worden geïnitialiseerd')

  const initialized = await runGmailImport(env)
  assert(initialized.status === 'initialized', 'Eerste run moet alleen het activeringsmoment vastleggen')
  assert(listCalls === 0, 'Eerste run mag geen historische berichten zoeken')

  // Een bericht dat door een oudere parser werd genegeerd, moet na een
  // parserverbetering opnieuw beoordeeld kunnen worden zonder duplicaatboeking.
  sqlite.prepare(`
    INSERT INTO gmail_intakes (
      gmail_message_id, source_account, source_sender, source_subject,
      received_at, intake_status, issues, decision
    ) VALUES (?, ?, ?, ?, ?, 'controle_vereist', ?, 'ignored')
  `).run(
    message.id, 'djkwinten@gmail.com', 'info@djkwinten.be',
    'Bericht via contactformulier website', new Date(activationFloor).toISOString(),
    JSON.stringify(['formulierkenmerk_ontbreekt']),
  )

  const imported = await runGmailImport(env)
  assert(imported.status === 'completed' && imported.imported === 1, 'Nieuwe aanvraag werd niet één keer geïmporteerd')

  const repeated = await runGmailImport(env)
  assert(repeated.duplicates === 1 && repeated.imported === 0, 'Retry werd niet als duplicaat geblokkeerd')

  const bookingCount = (sqlite.prepare('SELECT COUNT(*) AS count FROM bookings').get() as { count: number }).count
  const intakeCount = (sqlite.prepare('SELECT COUNT(*) AS count FROM gmail_intakes WHERE decision = ?').get('imported') as { count: number }).count
  const stored = sqlite.prepare(`
    SELECT b.is_aanvraag, b.feest_datum, b.locatie_naam, gi.intake_status, gi.original_message
    FROM bookings b JOIN gmail_intakes gi ON gi.booking_id = b.id
  `).get() as { is_aanvraag: number; feest_datum: string; locatie_naam: string; intake_status: string; original_message: string }

  assert(bookingCount === 1 && intakeCount === 1, 'Dubbele Gmail-run maakte meer dan één aanvraag')
  assert(stored.is_aanvraag === 1, 'Geïmporteerd record is niet als aanvraag opgeslagen')
  assert(stored.feest_datum === '', 'Tegenstrijdige datum had niet automatisch opgeslagen mogen worden')
  assert(stored.locatie_naam === 'feestzaal De Sterre te Bachte-Maria-Leerne', 'Locatie werd niet correct opgeslagen')
  assert(stored.intake_status === 'controle_vereist', 'Tegenstrijdige aanvraag mist de controlebadge')
  assert(stored.original_message.includes('Vanessa Van Parys'), 'Oorspronkelijk bericht werd niet bewaard')

  const listCallsBeforeDashboard = listCalls
  const listResponse = await app.fetch(new Request('https://crm.test/api/bookings'), runtimeEnv)
  assert(listResponse.ok, 'CRM-lijst kon niet worden geladen')
  assert(listCalls === listCallsBeforeDashboard, 'Recente Gmail-run werd niet begrensd bij dashboardload')
  const listBody = await listResponse.json() as { bookings: Array<Record<string, unknown>> }
  assert(listBody.bookings[0]?.intake_status === 'controle_vereist', 'CRM-lijst toont de controlebadge niet')
  assert(listBody.bookings[0]?.source_received_at === new Date(activationFloor).toISOString(), 'CRM-lijst toont niet de Gmail-ontvangstdatum')

  const bookingId = Number((sqlite.prepare('SELECT id FROM bookings LIMIT 1').get() as { id: number }).id)

  const detailResponse = await app.fetch(new Request(`https://crm.test/api/bookings/${bookingId}`), runtimeEnv)
  assert(detailResponse.ok, 'CRM-detail kon niet worden geladen')
  const detailBody = await detailResponse.json() as { booking: Record<string, unknown> }
  assert(String(detailBody.booking.source_original_message).includes('Vanessa Van Parys'), 'CRM-detail geeft de originele brontekst niet terug')
  assert(detailBody.booking.source_sender === 'DJ Kwinten <info@djkwinten.be>', 'CRM-detail geeft de originele afzender niet terug')
  assert(detailBody.booking.source_subject === 'Bericht via contactformulier website', 'CRM-detail geeft het originele onderwerp niet terug')
  assert(detailBody.booking.source_received_at === new Date(activationFloor).toISOString(), 'CRM-detail geeft de ontvangstdatum niet terug')

  const reviewResponse = await app.fetch(new Request(`https://crm.test/api/bookings/${bookingId}/intake-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'nieuw' }),
  }), runtimeEnv)
  assert(reviewResponse.ok, 'Controle afronden mislukte')
  const reviewed = sqlite.prepare('SELECT intake_status, issues, original_message FROM gmail_intakes WHERE booking_id = ?').get(bookingId) as { intake_status: string; issues: string; original_message: string }
  assert(reviewed.intake_status === 'nieuw' && reviewed.issues === '[]', 'Controle afronden werkte het bronrecord niet correct bij')
  assert(reviewed.original_message.includes('Vanessa Van Parys'), 'Controle afronden wijzigde de alleen-lezen brontekst')

  const exportResponse = await app.fetch(new Request('https://crm.test/api/export/bookings.json'), runtimeEnv)
  assert(exportResponse.ok, 'JSON-back-up kon niet worden gemaakt')
  const backup = await exportResponse.json() as Record<string, unknown>
  assert(Array.isArray(backup.gmail_intakes) && backup.gmail_intakes.length === 1, 'Gmail-bronrecord ontbreekt in de back-up')
  assert(Array.isArray(backup.gmail_sync_state) && backup.gmail_sync_state.length >= 1, 'Gmail-voortgang ontbreekt in de back-up')

  const restoredSqlite = new Database(':memory:')
  restoredSqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  const restoredDb = new MockD1Database(restoredSqlite) as unknown as D1Database
  const restoredEnv = { DB: restoredDb, ENVIRONMENT: 'test' }
  const restoredInitResponse = await app.fetch(new Request('https://crm.test/api/bookings/init', { method: 'POST' }), restoredEnv)
  assert(restoredInitResponse.ok, 'Lege hersteldatabase kon niet normaal worden geïnitialiseerd')
  const restoreResponse = await app.fetch(new Request('https://crm.test/api/export/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  }), restoredEnv)
  assert(restoreResponse.ok, `JSON-herstel mislukte: ${await restoreResponse.text()}`)
  const restoredIntake = restoredSqlite.prepare(`
    SELECT gi.original_message, gi.intake_status, b.naam_organisator
    FROM gmail_intakes gi JOIN bookings b ON b.id = gi.booking_id
  `).get() as { original_message: string; intake_status: string; naam_organisator: string }
  assert(restoredIntake.original_message.includes('Vanessa Van Parys'), 'Herstel verloor de originele brontekst')
  assert(restoredIntake.naam_organisator === 'Vanessa Van Parys', 'Herstel koppelde het bronrecord niet opnieuw aan de boeking')
  restoredSqlite.close()

  console.log(JSON.stringify({ initialized: initialized.status, imported: imported.imported, duplicateRetry: repeated.duplicates, bookingCount, intakeCount, listBadge: listBody.bookings[0]?.intake_status, detailHasSource: true, reviewedStatus: reviewed.intake_status, backupRestored: true }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  sqlite.close()
}
