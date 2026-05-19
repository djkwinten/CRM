import { Hono } from 'hono'
import { query, queryOne, execute } from '../lib/db'
import { sendReminderEmail, sendAanvraagReminderEmail, sendReviewEmail, sendFeestHerinneringEmail, checkBrevoConnection, verifySmtpConnection, SmtpConfig } from '../lib/mailer'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

type Bindings = {
  DB?: D1Database
  ENVIRONMENT: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  BREVO_API_KEY?: string
  SMTP_FROM?: string
  APP_URL?: string
}

export const remindersRoutes = new Hono<{ Bindings: Bindings }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSmtpConfig(env: Bindings): SmtpConfig {
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    user: env.SMTP_USER || '',
    pass: env.BREVO_API_KEY || env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || '',
    brevoApiKey: env.BREVO_API_KEY || env.SMTP_PASS || ''
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getFormLink(env: Bindings, bookingId: number, slug?: string | null): string {
  const base = env.APP_URL || 'http://localhost:5173'
  return slug ? `${base}/vragenlijst/${slug}` : `${base}/formulier/${bookingId}`
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: nl })
  } catch {
    return dateStr
  }
}

interface BookingRow {
  id: number
  feest_datum: string
  naam_organisator: string
  email: string
  status_vragenlijst: number
  status_contract: number
  status_voorschot: number
  is_aanvraag: number
  reminder_sent_at: string | null
  slug?: string | null
}

// ── Ensure reminder_sent_at column exists ─────────────────────────────────────

async function ensureReminderColumn(env: Bindings) {
  try {
    await execute(env, `ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT`)
  } catch {
    // Column already exists — ignore
  }
}


async function ensureInternalTodosTable(env: Bindings) {
  await execute(env, `
    CREATE TABLE IF NOT EXISTS internal_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'manual',
      text TEXT NOT NULL,
      due_date TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(booking_id, kind)
    )
  `)
}

function dateMinusDays(dateStr: string, days: number): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

async function createDueQuestionnaireTodos(env: Bindings): Promise<{ checked: number; created: number; results: { id: number; naam: string; created: boolean; reason?: string }[] }> {
  await ensureInternalTodosTable(env)

  const bookings = await query<BookingRow>(env, `
    SELECT id, feest_datum, naam_organisator, email, status_vragenlijst, status_contract, status_voorschot, is_aanvraag, reminder_sent_at, slug
    FROM bookings
    WHERE is_aanvraag = 0
      AND status_vragenlijst = 0
    ORDER BY feest_datum ASC
  `)

  const results: { id: number; naam: string; created: boolean; reason?: string }[] = []

  for (const b of bookings) {
    const days = daysUntil(b.feest_datum)
    if (days > 30 || days <= 0) {
      results.push({ id: b.id, naam: b.naam_organisator, created: false, reason: `${days} dagen — buiten venster` })
      continue
    }

    const dueDate = dateMinusDays(b.feest_datum, 30)
    const result = await execute(env, `
      INSERT OR IGNORE INTO internal_todos (booking_id, kind, text, due_date, done)
      VALUES (?, 'vragenlijst_opvolgen', ?, ?, 0)
    `, [b.id, `Vragenlijst opvolgen — ${b.naam_organisator || 'boeking #' + b.id}`, dueDate])

    results.push({
      id: b.id,
      naam: b.naam_organisator,
      created: !!result.changes,
      reason: result.changes ? undefined : 'todo bestaat al'
    })
  }

  return { checked: bookings.length, created: results.filter(r => r.created).length, results }
}

// ── GET /status ───────────────────────────────────────────────────────────────

remindersRoutes.get('/status', async (c) => {
  await ensureReminderColumn(c.env)
  await ensureInternalTodosTable(c.env)

  const bookings = await query<BookingRow>(c.env, `
    SELECT id, feest_datum, naam_organisator, email, status_vragenlijst, status_contract, status_voorschot, is_aanvraag, reminder_sent_at, slug
    FROM bookings
    ORDER BY feest_datum ASC
  `)

  const statuses = bookings.map(b => {
    const days = daysUntil(b.feest_datum)
    const needsReminder = (
      !b.is_aanvraag &&
      !b.status_vragenlijst &&
      days <= 30 &&
      days > 0 &&
      !b.reminder_sent_at
    )
    return {
      id: b.id,
      naam: b.naam_organisator,
      feest_datum: b.feest_datum,
      days_until: days,
      is_aanvraag: b.is_aanvraag,
      status_vragenlijst: b.status_vragenlijst,
      status_contract: b.status_contract,
      status_voorschot: b.status_voorschot,
      reminder_sent_at: b.reminder_sent_at,
      needs_reminder: needsReminder,
      email: b.email ? '***' + b.email.split('@')[1] : null
    }
  })

  return c.json({ statuses })
})

// ── POST /check — run the automatic check ────────────────────────────────────

remindersRoutes.post('/check', async (c) => {
  const result = await createDueQuestionnaireTodos(c.env)
  return c.json({
    success: true,
    checked: result.checked,
    created: result.created,
    // Behoud `sent` voor bestaande frontend-code, maar er worden geen e-mails verstuurd.
    sent: result.created,
    results: result.results.map(r => ({ id: r.id, naam: r.naam, sent: r.created, reason: r.reason }))
  })
})

