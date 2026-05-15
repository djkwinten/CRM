// ── Mailer via Brevo Transactional Email HTTP API ────────────────────────────
// Cloudflare Workers do NOT support raw TCP sockets, so nodemailer/SMTP cannot
// work. Instead we use the Brevo (formerly Sendinblue) HTTP API which works
// perfectly inside Cloudflare Workers.
// Docs: https://developers.brevo.com/reference/sendtransacemail

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from?: string
  brevoApiKey?: string
}

export async function sendTemplateEmail(cfg: SmtpConfig, to: string, subject: string, html: string, text: string): Promise<void> {
  await sendViaBrevo(cfg, to, subject, html, text)
}

export async function sendViaBrevo(
  cfg: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const apiKey = cfg.brevoApiKey || cfg.pass
  const from = cfg.from || cfg.user

  const payload = {
    sender: { name: 'DJ Kwinten', email: from },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo error ${res.status}: ${body}`)
  }
}

export interface BrevoConnectionStatus {
  ok: boolean
  configured: boolean
  status?: number
  error?: string
}

export async function checkBrevoConnection(cfg: SmtpConfig): Promise<BrevoConnectionStatus> {
  // Test by calling the Brevo account endpoint — no email sent.
  const apiKey = cfg.brevoApiKey || cfg.pass
  if (!apiKey) return { ok: false, configured: false, error: 'BREVO_API_KEY ontbreekt' }

  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey },
    })
    if (res.ok) return { ok: true, configured: true, status: res.status }

    const body = await res.text().catch(() => '')
    let message = body.slice(0, 300)
    try {
      const parsed = JSON.parse(body) as { message?: string; code?: string }
      message = [parsed.code, parsed.message].filter(Boolean).join(': ') || message
    } catch { /* keep raw body */ }
    return { ok: false, configured: true, status: res.status, error: message || `Brevo HTTP ${res.status}` }
  } catch (e: any) {
    return { ok: false, configured: true, error: e?.message || 'Brevo API niet bereikbaar' }
  }
}

export async function verifySmtpConnection(cfg: SmtpConfig): Promise<boolean> {
  const status = await checkBrevoConnection(cfg)
  return status.ok
}

export interface ReminderMailOptions {
  to: string
  naam: string
  formLink: string
  feestDatum: string
  daysLeft: number
}

export async function sendReminderEmail(cfg: SmtpConfig, opts: ReminderMailOptions): Promise<void> {
  const from = cfg.from || cfg.user
  const subject = `⏰ Herinnering: Vragenlijst voor jullie feest op ${opts.feestDatum}`

  const html = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Herinnering Vragenlijst</title>
</head>
<body style="margin:0; padding:0; background:#0f0f0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed, #6d28d9); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
              <div style="font-size: 36px; margin-bottom: 8px;">🎵</div>
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">DJ Manager</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px;">Boekingsbeheer</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #1a1a2e; padding: 32px; border-left: 1px solid #2a2a4a; border-right: 1px solid #2a2a4a;">
              <p style="color: #e2e8f0; font-size: 16px; margin: 0 0 16px;">Dag <strong>${opts.naam}</strong>,</p>
              <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Jullie feest op <strong style="color: #e2e8f0;">${opts.feestDatum}</strong> staat
                over <strong style="color: #a78bfa;">${opts.daysLeft} dag${opts.daysLeft !== 1 ? 'en' : ''}</strong> op de agenda.
                We hebben nog geen ingevulde vragenlijst ontvangen.
              </p>
              <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 32px;">
                Om jullie feest tot in de puntjes voor te bereiden — van de perfecte muziek tot de planning —
                vraag ik je vriendelijk om de vragenlijst nog in te vullen.
                Het duurt slechts <strong style="color: #e2e8f0;">5 à 10 minuten</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background: #7c3aed; border-radius: 12px; padding: 0;">
                    <a href="${opts.formLink}"
                       style="display: inline-block; padding: 16px 36px; color: white; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.3px;">
                      ✏️ Vragenlijst Invullen
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #475569; font-size: 12px; text-align: center; margin: 24px 0 0;">
                Of kopieer deze link: <br>
                <a href="${opts.formLink}" style="color: #7c3aed; word-break: break-all;">${opts.formLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #111827; border-radius: 0 0 16px 16px; padding: 20px 32px; border: 1px solid #1f2937; border-top: none;">
              <p style="color: #374151; font-size: 12px; margin: 0; text-align: center; line-height: 1.6;">
                Deze e-mail werd automatisch verstuurd door DJ Manager.<br>
                Jouw gegevens worden verwerkt conform de privacywetgeving (GDPR/AVG).<br>
                Vragen? Neem contact op met je DJ.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  const text = `
Dag ${opts.naam},

Jullie feest op ${opts.feestDatum} staat over ${opts.daysLeft} dag(en) op de agenda.
We hebben nog geen ingevulde vragenlijst ontvangen.

Vul de vragenlijst in via deze link:
${opts.formLink}

Het duurt slechts 5 à 10 minuten.

Met vriendelijke groeten,
DJ Manager
  `.trim()

  await sendViaBrevo(cfg, opts.to, subject, html, text)
}

export async function sendUpdateNotification(cfg: SmtpConfig, opts: { naam: string; datum: string; appUrl: string; isUpdate?: boolean }): Promise<void> {
  const from = cfg.from || cfg.user
  const subject = opts.isUpdate
    ? `✏️ Vragenlijst aangepast — ${opts.naam}`
    : `✅ Vragenlijst ingediend — ${opts.naam}`
  const datumStr = opts.datum ? new Date(opts.datum).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'

  const html = `
<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" style="max-width:520px;width:100%;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <tr><td style="background:linear-gradient(135deg,#007AFF,#5856D6);padding:24px 28px;">
          <p style="color:white;font-size:20px;font-weight:800;margin:0;">${opts.isUpdate ? '✏️ Vragenlijst Aangepast' : '✅ Vragenlijst Ingediend'}</p>
          <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:4px 0 0;">DJ Manager — Automatische melding</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="color:#1a1a2e;font-size:15px;margin:0 0 12px;">${opts.isUpdate ? 'Een klant heeft zijn/haar vragenlijst aangepast:' : 'Een klant heeft de vragenlijst ingevuld en ingediend:'}</p>
          <table style="background:#f8f9fa;border-radius:12px;padding:16px;width:100%;border-collapse:collapse;">
            <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Klant</td><td style="color:#111827;font-size:13px;font-weight:600;padding:4px 0;">${opts.naam}</td></tr>
            <tr><td style="color:#6b7280;font-size:13px;padding:4px 0;">Feestdatum</td><td style="color:#111827;font-size:13px;font-weight:600;padding:4px 0;text-transform:capitalize;">${datumStr}</td></tr>
          </table>
          <p style="margin:20px 0 0;"><a href="${opts.appUrl}" style="display:inline-block;background:#007AFF;color:white;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">Bekijk de aanpassingen →</a></p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:16px 28px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;margin:0;">Automatisch verstuurd door DJ Manager</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const action = opts.isUpdate ? 'aangepast' : 'ingediend'
  await sendViaBrevo(cfg, cfg.user, subject, html, `Vragenlijst ${action} door ${opts.naam} (${datumStr}). Bekijk via ${opts.appUrl}`)
}

export interface AanvraagReminderOptions {
  to: string
  naam: string
  feestDatum: string
  daysSince: number
}

export async function sendAanvraagReminderEmail(cfg: SmtpConfig, opts: AanvraagReminderOptions): Promise<void> {
  const from = cfg.from || cfg.user
  const subject = `🎵 Even opvolgen — Jouw aanvraag bij DJ Kwinten`

  const html = `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:20px 20px 0 0;padding:36px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">&#x1F3B5;</div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">DJ Kwinten</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500;">Even kort opvolgen over jouw aanvraag</p>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
            <p style="color:#111827;font-size:16px;margin:0 0 16px;font-weight:500;">Dag <strong>${opts.naam}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
              Je deed <strong>${opts.daysSince} dag${opts.daysSince !== 1 ? 'en' : ''} geleden</strong> een aanvraag
              voor je feest op <strong style="color:#d97706;">${opts.feestDatum}</strong>.
              Ik hoop dat mijn vorige antwoordmail goed is aangekomen &mdash; voor het geval dat niet zo was,
              stuur ik je hierbij even een seintje.
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px;">
              Heb je nog vragen, twijfels of wil je alvast bevestigen? Neem gerust contact op &mdash;
              ik help je graag verder en zorg ervoor dat jouw feest onvergetelijk wordt! 🎉
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:28px;">
              <tr><td style="padding:18px 22px;">
                <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 12px;">Jouw aanvraag</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#6b7280;font-size:13px;padding:5px 0;border-bottom:1px solid #f3f4f6;">Naam</td>
                    <td style="color:#111827;font-size:13px;font-weight:600;padding:5px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${opts.naam}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;font-size:13px;padding:5px 0;border-bottom:1px solid #f3f4f6;">Feestdatum</td>
                    <td style="color:#d97706;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #f3f4f6;text-align:right;text-transform:capitalize;">${opts.feestDatum}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;font-size:13px;padding:5px 0;">Status</td>
                    <td style="color:#f59e0b;font-size:13px;font-weight:600;padding:5px 0;text-align:right;">&#x23F3; Wacht op bevestiging</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:28px;">
              <tr><td style="padding:18px 22px;">
                <p style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 8px;">&#x1F399; Vrijblijvend kennismakingsgesprek</p>
                <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                  Wil je eerst even kennismaken en bekijken of ik de juiste match ben als DJ voor jouw feest?
                  Dat kan! Plan een <strong>vrijblijvend intake- of videogesprek</strong> in &mdash; zo kan ik al jouw
                  vragen beantwoorden en geef ik je een beter beeld van hoe ik te werk ga.
                </p>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;" width="50%">
                  <a href="mailto:djkwinten@gmail.com"
                     style="display:block;text-align:center;background:#f59e0b;color:white;font-size:14px;font-weight:700;padding:14px 20px;border-radius:12px;text-decoration:none;">
                    &#x2709; Stuur een bericht
                  </a>
                </td>
                <td style="padding-left:8px;" width="50%">
                  <a href="mailto:djkwinten@gmail.com?subject=Intake%20gesprek%20aanvraag&body=Hallo%20Kwinten%2C%0A%0AIk%20wil%20graag%20een%20kennismakingsgesprek%20inplannen."
                     style="display:block;text-align:center;background:#ffffff;color:#374151;font-size:14px;font-weight:600;padding:14px 20px;border-radius:12px;text-decoration:none;border:1.5px solid #d1d5db;">
                    &#x1F4C5; Plan een gesprek
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-radius:0 0 20px 20px;padding:20px 32px;border:1px solid #e5e7eb;border-top:none;">
            <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;line-height:1.7;">
              Deze herinnering werd automatisch verstuurd door DJ Manager.<br>
              Jouw gegevens worden verwerkt conform de privacywetgeving (GDPR/AVG).
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `

  const text = `
Dag ${opts.naam},

Je deed ${opts.daysSince} dag(en) geleden een aanvraag voor je feest op ${opts.feestDatum}.
Ik hoop dat mijn vorige antwoordmail goed is aangekomen — voor het geval dat niet zo was, stuur ik je hierbij even een seintje.

Heb je vragen of wil je bevestigen? Neem contact op via djkwinten@gmail.com.

Wil je eerst kennis maken? Vraag een vrijblijvend intake- of videogesprek aan.

Met vriendelijke groeten,
DJ Kwinten
  `.trim()

  await sendViaBrevo(cfg, opts.to, subject, html, text)
}

export interface ReviewMailOptions {
  to: string
  naam: string
  feestDatum: string
  reviewUrl: string
}

export async function sendReviewEmail(cfg: SmtpConfig, opts: ReviewMailOptions): Promise<void> {
  const from = cfg.from || cfg.user
  const subject = `🎉 Bedankt voor jullie vertrouwen, ${opts.naam}!`

  const html = `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <tr>
          <td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);border-radius:20px 20px 0 0;padding:36px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">🎵</div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">DJ Kwinten</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500;">Bedankt voor jullie vertrouwen!</p>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
            <p style="color:#111827;font-size:16px;margin:0 0 16px;font-weight:500;">Dag <strong>${opts.naam}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
              Wat een geweldige avond was het op <strong style="color:#6d28d9;">${opts.feestDatum}</strong>! 🎉
              Ik hoop dat jullie en jullie gasten een onvergetelijke tijd hebben gehad op de dansvloer.
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px;">
              Het was een plezier om jullie feest te mogen begeleiden. Als jullie tevreden waren
              over mijn diensten, zou ik het <strong>enorm waarderen</strong> als jullie even een
              korte review wilden achterlaten op mijn Google-pagina. Dit helpt mij enorm om
              toekomstige feestvierders te laten weten wat ze kunnen verwachten &mdash; het duurt
              slechts <strong>1 minuutje</strong>!
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;margin-bottom:28px;">
              <tr><td style="padding:18px 22px;">
                <p style="color:#5b21b6;font-size:13px;font-weight:700;margin:0 0 8px;">⭐ Waarom een review zo belangrijk is</p>
                <p style="color:#6d28d9;font-size:13px;line-height:1.6;margin:0;">
                  Reviews helpen andere koppels en feestvierders om de juiste DJ te kiezen voor hun
                  speciale dag. Jullie eerlijke mening maakt een groot verschil!
                </p>
              </td></tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:#6d28d9;border-radius:12px;padding:0;">
                  <a href="${opts.reviewUrl}"
                     style="display:inline-block;padding:16px 40px;color:white;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.3px;">
                    ⭐ Laat een Google Review achter
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#6b7280;font-size:13px;text-align:center;margin:0;">
              Of kopieer deze link:<br>
              <a href="${opts.reviewUrl}" style="color:#7c3aed;font-size:12px;word-break:break-all;">${opts.reviewUrl}</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-radius:0 0 20px 20px;padding:20px 32px;border:1px solid #e5e7eb;border-top:none;">
            <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;line-height:1.7;">
              Deze e-mail werd verstuurd door DJ Kwinten via DJ Manager.<br>
              Jouw gegevens worden verwerkt conform de privacywetgeving (GDPR/AVG).
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `

  const text = `
Dag ${opts.naam},

Wat een geweldige avond was het op ${opts.feestDatum}!
Ik hoop dat jullie en jullie gasten een onvergetelijke tijd hebben gehad.

Als jullie tevreden waren, zou ik het enorm waarderen als jullie even een korte review wilden achterlaten op Google:
${opts.reviewUrl}

Het duurt slechts 1 minuutje en helpt toekomstige feestvierders enorm!

Met vriendelijke groeten,
DJ Kwinten
  `.trim()

  await sendViaBrevo(cfg, opts.to, subject, html, text)
}

export interface FeestHerinneringOptions {
  to: string
  naam: string
  feestDatum: string
  type_feest: 'Trouw' | 'Algemeen'
  formLink: string
}

export async function sendFeestHerinneringEmail(cfg: SmtpConfig, opts: FeestHerinneringOptions): Promise<void> {
  const from = cfg.from || cfg.user
  const isTrouw = opts.type_feest === 'Trouw'
  const subject = `🎉 Jullie feest op ${opts.feestDatum} komt eraan!`

  const contactSection = isTrouw
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:28px;">
        <tr><td style="padding:18px 22px;">
          <p style="color:#7e22ce;font-size:13px;font-weight:700;margin:0 0 8px;">💍 Trouwfeest — Persoonlijke ontmoeting</p>
          <p style="color:#6b21a8;font-size:13px;line-height:1.6;margin:0;">
            Voor een trouwfeest neem ik <strong>een maand voor de grote dag</strong> contact met jullie op
            om samen een <strong>persoonlijke afspraak</strong> in te plannen. Zo bespreken we jullie feest
            tot in de puntjes: de planning, muziek, intredes, sfeer &mdash; zodat alles perfect verloopt.
          </p>
        </td></tr>
      </table>`
    : `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
        <tr><td style="padding:18px 22px;">
          <p style="color:#15803d;font-size:13px;font-weight:700;margin:0 0 8px;">🎉 Feest — Even bijpraten</p>
          <p style="color:#166534;font-size:13px;line-height:1.6;margin:0;">
            <strong>1 à 2 weken voor jullie feest</strong> neem ik contact met jullie op om de planning
            nog even samen door te nemen en te zorgen dat alles klaar staat voor een onvergetelijke avond!
          </p>
        </td></tr>
      </table>`

  const contactText = isTrouw
    ? `Voor een trouwfeest neem ik een maand voor de grote dag contact met jullie op om een persoonlijke afspraak in te plannen.`
    : `1 à 2 weken voor jullie feest neem ik contact met jullie op om de planning samen door te nemen.`

  const html = `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <tr>
          <td style="background:linear-gradient(135deg,#0ea5e9,#6366f1);border-radius:20px 20px 0 0;padding:36px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">&#x1F389;</div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">DJ Kwinten</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-weight:500;">Jullie feest komt eraan!</p>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;padding:36px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
            <p style="color:#111827;font-size:16px;margin:0 0 16px;font-weight:500;">Dag <strong>${opts.naam}</strong>,</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">
              Jullie feest op <strong style="color:#0ea5e9;">${opts.feestDatum}</strong> komt steeds dichterbij &mdash; en ik kijk er al enorm naar uit! 🎵
            </p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px;">
              Neem gerust even de tijd om jullie <strong>vragenlijst</strong> nog eens te overlopen en eventuele
              aanpassingen door te voeren. Zo zorg ik ervoor dat alles tot in de puntjes klaarstaat voor jullie feest.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#0ea5e9;border-radius:12px;padding:0;">
                  <a href="${opts.formLink}"
                     style="display:inline-block;padding:14px 36px;color:white;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.3px;">
                    &#x1F4CB; Vragenlijst bekijken &amp; aanpassen
                  </a>
                </td>
              </tr>
            </table>

            ${contactSection}

            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;">
              Heb je in de tussentijd vragen of wil je iets laten weten? Aarzel niet om me te contacteren!
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;border-radius:0 0 20px 20px;padding:20px 32px;border:1px solid #e5e7eb;border-top:none;">
            <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;line-height:1.7;">
              Deze e-mail werd verstuurd door DJ Kwinten via DJ Manager.<br>
              Jouw gegevens worden verwerkt conform de privacywetgeving (GDPR/AVG).
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `

  const text = `
Dag ${opts.naam},

Jullie feest op ${opts.feestDatum} komt steeds dichterbij — en ik kijk er al enorm naar uit!

Neem gerust even de tijd om jullie vragenlijst nog eens te overlopen:
${opts.formLink}

${contactText}

Heb je vragen? Neem gerust contact op.

Met vriendelijke groeten,
DJ Kwinten
  `.trim()

  await sendViaBrevo(cfg, opts.to, subject, html, text)
}
