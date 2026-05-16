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

// ── GET /status ───────────────────────────────────────────────────────────────

remindersRoutes.get('/status', async (c) => {
  await ensureReminderColumn(c.env)

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
      !b.reminder_sent_at &&
      !!b.email
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
  await ensureReminderColumn(c.env)

  const bookings = await query<BookingRow>(c.env, `
    SELECT id, feest_datum, naam_organisator, email, status_vragenlijst, reminder_sent_at, slug
    FROM bookings
    WHERE status_vragenlijst = 0
      AND email IS NOT NULL
      AND email != ''
      AND reminder_sent_at IS NULL
    ORDER BY feest_datum ASC
  `)

  const cfg = getSmtpConfig(c.env)
  const results: { id: number; naam: string; sent: boolean; reason?: string }[] = []

  for (const b of bookings) {
    const days = daysUntil(b.feest_datum)

    if (days > 30 || days <= 0) {
      results.push({ id: b.id, naam: b.naam_organisator, sent: false, reason: `${days} dagen — buiten venster` })
      continue
    }

    try {
      await sendReminderEmail(cfg, {
        to: b.email,
        naam: b.naam_organisator || 'klant',
        formLink: getFormLink(c.env, b.id, b.slug),
        feestDatum: formatDate(b.feest_datum),
        daysLeft: days
      })

      await execute(c.env, `UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?`, [b.id])
      results.push({ id: b.id, naam: b.naam_organisator, sent: true })
    } catch (e: any) {
      results.push({ id: b.id, naam: b.naam_organisator, sent: false, reason: e.message })
    }
  }

  const sent = results.filter(r => r.sent).length
  return c.json({ success: true, checked: bookings.length, sent, results })
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



async function sendDueFeestHerinneringen(env: Bindings): Promise<{ checked: number; sent: number; results: { id: number; naam: string; sent: boolean; reason?: string }[] }> {
  await ensureFeestHerinneringColumn(env)

  const bookings = await query<{ id: number; feest_datum: string; naam_organisator: string; naam_partner1: string | null; naam_partner2: string | null; email: string; is_aanvraag: number; type_feest: string; slug: string | null; feest_herinnering_sent_at: string | null }>(env, `
    SELECT id, feest_datum, naam_organisator, naam_partner1, naam_partner2, email, is_aanvraag, type_feest, slug, feest_herinnering_sent_at
    FROM bookings
    WHERE is_aanvraag = 0
      AND email IS NOT NULL
      AND email != ''
      AND feest_herinnering_sent_at IS NULL
    ORDER BY feest_datum ASC
  `)

  const cfg = getSmtpConfig(env)
  const results: { id: number; naam: string; sent: boolean; reason?: string }[] = []

  for (const b of bookings) {
    const days = daysUntil(b.feest_datum)
    const naam = (b.naam_partner1 && b.naam_partner2)
      ? `${b.naam_partner1.split(' ')[0]} & ${b.naam_partner2.split(' ')[0]}`
      : b.naam_organisator || 'klant'

    if (days > 30 || days <= 0) {
      results.push({ id: b.id, naam, sent: false, reason: `${days} dagen — buiten venster` })
      continue
    }

    try {
      await sendFeestHerinneringEmail(cfg, {
        to: b.email,
        naam,
        feestDatum: formatDate(b.feest_datum),
        type_feest: (b.type_feest as 'Trouw' | 'Algemeen') || 'Algemeen',
        formLink: getFormLink(env, b.id, b.slug),
      })
      await execute(env, `UPDATE bookings SET feest_herinnering_sent_at = datetime('now') WHERE id = ?`, [b.id])
      results.push({ id: b.id, naam, sent: true })
    } catch (e: any) {
      results.push({ id: b.id, naam, sent: false, reason: e?.message || String(e) })
    }
  }

  return { checked: bookings.length, sent: results.filter(r => r.sent).length, results }
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
