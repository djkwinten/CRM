import { Hono } from 'hono'
import { checkBrevoConnection, SmtpConfig } from '../lib/mailer'

type Bindings = {
  ENVIRONMENT: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  BREVO_API_KEY?: string
  SMTP_FROM?: string
}

export const mailRoutes = new Hono<{ Bindings: Bindings }>()

function getMailConfig(env: Bindings): SmtpConfig {
  const apiKey = env.BREVO_API_KEY || env.SMTP_PASS || ''
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587'),
    user: env.SMTP_USER || '',
    pass: apiKey,
    from: env.SMTP_FROM || env.SMTP_USER || '',
    brevoApiKey: apiKey,
  }
}

mailRoutes.get('/status', async (c) => {
  const cfg = getMailConfig(c.env)
  const hasApiKey = Boolean(cfg.brevoApiKey)
  const hasSender = Boolean(cfg.from)

  if (!hasApiKey || !hasSender) {
    return c.json({
      ok: false,
      provider: 'brevo',
      configured: false,
      has_api_key: hasApiKey,
      has_sender: hasSender,
      sender: cfg.from || null,
      message: !hasApiKey
        ? 'BREVO_API_KEY secret ontbreekt op de Cloudflare Worker.'
        : 'SMTP_USER of SMTP_FROM ontbreekt; Brevo heeft een afzender nodig.',
    }, 200)
  }

  const status = await checkBrevoConnection(cfg)
  return c.json({
    ok: status.ok,
    provider: 'brevo',
    configured: status.configured,
    has_api_key: true,
    has_sender: true,
    sender: cfg.from,
    brevo_status: status.status || null,
    brevo_error: status.error || null,
    message: status.ok
      ? 'Brevo API key is geldig en bereikbaar.'
      : 'Brevo API key is aanwezig, maar Brevo accepteert hem niet of de API is niet bereikbaar.',
  }, status.ok ? 200 : 502)
})
