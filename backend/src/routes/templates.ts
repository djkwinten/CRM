import { Hono } from 'hono'
import { query, queryOne, execute } from '../lib/db'
import { sendTemplateEmail, verifySmtpConnection, SmtpConfig } from '../lib/mailer'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

type Bindings = {
  DB?: D1Database
  ENVIRONMENT: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
  APP_URL?: string
}

export const templatesRoutes = new Hono<{ Bindings: Bindings }>()

const REVIEW_URL = 'https://g.page/r/CSbMZNi7yTPAEBM/review'

type TemplateKey = 'vragenlijst_reminder' | 'feest_nadert' | 'review_request' | 'aanvraag_followup' | 'afwijzing'

interface EmailTemplate {
  id: number
  key: TemplateKey
  name: string
  subject: string
  body: string
  updated_at: string
}

interface BookingRow {
  id: number
  feest_datum: string
  type_feest: string
  naam_organisator: string
  naam_partner1: string | null
  naam_partner2: string | null
  email: string
  locatie_naam: string | null
  is_aanvraag: number
  slug: string | null
  afgewezen_reden?: string | null
}

const DEFAULT_TEMPLATES: Record<TemplateKey, { name: string; subject: string; body: string }> = {
  vragenlijst_reminder: {
    name: 'Vragenlijst herinnering',
    subject: 'Herinnering: vragenlijst voor jullie feest op {{feest_datum}}',
    body: `Dag {{naam}},

Jullie feest op {{feest_datum}} komt dichterbij.
Ik heb de vragenlijst nog niet ontvangen.

Willen jullie die nog even invullen via:
{{vragenlijst_link}}

Zo kan ik alles goed voorbereiden.

Groetjes,
DJ Kwinten`
  },
  feest_nadert: {
    name: 'Feest nadert',
    subject: 'Jullie feest op {{feest_datum}} komt eraan!',
    body: `Dag {{naam}},

Jullie feest op {{feest_datum}} komt steeds dichterbij — en ik kijk er al enorm naar uit!

Neem gerust nog eens de tijd om jullie vragenlijst te controleren of aan te vullen:
{{vragenlijst_link}}

Heb je ondertussen nog vragen of wil je iets aanpassen? Laat het gerust weten.

Groetjes,
DJ Kwinten`
  },
  review_request: {
    name: 'Review vragen',
    subject: 'Bedankt voor het fijne feest, {{naam}}!',
    body: `Dag {{naam}},

Nog eens bedankt voor het fijne feest op {{feest_datum}}.
Ik hoop dat jullie en jullie gasten een fantastische avond hebben gehad.

Als jullie tevreden waren, zouden jullie dan een korte Google review willen achterlaten?
{{review_link}}

Dat helpt mij enorm.

Groetjes,
DJ Kwinten`
  },
  aanvraag_followup: {
    name: 'Aanvraag follow-up',
    subject: 'Even opvolgen over jouw aanvraag bij DJ Kwinten',
    body: `Dag {{naam}},

Ik wilde even jouw aanvraag voor {{feest_datum}} opvolgen.

Heb je nog vragen, twijfel je nog ergens over of wil je graag bevestigen? Laat gerust iets weten.

Ik help je graag verder.

Groetjes,
DJ Kwinten`
  },
  afwijzing: {
    name: 'Afwijzing / doorgeven',
    subject: 'Jouw aanvraag voor {{feest_datum}}',
    body: `Dag {{naam}},

Bedankt voor je aanvraag voor {{feest_datum}}.

Helaas kan ik deze aanvraag niet verder opnemen.
Reden: {{afgewezen_reden}}

Indien gewenst kan ik je eventueel doorverwijzen naar een collega-DJ.

Groetjes,
DJ Kwinten`
  }
}

function getSmtpConfig(env: Bindings): SmtpConfig {
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || '',
    brevoApiKey: env.SMTP_PASS || ''
  }
}

