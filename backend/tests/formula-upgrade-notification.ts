import { sendUpdateNotification, type SmtpConfig } from '../src/lib/mailer'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const originalFetch = globalThis.fetch
let capturedUrl = ''
let capturedInit: RequestInit | undefined

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(input)
  capturedInit = init
  return new Response(JSON.stringify({ messageId: 'synthetic-message' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}) as typeof fetch

try {
  const cfg: SmtpConfig = {
    host: 'unused.invalid',
    port: 587,
    user: 'dj@example.invalid',
    pass: 'synthetic-secret',
    from: 'dj@example.invalid',
  }

  await sendUpdateNotification(cfg, {
    naam: 'Synthetisch koppel',
    datum: '2033-05-14',
    appUrl: 'https://crm.example.invalid',
    formulaUpgrade: true,
  })

  assert(capturedUrl === 'https://api.brevo.com/v3/smtp/email', 'De melding gebruikt niet het bestaande Brevo-eindpunt')
  assert(capturedInit?.method === 'POST', 'De melding gebruikt niet de bestaande POST-aanroep')
  const payload = JSON.parse(String(capturedInit?.body || '{}')) as Record<string, unknown>
  assert(payload.subject === 'Formule gewijzigd via vragenlijst — Synthetisch koppel', 'Het onderwerp van de formulemelding is onjuist')
  assert(JSON.stringify(payload.to) === JSON.stringify([{ email: 'dj@example.invalid' }]), 'De formulemelding gaat niet naar de DJ')
  for (const requiredText of [
    'Intrede in de zaal',
    'Avondfeest (€850)',
    'Receptie + avondfeest (€950)',
    'Controleer de prijs vóór de definitieve bevestiging.',
  ]) {
    assert(String(payload.htmlContent).includes(requiredText), `De HTML-melding mist: ${requiredText}`)
    assert(String(payload.textContent).includes(requiredText), `De tekstmelding mist: ${requiredText}`)
  }

  await sendUpdateNotification(cfg, {
    naam: 'Synthetisch feest',
    datum: '2033-05-17',
    appUrl: 'https://crm.example.invalid',
    isUpdate: true,
    earlyReceptionAfterContract: true,
  })
  const priceChangePayload = JSON.parse(String(capturedInit?.body || '{}')) as Record<string, unknown>
  assert(priceChangePayload.subject === 'Prijswijziging na contract — Synthetisch feest', 'Het onderwerp van de na-contractmelding is onjuist')
  for (const requiredText of [
    'Prijswijziging na contract',
    'Vroeger aanwezig vanaf receptie',
    'Hierdoor komt er €75 bij.',
    'Het contract werd al opgesteld en is daarom niet automatisch aangepast.',
    'Controleer en bevestig de nieuwe prijs.',
  ]) {
    assert(String(priceChangePayload.htmlContent).includes(requiredText), `De HTML-prijswaarschuwing mist: ${requiredText}`)
    assert(String(priceChangePayload.textContent).includes(requiredText), `De tekstprijswaarschuwing mist: ${requiredText}`)
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log(JSON.stringify({ success: true, formulaUpgradeNotification: true, earlyReceptionAfterContractNotification: true }))
