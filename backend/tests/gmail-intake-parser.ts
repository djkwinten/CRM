import { gmailMessageText, isWebsiteContactMessage, parseWebsiteRequest } from '../src/lib/gmailIntake'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const receivedAt = '2026-01-01T10:00:00.000Z'
const conflicting = `Bericht via contactformulier website:
Naam: Vanessa Van Parys
phone: 0478247883
E-mailadres: vanparysvanessa@gmail.com
Bericht:
Wij trouwen op zaterdag 3 juli 2026 in feestzaal De Sterre te Bachte-Maria-Leerne en kregen uw naam door als Deejay.
Graag ontvingen wij een prijsofferte.`

const parsedConflict = parseWebsiteRequest(conflicting, receivedAt)
assert(parsedConflict.name === 'Vanessa Van Parys', 'Naam werd niet correct gelezen')
assert(parsedConflict.phone === '0478247883', 'Telefoon werd niet correct gelezen')
assert(parsedConflict.email === 'vanparysvanessa@gmail.com', 'E-mail werd niet correct gelezen')
assert(parsedConflict.eventDate === '', 'Een tegenstrijdige datum mag niet worden ingevuld')
assert(parsedConflict.eventType === 'Trouw', 'Trouwfeest werd niet herkend')
assert(parsedConflict.locationName === 'feestzaal De Sterre te Bachte-Maria-Leerne', 'Locatie werd niet conservatief gelezen')
assert(parsedConflict.status === 'controle_vereist', 'Tegenstrijdige datum moet controle vereisen')
assert(parsedConflict.issues.some(issue => issue.includes('Tegenstrijdige datum')), 'Reden voor datumcontrole ontbreekt')

const valid = `Bericht via contactformulier website:
Naam: Test Persoon
phone: 0470000000
E-mailadres: test@example.com
Bericht:
Wij organiseren een bedrijfsfeest op vrijdag 3 juli 2026 in feestzaal De Sterre te Gent.`
const parsedValid = parseWebsiteRequest(valid, receivedAt)
assert(parsedValid.eventDate === '2026-07-03', 'Geldige Nederlandse datum werd niet gelezen')
assert(parsedValid.eventType === 'Algemeen' && parsedValid.generalSubtype === 'Bedrijfsfeest', 'Bedrijfsfeest werd niet herkend')
assert(parsedValid.status === 'nieuw', `Geldige aanvraag kreeg onverwachte controle: ${parsedValid.issues.join(', ')}`)

const missing = `Bericht via contactformulier website:
Naam:
phone:
E-mailadres:
Bericht:
Graag een dj voor ons feest.`
const parsedMissing = parseWebsiteRequest(missing, receivedAt)
assert(parsedMissing.status === 'controle_vereist', 'Ontbrekende kerngegevens moeten controle vereisen')
assert(parsedMissing.issues.length >= 4, 'Niet alle ontbrekende gegevens werden gemeld')

const html = `<div>Bericht via contactformulier website:</div><div>Naam: HTML Test</div><div>phone: 0471000000</div><div>E-mailadres: html@example.com</div><div>Bericht:<br>Verjaardag op 4 juli 2026 in zaal Testzaal te Gent.</div>`
const encoded = Buffer.from(html).toString('base64url')
const gmailMessage = {
  id: 'gmail-1',
  payload: {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'From', value: 'DJ Kwinten <info@djkwinten.be>' },
      { name: 'Subject', value: 'Fwd: Bericht via contactformulier website' },
    ],
    parts: [
      { mimeType: 'text/plain', body: { data: Buffer.from('Nieuwe websiteboodschap ontvangen. Bekijk de HTML-versie voor alle gegevens.').toString('base64url') } },
      { mimeType: 'text/html', body: { data: encoded } },
    ],
  },
}
const text = gmailMessageText(gmailMessage)
assert(text.includes('HTML Test'), 'HTML/MIME werd niet naar tekst omgezet')
assert(isWebsiteContactMessage(gmailMessage, text).accepted, 'Geldig doorgestuurd formulier werd geweigerd')
assert(!isWebsiteContactMessage({ ...gmailMessage, payload: { ...gmailMessage.payload, headers: [{ name: 'From', value: 'bad@example.com' }, { name: 'Subject', value: 'Bericht via contactformulier website' }] } }, text).accepted, 'Verkeerde afzender werd geaccepteerd')

console.log(JSON.stringify({
  conflict: { status: parsedConflict.status, issues: parsedConflict.issues, location: parsedConflict.locationName },
  valid: { status: parsedValid.status, date: parsedValid.eventDate, subtype: parsedValid.generalSubtype },
  missingIssueCount: parsedMissing.issues.length,
  htmlAccepted: true,
}, null, 2))