async function ensureTemplates(env: Bindings) {
  await execute(env, `
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await execute(env, `
      INSERT OR IGNORE INTO email_templates (key, name, subject, body)
      VALUES (?, ?, ?, ?)
    `, [key, t.name, t.subject, t.body])
  }
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: nl })
  } catch {
    return dateStr
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function displayName(b: BookingRow): string {
  if (b.naam_partner1 && b.naam_partner2) return `${b.naam_partner1.split(' ')[0]} & ${b.naam_partner2.split(' ')[0]}`
  return b.naam_organisator || 'klant'
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => vars[key] ?? '')
}

function bodyToHtml(body: string): string {
  return body
    .split('\n\n')
    .map(p => `<p style="margin:0 0 16px;line-height:1.65;color:#374151;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function buildPreview(env: Bindings, key: string, bookingId: string, overrides?: { subject?: string; body?: string }) {
  await ensureTemplates(env)
  const template = await queryOne<EmailTemplate>(env, `SELECT * FROM email_templates WHERE key = ?`, [key])
  if (!template) throw new Error('Template niet gevonden')

  const booking = await queryOne<BookingRow>(env, `
    SELECT id, feest_datum, type_feest, naam_organisator, naam_partner1, naam_partner2, email,
           locatie_naam, is_aanvraag, slug, afgewezen_reden
    FROM bookings WHERE id = ?
  `, [bookingId])
  if (!booking) throw new Error('Boeking niet gevonden')

  const base = env.APP_URL || 'http://localhost:5173'
  const vragenlijstLink = booking.slug ? `${base}/vragenlijst/${booking.slug}` : `${base}/formulier/${booking.id}`
  const vars: Record<string, string> = {
    naam: displayName(booking),
    feest_datum: formatDate(booking.feest_datum),
    type_feest: booking.type_feest || '',
    locatie: booking.locatie_naam || '',
    vragenlijst_link: vragenlijstLink,
    review_link: REVIEW_URL,
    dagen_tot_feest: String(daysUntil(booking.feest_datum)),
    afgewezen_reden: booking.afgewezen_reden || ''
  }

  const subject = renderTemplate(overrides?.subject ?? template.subject, vars)
  const body = renderTemplate(overrides?.body ?? template.body, vars)
  const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center"><table width="600" style="max-width:600px;width:100%;background:white;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.08);"><tr><td style="background:linear-gradient(135deg,#111827,#374151);padding:28px 32px;color:white;"><h1 style="margin:0;font-size:24px;">DJ Kwinten</h1><p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:14px;">Boekingsbeheer</p></td></tr><tr><td style="padding:32px;">${bodyToHtml(body)}</td></tr><tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;">Verstuurd door DJ Kwinten via DJ Manager</td></tr></table></td></tr></table></body></html>`

  return { template, booking, to: booking.email, subject, body, html }
}

templatesRoutes.get('/', async (c) => {
  await ensureTemplates(c.env)
  const templates = await query<EmailTemplate>(c.env, `SELECT * FROM email_templates ORDER BY id ASC`)
  return c.json({ templates })
})

templatesRoutes.put('/:key', async (c) => {
  await ensureTemplates(c.env)
  const key = c.req.param('key')
  const body = await c.req.json<{ subject: string; body: string; name?: string }>()
  await execute(c.env, `
    UPDATE email_templates SET name = COALESCE(?, name), subject = ?, body = ?, updated_at = datetime('now')
    WHERE key = ?
  `, [body.name || null, body.subject, body.body, key])
  return c.json({ success: true })
})

templatesRoutes.post('/:key/preview/:bookingId', async (c) => {
  try {
    const data = await buildPreview(c.env, c.req.param('key'), c.req.param('bookingId'), await c.req.json().catch(() => ({})))
    return c.json({ to: data.to, subject: data.subject, body: data.body, html: data.html, template: data.template })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

templatesRoutes.post('/:key/send/:bookingId', async (c) => {
  try {
    const key = c.req.param('key') as TemplateKey
    const payload = await c.req.json<{ subject?: string; body?: string }>().catch(() => ({}))
    const data = await buildPreview(c.env, key, c.req.param('bookingId'), payload)
    if (!data.to) return c.json({ error: 'Geen e-mailadres voor deze boeking' }, 400)

    const cfg = getSmtpConfig(c.env)
    const ok = await verifySmtpConnection(cfg)
    if (!ok) return c.json({ error: 'E-mail service niet bereikbaar' }, 500)

    await sendTemplateEmail(cfg, data.to, data.subject, data.html, data.body)

    const fieldByKey: Partial<Record<TemplateKey, string>> = {
      vragenlijst_reminder: 'reminder_sent_at',
      feest_nadert: 'feest_herinnering_sent_at',
      review_request: 'review_sent_at',
      aanvraag_followup: 'aanvraag_reminder_sent_at'
    }
    const field = fieldByKey[key]
    if (field) await execute(c.env, `UPDATE bookings SET ${field} = datetime('now') WHERE id = ?`, [data.booking.id])

    return c.json({ success: true, sent_to: data.to })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})