// ── POST /send/:id — force-send for one booking ───────────────────────────────

remindersRoutes.post('/send/:id', async (c) => {
  await ensureReminderColumn(c.env)

  const id = c.req.param('id')
  const b = await queryOne<BookingRow>(c.env, `
    SELECT id, feest_datum, naam_organisator, email, status_vragenlijst, reminder_sent_at, slug
    FROM bookings WHERE id = ?
  `, [id])

  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)
  if (!b.email) return c.json({ error: 'Geen e-mailadres voor deze boeking' }, 400)
  if (b.status_vragenlijst) return c.json({ error: 'Vragenlijst is al ingevuld' }, 400)

  const days = daysUntil(b.feest_datum)
  const cfg = getSmtpConfig(c.env)

  try {
    await sendReminderEmail(cfg, {
      to: b.email,
      naam: b.naam_organisator || 'klant',
      formLink: getFormLink(c.env, b.id, b.slug),
      feestDatum: formatDate(b.feest_datum),
      daysLeft: Math.max(days, 0)
    })
    await execute(c.env, `UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?`, [b.id])
    return c.json({ success: true, sent_to: b.email })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── Aanvraag herinnering helpers ──────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
}

async function ensureAanvraagReminderColumn(env: Bindings) {
  try {
    await execute(env, `ALTER TABLE bookings ADD COLUMN aanvraag_reminder_sent_at TEXT`)
  } catch {
    // Column already exists — ignore
  }
}

// ── POST /aanvraag-send/:id — stuur aanvraag-herinnering voor één aanvraag ────

remindersRoutes.post('/aanvraag-send/:id', async (c) => {
  await ensureAanvraagReminderColumn(c.env)

  const id = c.req.param('id')
  const b = await queryOne<{ id: number; feest_datum: string; naam_organisator: string; email: string; is_aanvraag: number; created_at: string; aanvraag_reminder_sent_at: string | null }>(
    c.env,
    `SELECT id, feest_datum, naam_organisator, email, is_aanvraag, created_at, aanvraag_reminder_sent_at FROM bookings WHERE id = ?`,
    [id]
  )

  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)
  if (!b.is_aanvraag) return c.json({ error: 'Dit is al een bevestigde boeking' }, 400)
  if (!b.email) return c.json({ error: 'Geen e-mailadres voor deze aanvraag' }, 400)

  const cfg = getSmtpConfig(c.env)
  const since = daysSince(b.created_at)

  try {
    await sendAanvraagReminderEmail(cfg, {
      to: b.email,
      naam: b.naam_organisator || 'klant',
      feestDatum: formatDate(b.feest_datum),
      daysSince: Math.max(since, 0)
    })
    await execute(c.env, `UPDATE bookings SET aanvraag_reminder_sent_at = datetime('now') WHERE id = ?`, [b.id])
    return c.json({ success: true, sent_to: b.email })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /review-send/:id — stuur review-verzoek na het feest ────────────────

const REVIEW_URL = 'https://g.page/r/CSbMZNi7yTPAEBM/review'

remindersRoutes.post('/review-send/:id', async (c) => {
  const id = c.req.param('id')
  const b = await queryOne<{ id: number; feest_datum: string; naam_organisator: string; naam_partner1: string | null; naam_partner2: string | null; email: string; is_aanvraag: number; review_sent_at: string | null }>(
    c.env,
    `SELECT id, feest_datum, naam_organisator, naam_partner1, naam_partner2, email, is_aanvraag, review_sent_at FROM bookings WHERE id = ?`,
    [id]
  )

  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)
  if (b.is_aanvraag) return c.json({ error: 'Dit is nog een aanvraag, geen bevestigde boeking' }, 400)
  if (!b.email) return c.json({ error: 'Geen e-mailadres voor deze boeking' }, 400)

  // Bepaal weergavenaam
  const naam = (b.naam_partner1 && b.naam_partner2)
    ? `${b.naam_partner1.split(' ')[0]} & ${b.naam_partner2.split(' ')[0]}`
    : b.naam_organisator || 'klant'

  const cfg = getSmtpConfig(c.env)

  try {
    await sendReviewEmail(cfg, {
      to: b.email,
      naam,
      feestDatum: formatDate(b.feest_datum),
      reviewUrl: REVIEW_URL,
    })
    await execute(c.env, `UPDATE bookings SET review_sent_at = datetime('now') WHERE id = ?`, [b.id])
    return c.json({ success: true, sent_to: b.email })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /feest-herinnering-send/:id — stuur "feest nadert" mail ──────────────

async function ensureFeestHerinneringColumn(env: Bindings) {
  try {
    await execute(env, `ALTER TABLE bookings ADD COLUMN feest_herinnering_sent_at TEXT`)
  } catch {
    // Column already exists — ignore
  }
}



async function sendDueFeestHerinneringen(env: Bindings): Promise<{ checked: number; sent: number; created: number; results: { id: number; naam: string; sent: boolean; reason?: string }[] }> {
  // Automatische 1-maand-flow maakt enkel een interne todo aan.
  // Er wordt hier bewust geen e-mail meer verstuurd.
  const result = await createDueQuestionnaireTodos(env)
  return {
    checked: result.checked,
    sent: 0,
    created: result.created,
    results: result.results.map(r => ({ id: r.id, naam: r.naam, sent: false, reason: r.created ? 'todo aangemaakt' : r.reason }))
  }
}

remindersRoutes.post('/feest-herinnering-check', async (c) => {
  const result = await sendDueFeestHerinneringen(c.env)
  return c.json({ success: true, ...result })
})

remindersRoutes.post('/feest-herinnering-send/:id', async (c) => {
  await ensureFeestHerinneringColumn(c.env)

  const id = c.req.param('id')
  const b = await queryOne<{ id: number; feest_datum: string; naam_organisator: string; naam_partner1: string | null; naam_partner2: string | null; email: string; is_aanvraag: number; type_feest: string; slug: string | null; feest_herinnering_sent_at: string | null }>(
    c.env,
    `SELECT id, feest_datum, naam_organisator, naam_partner1, naam_partner2, email, is_aanvraag, type_feest, slug, feest_herinnering_sent_at FROM bookings WHERE id = ?`,
    [id]
  )

  if (!b) return c.json({ error: 'Boeking niet gevonden' }, 404)
  if (b.is_aanvraag) return c.json({ error: 'Dit is nog een aanvraag, geen bevestigde boeking' }, 400)
  if (!b.email) return c.json({ error: 'Geen e-mailadres voor deze boeking' }, 400)

  // Bepaal weergavenaam
  const naam = (b.naam_partner1 && b.naam_partner2)
    ? `${b.naam_partner1.split(' ')[0]} & ${b.naam_partner2.split(' ')[0]}`
    : b.naam_organisator || 'klant'

  const base = c.env.APP_URL || 'http://localhost:5173'
  const formLink = b.slug ? `${base}/vragenlijst/${b.slug}` : `${base}/formulier/${b.id}`

  const cfg = getSmtpConfig(c.env)

  try {
    await sendFeestHerinneringEmail(cfg, {
      to: b.email,
      naam,
      feestDatum: formatDate(b.feest_datum),
      type_feest: (b.type_feest as 'Trouw' | 'Algemeen') || 'Algemeen',
      formLink,
    })
    await execute(c.env, `UPDATE bookings SET feest_herinnering_sent_at = datetime('now') WHERE id = ?`, [b.id])
    return c.json({ success: true, sent_to: b.email })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})


// ── Interne to-do's ─────────────────────────────────────────────────────────

remindersRoutes.get('/todos', async (c) => {
  await ensureInternalTodosTable(c.env)
  const todos = await query<{ id: number; booking_id: number | null; kind: string; text: string; due_date: string | null; done: number; created_at: string }>(c.env, `
    SELECT id, booking_id, kind, text, due_date, done, created_at
    FROM internal_todos
    ORDER BY done ASC, COALESCE(due_date, '9999-12-31') ASC, created_at DESC
  `)
  return c.json({ todos })
})

remindersRoutes.post('/todos', async (c) => {
  await ensureInternalTodosTable(c.env)
  const body = await c.req.json().catch(() => ({})) as { text?: string; due_date?: string | null }
  const text = body.text?.trim()
  if (!text) return c.json({ success: false, error: 'Tekst ontbreekt' }, 400)
  const result = await execute(c.env, `
    INSERT INTO internal_todos (booking_id, kind, text, due_date, done)
    VALUES (NULL, 'manual', ?, ?, 0)
  `, [text, body.due_date || null])
  return c.json({ success: true, id: result.lastRowId })
})

remindersRoutes.patch('/todos/:id', async (c) => {
  await ensureInternalTodosTable(c.env)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { done?: boolean | number }
  await execute(c.env, `UPDATE internal_todos SET done = ?, updated_at = datetime('now') WHERE id = ?`, [body.done ? 1 : 0, id])
  return c.json({ success: true })
})

remindersRoutes.delete('/todos/:id', async (c) => {
  await ensureInternalTodosTable(c.env)
  const id = c.req.param('id')
  await execute(c.env, `DELETE FROM internal_todos WHERE id = ?`, [id])
  return c.json({ success: true })
})

// ── POST /smtp-test — check SMTP config ──────────────────────────────────────

remindersRoutes.post('/smtp-test', async (c) => {
  const cfg = getSmtpConfig(c.env)
  const status = await checkBrevoConnection(cfg)
  return c.json({
    connected: status.ok,
    configured: status.configured,
    brevo_status: status.status || null,
    brevo_error: status.error || null,
    message: status.ok
      ? 'E-mail service bereikbaar (Brevo API)'
      : !status.configured
        ? 'BREVO_API_KEY secret ontbreekt op de Cloudflare Worker.'
        : 'Brevo API key aanwezig, maar Brevo accepteert hem niet of de API is niet bereikbaar.',
    user: cfg.user || '(niet ingesteld)'
  }, status.ok || !status.configured ? 200 : 502)
})
